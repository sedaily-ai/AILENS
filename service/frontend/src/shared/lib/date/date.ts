// 공용 날짜 유틸. features/timeline과 features/news-feed가 "오늘"을 같은 방식으로 계산해야 하고 features 간 lateral import는 금지(boundaries 규칙)라 shared에 둔다.
export function kstTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// JSON-LD dateModified 계산. 공개 API가 updated_at을 내려주지만, 필드가 없을 때(옛 글)·발행일보다 이를 때(데이터 이상)·미래 시각일 때는
// 발행일을 쓴다(Search Console 문서가 미래 dateModified를 신뢰도 하락 신호로 본다).
export function clampModifiedIso(updatedAt: string | null | undefined, publishedIso: string): string {
  if (!updatedAt) return publishedIso;
  const updated = new Date(updatedAt);
  const published = new Date(publishedIso);
  if (Number.isNaN(updated.getTime())) return publishedIso;
  if (updated.getTime() < published.getTime()) return publishedIso;
  if (updated.getTime() > Date.now()) return publishedIso;
  return updated.toISOString();
}

// "YYYY.MM.DD HH:MM"(KST). lens 콘텐츠는 published_at(UTC ISO, 발행 완료 시각을 초 단위로 기록)이 있어 날짜뿐 아니라 시:분까지 보여 줄 수 있다.
// isoUtc가 없거나 파싱에 실패하면 null을 돌려주고, 호출부가 날짜만 있는 fallbackDate(YYYY-MM-DD)로 대체한다.
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

// "HH:MM"(KST). 날짜가 이미 화면에 있고 시:분만 필요할 때 쓴다(예: /timeline/[date] 목록은 h1이 날짜를 이미 보여 주므로 줄마다 날짜를 반복하지 않는다).
// features/news-feed의 NewsTimeMachineSection.formatTime과 같은 일을 하지만 features 간 lateral import가 금지라 shared로 올렸다(kstTodayStr과 같은 이유).
// 실패 시 '--:--' 같은 자리표시자 대신 null을 주어 호출부가 그 줄을 빼게 한다. S3 XML에 <time>이 없으면 백엔드 published_at이
// "2026-01-10T+09:00"처럼 파싱 불가한 문자열로 내려올 수 있다(clients/s3_xml_client.py의 strptime 실패 폴백).
export function kstTimeLabel(isoUtc: string | null | undefined): string | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}
