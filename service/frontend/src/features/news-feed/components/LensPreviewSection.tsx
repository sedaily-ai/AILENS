'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { LENS_ACCENT, lensFormatCaption, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { getSavedInterests } from '@/shared/lib/onboardingStorage';
import { LensFormatGuide } from './LensFormatGuide';

// 첫 방문자에게 가이드를 자동으로 한 번만 띄운다(2026-08-21, 사용자
// 요청 — "처음 온 사람들이... 왜 그렇게 봐야하고 각 유형은 어떤 내용을
// 담고있는지"). localStorage 플래그 하나로 "이미 봤음"을 기기에 남긴다
// — 서버 저장 없이 충분(재방문마다 다시 뜨면 오히려 방해).
const GUIDE_SEEN_KEY = 'ailens-lens-format-guide-seen';

// 활성 탭 텍스트 전용 accent(2026-08-24). LENS_ACCENT(#3b82f6)를 14px 텍스트에
// 그대로 쓰면 흰 배경 대비 3.68:1로 WCAG AA(4.5:1) 미달이라, 같은 계열의 한 단계
// 진한 셰이드(blue-600)로 5.17:1을 확보한다. 인디케이터 바·배경 틴트는 장식/대형
// 요소라 LENS_ACCENT를 그대로 쓴다. ⚠️ 임시 로컬 상수 — 다른 화면에서도 "AA용
// 진한 accent"가 필요해지면 lensPerspectives.ts의 공용 토큰으로 승격할 것.
const LENS_ACCENT_STRONG = '#2563eb';

// "오늘의 이슈, 4가지 시선" 홈 티저 — 지면 특별 코너로 개편(2026-08-21,
// 사용자 요청: "전체 지면 1면, 증권면 1면, 산업면 1면, 시그널 1면 이렇게
// 구성하고, 해당 중요한 기사들을 넣는 탭으로 만들겁니다").
//
// 2단 구조다(세 번째 시도 만에 정리 — 앞선 두 번은 사용자가 스크린샷으로
// 직접 고쳐줬다):
//  1. **탭**(전체/증권/산업/시그널) — 지면을 고른다. 탭마다 최대 4개의
//     기사가 있다("각 유형별로 기사 4개를 뽑아줄거니까").
//  2. **화살표** — 고른 탭 "안의" 기사 4개를 좌우로 넘긴다("이 화살표
//     부분 좌우 누르면 그 유형 안에 있는 기사를 움직인다는거죠"). 탭을
//     바꾸는 게 아니라, 같은 탭 안에서 기사 위치만 바뀐다.
//  각 기사는 예전과 동일한 레이아웃(사진+헤드라인 + 레터/웹툰/팟캐스트/
//  영상 4형식 캐릭터 행)으로 보여준다 — 이 시각 구조 자체는 안 바뀐다.
//
// 지면별 기사는 lens.paper_section 필드로 고른다(2026-08-21, 데이터 모델
// 수정 — 처음엔 lens.category(/markets 등 일반 카테고리 페이지가 쓰는
// 같은 필드, 증시/산업/... 7개 값)를 재사용해서 "전체" 탭은 category
// 무관 최신순으로 구현했었다. 그런데 그러면 산업/증권 카테고리로 새
// 글을 발행할 때마다 그 글이 "전체" 탭에도 자동으로 같이 떠버리는
// 문제가 생겼다(사용자 지적: "산업 1면에만 올라가야 하는데 지면
// 1면에도 들어갔네요... 지면 1면은 지면 1면 기사만 들어가는 겁니다.
// '전체'가 아니예요"). 한 필드를 두 목적(일반 카테고리 페이지 배치 +
// 지면 특별 코너 배치)에 같이 쓴 게 근본 원인이라, 지면 특별 코너
// 전용 필드(paper_section)를 완전히 분리했다 — "전체"/"증권"/"산업"/
// "시그널" 중 하나를 명시적으로 값으로 가진 글만 이 코너에 뜨고,
// category(증시/산업 등)와는 이제 아무 관계가 없다. 즉 어떤 글이
// 지면 특별 코너 어디에도 안 뜨는 게 기본값 — 사람이 명시적으로
// paper_section을 찍어줘야 노출된다. 기사가 없는 지면은 아래 "준비
// 중" 빈 상태로 보여준다.
interface SectionSlot {
  key: string;
  label: string;
  paperSection: string; // lens.paper_section과 매칭 — SECTIONS[0]은 "전체"
}

