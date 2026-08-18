/**
 * AWS Transcribe Streaming 기반 한국어 STT recognizer.
 *
 * 기존 VoiceRecognizer (Web Speech API) 와 동일 인터페이스 — drop-in 가능.
 *
 * 흐름:
 *  1) presign Lambda 호출 → wss:// signed URL
 *  2) WebSocket open
 *  3) AudioCapture 시작 → 16kHz PCM chunk
 *  4) chunk 마다 encodeAudioEvent + WS send
 *  5) WS message 수신 → decodeMessage → parseTranscriptEvent
 *  6) Results 의 Alternatives[0].Transcript → IsPartial=true → onPartial,
 *     IsPartial=false → onFinal
 *  7) stop() 시 빈 AudioEvent 보내고 WS close + capture stop
 *
 * 한 인스턴스 = 한 마이크 세션. 반복 사용 시 새 인스턴스.
 */
import { API_URL } from '@/shared/config/apiClient';
import { AudioCapture } from '@/shared/lib/chat/audioCapture';
import {
  encodeAudioEvent,
  decodeMessage,
  parseTranscriptEvent,
  getExceptionMessage,
  type TranscribeResult,
} from '@/shared/lib/chat/transcribeEventStream';

export interface TranscribeRecognizerOptions {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (msg: string) => void;
  onEnd: () => void;
  language?: string; // default 'ko-KR'
  sampleRate?: number; // default 16000
}

export class TranscribeStreamRecognizer {
  private ws: WebSocket | null = null;
  private capture: AudioCapture | null = null;
  private stopped = false;
  // 같은 ResultId 의 partial → final 흐름. 최종 final 텍스트만 onFinal.
  private partialBuf: Record<string, string> = {};
  // Transcribe 가 자체 silence detection 으로 final 떨굴 때까지 latency 가
  // 길어 사용자 체감 답답함. partial 텍스트가 마지막 변경 후 1.5초간 안 변하면
  // 마지막 partial 을 final 로 promote + stop. Phase 3 정식 VAD 도입 전 quick fix.
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPartialText = '';
  private silenceMs = 1500;
  // 한 세션에서 final 1번만 트리거 — partial promote 와 native final 중복 방지
  private finalEmitted = false;

  constructor(private opts: TranscribeRecognizerOptions) {}

  private resetSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.stopped || this.finalEmitted) return;
    this.silenceTimer = setTimeout(() => {
      if (this.stopped || this.finalEmitted) return;
      const text = this.lastPartialText.trim();
      if (!text) return;
      this.finalEmitted = true;
      this.opts.onFinal(text);
      this.stop();
    }, this.silenceMs);
  }

  async start(): Promise<void> {
    this.stopped = false;
    const lang = this.opts.language ?? 'ko-KR';
    const sr = this.opts.sampleRate ?? 16000;

    // 1) presign
    let url: string;
    try {
      const res = await fetch(`${API_URL}/api/voice/stt-presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, sample_rate: sr }),
      });
      if (!res.ok) throw new Error(`presign HTTP ${res.status}`);
      const data = await res.json();
      if (!data.url) throw new Error('presign response missing url');
      url = data.url;
    } catch (e) {
      this.opts.onError(`STT 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    // 2) WS open
    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
    } catch (e) {
      this.opts.onError(`WS 연결 실패: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    this.ws.onmessage = (ev) => {
      if (this.stopped) return;
      try {
        const msg = decodeMessage(ev.data as ArrayBuffer);
        const exMsg = getExceptionMessage(msg);
        if (exMsg) {
          this.opts.onError(`Transcribe: ${exMsg}`);
          this.stop();
          return;
        }
        const evt = parseTranscriptEvent(msg);
        if (!evt) return;
        this.handleResults(evt.Transcript.Results);
      } catch (e) {
        // 한 frame 디코딩 실패는 무시 (다음 frame 시도)
        console.warn('transcribe decode fail', e);
      }
    };

    this.ws.onerror = () => {
      if (!this.stopped) this.opts.onError('WebSocket 오류');
    };

    this.ws.onclose = (ev) => {
      if (this.stopped) return;
      this.stopped = true;
      if (ev.code !== 1000) {
        // 비정상 종료 — 코드만 알림. 4xx 는 인증·권한 (presign 만료 등)
        this.opts.onError(`WS 종료 (code ${ev.code})`);
      }
      this.cleanup();
      this.opts.onEnd();
    };

    // 3) WS open 대기 → AudioCapture 시작
    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error('ws null'));
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      const onOpen = () => {
        this.ws?.removeEventListener('open', onOpen);
        this.ws?.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        this.ws?.removeEventListener('open', onOpen);
        this.ws?.removeEventListener('error', onError);
        reject(new Error('ws open failed'));
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onError);
    }).catch((e) => {
      this.opts.onError(`WS open: ${e.message}`);
      throw e;
    });

    if (this.stopped) return;

    this.capture = new AudioCapture({
      onChunk: (pcm) => {
        if (this.stopped) return;
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        try {
          this.ws.send(encodeAudioEvent(pcm));
        } catch (e) {
          console.warn('ws send fail', e);
        }
      },
      onError: (msg) => {
        this.opts.onError(`마이크: ${msg}`);
        this.stop();
      },
    });

    try {
      await this.capture.start();
    } catch (e) {
      this.opts.onError(`마이크 시작 실패: ${e instanceof Error ? e.message : String(e)}`);
      this.stop();
    }
  }

  private handleResults(results: TranscribeResult[]) {
    for (const r of results) {
      const alt = r.Alternatives?.[0];
      const text = alt?.Transcript ?? '';
      if (!text) continue;
      const id = r.ResultId ?? '_';
      if (r.IsPartial) {
        this.partialBuf[id] = text;
        this.lastPartialText = text;
        this.opts.onPartial(text);
        // partial 이 도착할 때마다 silence timer 리셋. 마지막 partial 후
        // silenceMs 동안 partial 추가 없으면 final 강제 promote.
        this.resetSilenceTimer();
      } else {
        if (this.finalEmitted) continue;
        this.finalEmitted = true;
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
        delete this.partialBuf[id];
        this.opts.onFinal(text);
      }
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    // 빈 AudioEvent (length 0) 보내서 Transcribe 에 EOF 신호
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeAudioEvent(new ArrayBuffer(0)));
      } catch {/* noop */}
      try {
        this.ws.close(1000);
      } catch {/* noop */}
    }
    this.cleanup();
  }

  private cleanup() {
    try {
      this.capture?.stop();
    } catch {/* noop */}
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.capture = null;
    this.ws = null;
    this.partialBuf = {};
  }
}
