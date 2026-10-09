'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronLeft, ChevronRight, Headphones, Image as ImageIcon, Video } from 'lucide-react';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { LENS_ACCENT, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { lensPath } from '@/shared/lib/content/lensUrl';
import dynamic from 'next/dynamic';
import { useServerSeededList } from '@/shared/hooks/useServerSeededList';

// 안내 모달은 칩을 눌렀을 때만 필요하므로 첫 화면 번들에서 제외하고 눌렀을 때 불러온다. 포털 UI라 서버 렌더에 없으므로 ssr: false.
const LensFormatGuide = dynamic(() => import('@/features/news-feed/components/cards/LensFormatGuide').then((m) => m.LensFormatGuide), { ssr: false });

// 형식 타일 아이콘은 lensPerspectives.ts의 p.icon(lucide-react)을 사용한다. 절제된 에디토리얼 톤에 맞춰 획 굵기가 일정한 미니멀 라인 아이콘으로 통일한다.
//
// 가이드 자동 노출 여부는 localStorage 플래그 하나로 기기에 기록한다(서버 저장 불필요).
const GUIDE_SEEN_KEY = 'ailens-lens-format-guide-seen';

// 헤더의 네 칩 — 순서는 lensPerspectives(레터·웹툰·팟캐스트·영상)와 같고, 라벨은 "무엇을 하는지"로 짧게 쓴다.
const WAYS = [
  { label: '읽기', full: '레터', icon: BookOpen },
  { label: '웹툰', full: '웹툰', icon: ImageIcon },
  { label: '듣기', full: '팟캐스트', icon: Headphones },
  { label: '영상', full: '영상', icon: Video },
] as const;

// 활성 탭 텍스트 전용 accent. LENS_ACCENT(#3b82f6)는 14px 텍스트에서 흰 배경 대비 3.68:1로 WCAG AA(4.5:1)에 미달하므로
// 한 단계 진한 blue-600(5.17:1)을 쓴다. 인디케이터·배경 틴트는 장식/대형 요소라 LENS_ACCENT를 유지한다.
// 다른 화면에서도 필요해지면 lensPerspectives.ts의 공용 토큰으로 승격한다.
const LENS_ACCENT_STRONG = '#2563eb';

// "오늘의 이슈, 4가지 시선" 홈 티저 — 지면 특별 코너(전체·증권·산업·시그널 4탭, 고른 지면의 기사 최대 4건: 히어로 1 + 작은 카드 3).
// 지면 로직은 ../lib/paperSections.ts.
import { SECTIONS, pickSection, paperTitle } from '@/features/news-feed/lib/paperSections';

