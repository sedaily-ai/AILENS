import type { CmsPost, CmsStatus } from "@/lib/types";

export const STATUS_LABEL: Record<CmsStatus, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

export const STATUS_STYLE: Record<CmsStatus, string> = {
  draft: "ui-badge-draft",
  published: "ui-badge-published",
  archived: "ui-badge-archived",
};

export const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "published", label: "발행" },
];

// 발행일 칸 — 실제 발행 시각(published_at, UTC ISO)이 있으면 분까지(요청에
// 따라 초까지) 보여주고, 아직 발행 전(초안 등이라 published_at이 없는)
// 글은 편집자가 지정한 발행"일"(publish_date, 날짜만)만 보여준다 —
// "발행일만 나오지 말고 시간·분까지" 요청(2026-08-09)이지만 실제로 발행된
// 적 없는 글에 시각을 지어낼 순 없다. sv-SE 로케일이 "YYYY-MM-DD HH:mm:ss"
// 를 그대로 내놓아서 별도 조립 없이 쓴다.
export function formatPublishCell(p: CmsPost): string {
  if (!p.published_at) return p.publish_date;
  const d = new Date(p.published_at);
  if (Number.isNaN(d.getTime())) return p.publish_date;
  return d.toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// 정렬 키도 같은 이유로 published_at 우선 — 같은 발행"일"에 여러 건이
// 몰려도 실제 발행된 순서대로 정렬된다. published_at이 없는 글(날짜만
// 있는 문자열)은 자연스럽게 그 날짜의 "가장 이른 시각"처럼 취급된다(문자열
// 비교상 짧은 쪽이 접두사라 더 작게 정렬).
export function sortKey(p: CmsPost): string {
  return p.published_at || p.publish_date;
}
