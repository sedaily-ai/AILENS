// 홈 오디오 카드(AudioPreviewSection)의 재생 버튼 → 하단 고정 플레이어
// (TodayNewsPlayer)로 "이 항목 틀어줘" 요청을 전달하는 아주 얇은 이벤트
// 버스(2026-08-21, 사용자 요청 — "재생버튼 누르면 바 흘러가게 해주시죠,
// 해당 페이지로 리다이렉트말구"). 두 컴포넌트는 트리상 형제(레이아웃 레벨
// TodayNewsPlayer vs 피드 트리 안의 AudioPreviewSection)라 props로 못
// 잇는다 — Context Provider를 새로 씌우는 대신, 둘 다 이미 클라이언트
// 컴포넌트이므로 window CustomEvent로 가볍게 연결한다.
const EVENT_NAME = 'ailens:play-home-player-item';

export function requestPlayHomePlayerItem(id: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: id }));
}

export function onPlayHomePlayerItemRequest(handler: (id: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
