'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import { econSubcategoriesFor } from '@/shared/constants/econSubcategories';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '@/shared/lib/search/recentSearches';
import {
  countByCategory,
  countBySub,
  DEFAULT_PARAMS,
  loadSearchIndex,
  MAX_QUERY_LENGTH,
  parseTerms,
  search,
  splitHighlight,
  topKeywords,
  UNCATEGORIZED,
  type SearchParams,
  type SearchPeriod,
  type SearchRecord,
  type SearchScope,
  type SearchSort,
} from '@/shared/lib/search/searchIndex';

// 일반 검색 결과 — 검색창 → 정렬·상세 조건(범위·기간, 접힘) → 분류 탭 → 결과(좌) / 요즘 많이 나온 키워드(우).
// 검색 조건은 모두 주소(?q=&sort=&scope=&period=&cat=)에 담아 공유·뒤로가기가 되고, 검색은 브라우저에서 바로 한다(shared/lib/search/searchIndex.ts).
const PAGE_SIZE = 20;

const SORTS: Array<[SearchSort, string]> = [['latest', '최신순'], ['relevance', '정확도순']];
const SCOPES: Array<[SearchScope, string]> = [['all', '전체'], ['title', '제목'], ['summary', '요약']];
const PERIODS: Array<[SearchPeriod, string]> = [['all', '전체'], ['today', '오늘'], ['week', '1주'], ['month', '1달']];
const CATEGORY_ORDER = [...ECON_CATEGORIES.map((c) => c.label), UNCATEGORIZED];

function pick<T extends string>(value: string | null, allowed: Array<[T, string]>, fallback: T): T {
  return allowed.some(([v]) => v === value) ? (value as T) : fallback;
}

function paramsFromUrl(sp: URLSearchParams): SearchParams {
  return {
    q: (sp.get('q') ?? '').slice(0, MAX_QUERY_LENGTH),
    sort: pick(sp.get('sort'), SORTS, DEFAULT_PARAMS.sort),
    scope: pick(sp.get('scope'), SCOPES, DEFAULT_PARAMS.scope),
    period: pick(sp.get('period'), PERIODS, DEFAULT_PARAMS.period),
    category: sp.get('cat') ?? '',
    sub: sp.get('cat') ? (sp.get('sub') ?? '') : '', // 하위 분류는 대분류를 골랐을 때만 의미가 있다
  };
}

