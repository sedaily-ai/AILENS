/**
 * 마이크 → 16kHz Int16 PCM chunk stream.
 *
 * AudioWorklet (public/audio-worklet/pcm-downsampler.js) 가 AudioContext 의
 * native sample rate (보통 48000) → 16000 Int16 다운샘플. main thread 가 chunk
 * 받자마자 onChunk 콜백.
 *
 * 사용:
 *   const cap = new AudioCapture({ onChunk: (pcm) => ws.send(encodeAudioEvent(pcm)) });
 *   await cap.start();
 *   ...
 *   cap.stop();
 *
 * 한 인스턴스 = 한 마이크 세션. 종료 시 mic track 정리, AudioContext close.
 * echoCancellation/noiseSuppression/autoGainControl 활성 — 통화 환경 기본.
 */

export interface AudioCaptureOptions {
  /** 16kHz Int16 PCM chunk 한 번 받을 때마다 호출 (~256ms 간격) */
  onChunk: (pcm: ArrayBuffer) => void;
  /** 오류 시 호출 (마이크 권한 거절, AudioContext 실패 등) */
  onError?: (msg: string) => void;
}

export class AudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stopped = false;

  constructor(private opts: AudioCaptureOptions) {}

  async start(): Promise<void> {
    try {
      // 마이크 + 통화용 처리 (echo/noise/auto-gain)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      // AudioContext (Safari 호환)
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctx();
      // iOS 등 자동재생 정책으로 suspended 일 수 있음
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      // AudioWorklet 모듈 로드 (정적 파일)
      await this.context.audioWorklet.addModule('/audio-worklet/pcm-downsampler.js');

      this.node = new AudioWorkletNode(this.context, 'pcm-downsampler');
      this.node.port.onmessage = (e) => {
        if (this.stopped) return;
        // e.data 는 transferable ArrayBuffer
        this.opts.onChunk(e.data as ArrayBuffer);
      };

      this.source = this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
      // worklet → destination 연결 안 함 (스피커로 마이크 echo 나가는 거 방지)
      // 대신 process 가 호출되려면 graph 에 destination 까지 path 필요 → silent gain
      const silentGain = this.context.createGain();
      silentGain.gain.value = 0;
      this.node.connect(silentGain).connect(this.context.destination);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.opts.onError?.(msg);
      throw e;
    }
  }

  stop(): void {
    this.stopped = true;
    try {
      this.node?.disconnect();
    } catch {/* noop */}
    try {
      this.source?.disconnect();
    } catch {/* noop */}
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {/* noop */}
    try {
      this.context?.close();
    } catch {/* noop */}
    this.node = null;
    this.source = null;
    this.stream = null;
    this.context = null;
  }
}