export function LensPreviewSection({ initialItems, variant = 'home', paperDates, headerAction }: { initialItems?: CmsLens[]; variant?: 'home' | 'archive'; /** archive 변형에서 "전체 보기" 자리에 들어가는 요소(지난 지면의 날짜 선택 달력 등). */ headerAction?: ReactNode; /** 홈 헤더 ◀ ▶로 넘길 수 있는 지면 날짜(최신순, 첫 값 = 지금 보여 주는 날). 없으면 화살표를 그리지 않는다. */ paperDates?: string[] }) {
  // 4개 지면 탭(전체·증권·산업·시그널)이 각각 최신 4건씩만 쓴다 — 최신 100건이면 각 지면 8건 이상 확보. 이 섹션은 bullets를 안 읽어 SSR 요약본으로 충분하다.
  const items = useServerSeededList<CmsLens[], null>(initialItems, null, () => fetchLensPosts(100), (data) => data.length > 0 /* 빈 응답으로 SSR 프리페치 결과를 덮지 않는다 */);
  const [showGuide, setShowGuide] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  function openGuide(i: number) {
    setGuideIndex(i);
    setShowGuide(true);
  }
  // 가이드를 본 적이 있는지 — 처음 온 사람에게만 안내 버튼이 반짝인다. 서버 HTML과 어긋나지 않게 true(=반짝임 없음)로 시작해 마운트 후 localStorage를 읽는다.
  const [guideSeen, setGuideSeen] = useState(true);
  const router = useRouter();
  useEffect(() => {
    try {
      setGuideSeen(!!window.localStorage.getItem(GUIDE_SEEN_KEY));
    } catch {
      // 저장소 접근 불가 — 반짝임 없이 둔다.
    }
  }, []);
  // 탭으로 지면을 고르면 고른 지면 안의 기사 4건(히어로 1 + 작은 카드 3)이 신문 1면처럼 동시에 보인다.
  const [activeTab, setActiveTab] = useState(0);
  const [turnDir, setTurnDir] = useState<1 | -1>(1);

  // 홈에서 날짜를 넘긴다. dayIdx 0 = 서버가 보내 준 오늘의 지면이며, 이전 날짜는 클릭 시 한 번 받아 날짜별로 캐시하고 같은 카드에 갈아 끼운다.
  // dayIdx 0 = 서버가 보내 준 오늘의 지면. 그 앞날들은 눌렀을 때 한 번 받아 두고(날짜별 캐시) 같은 카드에 갈아 끼운다.
  const [dayIdx, setDayIdx] = useState(0);
  const [pastItems, setPastItems] = useState<Record<string, CmsLens[]>>({});
  const bookRef = useRef<HTMLDivElement>(null);
  const days = paperDates ?? [];
  // 날짜 전환은 데이터가 준비되면 면 안의 내용을 부드럽게 갈아 끼우는 방식이다.
  function goDay(next: number) {
    if (next === dayIdx) return;
    const d = days[next];
    const ready = next === 0 || pastItems[d] ? Promise.resolve() : loadDay(d);
    ready.then(() => {
      setTurnDir(next < dayIdx ? 1 : -1);
      setDayIdx(next);
    });
  }
  // 그날의 지면 16건을 서버가 줄여 준 API(/api/paper/[date])에서 받아 날짜별로 보관한다.
  function loadDay(d: string): Promise<CmsLens[] | undefined> {
    return fetch(`/api/paper/${d}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ posts?: CmsLens[] }>) : { posts: [] }))
      .then(({ posts }) => {
        if (posts && posts.length > 0) {
          setPastItems((prev) => ({ ...prev, [d]: posts }));
          return posts;
        }
        return undefined;
      })
      .catch(() => undefined);
  }
  // 첫 클릭이 즉시 바뀌도록 바로 앞날을 한가할 때 미리 받아 둔다(약 12KB). 데이터 절약 모드면 건너뛴다.
  useEffect(() => {
    const d = days[1];
    if (!d || variant !== 'home') return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const id = idle(() => void loadDay(d));
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id as number);
      else window.clearTimeout(id as number);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- days[1]은 서버가 정한 값, loadDay는 매 렌더 새 함수지만 같은 동작
  }, [days[1], variant]);

  // 첫 방문 자동 팝업은 사용하지 않는다. 가이드는 ⓘ 버튼으로 수동으로만 연다.

  // 기본 탭은 항상 "지면 1면"(전체)이다. 관심분야로 마운트 후 탭을 바꾸면 사용자마다 첫 탭이 달라지고 서버 HTML과 어긋나므로 사용하지 않는다.

  // LensFormatGuide가 이 함수를 ESC 리스너 의존성으로 쓰므로 useCallback으로 고정해 리스너 재구독을 막는다.
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    setGuideSeen(true);
    try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
    } catch {
      // 저장 실패해도 이번 세션 내 UI 상태는 유지.
    }
  }, []);

  if (!items || items.length === 0) return null;
  // 지난 날을 보는 중이면 그 날 데이터(받는 동안엔 직전 화면을 흐리게 둔다).
  const viewDay = dayIdx > 0 ? days[dayIdx] : undefined;
  const allItems = (viewDay && pastItems[viewDay]) || items;

  // 탭 전환 방향에 따라 지면이 넘어가는 모션 방향을 정한다(오른쪽 탭이면 왼쪽으로).
  function selectTab(i: number) {
    if (i === activeTab) return;
    setTurnDir(i > activeTab ? 1 : -1);
    setActiveTab(i);
  }

  // 탭(지면) 하나 안의 기사 최대 4건 — display_order가 있으면 같은 날짜 안에서 오름차순, 날짜는 최신 우선.
  // 이 4건을 "히어로 1 + 작은 카드 3"으로 동시에 보여 준다.
  const activeSection = SECTIONS[activeTab];
  const sectionArticles = pickSection(allItems, activeTab);

  const hero = sectionArticles[0] ?? null;
  const heroHref = hero ? lensPath(hero) : null;
  // 가이드 하단 버튼("지금 읽으러 갈래요" 등) — 고른 형식으로 지금 보고 있는 지면의 1면 기사를 바로 연다(?v=1~4가 형식 탭이다).
  function goToFormat(formatIndex: number) {
    closeGuide();
    if (heroHref) router.push(`${heroHref}?v=${formatIndex + 1}`);
  }

  // 한 면의 내용(히어로 + 보조 카드 3)을 그리는 함수. 날짜 전환 중 두 날짜의 면을 동시에 그려야 해서 분리했다.
  const pageBody = (sa: CmsLens[]) => {
    const h = sa[0];
    if (!h) return null;
    const hHref = lensPath(h);
    const hPhoto = pickLensPhoto(h);
    const minor = sa.slice(1, 4);
    return (
      <>
        <div className="lz-hero-col">
            {/* ── 히어로 기사 ── 이 지면의 대표 기사(최대 4건 중 1번). 사진이 위, 헤드라인·요약이 아래인 신문 리드 기사 구성이다. */}
            <Link href={hHref!} prefetch className="lz-issue block" style={{ textDecoration: 'none' }}>
              {hPhoto && (
                <span
                  data-hero-img
                  style={{
                    display: 'block',
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '21 / 9',
                    overflow: 'hidden',
                    borderRadius: 3,
                    background: '#f3f4f6',
                  }}
                >
                  <Image
                    src={hPhoto}
                    alt={displayHeadline(h.headline)}
                    fill
                    sizes="(max-width: 780px) 100vw, 700px"
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                  />
                </span>
              )}

              <span style={{ display: 'block', padding: 'clamp(16px, 2.2vw, 22px) 0 clamp(20px, 2.6vw, 26px)' }}>
                <span className="flex items-center" style={{ gap: 7, marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: LENS_ACCENT_STRONG,
                      letterSpacing: '0.02em',
                      background: 'rgba(37,99,235,0.08)',
                      padding: '2px 8px',
                      borderRadius: 999,
                    }}
                  >
                    {activeSection.label}
                  </span>
                  <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
                    {kstDateTimeLabel(h.published_at) ?? h.date.replaceAll('-', '.')}
                  </span>
                </span>
                <span
                  className="lz-h"
                  style={{
                    display: '-webkit-box',
                    fontFamily: "'Noto Serif KR', serif",
                    fontSize: 'clamp(24px, 3.4vw, 34px)',
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.03em',
                    lineHeight: 1.22,
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'keep-all',
                  }}
                >
                  {displayHeadline(h.headline)}
                </span>
                {h.context && (
                  <span
                    style={{
                      display: '-webkit-box',
                      marginTop: 10,
                      fontSize: 15,
                      color: '#6b7280',
                      lineHeight: 1.65,
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {h.context}
                  </span>
                )}
              </span>
            </Link>
        </div>

        {/* ── 같은 지면의 나머지 기사 최대 3건 ── 히어로 아래 가로 3열. 가로 나열이라 헤드라인 크기는 모두 동일하며, 지면명은 탭에 표시되므로 반복하지 않는다. */}
        {minor.length > 0 && (
          <div className="lz-minor-col" style={{ borderTop: '1px solid #e0e0da', paddingTop: 22, columnGap: 'clamp(16px, 2.4vw, 28px)', rowGap: 20 }}>
            {minor.map((article) => {
              const photo = pickLensPhoto(article);
              return (
                <Link key={article.id} href={lensPath(article)} prefetch className="lz-minor">
                  {photo && (
                    <span
                      style={{
                        display: 'block',
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '16 / 10',
                        borderRadius: 3,
                        overflow: 'hidden',
                        marginBottom: 10,
                        background: '#f3f4f6',
                      }}
                    >
                      <Image
                        src={photo}
                        alt={displayHeadline(article.headline)}
                        fill
                        sizes="220px"
                        className="lz-minor-thumb-img"
                        style={{ objectFit: 'cover', transition: 'transform .35s cubic-bezier(.2,.7,.3,1)' }}
                      />
                    </span>
                  )}
                  <span
                    className="lz-minor-h"
                    style={{
                      display: '-webkit-box',
                      fontSize: 14.5,
                      fontWeight: 700,
                      color: '#1c1917',
                      letterSpacing: '-0.015em',
                      lineHeight: 1.4,
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {displayHeadline(article.headline)}
                  </span>
                  {/* 본문 미리보기 1줄 — 그리드 카드(ArticleCard.tsx)와 같은 톤·크기를 사용한다. */}
                  {article.context && (
                    <span
                      style={{
                        display: '-webkit-box',
                        marginTop: 5,
                        fontSize: 12.5,
                        color: '#6b7280',
                        lineHeight: 1.55,
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {article.context}
                    </span>
                  )}
                  <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: '#9ca3af', fontWeight: 600 }}>
                    {kstDateTimeLabel(article.published_at) ?? article.date.replaceAll('-', '.')}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </>
    );
  };


  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        /* 지면 탭 — 세리프 라벨 + 잉크색 밑줄, 미끄러지는 인디케이터
           (2026-09-30 최종 정리). */
        .lz-step { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #ecece8; color: #374151; transition: background .15s ease, color .15s ease; }
        .lz-step { border: none; cursor: pointer; padding: 0; }
        .lz-step:hover:not(:disabled) { background: #e2e8f0; color: #374151; }
        .lz-step:disabled { opacity: .4; cursor: default; }
        .lz-tabs { position: relative; display: flex; }
        /* 탭·날짜 전환: 가벼운 슬라이드 + 페이드 */
        .lz-turn { animation: lz-fade .16s ease-out both; }
        @keyframes lz-fade { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .lz-turn { animation: none !important; } }
        .lz-mast { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 2px 11px; margin-bottom: 12px; border-top: 1px solid #b8bbc2; border-bottom: none; position: relative; }
        .lz-mast-l { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .lz-mast-brand { font-family: 'Noto Serif KR', serif; font-size: 12.5px; font-weight: 700; letter-spacing: .08em; color: #8a8576; position: absolute; left: 50%; transform: translateX(-50%); pointer-events: none; }
        @media (max-width: 900px) { .lz-mast-brand { display: none; } }
        .lz-tab { position: relative; font-family: inherit; }
        .lz-tab:not(.is-active):hover { color: #111827; }
        .lz-tab:active { transform: scale(.97); }
        .lz-tab:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -3px; border-radius: 8px; }
        .lz-tab-ind { position: absolute; bottom: -1px; left: 0; height: 3px;
          border-radius: 0; background: #5b8def; pointer-events: none;
          transition: transform .28s cubic-bezier(.4, 0, .2, 1); will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .lz-tab-ind { transition: none; } }

        /* 4차 리디자인(2026-09-30, 사용자 지적 — "카드 세로 길이가.. 지면
           신문이 어떻게 배치돼있나요?"). 실제 신문 지면은 좌우 2단 분할이
           아니라 컬럼 그리드다 — 리드 기사가 여러 컬럼 폭 + 큰 사진으로
           위쪽 전체를 차지하고, 작은 기사들은 그 아래 좁은 컬럼으로
           나열된다(대칭 그리드가 아니라 "위 크게, 아래 여러 개"). 왼쪽
           작은 사진+오른쪽 텍스트로 나란히 두던 히어로를 사진이 위, 헤드라인이
           아래로 오는 세로 배치로 바꾸고(사진을 훨씬 크게 쓸 수 있다),
          좁은 세로 사이드바였던 부기사 3건을 히어로 아래 가로 3열로
           내렸다 — 컬럼 폭이 다른 두 블록이 나란히 있어 높이가 안 맞던
           문제도 이걸로 자연히 해소된다(전부 한 칼럼 폭 기준으로 쌓이므로).
           부기사에도 작은 썸네일을 붙여 3열이 허전해 보이지 않게 했다. */
        .lz-hero-col { border-bottom: 4px double #b9b9b1; padding-bottom: 10px; }
        .lz-minor-col { display: grid; grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 640px) {
          .lz-minor-col { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .lz-minor { display: block; padding: 0 clamp(14px, 2vw, 20px) 8px; text-decoration: none;
          border-bottom: 1px solid rgba(17,24,39,0.08); transition: background .15s ease; }
        .lz-minor:last-child { border-bottom: none; }
        .lz-minor { padding-left: 0 !important; padding-right: 0 !important; }
        @media (min-width: 640px) {
          .lz-minor { border-bottom: none; border-right: none; }
        }
        .lz-minor:hover { background: transparent; }
        .lz-minor:hover .lz-minor-thumb-img { transform: scale(1.05); }
        .lz-minor:hover .lz-minor-h { color: #3d70de; }
        .lz-minor-h { transition: color .18s ease; }
        .lz-minor:hover .lz-minor-thumb-img { transform: scale(1.045); }
        .lz-minor:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }

        /* 헤더 타이포(2026-10-04) — 머리글은 작게, 한 줄 카피는 세리프로 크고 차분하게. */
        .lz-kick { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: #111827; }
        .lz-date { font-size: 12.5px; font-weight: 600; color: #b7b2a6; }
        .lz-lead { margin: 0; font-family: 'Noto Serif KR', serif; font-size: clamp(21px, 4.6vw, 26px); font-weight: 700; line-height: 1.4; letter-spacing: -0.025em;
          color: #1f2937; word-break: keep-all; text-wrap: balance; animation: lz-lead-in .6s cubic-bezier(.22,.8,.22,1) both; }
        .lz-mark { position: relative; display: inline-block; white-space: nowrap; }
        .lz-mark-line { position: absolute; left: -2px; bottom: -5px; width: calc(100% + 4px); height: 9px; overflow: visible; }
        .lz-mark-line path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: lz-mark-draw .8s cubic-bezier(.22,.8,.22,1) .45s forwards; }
        .lz-intro { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px 24px; }
        .lz-intro .lz-ways { margin-top: 0; }
        .lz-head { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .lz-intro-text { min-width: 0; }
        .lz-sub { margin: 0; font-size: clamp(14px, 3.4vw, 15.5px); font-weight: 600; line-height: 1.6; color: #4b5563; word-break: keep-all; text-wrap: balance; animation: lz-lead-in .6s cubic-bezier(.22,.8,.22,1) .08s both; }
        @keyframes lz-lead-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes lz-mark-draw { to { stroke-dashoffset: 0; } }
        .lz-find { display: inline-block; margin-top: 8px; font-size: 13.5px; font-weight: 500; color: #3d70de; text-decoration: none; border-bottom: 1px solid rgba(61,112,222,.3); padding-bottom: 1px; word-break: keep-all; transition: color .15s ease, border-color .15s ease; }
        .lz-find:hover { color: #3260c8; border-color: #3260c8; }
        @media (prefers-reduced-motion: reduce) { .lz-lead, .lz-sub { animation: none; } .lz-mark-line path { animation: none; stroke-dashoffset: 0; } }

        /* 네 칩(2026-10-04) — 질문 → 답 → "이렇게 볼 수 있어요"로 이어지는 시선 흐름의 끝. 칩 하나가 곧 안내 버튼이다.
           색은 사이트의 CI 파랑 계열(글자 #2f5fc4 on #f3f7ff, 테두리 #dbe6fb). 처음 온 사람에게만 첫 칩에 링이 3번 퍼진다(그 뒤엔 멈춤). */
        .lz-ways { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin-top: 14px; }
        .lz-flow { display: flex; align-items: center; flex-wrap: nowrap; gap: 6px; min-width: 0; max-width: 100%; }
        .lz-way-arrow { flex: none; width: 20px; height: 12px; }
        .lz-way-arrow-p { stroke-dasharray: 1; stroke-dashoffset: 1; animation: lz-arrow-draw .5s cubic-bezier(.22,.8,.22,1) forwards; }
        @keyframes lz-arrow-draw { to { stroke-dashoffset: 0; } }
        @media (max-width: 420px) {
          .lz-flow { gap: 2px; width: 100%; }
          .lz-way { flex: 1 1 0; min-width: 0; justify-content: center; height: 34px; padding: 0 6px; gap: 4px; font-size: 13.5px; }
          .lz-way-arrow { width: 12px; }
        }
        /* 아주 좁은 화면(≈340px 이하)에서는 아이콘을 빼고 글자만 — 한 줄 유지가 우선이다. */
        @media (max-width: 350px) { .lz-way svg { display: none; } }
        /* 흐름 애니메이션(6초 주기, 반복) — 불빛이 읽기 → 웹툰 → 듣기 → 영상 순서로 칩에 차례로 켜지고, 칩 사이 화살표를 따라 이어진다.
           칩마다 1.2초씩 어긋난 지연(--i)으로 한 번에 하나만 켜진다. 마우스를 올리면 멈춰 누르기 편하다. */
        .lz-way { animation: lz-run 6s ease-in-out infinite; animation-delay: calc(var(--i, 0) * 1.2s + 1.4s); }
        /* 켜진 칩 = 그림자가 깊어지며 살짝 떠오르고, 옅은 파랑 막(::after)이 덮인다(그라데이션 면은 중간값이 안 만들어져서 막의 투명도로 켠다). */
        .lz-way::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: rgba(61,112,222,.08); opacity: 0; pointer-events: none;
          animation: lz-run-tint 6s ease-in-out infinite; animation-delay: calc(var(--i, 0) * 1.2s + 1.4s); }
        @keyframes lz-run {
          0%, 24%, 100% { transform: none; box-shadow: 0 1px 2px rgba(17,24,39,.05), 0 4px 10px -6px rgba(61,112,222,.22); border-color: rgba(61,112,222,.08); }
          6%, 16% { transform: translateY(-1px); box-shadow: 0 1px 2px rgba(17,24,39,.06), 0 6px 14px -7px rgba(61,112,222,.34); border-color: rgba(61,112,222,.16); }
        }
        @keyframes lz-run-tint { 0%, 24%, 100% { opacity: 0; } 6%, 16% { opacity: 1; } }
        .lz-way-arrow-flow { stroke-dasharray: .32 1.4; stroke-dashoffset: 1; opacity: 0; animation: lz-arrow-run 6s linear infinite; animation-delay: calc(var(--d, 0s)); }
        @keyframes lz-arrow-run {
          0% { stroke-dashoffset: 1; opacity: 1; }
          14% { stroke-dashoffset: -.4; opacity: 1; }
          15%, 100% { stroke-dashoffset: -.4; opacity: 0; }
        }
        .lz-ways:hover .lz-way, .lz-ways:hover .lz-way::after, .lz-ways:hover .lz-way-arrow-flow, .lz-way:focus-visible { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .lz-way-arrow-p { animation: none; stroke-dashoffset: 0; } .lz-way, .lz-way::after, .lz-way-arrow-flow { animation: none; } .lz-way-arrow-flow { display: none; } }
        /* 2026-10-04 — 테두리는 거의 안 보이게(파랑 8% 한 줄), 면은 그라데이션 없는 단색, 그림자는 두 겹뿐. 과하면 "AI가 만든 티"가 나서
           효과는 한 단계 덜어낸 선에서 멈춘다. */
        .lz-way { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 15px 0 12px; border: 1px solid #dbe6fb; border-radius: 999px;
          background: #fff; color: #2f5fc4; font-size: 14px; font-weight: 700; font-family: inherit; letter-spacing: -0.01em; cursor: pointer; white-space: nowrap;
          transition: background .2s ease, box-shadow .2s ease, transform .2s ease; }
        .lz-way:hover { background: #ebf1fe; transform: translateY(-1px); }
        .lz-way:active { transform: translateY(0) scale(.97); box-shadow: 0 1px 2px rgba(17,24,39,.06); }
        .lz-way:focus-visible { outline: 2px solid #3d70de; outline-offset: 2px; }
        .lz-way[data-new='true']::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; border: 2px solid #5b8def; opacity: 0;
          animation: lz-ping 1.8s ease-out 1.2s 3; pointer-events: none; }
        @keyframes lz-ping { 0% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(1.3); } }
        .lz-ways-hint { margin-left: 4px; font-size: 12.5px; font-weight: 600; color: #9ca3af; }
        @media (max-width: 420px) { .lz-ways-hint { flex-basis: 100%; margin: 2px 0 0 2px; } }
        @media (prefers-reduced-motion: reduce) { .lz-way[data-new='true']::before { animation: none; } .lz-way { transition: none; } }

        .lz-issue .lz-h { transition: color .18s ease; }
        .lz-issue:hover .lz-h { color: #3d70de; }
        .lz-issue [data-hero-img] img { transition: transform .5s cubic-bezier(.22,.8,.22,1); }
        .lz-issue:hover [data-hero-img] img { transform: scale(1.03); }
      `}</style>

      {variant === 'home' && (
        <div style={{ marginBottom: 'clamp(28px, 4vw, 40px)' }}>
        {/* 소개 문구 영역 */}
        {/* 카피 구성: 페인포인트와 해결을 말하는 한 줄(큰 글씨) → 해결 방법(읽고·듣고·보는 네 가지). 제작 방식 고지는 기사 하단 AiDisclaimer·푸터에 있다. */}
        {/* 질문(큰 세리프)과 답(작은 고딕)을 한 줄에 — 넓은 화면에선 기준선을 맞춰 나란히, 좁은 화면에선 자연스럽게 아래로 줄바꿈. */}
        {/* 소개 영역 — 왼쪽 문구 두 줄, 오른쪽 형식 칩. */}
        <div className="lz-intro">
        <div className="lz-intro-text">
        <div className="lz-head">
        <p className="lz-lead">
          뉴스 챙겨보기{' '}
          <span className="lz-mark">
            어려우시죠?
            <svg className="lz-mark-line" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden>
              <path d="M2 6 C22 2, 44 8, 64 5 S104 3, 118 6" fill="none" stroke="#FFB020" strokeWidth={4} strokeLinecap="round" pathLength={1} />
            </svg>
          </span>
        </p>
        <p className="lz-sub">당신의 일상에 맞춘 뉴스를 준비했어요.</p>
        </div>
        {/* "내 일상이 뭐지?" 질문에 이어 하루의 틈 장면을 고르는 /start로 진입시킨다. */}
        <Link href="/start" className="lz-find">
          내 일상이 뭔지 모르겠다면, 하루를 같이 떠올려볼까요 <span aria-hidden>→</span>
        </Link>
        </div>
        {/* 헤더 시선 흐름(질문 → 답 → 다음 행동)의 끝에 네 가지 형식 칩을 둔다. 칩 하나가 곧 버튼이며, 누르면 해당 형식의 소개가 열린다. 처음 방문자에게는 첫 칩에 링이 3번 퍼진다. */}
        <div className="lz-ways" role="group" aria-label="네 가지 형식 — 눌러서 소개 보기">
          {/* 칩과 화살표는 한 덩어리(.lz-flow, 줄바꿈 없음) — 좁은 화면에서도 "읽기 → 웹툰 → 듣기 → 영상"이 항상 한 줄로 이어져 보인다. */}
          <div className="lz-flow">
          {WAYS.map((w, i) => {
            const WayIcon = w.icon;
            return (
              <Fragment key={w.label}>
                {/* 칩 사이 손그림 화살표 — 읽기 → 웹툰 → 듣기 → 영상으로 "이어서 골라 볼 수 있다"는 흐름을 보여 준다. 순서대로 한 번 그려진다. */}
                {i > 0 && (
                  <svg className="lz-way-arrow" viewBox="0 0 20 12" aria-hidden>
                    <path className="lz-way-arrow-p" style={{ animationDelay: `${0.5 + i * 0.18}s` }} d="M1.5 6.4 C5 5.2, 9 7, 17 6 M13 2.2 L17.4 6 L13.2 9.8" fill="none" stroke="#8fb0ee" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
                    {/* 흘러가는 불빛 — 앞 칩이 켜진 직후 이 화살표를 따라 다음 칩으로 짧은 진한 선이 지나간다. */}
                    <path className="lz-way-arrow-flow" style={{ animationDelay: `${(i - 1) * 1.2 + 1.4 + 0.55}s` }} d="M1.5 6.4 C5 5.2, 9 7, 17 6" fill="none" stroke="#3d70de" strokeWidth={2.2} strokeLinecap="round" pathLength={1} />
                  </svg>
                )}
                <button
                  type="button"
                  className="lz-way"
                  style={{ '--i': i } as CSSProperties}
                  data-new={!guideSeen && i === 0}
                  onClick={() => openGuide(i)}
                  aria-label={`${w.full} 소개 보기`}
                >
                  <WayIcon size={16} strokeWidth={2} aria-hidden />
                  {w.label}
                </button>
              </Fragment>
            );
          })}
          </div>
          <span className="lz-ways-hint" aria-hidden>
            눌러서 미리 보기
          </span>
        </div>
        </div>
        </div>
      )}

      {variant === 'home' && (
      <header style={{ marginBottom: 18, borderTop: '1px solid #e5e7eb' }}>
        {/* 데이트라인을 "오늘의 지면" 라벨과 한 줄로 합쳐 히어로 이미지 이전의 줄 수를 줄인다. */}
        {/* 헤더 타이포 — 제목("오늘의 이슈, 4가지 시선")은 검색·정체성 때문에 작은 머리글(kicker)로 유지하고, 페인포인트→해결 한 줄(세리프)을 주 카피로 둔다. 핵심 단어만 앰버 밑줄로 강조한다. */}
      </header>
      )}

      <div
        className="lz-paper"
        style={{
          // 지면 영역 구분 — 연한 종이색 면 + 얇은 테두리 + 둥근 모서리. 가까운 그림자·넓고 옅은 그림자 조합으로 은은한 입체감을 준다.
          backgroundColor: '#f8f8f6',
          boxShadow: '0 1px 2px rgba(60,55,45,.06), 0 8px 24px -14px rgba(60,55,45,.16)',
          border: '1px solid #e4e4df',
          borderRadius: 12,
          padding: 'clamp(22px, 3vw, 34px) clamp(16px, 2.4vw, 26px) clamp(16px, 2.4vw, 26px)',
        }}
      >
        {/* 지면 안의 제호 줄 — 왼쪽 구역 제목(날짜 지면), 가운데 제호, 오른쪽 날짜 이동·전체 보기. */}
        <div className="lz-mast" style={{ position: 'relative' }}>
          <svg viewBox="0 0 600 6" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -3, width: '100%', height: 6, pointerEvents: 'none' }}>
            <path d="M0 3.2 C60 1.8, 120 4.4, 180 3 S300 2, 360 3.4 S480 4.2, 540 2.6 S590 3.2, 600 3" fill="none" stroke="#c4c7cd" strokeWidth={1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="lz-mast-brand" aria-hidden>AI LENS · 서울경제신문</span>
          <div className="lz-mast-l">
            {/* 실제 날짜를 제목으로 사용해 날짜를 넘겨도 제목이 맞도록 한다. */}
            <h2 className="lz-kick">{paperTitle(viewDay ?? hero?.date)}</h2>
          </div>
          {/* 지난 지면 목록 페이지로 이동하는 "전체 보기 →" 링크. /paper는 리다이렉트라 전환 중 빈 화면이 비치므로 지면 날짜로 직접 이동한다. 날짜 이동은 해당 페이지에서 한다. */}
          <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
            {/* ◀ 어제 · ▶ 다음 날 — 지면이 있는 날만 오가고(주말 등은 건너뜀) 홈에서 바로 갈아 끼운다. 가장 최근이면 ▶, 가장 오래됐으면 ◀가 비활성. */}
            {days.length > 1 && (
              <>
                <button type="button" className="lz-step" aria-label="이전 지면 보기" title="이전 지면" disabled={dayIdx >= days.length - 1} onClick={() => goDay(dayIdx + 1)}>
                  <ChevronLeft size={16} strokeWidth={2.3} />
                </button>
                <button type="button" className="lz-step" aria-label="다음 지면 보기" title="다음 지면" disabled={dayIdx === 0} onClick={() => goDay(dayIdx - 1)}>
                  <ChevronRight size={16} strokeWidth={2.3} />
                </button>
              </>
            )}
            {variant === 'archive' ? headerAction : (
              <Link href={viewDay ?? hero?.date ? `/paper/${viewDay ?? hero?.date}` : '/paper'} className="flex-shrink-0 text-gray-600 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 700, marginLeft: 6 }}>
                전체 보기 →
              </Link>
            )}
          </div>
        </div>
        {/* 지면 탭 */}
        {/* 연한 회색 트랙 안에서 선택된 탭이 흰 알약으로 표시되는 세그먼트 형태. */}
        <div className="lz-tabs" style={{ display: 'inline-flex', gap: 2, padding: 4, borderRadius: 999, background: 'rgba(17,24,39,0.055)', marginBottom: 16 }}>
          {SECTIONS.map((s, i) => {
            const isActive = i === activeTab;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectTab(i)}
                aria-pressed={isActive}
                className={`lz-tab${isActive ? ' is-active' : ''}`}
                style={{
                  minHeight: 38,
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  fontSize: 14.5,
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: '-0.01em',
                  background: isActive ? '#fff' : 'transparent',
                  boxShadow: isActive ? '0 1px 2px rgba(17,24,39,.08), 0 2px 8px -2px rgba(17,24,39,.12)' : 'none',
                  // 잉크 #111827 on 흰 알약 ≈ 17:1, 비활성 #6b7280 on 연회색 트랙 ≈ 4.6:1 — AA 통과.
                  color: isActive ? '#111827' : '#6b7280',
                  cursor: 'pointer',
                  transition: 'background .2s ease, box-shadow .2s ease, color .2s ease',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {!hero ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
              {activeSection.label}을 준비하고 있어요.
            </p>
          </div>
        ) : (
        <>
        <div className="lz-book" ref={bookRef}>
          <div key={`${activeTab}-${dayIdx}`} className="lz-turn" style={{ ['--dir' as string]: turnDir }}>
            {pageBody(sectionArticles)}
          </div>
        </div>
        </>
        )}
      </div>

      {showGuide && <LensFormatGuide initialIndex={guideIndex} onClose={closeGuide} onGo={heroHref ? goToFormat : undefined} />}
    </section>
  );
}
