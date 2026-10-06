/**
 * 챗봇 음성 통화 클라이언트.
 *
 * 1) STT: 브라우저 Web Speech API(webkitSpeechRecognition / SpeechRecognition), 한국어 ko-KR, 실시간 partial transcript 지원.
 *    Safari 일부 미지원이므로 환경 체크 후 fallback 메시지를 보낸다.
 * 2) TTS: 백엔드 POST /api/voice/tts(Polly, 단일 기본 voice). 응답 base64 mp3 → Blob → HTMLAudioElement로 재생한다.
 *    백엔드는 항상 DEFAULT_CHAT_VOICE 하나로 합성한다(service/backend/handlers/voice/tts.py 참조).
 * 3) 핸즈프리: onresult의 final 결과를 받자마자 자동 send하고 onaudioend 시 recognition을 다시 시작한다. 사용자가 종료할 때까지 반복한다.
 */
import { API_URL } from '@/shared/config/apiClient';
import { TranscribeStreamRecognizer } from '@/shared/lib/chat/transcribeStream';

// Web Speech API는 webkit prefix 호환을 위해 동적으로 가져온다. TS DOM lib에는 SpeechRecognition 타입은 있지만 webkit prefix는 없으므로,
// `any` 대신 실제로 접근하는 프로퍼티/메서드만 담은 최소 인터페이스를 쓴다.
interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionAny = MinimalSpeechRecognition;

interface WindowWithSpeechRecognition {
  SpeechRecognition?: new () => MinimalSpeechRecognition;
  webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionAny) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowWithSpeechRecognition;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface VoiceRecognizerOptions {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (msg: string) => void;
  onEnd: () => void;
}

/** 한 번의 마이크 세션을 관리. 사용자가 stop 호출하기 전까지 partial → final 흐름 반복. */
class VoiceRecognizer {
  private recognition: SpeechRecognitionAny | null = null;
  private stopped = false;

  constructor(private opts: VoiceRecognizerOptions) {}

