import Link from 'next/link';
import { buildPageItems } from '@/shared/lib/content/pagination';

// 목록 페이지 번호 막대(‹ 1 2 3 … ›). /lens, /words 등 서버 페이지네이션 목록이 같이 쓴다. 상태가 없어 서버·클라이언트 어디서든 쓸 수 있다.
export function Pager({ currentPage, totalPages, hrefFor }: { currentPage: number; totalPages: number; hrefFor: (n: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="페이지" style={{ marginTop: 36, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Link href={hrefFor(Math.max(currentPage - 1, 1))} aria-label="이전 페이지" aria-disabled={currentPage === 1} className="lp-pg" style={{ pointerEvents: currentPage === 1 ? 'none' : undefined, opacity: currentPage === 1 ? 0.35 : 1 }}>
        ‹
      </Link>
      {buildPageItems(currentPage, totalPages).map((n, i) =>
        n === 'ellipsis' ? (
          <span key={`e${i}`} aria-hidden style={{ minWidth: 24, textAlign: 'center', color: '#9ca3af' }}>
            …
          </span>
        ) : (
          <Link key={n} href={hrefFor(n)} aria-current={n === currentPage ? 'page' : undefined} aria-label={`${n}페이지`} className={`lp-pg${n === currentPage ? ' is-on' : ''}`}>
            {n}
          </Link>
        ),
      )}
      <Link href={hrefFor(Math.min(currentPage + 1, totalPages))} aria-label="다음 페이지" aria-disabled={currentPage === totalPages} className="lp-pg" style={{ pointerEvents: currentPage === totalPages ? 'none' : undefined, opacity: currentPage === totalPages ? 0.35 : 1 }}>
        ›
      </Link>
      <style>{`
        .lp-pg { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; height: 38px; padding: 0 8px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #374151; text-decoration: none; transition: background .15s ease; }
        .lp-pg:hover { background: #f1f5f9; }
        .lp-pg.is-on { background: #1f2937; color: #fff; pointer-events: none; }
      `}</style>
    </nav>
  );
}
