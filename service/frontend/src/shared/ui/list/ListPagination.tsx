'use client';

import Link from 'next/link';
import { buildPageItems } from '@/shared/lib/content/pagination';

// 목록 페이지(video/listen) 공용 페이지네이션: n개씩 보기 셀렉트 + 페이지 번호.
// lens(/lens/page/[n])·webtoon(/webtoon?page=)처럼 기본 페이지 크기일 때는 경로 세그먼트 Link로 크롤러·CDN 캐시가 타게 하고,
// 사용자가 페이지 크기를 바꾸면(이미 로드된 전체 목록을 다시 슬라이스만 하면 되므로) 그 세션 한정으로 버튼 기반 클라이언트 상태 페이지네이션으로 전환한다
// (커스텀 크기마다 정적 라우트가 필요 없다).
// 번호 버튼은 테두리 없는 숫자로 두고 현재 페이지만 채운 원형으로 강조한다(hover는 .lp-num 클래스, 아래 <style>).
// 활성 페이지 배경은 accent를 꽉 채우지 않고 10% 알파 톤(`${accent}14`)을 쓴다(ArticleThumb 등과 같은 패턴). "1~10 블록 전체 노출" 구조는 pagination.ts 주석 참조.
const PG_STYLE = (active: boolean, disabled: boolean, accent: string): React.CSSProperties => ({
  minWidth: 32,
  height: 32,
  padding: '0 4px',
  borderRadius: 999,
  fontSize: 13.5,
  fontWeight: active ? 700 : 500,
  cursor: disabled ? 'default' : 'pointer',
  fontVariantNumeric: 'tabular-nums',
  border: 'none',
  background: active ? `${accent}1A` : 'transparent',
  color: active ? accent : disabled ? '#d1d5db' : '#4b5563',
  pointerEvents: disabled ? 'none' : undefined,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s ease, color 0.15s ease',
});

// 이전/다음 화살표만 옅은 원형 테두리로 남긴다 — 숫자 무리와 구분되는
// "컨트롤"이라는 역할을 시각적으로도 유지.
const PG_ARROW_STYLE = (disabled: boolean): React.CSSProperties => ({
  minWidth: 32,
  height: 32,
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  border: '1px solid rgba(17,24,39,0.12)',
  background: '#fff',
  color: disabled ? '#d1d5db' : '#4b5563',
  pointerEvents: disabled ? 'none' : undefined,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s ease',
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
  // 생략 부호를 포함한다. 총 페이지 수만큼 버튼을 그리면 페이지가 많을 때(웹툰 52페이지) 버튼이 여러 줄로 쌓인다.
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
                style={PG_ARROW_STYLE(currentPage === 1)}
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
                    className={n === currentPage ? undefined : 'lp-num'}
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
                style={PG_ARROW_STYLE(currentPage === totalPages)}
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
                style={PG_ARROW_STYLE(currentPage === 1)}
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
                    className={n === currentPage ? undefined : 'lp-num'}
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
                style={PG_ARROW_STYLE(currentPage === totalPages)}
              >
                ›
              </Link>
            </>
          )}
        </nav>
      )}
      <style>{`
        .lp-num:hover { background: rgba(17,24,39,0.06); color: #111827; }
      `}</style>
    </div>
  );
}