function urlFor(p: SearchParams): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.sort !== DEFAULT_PARAMS.sort) qs.set('sort', p.sort);
  if (p.scope !== DEFAULT_PARAMS.scope) qs.set('scope', p.scope);
  if (p.period !== DEFAULT_PARAMS.period) qs.set('period', p.period);
  if (p.category) qs.set('cat', p.category);
  if (p.category && p.sub) qs.set('sub', p.sub);
  const s = qs.toString();
  return s ? `/search?${s}` : '/search';
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {splitHighlight(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

// 로고·와이드 배너처럼 3:2 칸에 크롭하면 잘리는 이미지는 칸 안에 통째로 넣는다(사진은 그대로 꽉 채운다).
function fitLogo(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const ratio = img.naturalWidth / img.naturalHeight;
  if (ratio > 2.2 || ratio < 0.8) {
    img.style.objectFit = 'contain';
    img.style.background = '#fff';
  }
}

function dateLabel(rec: SearchRecord): string {
  return rec.d.replaceAll('-', '.');
}

export function SearchPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const params = useMemo(() => paramsFromUrl(new URLSearchParams(sp.toString())), [sp]);
  const [input, setInput] = useState(params.q);
  const [items, setItems] = useState<SearchRecord[] | null>(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [recent, setRecent] = useState<string[]>([]);
  const [tipOpen, setTipOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 주소가 바뀌면(뒤로가기·칩 클릭) 입력창과 더 보기 개수를 맞춘다. 같은 렌더에서 보정해 effect 깜빡임을 피한다.
  const [syncedQ, setSyncedQ] = useState(params.q);
  if (syncedQ !== params.q) {
    setSyncedQ(params.q);
    setInput(params.q);
    setShown(PAGE_SIZE);
  }

  // 검색용 목록은 처음 한 번 받는다. 실패하면 "다시 시도"가 retry 값을 올려 이 effect를 다시 돌린다.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadSearchIndex()
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setError(true));
    // 최근 검색어는 이 기기의 저장소에서 읽는다(서버 렌더와 어긋나지 않게 마운트 뒤에).
    void Promise.resolve().then(() => !cancelled && setRecent(getRecentSearches()));
    return () => {
      cancelled = true;
    };
  }, [retry]);
  const reload = () => {
    setError(false);
    setRetry((n) => n + 1);
  };

  const terms = useMemo(() => parseTerms(params.q), [params.q]);
  const hits = useMemo(() => (items ? search(items, params) : []), [items, params]);
  const counts = useMemo(() => (items ? countByCategory(items, params) : new Map<string, number>()), [items, params]);
  // 고른 대분류의 하위 분류 칩: 정의된 하위 분류 순서대로, 지금 결과가 있는 것만(숫자 포함).
  const subCounts = useMemo(() => (items ? countBySub(items, params) : new Map<string, number>()), [items, params]);
  const subChips = useMemo(() => {
    const cfg = ECON_CATEGORIES.find((c) => c.label === params.category);
    if (!cfg) return [];
    return econSubcategoriesFor(cfg.slug).filter((s) => (subCounts.get(s) ?? 0) > 0 || s === params.sub);
  }, [params.category, params.sub, subCounts]);
  const totalAllCategories = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);
  const keywords = useMemo(() => (items ? topKeywords(items, 3, 10) : []), [items]);
  const hasQuery = terms.length > 0;

  const go = useCallback(
    (next: SearchParams, replace = false) => {
      const target = urlFor(next);
      if (replace) router.replace(target, { scroll: false });
      else router.push(target, { scroll: false });
    },
    [router],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim().slice(0, MAX_QUERY_LENGTH);
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    setRecent(addRecentSearch(q));
    go({ ...params, q, category: '' });
  }

  function chip(term: string) {
    setRecent(addRecentSearch(term));
    go({ ...DEFAULT_PARAMS, q: term });
  }

  const tabs = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0 || c === params.category);
  const visible = hits.slice(0, shown);

  return (
    <ArticlePageShell sidebar={<KeywordRail keywords={keywords} onPick={chip} />}>
      <main id="main-content" style={{ padding: '4px 0 90px' }}>
        <style>{`
          .sp-field { display: flex; align-items: center; height: 72px; padding: 0 12px 0 30px; border-radius: 999px; background: #f1f3f6; transition: box-shadow .15s ease, background .15s ease; }
          .sp-field:focus-within { background: #fff; box-shadow: 0 0 0 2px #3d70de; }
          .sp-field input { flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #111827; font-family: inherit; }
          .sp-field input::placeholder { color: #9ca3af; font-weight: 600; }
          .sp-field input::-webkit-search-cancel-button { display: none; }
          .sp-go { flex: none; width: 48px; height: 48px; border: none; border-radius: 50%; background: #3d70de; color: #fff; display: grid; place-items: center; cursor: pointer; transition: background .15s; }
          .sp-go:hover { background: #3260c8; }
          .sp-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 13.5px; }
          .sp-bar-r { display: flex; align-items: center; gap: 14px; margin-left: auto; color: #6b7280; }
          .sp-bar-r button, .sp-bar-r a { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: none; white-space: nowrap; }
          .sp-bar-r button:hover, .sp-bar-r a:hover { color: #111827; }
          .sp-dot { width: 6px; height: 6px; border-radius: 50%; background: #3d70de; }
          .sp-tip { margin: 10px 0 0; padding: 12px 14px; border-radius: 12px; background: #f8fafc; font-size: 13px; line-height: 1.6; color: #475569; }
          .sp-filters { margin: 10px 0 0; padding: 12px 14px; display: grid; gap: 6px; font-size: 14px; border-radius: 12px; background: #f8fafc; }
          .sp-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
          .sp-row dt { flex: none; width: 44px; font-weight: 700; color: #111827; }
          .sp-row dd { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
          .sp-opt { height: 32px; padding: 0 12px; border: none; border-radius: 999px; background: transparent; font: inherit; font-weight: 500; color: #6b7280; cursor: pointer; }
          .sp-opt:hover { background: #f1f3f6; color: #111827; }
          .sp-opt[aria-pressed='true'] { background: #111827; color: #fff; font-weight: 700; }
          .sp-tabs { display: flex; gap: 22px; margin-top: 22px; overflow-x: auto; border-bottom: 1px solid #e5e7eb; scrollbar-width: none; }
          .sp-tabs::-webkit-scrollbar { display: none; }
          .sp-tab { flex: none; padding: 14px 0; border: none; border-bottom: 2px solid transparent; background: none; font: inherit; font-size: 16px; font-weight: 600; color: #6b7280; cursor: pointer; white-space: nowrap; }
          .sp-tab:hover { color: #111827; }
          .sp-tab[aria-selected='true'] { color: #111827; font-weight: 800; border-bottom-color: #111827; }
          .sp-tab small { margin-left: 4px; font-size: 12.5px; font-weight: 500; color: #9ca3af; }
          .sp-subs { display: flex; gap: 8px; margin-top: 14px; overflow-x: auto; scrollbar-width: none; }
          .sp-subs::-webkit-scrollbar { display: none; }
          .sp-sub { flex: none; height: 34px; padding: 0 14px; border: none; border-radius: 999px; background: #f1f3f6; font: inherit; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; white-space: nowrap; }
          .sp-sub:hover { background: #e4e9f2; }
          .sp-sub[aria-pressed='true'] { background: #1f2937; color: #fff; }
          .sp-sub small { margin-left: 5px; font-size: 12px; font-weight: 500; opacity: .7; }
          .sp-count { margin: 18px 0 0; font-size: 14px; color: #6b7280; }
          .sp-count b { color: #111827; }
          .sp-list { margin: 4px 0 0; padding: 0; list-style: none; }
          .sp-item { border-bottom: 1px solid #f1f2f4; }
          .sp-link { display: flex; gap: 20px; align-items: center; padding: 20px 0; text-decoration: none; color: inherit; }
          .sp-link:hover .sp-title { color: #3d70de; }
          .sp-title { margin: 0; font-family: "Noto Serif KR", serif; font-size: clamp(17px, 3vw, 21px); font-weight: 700; line-height: 1.38; letter-spacing: -0.015em; color: #111827; text-wrap: pretty; transition: color .18s ease; }
          .sp-sum { margin: 8px 0 0; font-size: 14.5px; line-height: 1.6; color: #6b7280; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          .sp-meta { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: #9ca3af; font-variant-numeric: tabular-nums; }
          .sp-cat { padding: 2px 8px; border-radius: 999px; background: #f1f2f4; font-weight: 700; color: #374151; }
          .sp-thumb { position: relative; flex: none; width: clamp(96px, 24vw, 184px); aspect-ratio: 3 / 2; border-radius: 6px; overflow: hidden; background: #f3f4f6; }
          .sp-thumb::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(0,0,0,.06); pointer-events: none; }
          .sp-title mark, .sp-sum mark { background: rgba(61,112,222,.16); color: inherit; border-radius: 3px; padding: 0 1px; }
          .sp-more { display: block; width: 100%; height: 48px; margin-top: 18px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font: inherit; font-size: 14.5px; font-weight: 700; color: #374151; cursor: pointer; }
          .sp-more:hover { background: #f8fafc; }
          .sp-empty { padding: 56px 0; text-align: center; font-size: 15px; line-height: 1.7; color: #6b7280; }
          .sp-sk { height: 92px; margin: 20px 0; border-radius: 10px; background: linear-gradient(90deg, #f3f4f6, #eceef2, #f3f4f6); background-size: 200% 100%; animation: sp-sk 1.2s linear infinite; }
          @keyframes sp-sk { to { background-position: -200% 0; } }
          .sp-sec { margin-top: 28px; }
          .sp-sech { display: flex; justify-content: space-between; margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #6b7280; }
          .sp-sech button { border: none; background: none; font: inherit; font-weight: 600; color: #9ca3af; cursor: pointer; }
          .sp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
          .sp-chip { height: 38px; padding: 0 16px; border: none; border-radius: 999px; background: #f1f3f6; font: inherit; font-size: 14.5px; font-weight: 600; color: #1f2937; cursor: pointer; }
          .sp-chip:hover { background: #e4e9f2; }
          @media (max-width: 640px) {
            .sp-field { height: 56px; padding: 0 8px 0 20px; }
            .sp-field input { font-size: 18px; }
            .sp-go { width: 40px; height: 40px; }
            .sp-filters { margin-top: 8px; padding: 8px 10px; gap: 2px; }
            .sp-row { flex-wrap: nowrap; }
            .sp-row dt { width: 40px; font-size: 13px; }
            .sp-row dd { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
            .sp-row dd::-webkit-scrollbar { display: none; }
            .sp-opt { height: 30px; padding: 0 11px; font-size: 13.5px; white-space: nowrap; }
            .sp-link { gap: 14px; padding: 16px 0; }
            .sp-tab { font-size: 15px; }
          }
          @media (prefers-reduced-motion: reduce) { .sp-sk { animation: none; } }
        `}</style>

        <h1 className="sr-only">{hasQuery ? `‘${params.q}’ 검색 결과` : '검색'}</h1>

        <form onSubmit={submit} role="search" style={{ paddingTop: 'clamp(12px, 3vw, 28px)' }}>
          <div className="sp-field">
            <input ref={inputRef} type="search" name="q" value={input} onChange={(e) => setInput(e.target.value)} maxLength={MAX_QUERY_LENGTH} placeholder="궁금한 이슈를 검색해 보세요" aria-label="검색어" autoComplete="off" enterKeyHint="search" />
            <button type="submit" className="sp-go" aria-label="검색">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </button>
          </div>
        </form>
        <div className="sp-bar">
          {hasQuery && (
            <div role="group" aria-label="정렬" style={{ display: 'flex', gap: 2 }}>
              {SORTS.map(([v, text]) => (
                <button key={v} type="button" className="sp-opt" aria-pressed={params.sort === v} onClick={() => go({ ...params, sort: v }, true)}>
                  {text}
                </button>
              ))}
            </div>
          )}
          <div className="sp-bar-r">
            {hasQuery && (
              <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
                상세 조건
                {(params.scope !== DEFAULT_PARAMS.scope || params.period !== DEFAULT_PARAMS.period) && <span className="sp-dot" aria-label="적용 중" />}
              </button>
            )}
            {hasQuery && <Link href="/search">초기화</Link>}
            <button type="button" aria-expanded={tipOpen} onClick={() => setTipOpen((v) => !v)}>
              검색 팁
            </button>
          </div>
        </div>
        {tipOpen && (
          <p className="sp-tip">
            단어를 쉼표나 띄어쓰기로 나누면 그중 하나라도 들어 있는 이슈를 찾아요. 범위에서 제목만 또는 요약만 고를 수 있고, 기간으로 최근 이슈만 좁힐 수 있어요. 기사 본문 전체는 검색하지 않아요.
          </p>
        )}

        {hasQuery && (
          <>
 {moreOpen && (
            <dl className="sp-filters" aria-label="검색 조건">
              <FilterRow label="범위" options={SCOPES} value={params.scope} onChange={(v) => go({ ...params, scope: v }, true)} />
              <FilterRow label="기간" options={PERIODS} value={params.period} onChange={(v) => go({ ...params, period: v }, true)} />
            </dl>
            )}

            <div role="tablist" aria-label="분류" className="sp-tabs">
              <button type="button" role="tab" className="sp-tab" aria-selected={params.category === ''} onClick={() => go({ ...params, category: '', sub: '' }, true)}>
                전체{items && <small>{totalAllCategories}</small>}
              </button>
              {tabs.map((c) => (
                <button key={c} type="button" role="tab" className="sp-tab" aria-selected={params.category === c} onClick={() => go({ ...params, category: c, sub: '' }, true)}>
                  {c}
                  <small>{counts.get(c) ?? 0}</small>
                </button>
              ))}
            </div>

            {subChips.length > 0 && (
              <div role="group" aria-label="하위 분류" className="sp-subs">
                <button type="button" className="sp-sub" aria-pressed={params.sub === ''} onClick={() => go({ ...params, sub: '' }, true)}>
                  전체
                </button>
                {subChips.map((s) => (
                  <button key={s} type="button" className="sp-sub" aria-pressed={params.sub === s} onClick={() => go({ ...params, sub: s }, true)}>
                    {s}
                    <small>{subCounts.get(s) ?? 0}</small>
                  </button>
                ))}
              </div>
            )}

            {items === null && !error && (
              <div aria-busy="true" aria-label="검색 중">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="sp-sk" />
                ))}
              </div>
            )}
            {error && (
              <div className="sp-empty">
                검색 목록을 불러오지 못했어요.
                <br />
                <button type="button" className="sp-chip" style={{ marginTop: 14 }} onClick={reload}>
                  다시 시도
                </button>
              </div>
            )}
            {items && (
              <>
                <p className="sp-count" aria-live="polite">
                  ‘<b>{params.q}</b>’ 검색 결과 <b>{hits.length}</b>건
                </p>
                {hits.length === 0 ? (
                  <div className="sp-empty">
                    맞는 이슈가 없어요.
                    <br />
                    다른 단어로 찾거나, 기간·범위를 넓혀 보세요.
                  </div>
                ) : (
                  <>
                    <ul className="sp-list">
                      {visible.map(({ rec }) => (
                        <li key={rec.i} className="sp-item">
                          <Link href={lensPath({ id: rec.i, date: rec.d, category: rec.c || null })} className="sp-link">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <h2 className="sp-title">
                                <Mark text={rec.h} terms={terms} />
                              </h2>
                              {rec.s && (
                                <p className="sp-sum">
                                  <Mark text={rec.s} terms={terms} />
                                </p>
                              )}
                              <div className="sp-meta">
                                <span className="sp-cat">{rec.u && rec.c ? `${rec.c} · ${rec.u}` : rec.c || UNCATEGORIZED}</span>
                                <span>{dateLabel(rec)}</span>
                              </div>
                            </div>
                            {rec.p && (
                              <span className="sp-thumb">
                                <Image
                                  src={rec.p}
                                  alt={rec.h}
                                  width={368}
                                  height={245}
                                  loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onLoad={fitLogo}
                                />
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {hits.length > shown && (
                      <button type="button" className="sp-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                        결과 더 보기 ({hits.length - shown}건 남음)
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {!hasQuery && (
          <>
            {recent.length > 0 && (
              <section className="sp-sec" aria-label="최근 검색어">
                <p className="sp-sech">
                  <span>최근 검색어</span>
                  <button type="button" onClick={() => { clearRecentSearches(); setRecent([]); }}>
                    모두 지우기
                  </button>
                </p>
                <ul className="sp-chips">
                  {recent.map((r) => (
                    <li key={r}>
                      <button type="button" className="sp-chip" onClick={() => chip(r)}>
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="sp-sec" aria-label="요즘 많이 나온 키워드">
              <p className="sp-sech">
                <span>요즘 많이 나온 키워드</span>
              </p>
              {keywords.length > 0 ? (
                <ul className="sp-chips">
                  {keywords.map((k) => (
                    <li key={k}>
                      <button type="button" className="sp-chip" onClick={() => chip(k)}>
                        # {k}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>{error ? '목록을 불러오지 못했어요.' : '불러오는 중…'}</p>
              )}
            </section>
            <p className="sp-empty">검색어를 입력하면 AI LENS의 이슈를 제목과 요약에서 찾아 드려요.</p>
          </>
        )}
      </main>
    </ArticlePageShell>
  );
}

function FilterRow<T extends string>({ label, options, value, onChange }: { label: string; options: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="sp-row">
      <dt>{label}</dt>
      <dd>
        {options.map(([v, text]) => (
          <button key={v} type="button" className="sp-opt" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </dd>
    </div>
  );
}

// 오른쪽 열: 요즘 많이 나온 키워드 순위. 실제 검색 로그가 아니라 최근 사흘간 기사 제목에 자주 나온 말이며 화면에도 그렇게 밝힌다.
function KeywordRail({ keywords, onPick }: { keywords: string[]; onPick: (k: string) => void }) {
  return (
    <aside className="hidden lg:block" style={{ paddingTop: 'clamp(12px, 3vw, 28px)' }} aria-label="요즘 많이 나온 키워드">
      <h2 style={{ margin: 0, paddingTop: 16, borderTop: '1px solid #dcdcdc', fontSize: 18, fontWeight: 800, color: '#111827' }}>요즘 많이 나온 키워드</h2>
      <p style={{ margin: '6px 0 8px', fontSize: 13, color: '#6b7280' }}>최근 사흘간 기사 제목에 자주 나온 말이에요.</p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {keywords.map((k, i) => (
          <li key={k} style={{ borderTop: '1px solid #ececec' }}>
            <button
              type="button"
              onClick={() => onPick(k)}
              style={{ display: 'grid', gridTemplateColumns: '30px minmax(0,1fr)', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '0 2px', border: 'none', background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: i < 3 ? '#3d70de' : '#767676' }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{k}</span>
            </button>
          </li>
        ))}
      </ol>
      <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9ca3af' }}>검색 순위가 아니라 기사 제목 기준이에요.</p>
    </aside>
  );
}
