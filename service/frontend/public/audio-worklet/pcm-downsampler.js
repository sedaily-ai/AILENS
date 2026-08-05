/**
 * AudioWorklet — 마이크 입력 Float32 → 16kHz Int16 PCM 다운샘플러.
 *
 * AudioContext 기본 sample rate (보통 48000Hz) 에서 들어온 audio frame 을
 * 16000Hz Int16 PCM 으로 변환해 main thread 에 ArrayBuffer 로 post.
 * AWS Transcribe Streaming 이 16kHz PCM 만 받기 때문.
 *
 * 등록: audioContext.audioWorklet.addModule('/audio-worklet/pcm-downsampler.js')
 * 노드: new AudioWorkletNode(audioContext, 'pcm-downsampler')
 * 이벤트: node.port.onmessage = (e) => { e.data is ArrayBuffer of Int16 PCM at 16kHz }
 */

class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.sourceSampleRate = sampleRate; // global from AudioWorkletGlobalScope
    this.ratio = this.sourceSampleRate / this.targetSampleRate;
    this.accumulator = 0;
    this.outBuffer = [];
    // ~256ms 마다 flush (4096 samples @ 16kHz) — Transcribe 권장 chunk size
    this.flushThreshold = 4096;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0]; // mono, channel 0
    if (!channel) return true;

    // 단순 linear interpolation 다운샘플 (low pass filter 없음 — Transcribe 가 자체 처리)
    let i = 0;
    while (i < channel.length) {
      const idx = this.accumulator;
      const floor = Math.floor(idx);
      if (floor >= channel.length) {
        this.accumulator -= channel.length;
        break;
      }
      const ceil = Math.min(floor + 1, channel.length - 1);
      const frac = idx - floor;
      const sample = channel[floor] * (1 - frac) + channel[ceil] * frac;
      // Float32 [-1, 1] → Int16 [-32768, 32767]
      const i16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      this.outBuffer.push(i16);
      this.accumulator += this.ratio;
      i = Math.floor(this.accumulator);
    }

    if (this.outBuffer.length >= this.flushThreshold) {
      const arr = new Int16Array(this.outBuffer);
      this.outBuffer = [];
      // transferable — main thread 가 buffer 소유권 가져감 (zero-copy)
      this.port.postMessage(arr.buffer, [arr.buffer]);
    }

    return true; // keep processing
  }
}

registerProcessor('pcm-downsampler', PcmDownsampler);
