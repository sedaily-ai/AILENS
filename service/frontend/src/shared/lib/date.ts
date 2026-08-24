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

// "HH:MM"(KST) — 날짜가 이미 화면에 있고 시:분만 필요할 때. 2026-08-24,
// /timeline/[date] 기사 목록에 발행 시각을 붙이면서 추가했다: 그 페이지는
// h1이 "2026년 8월 24일자 서울경제"라 목록 30줄에 날짜를 반복하면 이미 아는
// 정보만 늘어난다 — 그 줄에서 새로운 정보는 시:분뿐이다.
//
// features/news-feed의 NewsTimeMachineSection.formatTime이 같은 일을 하는데
// (같은 published_at을 쓰는 홈 위젯) features 간 lateral import가 금지라
// 가져다 쓸 수 없어서, 중복을 하나 더 만드는 대신 shared로 올렸다
// (kstTodayStr이 같은 이유로 여기 있다).
//
// 실패 시 '--:--' 같은 자리표시자를 만들지 않고 null을 준다 — 호출부가 그 줄을
// 아예 빼는 편이 낫다. S3 XML에 <time>이 없으면 백엔드 published_at이
// "2026-01-10T+09:00" 처럼 파싱 불가한 문자열로 내려올 수 있다
// (clients/s3_xml_client.py의 strptime 실패 폴백).
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