// 탭 라벨 자체에 "1면"까지 표기(2026-08-21, 사용자 확인 — 처음엔 탭은
// 짧게 두고 "1면"을 배지 쪽으로 뺐었는데, 스크린샷으로 "지면 1면/증권
// 1면/산업 1면/시그널 1면 이라고 표기해주시죠"라고 재요청해 탭 라벨을
// 그대로 "OO 1면"으로 확정. 배지·빈 상태 문구는 label을 그대로 쓰므로
// 별도로 "1면"을 덧붙이지 않는다(중복 방지, 아래 참조).
const SECTIONS: SectionSlot[] = [
  { key: 'all', label: '지면 1면', paperSection: '전체' },
  { key: 'markets', label: '증권 1면', paperSection: '증권' },
  { key: 'industry', label: '산업 1면', paperSection: '산업' },
  { key: 'signal', label: '시그널 1면', paperSection: '시그널' },
];

const ARTICLES_PER_SECTION = 4;

export function LensPreviewSection({ initialItems }: { initialItems?: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [activeTab, setActiveTab] = useState(0);
  const [articleIndex, setArticleIndex] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((data) => {
      // 빈 응답으로 SSR 프리페치 결과를 덮지 않는다.
      if (!cancelled && data.length > 0) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(NewsTimeMachine.tsx:62와 같은 관례). 렌더 중에는 읽을 수 없다 — 서버에는 localStorage가 없어 하이드레이션이 깨진다.
      if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) setShowGuide(true);
    } catch {
      // localStorage 접근 불가(시크릿 모드 등) — 자동으로는 안 띄우고,
      // ⓘ 버튼으로는 여전히 열 수 있다.
    }
  }, []);

  // 온보딩(/start)에서 고른 관심분야로 기본 탭을 맞춘다(2026-09) — 지금까지는
  // 저장만 하고 아무 데도 안 썼다. SECTIONS의 paperSection이 온보딩
  // InterestStep과 완전히 같은 taxonomy(전체/증권/산업/시그널)라 매핑 없이
  // 바로 찾는다. 여러 개 골랐으면 SECTIONS 순서상 처음 매칭되는 것 하나만
  // (탭은 한 번에 하나만 활성화 가능).
  useEffect(() => {
    const saved = getSavedInterests();
    if (saved.length === 0) return;
    const idx = SECTIONS.findIndex((s) => saved.includes(s.paperSection));
    if (idx < 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(바로 위 GUIDE_SEEN_KEY effect와 같은 관례).
    setActiveTab(idx);
  }, []);

  // useCallback으로 고정한다 — LensFormatGuide가 이 함수를 ESC 리스너
  // 의존성으로 쓰기 때문에(2026-08-21 재설계에서 ESC 처리를 모달 안으로
  // 옮겼다), 매 렌더 재생성되면 리스너가 계속 재구독된다.
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
    } catch {
      // 저장 실패해도 이번 세션 내 UI 상태는 유지.
    }
  }, []);

  if (!items || items.length === 0) return null;

  function selectTab(i: number) {
    setActiveTab(i);
    setArticleIndex(0); // 탭을 바꾸면 그 탭의 첫 기사부터.
  }

  const activeSection = SECTIONS[activeTab];
  const sectionArticles = items
    .filter((l) => l.paper_section === activeSection.paperSection)
    // display_order가 있는 글은 오름차순으로 우선 배치(1번 자리에 실을
    // 글을 명시적으로 고르는 용도) — 없는 글은 items가 이미 정렬해 온
    // publish_date/published_at 내림차순을 그대로 따른다(정렬 안정성
    // 덕분에 순서 유지). published_at을 정렬 키인 척 수동 재기록하던
    // 임시방편(2026-08-21 이전 지면 4건 전부 이렇게 처리)을 대체한다.
    //
    // 2026-09-28 — display_order는 파이프라인이 "그날 회차 안에서" 매기는
    // 0부터 시작하는 인덱스라(pipelines/frontpage_auto/run.py), 날짜
    // 구분 없이 여기서 전역 오름차순만 걸면 예전 어느 날 우연히 0을
    // 받은 글이 그보다 값이 큰(예: 2) 오늘 새 글보다 계속 앞자리를
    // 차지하는 버그가 생긴다(실측 — 9/23 글이 9/28 새 글을 밀어내고
    // 계속 지면 1면 1번 자리에 남아있었음). 날짜(YYYY-MM-DD)를 1순위로
    // 최신순 정렬하고, 같은 날짜 안에서만 display_order로 미세 조정한다.
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const orderA = a.display_order;
      const orderB = b.display_order;
      if (orderA != null && orderB != null) return orderA - orderB;
      if (orderA != null) return -1;
      if (orderB != null) return 1;
      return 0;
    })
    .slice(0, ARTICLES_PER_SECTION);
  const total = sectionArticles.length;
  const safeArticleIndex = total > 0 ? Math.min(articleIndex, total - 1) : 0;
  const current = total > 0 ? sectionArticles[safeArticleIndex] : null;
  const href = current ? `/lens/${encodeURIComponent(current.id)}` : null;
  const photo = current ? pickLensPhoto(current) : null;
  const rows = current ? (current.lenses ?? []).slice(0, 4) : [];

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        /* 지면 탭 — 언더라인 관례는 유지하되, 선택을 색 하나가 아니라
           [연한 배경 틴트 + 미끄러지는 인디케이터 + 굵기]로 함께 설명한다. */
        .lz-tabs { position: relative; display: flex; }
        .lz-tab { position: relative; transition: background .15s ease, color .15s ease; }
        .lz-tab:not(.is-active):hover { background: #f4f6f8; color: #374151; }
        .lz-tab:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -3px; border-radius: 8px; }
        /* 인디케이터: 활성 탭 폭(=1/탭수)만큼만 그리고, translateX로 그 자리로
           미끄러진다. 탭이 모두 flex-1(균등폭)이라 활성 인덱스 × 100%면 정확히
           해당 탭 아래에 선다. */
        .lz-tab-ind { position: absolute; bottom: -1px; left: 0; height: 2.5px;
          border-radius: 2px; background: ${LENS_ACCENT}; pointer-events: none;
          transition: transform .28s cubic-bezier(.4, 0, .2, 1); will-change: transform; }
        @media (prefers-reduced-motion: reduce) { .lz-tab-ind { transition: none; } }
        .lz-arrow { transition: background .15s ease, transform .08s ease; }
        .lz-arrow:not(:disabled):hover { background: #dbeafe; }
        .lz-arrow:not(:disabled):active { transform: scale(.9); }
        .lz-dot { transition: background .15s ease, width .15s ease; }

        /* 가이드 ⓘ 트리거 — 제목 옆이라 시각 크기는 22px로 작게 두되,
           ::after로 히트 영역만 44×44로 넓힌다(레이아웃은 그대로).
           버튼을 실제로 44px로 키우면 h2 옆 여백이 벌어져 제목 정렬이
           깨진다. */
        .lz-info { position: relative; }
        .lz-info::after { content: ''; position: absolute; left: 50%; top: 50%;
          width: 44px; height: 44px; transform: translate(-50%, -50%); }
        .lz-info:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 3px; }

        .lz-issue:hover .lz-h { text-decoration: underline; text-underline-offset: 3px; }

        /* ── 형식 4칸 ── 2026-08-24 재구조화.
           이전엔 [일러스트][역할명][질문+태그라인][›] 세로 4행이었다. 문제가
           둘: (a) 행마다 두 줄씩 ~290px를 먹어서, 이 섹션의 주인공(오늘의
           이슈)보다 형식 목록이 화면을 더 차지했다 — 위계가 뒤집혔다.
           (b) 네 행이 거의 같은 텍스처의 반복이었고, 그 안의 태그라인은
           기사와 무관한 고정 문구라 매일 같은 말이 4줄 반복됐다(스티어링
           §4 "카드 반복의 함정").
           지금은 그리드 타일이다 — 모바일 2×2, 720px↑ 4열. 높이가 절반
           이하로 줄고 "네 개가 한 세트의 선택지"로 읽힌다. 1px 간격 +
           바탕색으로 헤어라인 격자를 만들어 별도 테두리를 안 쓴다. */
        /* 칸 구분선 — gap+바탕색 대신 셀 border로 그린다(2026-08-24, "세로
           선을 칸 끝까지" 요청). gap 방식은 선이 그리드 트랙에만 그려져
           칸보다 짧게 끊겨 보였다. border는 셀 박스 높이를 그대로 따라가므로
           위아래 끝까지 이어진다. 칸이 항상 4개라 nth-child로 마지막 열·행의
           선만 뺀다. align-items: stretch(기본)라 네 칸의 높이가 같아져
           세로선 길이도 서로 어긋나지 않는다. */
        .lz-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: stretch; }
        .lz-cell { display: flex; flex-direction: column; gap: 9px; min-height: 104px; height: 100%;
          padding: 14px clamp(12px, 1.8vw, 16px); background: #fff; text-decoration: none;
          border-right: 1px solid rgba(17,24,39,0.1);
          border-bottom: 1px solid rgba(17,24,39,0.1);
          transition: background .14s ease; }
        /* 모바일 2×2 — 오른쪽 열(2,4) 우측선 없음, 아래 행(3,4) 하단선 없음. */
        .lz-cell:nth-child(2n) { border-right: none; }
        .lz-cell:nth-child(n + 3) { border-bottom: none; }
        @media (min-width: 720px) {
          .lz-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          /* 4열 한 줄 — 하단선 전부 없음, 마지막 칸만 우측선 없음. */
          .lz-cell { border-bottom: none; }
          .lz-cell:nth-child(2n) { border-right: 1px solid rgba(17,24,39,0.1); }
          .lz-cell:last-child { border-right: none; }
        }
        .lz-cell:hover { background: #f7f9fc; }
        .lz-cell:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }
        .lz-cell:hover .lz-cq { color: #111827; }
        .lz-cq { transition: color .14s ease; }
        .lz-avatar { box-shadow: inset 0 0 0 1px rgba(17,24,39,0.06); }

        /* 페이저 — 카드 안, 히어로 바로 아래로 옮겼다(2026-08-24). 이전엔
           카드 **밖** 아래에 있어서, 카드 안 내용을 바꾸는 컨트롤이 카드
           밖에 떠 있었다(무엇을 조작하는지 안 읽힘). */
        .lz-pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px;
          padding: 9px clamp(12px, 2.4vw, 18px); border-top: 1px solid rgba(17,24,39,0.06); }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p className="text-gray-400" style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          오늘의 지면
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              오늘의 이슈, 4가지 시선
            </h2>
            {/* 가이드 트리거 — 첫 방문자에겐 자동으로 뜨고, 재방문자는
                이 버튼으로 다시 볼 수 있다(LensFormatGuide.tsx 참조). */}
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              aria-label="4가지 형식 안내 보기"
              className="lz-info flex items-center justify-center flex-shrink-0 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid currentColor', color: '#6b7280', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>i</span>
            </button>
          </div>
          <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 600 }}>
            전체 보기 →
          </Link>
        </div>
        {/* 사용법 설명을 줄였다(2026-08-24) — 탭·화살표·형식 타일이 각자
            생김새로 이미 역할을 말한다. 이 줄은 "왜 네 형식인가"만 말한다. */}
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'keep-all' }}>
          같은 기사를 네 가지 형식으로 담았어요. 원하는 방식으로 보세요.
        </p>
      </header>

      <div
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          background: '#fff',
          border: '1px solid rgba(17,24,39,0.07)',
          boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 14px 36px -10px rgba(17,24,39,0.09)',
        }}
      >
        {/* 지면 탭 — 1단계 선택. 화살표(아래)와 역할이 다르다: 탭은 지면을
            바꾸고, 화살표는 고른 지면 "안의" 기사를 넘긴다. */}
        <div className="lz-tabs" style={{ borderBottom: '1px solid rgba(17,24,39,0.09)' }}>
          {SECTIONS.map((s, i) => {
            const isActive = i === activeTab;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectTab(i)}
                aria-pressed={isActive}
                className={`lz-tab flex-1${isActive ? ' is-active' : ''}`}
                style={{
                  minHeight: 48,
                  padding: '15px 6px',
                  fontSize: 14,
                  fontWeight: isActive ? 800 : 700,
                  letterSpacing: '-0.01em',
                  border: 'none',
                  background: isActive ? 'rgba(59,130,246,0.07)' : 'transparent',
                  // 비활성 #5b6472 ≈ 6:1, 활성 #2563eb ≈ 5.2:1 — 둘 다 AA 통과.
                  color: isActive ? LENS_ACCENT_STRONG : '#5b6472',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            );
          })}
          {/* 활성 위치로 미끄러지는 하단 인디케이터 — 색 대신 움직임/위치로 선택을 설명. */}
          <span
            aria-hidden
            className="lz-tab-ind"
            style={{ width: `${100 / SECTIONS.length}%`, transform: `translateX(${activeTab * 100}%)` }}
          />
        </div>

        {!current ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
              {activeSection.label}을 준비하고 있어요.
            </p>
          </div>
        ) : (
          <>
            {/* ── 하나의 이슈 ── 네 시선이 공유하는 원본. 사진 + 헤드라인 + 요약. */}
            <Link
              href={href!}
              prefetch
              className="lz-issue flex"
              style={{ gap: 'clamp(12px, 2.4vw, 18px)', padding: 'clamp(14px, 2.4vw, 18px)', textDecoration: 'none', alignItems: 'center' }}
            >
              {photo && (
                <span
                  className="flex-shrink-0"
                  style={{
                    position: 'relative',
                    width: 'clamp(112px, 22vw, 168px)',
                    aspectRatio: '3 / 2',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#f3f4f6',
                    boxShadow: 'inset 0 0 0 1px rgba(17,24,39,0.07)',
                  }}
                >
                  <Image
                    src={photo}
                    alt=""
                    fill
                    sizes="168px"
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                  />
                </span>
              )}

              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="flex items-center" style={{ gap: 7, marginBottom: 5 }}>
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
                    {kstDateTimeLabel(current.published_at) ?? current.date.replaceAll('-', '.')}
                  </span>
                </span>
                <span
                  className="lz-h"
                  style={{
                    display: '-webkit-box',
                    fontSize: 'clamp(16px, 2.4vw, 20px)',
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.025em',
                    lineHeight: 1.35,
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'keep-all',
                  }}
                >
                  {current.headline}
                </span>
                {current.context && (
                  <span
                    className="hidden sm:block"
                    style={{
                      marginTop: 5,
                      fontSize: 14,
                      color: '#6b7280',
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {current.context}
                  </span>
                )}
              </span>
            </Link>

            {rows.length > 0 && (
              <>
                <p
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#9ca3af',
                    letterSpacing: '0.01em',
                    padding: '13px clamp(12px, 2.4vw, 18px) 10px',
                    borderTop: '1px solid rgba(17,24,39,0.06)',
                  }}
                >
                  어떤 형식으로 볼까요
                </p>

                {/* 형식 타일 — 항상 고정 태그라인만 쓴다(lensFormatCaption).
                    한때 "기사별 질문(실제 내용)을 보여준다"는 의도로
                    l.question을 썼던 적이 있는데, 실제로는 레터·팟캐스트·
                    영상의 question이 파이프라인에서 기사 제목을 그대로
                    복사한 값이라(웹툰만 진짜 별도 core_question을 만듦)
                    "실제 내용"이 아니라 헤드라인 중복 표시였다 — 2026-08-23
                    발견 후 고쳤다가 다음날 그리드 재설계로 조용히
                    재도입됐던 걸 2026-09-03 재발견해 다시 고쳤다. 형식이
                    뭔지에 대한 설명은 제목 옆 ⓘ 가이드(LensFormatGuide)가
                    담당한다. */}
                <div className="lz-grid">
                  {rows.map((l, i) => {
                    const p = lensPerspectiveAt(i);
                    return (
                      <Link key={i} href={`${href}?v=${i + 1}`} prefetch className="lz-cell">
                        <span className="flex items-center" style={{ gap: 8 }}>
                          <span
                            className="lz-avatar flex items-center justify-center flex-shrink-0"
                            style={{ width: 34, height: 34, borderRadius: 999, background: p.tint, overflow: 'hidden' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                            <img
                              src={p.illustration}
                              alt=""
                              width={34}
                              height={34}
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                            />
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: p.color,
                              letterSpacing: '-0.01em',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {p.short}
                          </span>
                        </span>
                        <span
                          className="lz-cq"
                          style={{
                            display: '-webkit-box',
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#374151',
                            lineHeight: 1.5,
                            letterSpacing: '-0.015em',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {lensFormatCaption(i)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 이 지면의 다른 기사 ── 카드 맨 아래(2026-08-24, 위치
                교체 요청). 히어로와 형식 4칸은 "같은 기사"에 속하므로 붙여
                두고, 기사 자체를 바꾸는 컨트롤은 그 묶음 밖 맨 아래에
                둔다. 라벨로 무엇이 바뀌는지 명시한다(형식 타일이 아니라
                위 히어로). 기사가 1건이면 넘길 게 없어 숨긴다. */}
            {total > 1 && (
              <div className="lz-pager">
                <span style={{ marginRight: 'auto', fontSize: 12.5, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.01em' }}>
                  이 지면의 다른 기사
                </span>
                <button
                  type="button"
                  aria-label="이전 기사"
                  disabled={safeArticleIndex === 0}
                  onClick={() => setArticleIndex((i) => Math.max(0, i - 1))}
                  className="lz-arrow flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: LENS_ACCENT_STRONG,
                    cursor: safeArticleIndex === 0 ? 'default' : 'pointer',
                    opacity: safeArticleIndex === 0 ? 0.3 : 1,
                    pointerEvents: safeArticleIndex === 0 ? 'none' : 'auto',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <div className="flex items-center" style={{ gap: 5 }}>
                  {sectionArticles.map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-label={`${i + 1}번째 기사로 이동`}
                      onClick={() => setArticleIndex(i)}
                      className="lz-dot"
                      style={{
                        width: i === safeArticleIndex ? 16 : 6,
                        height: 6,
                        borderRadius: 999,
                        border: 'none',
                        background: i === safeArticleIndex ? LENS_ACCENT : '#dbeafe',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="다음 기사"
                  disabled={safeArticleIndex === total - 1}
                  onClick={() => setArticleIndex((i) => Math.min(total - 1, i + 1))}
                  className="lz-arrow flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: LENS_ACCENT_STRONG,
                    cursor: safeArticleIndex === total - 1 ? 'default' : 'pointer',
                    opacity: safeArticleIndex === total - 1 ? 0.3 : 1,
                    pointerEvents: safeArticleIndex === total - 1 ? 'none' : 'auto',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showGuide && <LensFormatGuide onClose={closeGuide} />}
    </section>
  );
}
