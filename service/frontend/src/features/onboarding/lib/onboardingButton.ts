import type { CSSProperties } from 'react';

// 온보딩 공용 주요 액션 버튼 — 2026-09-03, "검정색 버튼도 좀 1차원적이고"
// 피드백으로 신설. 이전엔 Interest/Result/Done 3곳이 전부 `#0f172a` 플랫
// 배경만 있는 버튼을 각자 인라인으로 복붙해뒀다. 포맷이 이미 정해진 스텝
// (Result/Subscribe/Done)에는 그 포맷의 accent를 배경색 자체로 써서
// "당신을 위한 결과"라는 느낌을 버튼에도 이어지게 한다 — 아직 포맷을
// 모르는 단계(Interest)는 인자 없이 호출해 중립 다크(#111827)를 쓴다.
// 처음엔 accent색 그림자(glow)도 같이 줬는데, 사용자가 실제 화면에서
// 보고 "은은하게 비치는 glow가 번져 보인다"고 바로 잡아내 뺐다 — 카드
// 밖으로 색이 새어나가지 않게, 입체감은 버튼 자체의 색상 대비로만 낸다.
export function onboardingPrimaryButtonStyle(accent = '#111827'): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'center',
    padding: 15,
    borderRadius: 14,
    background: accent,
    border: 'none',
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    textDecoration: 'none',
  };
}
