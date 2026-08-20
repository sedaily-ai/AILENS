import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// 애니메이션 규칙 상수 (초 단위 → useVideoConfig().fps로 프레임 환산)
export const TRANSITION_SECONDS = 0.3; // 컷 전환 크로스페이드
export const CAPTION_DELAY_SECONDS = 0.2; // 자막 등장 지연
export const DIAGRAM_STAGGER_SECONDS = 0.3; // diagram 노드 순차 등장 간격
export const CHART_BAR_STAGGER_SECONDS = 0.08; // chart 막대 순차 등장 간격
export const CHART_LINE_DRAW_SECONDS = 1.4; // chart 꺾은선 드로잉 총 시간
export const HIGHLIGHT_BOX_DRAW_SECONDS = 0.7; // highlight 박스 테두리 드로잉 시간
export const HIGHLIGHT_EMPHASIS_SECONDS = 0.35; // 테두리 완성 후 강조색 전환 시간
export const STAT_COUNT_UP_SECONDS = 1.2; // stat 숫자 카운트업 시간
export const ENTRANCE_SECONDS = 0.5; // 컷/자막 진입 페이드+슬라이드 총 시간

export const useFrames = (seconds: number): number => {
  const { fps } = useVideoConfig();
  return Math.round(seconds * fps);
};

// 컷 진입: 페이드인 + 20px 위로 슬라이드 (spring, overshoot 없음 — 절제된 톤).
// delaySeconds를 주면 그만큼 늦게 시작한다 (예: 자막의 0.2초 지연).
export const useEntranceStyle = (delaySeconds = 0): React.CSSProperties => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delayFrames = Math.round(delaySeconds * fps);
  const localFrame = Math.max(frame - delayFrames, 0);
  const active = frame >= delayFrames;

  const progress = spring({
    frame: localFrame,
    fps,
    config: { damping: 200, stiffness: 260, mass: 0.9 },
  });
  const opacity = active
    ? interpolate(localFrame, [0, Math.round(ENTRANCE_SECONDS * fps * 0.6)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;
  const translateY = interpolate(progress, [0, 1], [20, 0]);

  return { opacity, transform: `translateY(${translateY}px)` };
};

// 0..1 등장 progress. 아이콘 스케일업 등 커스텀 애니메이션에 사용.
export const useEnterProgress = (delaySeconds = 0, durationSeconds = ENTRANCE_SECONDS): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delayFrames = Math.round(delaySeconds * fps);
  const localFrame = frame - delayFrames;
  return spring({
    frame: localFrame,
    fps,
    durationInFrames: Math.round(durationSeconds * fps),
    config: { damping: 200, stiffness: 260, mass: 0.9 },
  });
};

// 0 → targetValue 카운트업 (ease-out). 컷 시작과 동시에 시작.
export const useCountUp = (targetValue: number, durationSeconds = STAT_COUNT_UP_SECONDS): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.round(durationSeconds * fps);
  const value = interpolate(frame, [0, durationFrames], [0, targetValue], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return Math.round(value);
};

// 특정 시작 프레임 이후 진행되는 0..1 progress (staggered 항목에 사용).
export const useDelayedProgress = (delayFrames: number, durationFrames: number): number => {
  const frame = useCurrentFrame();
  return interpolate(frame - delayFrames, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
