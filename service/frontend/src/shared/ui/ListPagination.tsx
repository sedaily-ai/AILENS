'use client';

import Link from 'next/link';
import { buildPageItems } from '@/shared/lib/pagination';

// 목록 페이지(video/listen, 2026-08-28 신설) 공용 페이지네이션 — n개씩
// 보기 셀렉트 + 페이지 번호. lens(/lens/page/[n])·webtoon(/webtoon?page=)
// 처럼 기본 페이지 크기일 때는 경로 세그먼트 Link로 크롤러·CDN 캐시가
// 타게 하고, 사용자가 페이지 크기를 바꾸면(이미 브라우저에 다 로드된
// 전체 목록을 다시 슬라이스만 하면 되므로) 그 세션 한정으로 버튼 기반
// 클라이언트 상태 페이지네이션으로 전환한다 — 커스텀 크기마다 정적
// 라우트를 만들 필요가 없다.
const PG_STYLE = (active: boolean, disabled: boolean, accent: string): React.CSSProperties => ({
  minWidth: 40,
  height: 40,
  padding: '0 8px',
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: 700,
  cursor: disabled ? 'default' : 'pointer',
  fontVariantNumeric: 'tabular-nums',
  border: active ? `1px solid ${accent}` : '1px solid rgba(17,24,39,0.12)',
  background: active ? accent : '#fff',
  color: active ? '#fff' : disabled ? '#c0c5cc' : '#374151',
  pointerEvents: disabled ? 'none' : undefined,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export function ListPagination({
  currentPage,
  totalPages,
  pageHref,
  isCustomSize,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  accentColor = '#3b82f6',
  totalCount,
}: {
  currentPage: number;
  totalPages: number;
  /** 기본 페이지 크기일 때 쓰는 정적 경로(예: /video/page/3). */
  pageHref: (n: number) => string;
  /** 사용자가 기본값과 다른 페이지 크기를 골랐는지 — true면 Link 대신 버튼. */
  isCustomSize: boolean;
  onPageChange: (n: number) => void;
  pageSize: number;
  pageSizeOptions: number[];
  onPageSizeChange: (n: number) => void;
  accentColor?: string;
  totalCount: number;
}) {
  // 생략 부호 포함(2026-09-02) — 예전엔 총 페이지 수만큼 무조건 버튼을
  // 다 그려서, 페이지가 많아지면(웹툰에서 실측 52페이지) 버튼이 수십
  // 개씩 나열됐다. flex-wrap 덕에 화면 밖으로 안 넘치긴 했지만 그것도
  // 여러 줄로 접힌 버튼 무더기라 UX가 나빴다.
  const pages = buildPageItems(currentPage, totalPages);

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
      style={{ gap: 12, marginTop: 32 }}
    >
      <label className="flex items-center" style={{ gap: 8, fontSize: 13, color: '#6b7280' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>총 {totalCount}개</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{
            height: 32,
            padding: '0 8px',
            borderRadius: 8,
            border: '1px solid rgba(17,24,39,0.14)',
            fontSize: 13,
            color: '#374151',
            background: '#fff',
          }}
          aria-label="한 페이지에 보일 개수"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}개씩 보기
            </option>
          ))}
        </select>
      </label>

      {totalPages > 1 && (
        <nav aria-label="목록 페이지" className="flex items-center flex-wrap" style={{ gap: 6 }}>
          {isCustomSize ? (
            <>
              <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
                style={PG_STYLE(false, currentPage === 1, accentColor)}
              >
                ‹
              </button>
              {pages.map((n, i) =>
                n === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} aria-hidden style={{ minWidth: 24, textAlign: 'center', color: '#9ca3af' }}>
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onPageChange(n)}
                    aria-current={n === currentPage ? 'page' : undefined}
                    aria-label={`${n}페이지`}
                    style={PG_STYLE(n === currentPage, false, accentColor)}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="다음 페이지"
                style={PG_STYLE(false, currentPage === totalPages, accentColor)}
              >
                ›
              </button>
            </>
          ) : (
            <>
              <Link
                href={pageHref(currentPage - 1)}
                aria-label="이전 페이지"
                aria-disabled={currentPage === 1}
                style={PG_STYLE(false, currentPage === 1, accentColor)}
              >
                ‹
              </Link>
              {pages.map((n, i) =>
                n === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} aria-hidden style={{ minWidth: 24, textAlign: 'center', color: '#9ca3af' }}>
                    …
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={pageHref(n)}
                    aria-current={n === currentPage ? 'page' : undefined}
                    aria-label={`${n}페이지`}
                    style={PG_STYLE(n === currentPage, false, accentColor)}
                  >
                    {n}
                  </Link>
                ),
              )}
              <Link
                href={pageHref(currentPage + 1)}
                aria-label="다음 페이지"
                aria-disabled={currentPage === totalPages}
                style={PG_STYLE(false, currentPage === totalPages, accentColor)}
              >
                ›
              </Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
