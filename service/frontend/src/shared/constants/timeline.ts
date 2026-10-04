// 타임라인(그날의 뉴스) 데이터 구간 경계 — 홈 구역(features/news-feed)과 /timeline(features/timeline)이 같은 값을 써야 해서 shared에 한 곳으로 둔다.

/** 서울경제 원본 기사 아카이브(S3)가 커버하는 최소 날짜(2026-08-17 실측). 이 날짜부터 오늘까지는 S3, 그 이전은 빅카인즈. */
export const ARCHIVE_MIN_DATE = '2026-02-01';

/** 빅카인즈 뉴스 검색으로 찾을 수 있는 가장 이른 날짜. 백엔드 BIGKINDS_MIN_DATE와 같은 값. */
export const BIGKINDS_MIN_DATE = '1990-01-01';

/** 날짜가 S3 아카이브 구간(최근)인지. 아니면 빅카인즈 구간. */
export function isArchiveDate(date: string): boolean {
  return date >= ARCHIVE_MIN_DATE;
}
