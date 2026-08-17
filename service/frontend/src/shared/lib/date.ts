// 공용 날짜 유틸 — features/timeline과 features/news-feed 양쪽이 "오늘"을
// 같은 방식으로 계산해야 해서 shared로 뺐다(2026-08-12, features 간 lateral
// import 금지 원칙 — boundaries 규칙 참조). 처음엔 features/timeline 안에
// 있었다.
export function kstTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// JSON-LD dateModified 계산(2026-08-18, GEO 점검 — en.sedaily.com 대비 저희는
// dateModified가 항상 datePublished와 같은 값이었다). 공개 API가 이제
// updated_at을 내려주지만, 방어적으로 세 경우엔 그냥 발행일을 쓴다:
// 필드가 없을 때(옛 글), 발행일보다 이를 때(데이터 이상), 미래 시각일 때
// (en.sedaily.com도 명시한 이유 — Search Console 문서가 미래 dateModified를
// 신뢰도 하락 신호로 본다).
export function clampModifiedIso(updatedAt: string | null | undefined, publishedIso: string): string {
  if (!updatedAt) return publishedIso;
  const updated = new Date(updatedAt);
  const published = new Date(publishedIso);
  if (Number.isNaN(updated.getTime())) return publishedIso;
  if (updated.getTime() < published.getTime()) return publishedIso;
  if (updated.getTime() > Date.now()) return publishedIso;
  return updated.toISOString();
}
