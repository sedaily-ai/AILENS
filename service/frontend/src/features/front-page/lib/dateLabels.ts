// 지면 날짜 라벨/계산 헬퍼 — 목록(FrontPageView)과 본문(FrontPageArticleView) 공용.

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// "2026-07-24" → "2026년 7월 24일 금요일"
export function formatPaperDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 ${dow}요일`;
}

// "2026-07-24" → "2026-07-23" (월/년 경계는 Date 정규화로 처리)
export function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${mm}-${dd}`;
}
