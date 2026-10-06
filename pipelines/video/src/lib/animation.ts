import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

// 애니메이션 규칙 상수 (초 단위 → useVideoConfig().fps로 프레임 환산)
export const TRANSITION_SECONDS = 0.3; // 컷 전환 크로스페이드
export const CAPTION_DELAY_SECONDS = 0.2; // 자막 등장 지연
export const DIAGRAM_STAGGER_SECONDS = 0.3; // diagram 노드 순차 등장 간격
export const CHART_BAR_STAGGER_SECONDS = 0.08; // chart 막대 순차 등장 간격
export const CHART_LINE_DRAW_SECONDS = 1.4; // chart 꺾은선 드로잉 총 시간
export const STAT_COUNT_UP_SECONDS = 1.2; // stat 숫자 카운트업 시간
export const ENTRANCE_SECONDS = 0.5; // 컷/자막 진입 페이드+슬라이드 총 시간

export const useFrames = (seconds: number): number => {
  const { fps } = useVideoConfig();
  return Math.round(seconds * fps);
};

// 스프링 기본값(프롬프트 §10): 등장 damping 14 / stiffness 170, 강조 튐 damping 9 / stiffness 180,
// 지도 카메라·마무리 damping 18 / stiffness 70. 텍스트 슬라이드는 살짝의 탄력만, 아이콘 같은
// 포인트 요소는 확실히 튀도록 감쇠비를 다르게 둔다. 감쇠비가 너무 크면(과감쇠) 오버슈트가 없어
// 단순 ease-out과 구분되지 않는다.
export const SPRING_ENTRANCE = { damping: 14, stiffness: 170 };
export const SPRING_EMPHASIS = { damping: 9, stiffness: 180 };
export const SPRING_SLOW = { damping: 18, stiffness: 70 };
const ENTRANCE_SPRING = SPRING_ENTRANCE;
const ICON_POP_SPRING = SPRING_EMPHASIS;

// 컷 진입: 페이드인 + 20px 위로 슬라이드.
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
    config: ENTRANCE_SPRING,
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
    config: ICON_POP_SPRING,
  });
};

// 0 → targetValue 카운트업 (ease-out). 컷 시작과 동시에 시작.
// 소수 값도 지원한다. 목표값의 소수 자릿수(최대 4)에 맞춰 반올림한다.
export const useCountUpDecimal = (targetValue: number, durationSeconds = STAT_COUNT_UP_SECONDS): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.round(durationSeconds * fps);
  const decimals = Math.min(4, (String(targetValue).split('.')[1] ?? '').length);
  const value = interpolate(frame, [0, durationFrames], [0, targetValue], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
};

// 특정 시작 프레임 이후 진행되는 0..1 progress (staggered 항목에 사용).
export const useDelayedProgress = (delayFrames: number, durationFrames: number): number => {
  const frame = useCurrentFrame();
  return interpolate(frame - delayFrames, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
