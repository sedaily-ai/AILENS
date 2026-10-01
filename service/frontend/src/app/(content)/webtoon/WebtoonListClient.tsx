'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { coverThumb } from '@/shared/lib/webtoonCovers.generated';
import { groupIntoSeries, type WebtoonSeries } from '@/shared/lib/webtoonSeries';
import { kstTodayStr } from '@/shared/lib/date';
import { buildPageItems } from '@/shared/lib/pagination';
import {
  INK,
  BODY,
  MUTED,
  PLACEHOLDER,
  BAND,
  WEBTOON_GRID_CSS,
  fmtDate,
  computeCategoryFilter,
  SectionHead,
  SeriesCard,
  CategoryChipsNav,
  PageLink,
} from './webtoonSeriesUi';

// 연재 웹툰 파일럿(2026-08-06) — 이슈를 텍스트 레터가 아니라 컷(이미지+캡션)
// 나열로 보여준다. 그림은 admin에서 GPT 등으로 미리 만들어 올린다.
//
// ══════════════════════════════════════════════════════════════════════
// 2026-08-21 (5차) — "화수 나열"에서 "여러 개의 독립된 시리즈"로 재구조화
// ══════════════════════════════════════════════════════════════════════
//
// 참고 이미지(카카오페이지식 목록)를 받았는데, 그 화면은 서로 다른 여러
// 시리즈가 나란히 진열된 셀프다. 그런데 이 페이지는 원래 "이슈를 웹툰으로"
// 라는 하나의 연재를 화수로 나열하는 구조였다(epNumber가 전체 아이템에
// 연번을 매겼다) — 완전히 다른 정보구조다.
//
// 백엔드에는 시리즈 마스터 테이블이 없다(조사 결과: editor_id는 작성자
// 표시명일 뿐 시리즈 식별자가 아니고, channels/category/display_order 전부
// 다른 용도다). 새 테이블·새 GSI를 만드는 대신, 매 편(post)에 자유 텍스트
// series_title을 중복 저장하는 가장 얕은 방법을 택했다(category와 같은
// 저장 위치 재사용, cms_posts_public.py _shape_webtoon 참조). 같은 문자열을
// 쓴 편들이 하나의 시리즈다 — shared/lib/webtoonSeries.ts의 groupIntoSeries()
// 가 평평한 편 목록을 시리즈 단위로 묶는다. series_title이 없는 과거 발행분은
// 편 제목 자체를 시리즈명으로 쓰는 "단편" 시리즈로 폴백한다(깨지지 않는다).
//
// ── 히어로 캐러셀은 그대로 유지한다(사용자 확인, 2026-08-21) ──
// 시리즈 재구조화안을 처음 냈을 때는 "시리즈 카드와 중복된다"는 이유로
// 히어로 캐러셀을 레일로 바꿨는데, 실제 화면(첨부 스크린샷)을 보고 사용자가
// "히어로 섹션은 그대로 유지, 그 아래는 지금 비율(시리즈 카드) 그대로"로
// 확정했다. 그래서 히어로는 4차 디자인(풀블리드 캐러셀, 최신 5편, 좌우
// 엿보기+블러 배경) 그대로 복원했고, 그 밑의 "최근 업데이트" 레일·"전체
// 웹툰" 격자만 시리즈 카드로 유지한다 — 위쪽은 편(episode) 단위, 아래쪽은
// 시리즈 단위로 두 단위가 한 페이지에 공존한다(히어로는 "방금 올라온 편"을
// 보여주는 자리, 아래는 "어떤 시리즈들이 있는지 훑어보는" 자리라 단위가
// 달라도 자연스럽다).
//
// ── "편집국 추천"(display_order) 레일도 뺐다 ──
// 그 필드는 편(episode) 단위에 저장된다. 시리즈 단위로 올리려면 "이 편의
// display_order가 이 시리즈 전체를 대표한다"는 새로운 규칙을 만들어야
// 하는데, 시리즈 안에 추천 편과 비추천 편이 섞이면 그 규칙이 바로 깨진다.
// 지표 없이 "인기"를 지어내지 않기로 한 이전 결정과 같은 이유로, 애매한
// 규칙 위에 기능을 얹지 않는다 — 나중에 시리즈 마스터 테이블이 생기면 그때
// 시리즈 단위 추천 필드를 새로 만드는 게 맞다.
//
// ── 세로 포스터: 크롭 대신 레터박스 ──
// 표지 24장을 실측하면 22장이 3:2 가로(800x533), 2장만 4:5(800x1000)다.
// "세로 비율이어야 한다"는 요청과 이 실측이 충돌한다 — 두 갈래를 검토했다:
//   (A) 하드 크롭: 2:3 세로 박스에 채우려면 3:2 가로 이미지는 폭의 약
//       56%를 잘라내야 한다(box 2:3, image 3:2 기준 cover 계산). 실제 표지
//       상당수가 좌하단/좌상단에 캡션 박스가 그려져 있다(예:「성과급 갈등이
//       원인」) — 중앙만 남기면 그 캡션이 그대로 잘려나간다.
//   (B) contain(레터박스): 정보 손실은 없지만, 가로 이미지를 세로 박스에
//       그대로 넣으면 위아래에 빈 여백이 절반 가까이 남아 "밋밋한 회색
//       막대"가 된다.
// 그래서 (B)를 개선한 세 번째 방법을 썼다 — 이미 히어로 캐러셀(4차)에서
// 검증된 "블러 배경 + 원본 전체 노출" 기법을 포스터에도 그대로 적용한다
// (SeriesPoster 참조): 같은 이미지를 블러+확대해 카드 전체(2:3)를 색으로
// 채우고, 그 위에 원본을 자르지 않고 onDoubleClick 없이 contain으로 얹는다.
// 결과: 카드 모양은 확실히 세로로 길고(요청 충족), 캡션이 있는 원본은
// 한 글자도 안 잘리며, 빈 여백은 무채색 막대가 아니라 그 그림의 색으로
// 채워진다. 일관성 우선(§4) — 새 기법을 만들지 않고 기존 블러 배경
// 기법을 재사용했다.
//
// ── 카테고리 ──
// "경제·금융·기업·정치·사회·국제·문화" 7개로 독립시켰다가, 같은 날 사용자
// 확인으로 경제 레터와 같은 라벨 세트(ECON_CATEGORIES: 증시·부동산·산업·
// 금융·정책·국제·문화)로 통일했다 — shared/constants/
// webtoonCategories.ts. admin WebtoonMode.tsx의 저장 값과 라벨이 반드시
// 일치해야 한다(의도적 중복, econCategories.ts와 같은 이유).
//
// ── 조회수·할인 배지는 안 만들었다 ──
// 참고 이미지의 "6화무"·조회수 47.2만·작가명은 이 시스템에 없는 데이터다
// (CmsWebtoon에 조회수·작가명 필드가 없고, 유료 잠금 개념도 없다). 사용자
// 확인대로 이 배지들은 만들지 않는다 — §4 "준비되지 않은 기능"과 같은
// 이유로, 없는 지표를 지어내면 신뢰가 깨진다.
//
// ══ 이전 차수 기록(4차 이전) ══ WebtoonListClient.tsx git 히스토리 참조.
// 액자 제거(→ /video 카드 언어 재사용), 3단 구성 실험, 흑백 펜화 카피 정정
// 등은 이 5차 재구조화로 대부분 대체됐다.