  start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.opts.onError('이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome/Edge 권장)');
      return;
    }
    const r: SpeechRecognitionAny = new Ctor();
    r.lang = 'ko-KR';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
      let interim = '';
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const transcript = res?.[0]?.transcript ?? '';
        if (res?.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (interim) this.opts.onPartial(interim);
      if (finalText) this.opts.onFinal(finalText);
    };

    r.onerror = (ev: { error: string }) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      this.opts.onError(`음성 인식 오류: ${ev.error}`);
    };

    r.onend = () => {
      if (!this.stopped) this.opts.onEnd();
    };

    this.recognition = r;
    this.stopped = false;
    try {
      r.start();
    } catch (e) {
      this.opts.onError(`마이크 시작 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  stop() {
    this.stopped = true;
    try {
      this.recognition?.stop();
    } catch {
      // 이미 중지된 경우 무시
    }
    this.recognition = null;
  }
}

/**
 * STT 환경별 최적 recognizer 인스턴스를 반환한다.
 *
 * - 기본: AWS Transcribe Streaming(한국어 정확도, iOS Safari 지원, custom vocab 적용 여지).
 * - Web Speech API는 쓰지 않는다. localStorage 'stt-prefer-webspeech=1'이면 강제로 쓴다(디버그용).
 *
 * 콜백 인터페이스(onPartial / onFinal / onError / onEnd)는 동일하다.
 */
export function createRecognizer(opts: VoiceRecognizerOptions): {
  start: () => void | Promise<void>;
  stop: () => void;
} {
  const prefer =
    typeof window !== 'undefined' && localStorage.getItem('stt-prefer-webspeech') === '1';
  if (prefer && isSpeechRecognitionAvailable()) {
    return new VoiceRecognizer(opts);
  }
  return new TranscribeStreamRecognizer(opts);
}

/** Polly TTS 호출 → mp3 Blob URL */
export async function synthesizeSpeech(text: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/voice/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`TTS HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data.audio) throw new Error('TTS 응답에 audio 없음');
  // base64 → Blob
  const binStr = atob(data.audio);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.content_type || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

/** TTS 전에 텍스트를 정제한다. Polly가 어색하게 읽는 부호·이모티콘·마크다운을 제거한다. */
export function sanitizeForTTS(text: string): string {
  return text
    // 이모티콘 (:-) :( :D ;P 등
    .replace(/[:;][-~]?[)(\][DPpoO3<>]/g, '')
    // 마크다운 ** * _ `
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/(?<!\w)_+([^_\n]+)_+(?!\w)/g, '$1')
    // URL
    .replace(/https?:\/\/\S+/g, '')
    // 단독 콜론/세미콜론 (숫자 사이 아닐 때) → 쉼표
    .replace(/(?<!\d):(?!\d)/g, ', ')
    .replace(/(?<!\d);(?!\d)/g, ', ')
    // 헤더 마커 # >
    .replace(/^[#>\s]+/gm, '')
    // 다중 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
}

// 문장 경계 — 한국어 마침표·물음표·느낌표·줄바꿈
const SENTENCE_BOUNDARY = /([\s\S]*?[.?!。？！\n])([\s\S]*)$/;

/**
 * 스트리밍 chunk를 sentence 경계 기준으로 잘라 콜백한다.
 *
 * firstMinChars(기본 25): 첫 phrase가 이만큼 쌓이면 즉시 flush해 첫 audio까지의 latency를 줄인다.
 * restMinChars(기본 60): 이후 phrase는 한 호흡으로 묶어 자연스러운 inflection을 유지한다.
 * 짧은 답(1~2문장)이면 첫 phrase가 보통 전체가 된다.
 *
 * end()로 남은 buf를 강제 flush한다.
 */
export function makeSentenceFlusher(
  onSentence: (s: string) => void,
  opts: { firstMinChars?: number; restMinChars?: number; firstSoftMs?: number } = {},
): {
  push: (chunk: string) => void;
  end: () => void;
} {
  // 첫 phrase는 12자 이상 + sentence 경계. 짧은 답에서는 첫 호흡이 거의 전체 답이 되므로 빠르게 flush해 음성 latency를 줄인다.
  const firstMin = opts.firstMinChars ?? 12;
  const restMin = opts.restMinChars ?? 40;
  // 첫 phrase soft timeout: LLM이 sentence 경계 없이 길게 흘리는 경우(마침표 없이 ~40자 누적 등)에도
  // 이 ms 안에 경계를 못 만나면 첫 chunk를 강제 flush해 음성 출력 latency를 보장한다.
  const firstSoftMs = opts.firstSoftMs ?? 800;
  let buf = '';
  let isFirst = true;
  let firstStartedAt = 0;
  let firstSoftTimer: ReturnType<typeof setTimeout> | null = null;

  const flushFirstSoft = () => {
    if (!isFirst) return;
    const text = buf.trim();
    if (!text) return;
    onSentence(text);
    isFirst = false;
    buf = '';
    if (firstSoftTimer) {
      clearTimeout(firstSoftTimer);
      firstSoftTimer = null;
    }
  };

  return {
    push(chunk: string) {
      buf += chunk;
      if (isFirst && firstStartedAt === 0 && buf.trim().length > 0) {
        firstStartedAt = Date.now();
        if (firstSoftTimer) clearTimeout(firstSoftTimer);
        firstSoftTimer = setTimeout(flushFirstSoft, firstSoftMs);
      }
      while (true) {
        const min = isFirst ? firstMin : restMin;
        if (buf.length < min) return;
        const m = buf.match(SENTENCE_BOUNDARY);
        if (!m) return;
        const sentence = m[1].trim();
        if (sentence) {
          onSentence(sentence);
          isFirst = false;
          if (firstSoftTimer) {
            clearTimeout(firstSoftTimer);
            firstSoftTimer = null;
          }
        }
        buf = m[2];
      }
    },
    end() {
      if (firstSoftTimer) {
        clearTimeout(firstSoftTimer);
        firstSoftTimer = null;
      }
      const tail = buf.trim();
      if (tail) onSentence(tail);
      buf = '';
      isFirst = true;
      firstStartedAt = 0;
    },
  };
}

// 현재 재생 중인 voice audio를 추적해 외부에서 stopVoiceAudio()로 즉시 중단할 수 있게 한다(오버레이 close / 모드 전환 시 음성이 계속 들리는 문제 방지).
let _currentVoiceAudio: HTMLAudioElement | null = null;
let _currentVoiceUrl: string | null = null;

/** Audio Blob URL 을 재생하고 끝까지 기다림. 도중 stopVoiceAudio() 로 중단 가능. */
export function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    _currentVoiceAudio = audio;
    _currentVoiceUrl = url;
    const cleanup = () => {
      if (_currentVoiceAudio === audio) {
        _currentVoiceAudio = null;
        _currentVoiceUrl = null;
      }
      URL.revokeObjectURL(url);
    };
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('오디오 재생 실패'));
    };
    // pause 로 외부 중단 시 ended 이벤트 안 옴 — abort 도 별도 처리
    audio.onpause = () => {
      // 끝나기 전 pause 호출 = 외부 stop. 다음 sentence 재생 막지 않게 resolve.
      if (!audio.ended && audio.currentTime < (audio.duration || Infinity)) {
        cleanup();
        resolve();
      }
    };
    audio.play().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}

/** 현재 재생 중인 voice audio 강제 중단 — overlay close / 모드 전환 시 호출. */
export function stopVoiceAudio(): void {
  const a = _currentVoiceAudio;
  if (a) {
    try { a.pause(); } catch {/* noop */}
    try { a.src = ''; } catch {/* noop */}
  }
  if (_currentVoiceUrl) {
    try { URL.revokeObjectURL(_currentVoiceUrl); } catch {/* noop */}
  }
  _currentVoiceAudio = null;
  _currentVoiceUrl = null;
}
