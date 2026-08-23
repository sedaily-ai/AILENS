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

// "YYYY.MM.DD HH:MM"(KST) — 2026-08-23, lens 콘텐츠는 published_at(UTC ISO,
// mustknow_auto/frontpage_auto가 발행 완료 시각을 초 단위로 기록)이 있어서
// 날짜만이 아니라 시:분까지 보여줄 수 있다("입력 2026.08.14"까지만 표기
// 가능하던 기존 한계 — LensViewClient.tsx 옛 주석 참조 — 를 published_at
// 노출로 해소). isoUtc가 없거나 파싱 실패하면 null을 돌려주고, 호출부가
// 날짜만 있는 fallbackDate(YYYY-MM-DD)로 대체한다.
export function kstDateTimeLabel(isoUtc: string | null | undefined): string | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}.${get('month')}.${get('day')} ${get('hour')}:${get('minute')}`;
}