// 디자인 토큰(INK/BODY/MUTED/...)·카드 CSS(WEBTOON_GRID_CSS)는 이 페이지와
// /webtoon/all(전체보기)이 공유해야 해서 webtoonSeriesUi.tsx로 뽑았다(위
// import 참조) — 카드가 두 곳에 따로 있으면 한쪽만 고치는 실수가 생긴다.

const PAGE_SIZE = 12;
/** 최근 업데이트 레일에 올릴 시리즈 수. */
const RAIL_SIZE = 9;
/** 히어로 캐러셀에 올릴 최신 편수. 인디케이터가 한 줄(5x44=220px)에 들어가는 선. */
const HERO_SIZE = 5;

/** "오늘인가" 판정용 — 세션 중에 바뀌지 않는 값이라 구독할 게 없다. */
const NEVER_CHANGES = () => () => {};
const ALWAYS_FALSE = () => false;

export function WebtoonListClient({
  initialItems,
  initialPage,
  initialCategory,
}: {
  initialItems: CmsWebtoon[];
  initialPage: number;
  initialCategory?: string;
}) {
  const [items, setItems] = useState<CmsWebtoon[]>(initialItems);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWebtoons().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 최신 편이 정말 "오늘" 인지는 클라이언트에서만 판정한다(빌드타임 날짜를
   * HTML에 구우면 하루만 지나도 틀린 라벨이 박히고 하이드레이션도 어긋난다).
   * 서버 스냅샷은 항상 false, 클라이언트 스냅샷만 실제 날짜를 본다.
   */
  const newestDate = items.length > 0 ? items[0].date : null;
  const readIsToday = useCallback(() => !!newestDate && newestDate === kstTodayStr(), [newestDate]);
  const newestIsToday = useSyncExternalStore(NEVER_CHANGES, readIsToday, ALWAYS_FALSE);

  /** 화수는 채널 전체(편 단위) 기준 — 히어로 캡션의 "N화"에만 쓴다. */
  const epNumber = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((w, i) => m.set(w.id, items.length - i));
    return m;
  }, [items]);

  /** 평평한 편 목록을 시리즈 단위로 묶는다 — 업데이트순(최신 화가 갱신된 시리즈가 앞). */
  const allSeries = useMemo(() => groupIntoSeries(items), [items]);

  // URL 이 곧 상태다 — 칩과 페이지 버튼이 전부 <Link> 라서 크롤러가 모든 조합을
  // 밟을 수 있고 뒤로가기도 정상 동작한다. 카테고리 거르기 규칙은 /webtoon/all
  // 과 같은 함수(computeCategoryFilter)를 쓴다 — 두 페이지가 규칙을 각자
  // 다시 구현하면 갈릴 위험이 있다.
  const { categoryCounts, categories, activeCategory, filtering, pool } = useMemo(
    () => computeCategoryFilter(allSeries, initialCategory),
    [allSeries, initialCategory],
  );

  const totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const currentPage = Math.min(initialPage, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paged = pool.slice(startIndex, startIndex + PAGE_SIZE);

  const showBrowse = !filtering && currentPage === 1;
  /** 히어로는 편(episode) 단위 — 최신 5편을 그대로 캐러셀에 올린다. */
  const heroItems = showBrowse ? items.slice(0, HERO_SIZE) : [];
  /** 레일은 그리드 첫 페이지와 같은 시리즈를 겹쳐 보여주지 않는다. */
  const rail = showBrowse ? allSeries.slice(0, RAIL_SIZE) : [];
  const gridExcludingRail = showBrowse ? pool.slice(rail.length) : pool;
  const gridTotalPages = Math.max(1, Math.ceil(gridExcludingRail.length / PAGE_SIZE));
  const gridCurrentPage = showBrowse ? Math.min(currentPage, gridTotalPages) : currentPage;
  const gridItems = showBrowse
    ? gridExcludingRail.slice(0, PAGE_SIZE)
    : paged;

  const href = (opts: { page?: number; cat?: string | null }) => {
    const cat = opts.cat === undefined ? activeCategory : opts.cat;
    const page = opts.page ?? 1;
    const q = new URLSearchParams();
    if (cat) q.set('cat', cat);
    if (page > 1) q.set('page', String(page));
    const s = q.toString();
    return s ? `/webtoon?${s}` : '/webtoon';
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{WEBTOON_GRID_CSS}</style>
      <style>{`
        /* ══ 히어로 캐러셀 ══ 이 홈 목록 페이지에만 있는 구간(편 단위,
           화면 폭을 쓰는 풀블리드) — /webtoon/all(전체보기)에는 없어서
           webtoonSeriesUi.tsx 공유 CSS 에는 넣지 않았다. 밴드 안에는
           **표지뿐이다** — 글자는 밴드 밖(캡션·인디케이터)에 있다. 블러
           배경 위 글자는 대비를 계산할 수 없고, 트랙 안에 글자를 두면
           반쯤 보이는 옆 카드에서 문장이 중간에 잘려 고장처럼 보인다. */
        .wt-hband { position: relative; overflow: hidden; }

        /* 백드롭 — 표지를 형태가 사라질 때까지 흘려서 색면으로만 남긴다. */
        .wt-hbg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .wt-hbg > span { position: absolute; inset: -10%; opacity: 0; background-size: cover;
          background-position: center; filter: blur(56px) saturate(1.7);
          transform: scale(1.15); transition: opacity .6s ease; }
        .wt-hbg > span[data-on="1"] { opacity: 1; }
        /* 베일 — 위아래를 #fff 로 끝내서 밴드 경계선을 없앤다. */
        .wt-hveil { position: absolute; inset: 0; pointer-events: none; background:
          linear-gradient(180deg, #fff 0%, rgba(255,255,255,.42) 20%,
            rgba(255,255,255,.30) 52%, rgba(255,255,255,.78) 88%, #fff 100%); }

        /* --sw: 중앙 표지 폭. 72vw 로 묶어야 640~900px 구간에서도 옆 편이 보인다. */
        .wt-hstage { position: relative; max-width: 1280px; margin: 0 auto; --sw: min(600px, 72vw); }
        .wt-htrack { display: flex; align-items: center; gap: 16px; overflow-x: auto;
          scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none;
          list-style: none; margin: 0;
          padding: 20px calc((100% - var(--sw)) / 2); }
        .wt-htrack::-webkit-scrollbar { display: none; }
        .wt-htrack > li { flex: 0 0 var(--sw); scroll-snap-align: center;
          display: flex; align-items: center; }
        @media (min-width: 640px) { .wt-htrack { gap: 24px; } }

        /* 포스터 — 3:2 그림 하나가 전부이고, radius 도 한 단계 크다(16). */
        .wt-hposter { display: block; position: relative; width: 100%; overflow: hidden;
          border-radius: 16px; background: #fff; text-decoration: none;
          transition: box-shadow .3s ease, transform .18s ease; }
        .wt-hposter:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }

        /* 중앙이 주인공 — 크기(여백 인셋)와 그림자로 말한다. */
        .wt-hslot { width: 100%; transition: padding .3s ease; }
        .wt-hslot[data-on="0"] { padding-inline: 10px; }
        @media (min-width: 640px) { .wt-hslot[data-on="0"] { padding-inline: 40px; } }
        .wt-hslot[data-on="0"] .wt-hposter {
          box-shadow: 0 1px 2px rgba(17,24,39,.04), 0 6px 16px rgba(17,24,39,.08); }
        .wt-hslot[data-on="0"] .wt-hcover { opacity: .78; }
        .wt-hslot[data-on="1"] .wt-hposter {
          box-shadow: 0 4px 10px rgba(17,24,39,.08), 0 24px 56px rgba(17,24,39,.20); }
        .wt-hslot[data-on="1"] .wt-hposter:hover { transform: translateY(-3px); }
        .wt-hslot[data-on="1"] .wt-hposter:hover .wt-hcover { transform: scale(1.03); }
        .wt-hcover { transition: transform .3s ease, opacity .3s ease; }

        /* 캡션 — 밴드 밖 흰 바닥이다. 포스터 줄 아래 한 덩어리로 놓여서
           "가운데 것의 설명"으로 읽힌다. */
        .wt-hcap { text-align: center; padding-top: 4px; }
        .wt-hcap-in { max-width: 520px; margin: 0 auto; min-height: 140px; }
        @media (min-width: 640px) { .wt-hcap-in { min-height: 152px; } }
        .wt-hcap-meta { font-size: 13px; font-weight: 600; color: ${MUTED};
          font-variant-numeric: tabular-nums; margin-bottom: 8px; }
        .wt-hcap-t { font-size: 20px; font-weight: 800; letter-spacing: -0.02em;
          line-height: 1.4; color: ${INK}; word-break: keep-all; margin-bottom: 8px;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; }
        @media (min-width: 640px) { .wt-hcap-t { font-size: 24px; } }
        .wt-hcap-ex { font-size: 16px; color: ${BODY}; line-height: 1.7; word-break: keep-all;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; }
        .wt-hcap a { text-decoration: none; }
        .wt-hcap a:hover .wt-hcap-t { text-decoration: underline; text-underline-offset: 3px; }
        .wt-hcap a:focus-visible { outline: 2px solid ${INK}; outline-offset: 4px; border-radius: 8px; }
        @keyframes wt-cap-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .wt-hcap-in { animation: wt-cap-in .32s ease both; }

        /* 화살표 — 어떤 색면 위에 놓일지 알 수 없다. 어두운 채움 + 흰 링. */
        .wt-harrow { display: none; }
        @media (min-width: 640px) {
          .wt-harrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
            display: inline-flex; align-items: center; justify-content: center;
            width: 44px; height: 44px; border-radius: 999px; border: none; padding: 0;
            background: rgba(17,24,39,.76); color: #fff; cursor: pointer;
            -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
            box-shadow: 0 0 0 1.5px rgba(255,255,255,.92), 0 2px 10px rgba(17,24,39,.22);
            transition: background .14s ease; }
          .wt-harrow:hover:not(:disabled) { background: rgba(17,24,39,.94); }
          .wt-harrow:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; }
          .wt-harrow:disabled { visibility: hidden; }
          .wt-hprev { left: 12px; }
          .wt-hnext { right: 12px; }
        }

        /* 인디케이터 — 밴드 밖(흰 바닥)이라 MUTED·INK 둘 다 안전하다. */
        .wt-hdots { display: flex; justify-content: center; align-items: center;
          list-style: none; margin: 8px 0 0; padding: 0; }
        .wt-hdot { width: 44px; height: 44px; display: inline-flex; align-items: center;
          justify-content: center; background: none; border: none; padding: 0; cursor: pointer; }
        .wt-hdot:focus-visible { outline: 2px solid ${INK}; outline-offset: -8px; border-radius: 10px; }
        .wt-hdot > span { display: block; width: 8px; height: 8px; border-radius: 999px;
          background: ${MUTED}; transition: width .25s ease, background .25s ease; }
        .wt-hdot:hover > span { background: ${BODY}; }
        .wt-hdot[aria-current="true"] > span { width: 28px; background: ${INK}; }

        @media (prefers-reduced-motion: reduce) {
          .wt-harrow, .wt-hslot, .wt-hbg > span, .wt-hdot > span, .wt-hposter { transition: none; }
          .wt-hcap-in { animation: none; }
          .wt-hslot[data-on="1"] .wt-hposter:hover { transform: none; }
          .wt-hslot[data-on="1"] .wt-hposter:hover .wt-hcover { transform: none; }
        }
      `}</style>

      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ paddingBottom: paged.length > 0 ? 0 : 96 }}>
        <div className="wt-wrap" style={{ paddingTop: 'clamp(28px, 5vw, 56px)' }}>
          <header style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: MUTED, marginBottom: 4 }}>
              Webtoon
            </p>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em', color: INK, marginBottom: 8 }}>
              이슈를 웹툰으로
            </h1>
            <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, maxWidth: 520 }}>
              경제·사회 이슈를 여러 화로 이어가는 시리즈 웹툰이에요.
            </p>
          </header>

          {/* 카테고리 — 데이터에 있는 것만. */}
          <CategoryChipsNav
            categories={categories}
            categoryCounts={categoryCounts}
            activeCategory={activeCategory}
            totalCount={allSeries.length}
            buildHref={(cat) => href({ cat })}
          />

          {allSeries.length === 0 && (
            <div style={{ padding: '72px 24px', textAlign: 'center', background: BAND, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>아직 연재된 웹툰이 없어요</p>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7 }}>곧 첫 시리즈로 찾아올게요.</p>
            </div>
          )}

          {allSeries.length > 0 && pool.length === 0 && (
            <div style={{ padding: '56px 24px', textAlign: 'center', background: BAND, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>
                {activeCategory} 웹툰은 아직 없어요
              </p>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, marginBottom: 16 }}>
                다른 카테고리를 보거나 전체 목록에서 골라보세요.
              </p>
              <Link href={href({ cat: null })} className="wt-chip" style={{ background: INK, color: '#fff', fontWeight: 700 }}>
                전체 웹툰 보기
              </Link>
            </div>
          )}
        </div>

        {/* ── 1. 히어로 캐러셀 ── 화면 폭을 쓰는 유일한 구간. 최신 5편(편 단위). */}
        {heroItems.length > 0 && (
          <HeroCarousel
            items={heroItems}
            epNumber={epNumber}
            title="새로 올라온 웹툰"
            sub={
              newestIsToday
                ? `오늘 발행 · ${heroItems.length}편`
                : `가장 새 회차 ${fmtDate(heroItems[0].date)} · ${heroItems.length}편`
            }
          />
        )}

        {/* ── 2. 최근 업데이트(가로 레일) ── 발행량이 늘어도 세로 길이를 안 먹는다. */}
        {rail.length > 0 && (
          <div className="wt-wrap">
            <SeriesRail items={rail} showCategory={!filtering} />
          </div>
        )}

        {/* ── 3. 전체 웹툰 ── 격자 + 페이지네이션. 카테고리 칩이 이 섹션을 좁힌다. */}
        {gridItems.length > 0 && (
          <section className="wt-band">
            <div className="wt-wrap">
              <SectionHead
                title={filtering ? `${activeCategory} 웹툰` : '전체 웹툰'}
                moreHref={activeCategory ? `/webtoon/all?cat=${encodeURIComponent(activeCategory)}` : '/webtoon/all'}
              />
              <ul className="wt-grid">
                {gridItems.map((s, i) => (
                  <li key={s.slug}>
                    <SeriesCard
                      series={s}
                      showCategory={!filtering}
                      sizes="(min-width: 900px) 220px, (min-width: 640px) 30vw, 46vw"
                      eager={heroItems.length === 0 && rail.length === 0 && i === 0}
                    />
                  </li>
                ))}
              </ul>

              {gridTotalPages > 1 && (
                // flex-wrap 추가(2026-09-02) — 예전엔 총 페이지 수만큼
                // 무조건 다 렌더링해서(생략 부호 없이) 시리즈가 많아지면
                // (실측 52페이지) 한 줄로 화면 밖까지 넘쳐 흘렀다.
                // buildPageItems()로 생략 부호를 넣은 게 근본 수정이고,
                // wrap은 혹시 남는 케이스에 대한 안전망.
                <nav aria-label="웹툰 목록 페이지" className="flex items-center justify-center flex-wrap" style={{ gap: 8, marginTop: 32 }}>
                  <PageLink href={href({ page: gridCurrentPage - 1 })} label="이전 페이지" disabled={gridCurrentPage === 1}>
                    ←
                  </PageLink>
                  {buildPageItems(gridCurrentPage, gridTotalPages).map((item, i) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${i}`} aria-hidden style={{ width: 44, textAlign: 'center', color: MUTED }}>
                        …
                      </span>
                    ) : (
                      <PageLink key={item} href={href({ page: item })} label={`${item}페이지`} active={gridCurrentPage === item}>
                        {item}
                      </PageLink>
                    ),
                  )}
                  <PageLink href={href({ page: gridCurrentPage + 1 })} label="다음 페이지" disabled={gridCurrentPage === gridTotalPages}>
                    →
                  </PageLink>
                </nav>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * 히어로 캐러셀 — 이 페이지에서 유일하게 화면 폭을 쓰는 구간이다. 편(episode)
 * 단위로 최신 5편을 보여준다(시리즈 단위가 아니다 — "방금 올라온 편"을
 * 보여주는 자리라 편 단위가 맞다).
 *
 * 위치 계산을 transform 이 아니라 네이티브 스크롤 + scroll-snap 으로 한다:
 * 터치 스와이프·관성·키보드 포커스 이동이 전부 브라우저 기본 동작으로
 * 따라오고, translateX 를 직접 관리할 때 생기는 문제가 없다.
 *
 * 활성 슬라이드는 컨테이너 중앙에 가장 가까운 자식으로 판정한다.
 * offsetLeft 대신 getBoundingClientRect 를 쓰는 이유는 트랙의 좌우 패딩이
 * offsetLeft 의 원점을 어긋나게 하기 때문이다.
 */
function HeroCarousel({
  items,
  epNumber,
  title,
  sub,
}: {
  items: CmsWebtoon[];
  epNumber: Map<string, number>;
  title: string;
  sub: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const rafRef = useRef(0);
  const [active, setActive] = useState(0);

  const sync = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = trackRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const center = box.left + box.width / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(el.children).forEach((child, i) => {
        const r = (child as HTMLElement).getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive((prev) => (prev === best ? prev : best));
    });
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(rafRef.current);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [sync, items]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const target = el.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    if (!target) return;
    const box = el.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: r.left + r.width / 2 - (box.left + box.width / 2),
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [items.length]);

  const many = items.length > 1;
  const current = items[Math.min(active, items.length - 1)];

  return (
    <section style={{ marginBottom: 48 }}>
      <div className="wt-wrap" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: INK, marginBottom: 4 }}>
          {title}
        </h2>
        <p style={{ fontSize: 13, color: MUTED, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sub}</p>
      </div>

      <div className="wt-hband">
        <div className="wt-hbg" aria-hidden>
          {items.map((w, i) => {
            const src = coverThumb(w.cover_image_url, 'sm');
            if (!src) return null;
            return <span key={w.id} data-on={i === active ? '1' : '0'} style={{ backgroundImage: `url("${src}")` }} />;
          })}
        </div>
        <div className="wt-hveil" aria-hidden />

        <div className="wt-hstage">
          <ul className="wt-htrack" ref={trackRef} onScroll={sync} aria-label={title}>
            {items.map((w, i) => (
              <li key={w.id}>
                <div className="wt-hslot" data-on={i === active ? '1' : '0'}>
                  <Link
                    href={`/webtoon/${encodeURIComponent(w.id)}`}
                    prefetch={i === 0}
                    className="wt-hposter"
                    aria-label={`${epNumber.get(w.id)}화 ${w.title}`}
                  >
                    <EpisodeCover
                      webtoon={w}
                      size="lg"
                      sizes="(min-width: 834px) 600px, 72vw"
                      priority={i === 0}
                    />
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {many && (
            <>
              <button
                type="button"
                className="wt-harrow wt-hprev"
                onClick={() => goTo(active - 1)}
                disabled={active === 0}
                aria-label="이전 회차 보기"
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                className="wt-harrow wt-hnext"
                onClick={() => goTo(active + 1)}
                disabled={active === items.length - 1}
                aria-label="다음 회차 보기"
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="wt-wrap wt-hcap">
        <div className="wt-hcap-in" key={current.id} aria-live="polite">
          <Link href={`/webtoon/${encodeURIComponent(current.id)}`} prefetch={false}>
            <p className="wt-hcap-meta">
              {[current.category ?? null, `${epNumber.get(current.id)}화`, fmtDate(current.date)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <h3 className="wt-hcap-t">{displayHeadline(current.title)}</h3>
            <p className="wt-hcap-ex">{current.excerpt}</p>
          </Link>
        </div>

        {many && (
          <ul className="wt-hdots">
            {items.map((w, i) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="wt-hdot"
                  onClick={() => goTo(i)}
                  aria-current={i === active ? 'true' : undefined}
                  aria-label={`${epNumber.get(w.id)}화 ${w.title}`}
                >
                  <span aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 히어로 캐러셀 전용 표지 칸 — 원본 3:2를 그대로 두고 자르지 않는다. */
function EpisodeCover({
  webtoon,
  size,
  sizes,
  priority,
}: {
  webtoon: CmsWebtoon;
  size: 'lg' | 'md';
  sizes: string;
  priority?: boolean;
}) {
  const src = coverThumb(webtoon.cover_image_url, size);
  return (
    <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: PLACEHOLDER }}>
      {src ? (
        <Image
          src={src}
          alt={`${webtoon.title} 첫 장면`}
          fill
          sizes={sizes}
          className="wt-hcover"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full" style={{ fontSize: 14, color: BODY }}>
          준비 중
        </div>
      )}
    </div>
  );
}

/**
 * 최근 업데이트 레일 — 시리즈를 세로 포스터로 가로 스크롤. 발행량이 늘어도
 * 세로 길이를 안 먹는 것이 이 모양을 고른 이유다(기존 ChartRail과 같은
 * 인터랙션 패턴 재사용 — 화살표는 마우스 보조수단, 키보드는 카드 링크로
 * Tab 하면 브라우저가 알아서 스크롤한다).
 */
function SeriesRail({ items, showCategory }: { items: WebtoonSeries[]; showCategory: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: el.scrollLeft <= 2, end: max <= 2 || el.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    sync();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, items]);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <section style={{ marginBottom: 48 }}>
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <SectionHead title="최근 업데이트" moreHref="/webtoon/all" />
        <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
          <button type="button" className="wt-arrow" onClick={() => nudge(-1)} disabled={edge.start} aria-label="이전 시리즈 보기">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button type="button" className="wt-arrow" onClick={() => nudge(1)} disabled={edge.end} aria-label="다음 시리즈 보기">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <ul className="wt-rail" ref={ref} onScroll={sync}>
        {items.map((s, i) => (
          <li key={s.slug}>
            <SeriesCard
              series={s}
              showCategory={showCategory}
              sizes="(min-width: 640px) 176px, 132px"
              eager={i === 0}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

