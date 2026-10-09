'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import { econSubcategoriesFor } from '@/shared/constants/econSubcategories';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from '@/shared/lib/search/recentSearches';
import { DEFAULT_PARAMS, loadSearchIndex, parseTerms, search, splitHighlight, topKeywords, type SearchRecord } from '@/shared/lib/search/searchIndex';

// 헤더 돋보기를 누르면 헤더 아래로 펼쳐지는 전체 메뉴 + 검색 패널(참조: 영문판 메가메뉴).
//   왼쪽: 카테고리와 하위 카테고리 전체 / 오른쪽: 검색창 · 최근 검색어 · 요즘 많이 나온 키워드 / 맨 아래: 서비스 링크
// 입력하면 오른쪽에 추천 결과가 바로 뜨고, Enter·화살표 버튼·키워드 칩은 결과 페이지(/search?q=)로 보낸다. 이전의 AI 대화형 검색은 일반 검색으로 바뀌었다(2026-10-09).
type Props = { open: boolean; onClose: () => void };

const SUGGEST_MAX = 5;
const FOOT_LINKS: Array<[string, string]> = [['서비스 소개', '/about'], ['문의', '/contact'], ['이용약관', '/terms'], ['개인정보처리방침', '/privacy']];

export function SearchOverlay({ open, onClose }: Props) {
  if (!open) return null;
  return <Panel onClose={onClose} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const uid = useId().replace(/:/g, '');
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  // 패널은 열릴 때만 마운트되므로(서버 렌더 없음) 처음 렌더에서 바로 저장소를 읽어도 된다.
  const [recent, setRecent] = useState<string[]>(() => getRecentSearches());
  const [items, setItems] = useState<SearchRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  // 헤더 바로 아래에서 시작한다(헤더는 그대로 보인다). 헤더를 못 찾으면 56px.
  const [top] = useState(() => {
    const h = document.querySelector('header');
    return h ? Math.max(0, Math.round(h.getBoundingClientRect().bottom)) : 56;
  });

  useEffect(() => {
    // 마우스가 있는 화면에서만 바로 입력할 수 있게 포커스한다. 터치 기기는 키보드가 메뉴를 가리지 않게 눌렀을 때 올린다.
    if (window.matchMedia?.('(hover: hover)').matches) inputRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSearchIndex()
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const keywords = useMemo(() => (items ? topKeywords(items, 3, 8) : []), [items]);
  // 검색 목록이 로드되면 글이 실제로 있는 분류·하위 분류만 남긴다(목록 전에는 정의된 전체를 보여 주고, 못 불러오면 그대로 둔다).
  const menu = useMemo(() => {
    const counts = new Map<string, number>();
    if (items) for (const r of items) if (r.c) counts.set(`${r.c}|${r.u}`, (counts.get(`${r.c}|${r.u}`) ?? 0) + 1);
    return ECON_CATEGORIES.map((cfg) => {
      const all = econSubcategoriesFor(cfg.slug);
      const subs = items ? all.filter((s) => (counts.get(`${cfg.label}|${s}`) ?? 0) > 0) : all;
      const total = items ? all.reduce((n, s) => n + (counts.get(`${cfg.label}|${s}`) ?? 0), 0) + (counts.get(`${cfg.label}|`) ?? 0) : 1;
      return { cfg, subs, total };
    }).filter((m) => m.total > 0);
  }, [items]);
  const suggestions = useMemo(() => (items && q.trim() ? search(items, { ...DEFAULT_PARAMS, q }).slice(0, SUGGEST_MAX) : []), [items, q]);
  const terms = useMemo(() => parseTerms(q), [q]);

  const go = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t) return;
      addRecentSearch(t);
      onClose();
      router.push(`/search?q=${encodeURIComponent(t)}`);
    },
    [onClose, router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pick = active >= 0 ? suggestions[active] : null;
    if (pick) {
      addRecentSearch(q.trim());
      onClose();
      router.push(lensPath({ id: pick.rec.i, date: pick.rec.d, category: pick.rec.c || null }));
      return;
    }
    go(q);
  }

  const searchColumn = (
    <div className="mm-search">
      <form onSubmit={onSubmit} role="search">
        <div className="mm-field">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3d70de" strokeWidth={2.2} aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(-1);
            }}
            maxLength={100}
            placeholder="궁금한 이슈를 검색해 보세요"
            aria-label="검색어"
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={`${uid}-list`}
          />
          {q && (
            <button type="button" className="mm-x" aria-label="입력 지우기" onClick={() => { setQ(''); inputRef.current?.focus(); }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
          <button type="submit" className="mm-go" aria-label="검색" disabled={!q.trim()}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </form>

      {q.trim() ? (
        <>
          {suggestions.length > 0 ? (
            <ul id={`${uid}-list`} role="listbox" className="mm-list">
              {suggestions.map((h, i) => (
                <li key={h.rec.i} role="option" aria-selected={i === active} className="mm-item">
                  <Link
                    href={lensPath({ id: h.rec.i, date: h.rec.d, category: h.rec.c || null })}
                    data-on={i === active}
                    onClick={() => {
                      addRecentSearch(q.trim());
                      onClose();
                    }}
                  >
                    <span className="mm-it">
                      {splitHighlight(h.rec.h, terms).map((p, k) => (p.hit ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>))}
                    </span>
                    <span className="mm-im">
                      {h.rec.c || '기타'} · {h.rec.d.replaceAll('-', '.')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : items ? (
            <p className="mm-empty">‘{q.trim()}’에 맞는 이슈가 없어요. 다른 단어로 찾아볼까요?</p>
          ) : failed ? (
            <p className="mm-empty">검색 목록을 불러오지 못했어요. 검색 버튼을 누르면 결과 페이지에서 다시 시도해요.</p>
          ) : (
            <p className="mm-empty">찾는 중…</p>
          )}
          <button type="button" className="mm-all" onClick={() => go(q)}>
            <span>‘{q.trim()}’ 전체 결과 보기</span>
            <span aria-hidden>→</span>
          </button>
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="mm-sec" aria-label="최근 검색어">
              <p className="mm-h">
                <span>최근 검색어</span>
                <button type="button" onClick={() => { clearRecentSearches(); setRecent([]); }}>
                  모두 지우기
                </button>
              </p>
              <ul className="mm-chips">
                {recent.map((r) => (
                  <li key={r} className="mm-chip-wrap">
                    <button type="button" className="mm-chip" onClick={() => go(r)}>
                      {r}
                    </button>
                    <button type="button" className="mm-chip-del" aria-label={`${r} 지우기`} onClick={() => setRecent(removeRecentSearch(r))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mm-sec" aria-label="요즘 많이 나온 키워드">
            <p className="mm-h">
              <span>요즘 많이 나온 키워드</span>
            </p>
            {items ? (
              keywords.length > 0 && (
                <>
                  <ul className="mm-chips">
                    {keywords.map((k) => (
                      <li key={k}>
                        <button type="button" className="mm-chip kw" onClick={() => go(k)}>
                          {k}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mm-note">최근 사흘간 기사 제목에 자주 나온 말이에요(검색 순위가 아니에요).</p>
                </>
              )
            ) : failed ? null : (
              <div className="mm-chips" aria-busy="true" aria-label="불러오는 중">
                {[64, 86, 72, 98, 70].map((w, i) => (
                  <span key={i} className="mm-sk" style={{ width: w }} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="전체 메뉴와 검색" onKeyDown={onKeyDown} style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <style>{`
        @keyframes mm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mm-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
        .mm-scrim { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(17,24,39,.4); animation: mm-fade .18s ease both; }
        .mm-panel { position: absolute; left: 0; right: 0; max-height: calc(100dvh - var(--mm-top)); overflow-y: auto; overscroll-behavior: contain; background: #fff; border-bottom: 1px solid #e5e7eb; box-shadow: 0 24px 48px -24px rgba(17,24,39,.35); animation: mm-in .2s cubic-bezier(.2,.7,.2,1) both; }
        .mm-inner { max-width: 1320px; margin: 0 auto; padding: 24px clamp(16px, 3.5vw, 44px) 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; }
        .mm-cats { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; order: 2; }
        .mm-search { order: 1; min-width: 0; }
        .mm-cat h3 { margin: 0 0 6px; font-size: 13px; font-weight: 800; letter-spacing: .08em; color: #111827; }
        .mm-cat h3 a { color: inherit; text-decoration: none; }
        .mm-cat h3 a:hover { color: #3d70de; }
        .mm-cat ul { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 0; padding: 0; list-style: none; }
        .mm-cat li a { display: inline-block; padding: 5px 0; font-size: 14.5px; color: #4b5563; text-decoration: none; }
        .mm-cat li a:hover { color: #3d70de; }
        .mm-foot { grid-column: 1 / -1; order: 3; display: flex; flex-wrap: wrap; gap: 4px 24px; margin: 4px calc(-1 * clamp(16px, 3.5vw, 44px)) 0; padding: 14px clamp(16px, 3.5vw, 44px); background: #f8f9fb; box-shadow: 0 0 0 100vmax #f8f9fb; clip-path: inset(0 -100vmax); border-top: 1px solid #eef0f3; }
        .mm-foot a { font-size: 13.5px; font-weight: 700; color: #1f2937; text-decoration: none; }
        .mm-foot a:hover { color: #3d70de; }
        .mm-field { display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 6px 0 16px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 2px #3d70de; }
        .mm-field input { flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent; font-size: 16px; font-weight: 600; color: #111827; font-family: inherit; }
        .mm-field input::placeholder { color: #9ca3af; font-weight: 500; }
        .mm-field input::-webkit-search-cancel-button { display: none; }
        .mm-go { flex: none; width: 40px; height: 40px; border: none; border-radius: 10px; background: #3d70de; color: #fff; display: grid; place-items: center; cursor: pointer; transition: background .15s; }
        .mm-go:hover { background: #3260c8; }
        .mm-go:disabled { background: #c7d2e6; cursor: default; }
        .mm-x { flex: none; width: 32px; height: 32px; border: none; border-radius: 50%; background: transparent; color: #6b7280; display: grid; place-items: center; cursor: pointer; }
        .mm-x:hover { background: #eef0f3; }
        .mm-sec { margin-top: 18px; }
        .mm-h { display: flex; align-items: center; justify-content: space-between; margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #6b7280; }
        .mm-h button { border: none; background: none; font-size: 12.5px; font-weight: 600; letter-spacing: 0; color: #9ca3af; cursor: pointer; padding: 2px 0; }
        .mm-h button:hover { color: #374151; }
        .mm-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .mm-chip { display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border: none; border-radius: 999px; background: #f1f3f6; color: #1f2937; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; transition: background .15s; }
        .mm-chip:hover { background: #e4e9f2; }
        .mm-chip.kw { background: #eef3ff; color: #1e3a8a; }
        .mm-chip.kw::before { content: '#'; margin-right: 3px; color: #3d70de; font-weight: 600; }
        .mm-chip.kw:hover { background: #dfe8ff; }
        .mm-chip-wrap { display: inline-flex; align-items: center; background: #f1f3f6; border-radius: 999px; }
        .mm-chip-wrap .mm-chip { background: transparent; padding-right: 4px; }
        .mm-chip-wrap .mm-chip:hover { background: #e4e9f2; border-radius: 999px 0 0 999px; }
        .mm-chip-del { width: 28px; height: 36px; border: none; background: transparent; color: #9ca3af; font-size: 15px; cursor: pointer; border-radius: 0 999px 999px 0; }
        .mm-chip-del:hover { color: #111827; background: #e4e9f2; }
        .mm-sk { display: inline-block; height: 36px; border-radius: 999px; background: #f1f3f6; animation: mm-pulse 1.1s ease-in-out infinite; }
        @keyframes mm-pulse { 50% { opacity: .5; } }
        .mm-note { margin: 10px 0 0; font-size: 12px; color: #9ca3af; }
        .mm-list { margin: 12px 0 0; padding: 0; list-style: none; }
        .mm-item a { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; margin: 0 -10px; border-radius: 10px; text-decoration: none; color: #111827; }
        .mm-item a:hover, .mm-item a[data-on='true'] { background: #f3f7ff; }
        .mm-it { font-size: 14.5px; font-weight: 700; line-height: 1.4; word-break: keep-all; }
        .mm-im { font-size: 12px; color: #9ca3af; }
        .mm-it mark { background: rgba(61,112,222,.16); color: inherit; border-radius: 3px; padding: 0 1px; }
        .mm-all { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 6px; padding: 11px 0; border: none; border-top: 1px solid #eef0f3; background: transparent; color: #3d70de; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; text-align: left; }
        .mm-empty { margin: 16px 0 4px; font-size: 14px; color: #6b7280; }
        @media (min-width: 1024px) {
          .mm-inner { grid-template-columns: minmax(0, 1fr) 360px; column-gap: 56px; padding-top: 32px; }
          /* 열 폭을 좁혀 데스크톱(왼쪽 영역 약 780px)에서 6열 × 2행으로 보이게 한다(영문 사이트 메뉴와 같은 밀도). 더 좁은 화면은 자동으로 열 수가 줄어든다. */
          .mm-cats { order: 1; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 32px 20px; align-content: start; }
          .mm-search { order: 2; }
          .mm-cat ul { flex-direction: column; gap: 0; }
          .mm-cat li a { padding: 6px 0; font-size: 15px; }
        }
        /* 노트북 폭(1024~1279px)에서는 검색 열을 줄여 카테고리가 5열 × 2행으로 들어가게 한다. */
        @media (min-width: 1024px) and (max-width: 1279px) {
          .mm-inner { grid-template-columns: minmax(0, 1fr) 320px; column-gap: 40px; }
        }
        @media (prefers-reduced-motion: reduce) { .mm-scrim, .mm-panel, .mm-sk { animation: none; } }
      `}</style>
      <div className="mm-scrim" style={{ top }} onClick={onClose} />
      <div className="mm-panel" style={{ top, ['--mm-top' as string]: `${top}px` }}>
        <div className="mm-inner">
          <div className="mm-cats">
            {menu.map(({ cfg, subs }) => (
              <section key={cfg.slug} className="mm-cat" aria-label={cfg.label}>
                <h3>
                  <Link href={`/${cfg.slug}`} onClick={onClose}>
                    {cfg.label}
                  </Link>
                </h3>
                <ul>
                  {subs.map((sub) => (
                    <li key={sub}>
                      <Link href={`/${cfg.slug}?sub=${encodeURIComponent(sub)}`} onClick={onClose}>
                        {sub}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {searchColumn}
          <nav className="mm-foot" aria-label="서비스 링크">
            {FOOT_LINKS.map(([label, href]) => (
              <Link key={href} href={href} onClick={onClose}>
                {label}
              </Link>
            ))}
            <a href="/rss.xml">RSS</a>
          </nav>
        </div>
      </div>
    </div>,
    document.body,
  );
}
