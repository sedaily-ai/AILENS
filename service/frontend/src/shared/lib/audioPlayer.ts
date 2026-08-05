/**
 * 시크릿 없는 단일 오디오 재생기.
 *
 * 프로덕션 음성 경로는 ElevenLabs 를 클라이언트에서 직접 호출하지 않는다.
 * 발행 시 사전 합성된 mp3 를 같은 오리진(S3 + CloudFront)에서 받아 재생만
 * 한다 — 키가 번들에 포함되지 않으므로 안전하게 배포 가능.
 */
let currentAudio: HTMLAudioElement | null = null;

export interface PlayCallbacks {
  onPlay?: () => void;
  onEnd?: () => void;
  onError?: (e: unknown) => void;
}

export function playAudioUrl(url: string, cb?: PlayCallbacks): void {
  stopAudio();
  const audio = new Audio(url);
  currentAudio = audio;
  audio.onplaying = () => cb?.onPlay?.();
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    cb?.onEnd?.();
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    cb?.onError?.(audio.error);
  };
  audio.play().catch((e) => {
    if (currentAudio === audio) currentAudio = null;
    cb?.onError?.(e);
  });
}

export function stopAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

// letter.id ('l-20260518-NT') → '/podcast/2026-05-18/NT.mp3'
// 같은 오리진 정적 경로. 로컬은 Next public/, 배포는 CloudFront 가 서빙.
export function letterPodcastUrl(letterId: string): string | null {
  const m = letterId.match(/^l-(\d{4})(\d{2})(\d{2})-([A-Z]{2})$/);
  if (!m) return null;
  const [, y, mo, d, group] = m;
  return `/podcast/${y}-${mo}-${d}/${group}.mp3`;
}
