'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { LENS_ACCENT, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { getSavedInterests } from '@/shared/lib/onboardingStorage';
import { lensPath } from '@/shared/lib/lensUrl';
import { LensFormatGuide } from './LensFormatGuide';
import { PublishSealIcon } from '@/shared/ui/icons/HandDrawnIcons';

// 데이트라인(2026-09-30, "신문사다운 구조" 요청) — "2026년 9월 30일 수요일"
// 형태. features/timeline의 kdate()는 요일이 없고, FSD 규칙상 다른
// feature를 직접 import할 수도 없어(features → features 금지) 여기 로컬로
// 다시 작게 만든다.
const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;
function fullDateline(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

// 형식 타일 아이콘 — 2차 리디자인(2026-09-30, 사용자 피드백: "일러스트
// 구리고요"). 손그림 캐릭터 아이콘(눈코입+반짝이)으로 1차 교체했던 게
// "고급진 신문 디자인" 방향과 정면으로 부딪혔다 — 귀여운 캐릭터와 절제된
// 에디토리얼은 같이 안 간다. lensPerspectives.ts에 처음부터 있었지만 이
// 타일에서 한 번도 안 쓰이던 p.icon(lucide-react: BookOpen/Image/
// Headphones/Video)으로 되돌아간다 — 손으로 그린 티가 안 나는, 획 굵기
// 일정한 미니멀 라인 아이콘.

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
// 구조 변천사(2026-09-30 하루 동안 네 번 — 각 라운드 사용자 확인 인용):
//  1. 탭+화살표 페이저(2026-08-21) — 탭으로 지면 고르고, 화살표로 그 지면
//     "안의" 기사 4건을 하나씩 넘겨봄.
//  2. 신문 지면 탭 스타일링(2026-09-30 오전) — 구조는 1과 같음, 탭을
//     세리프+잉크 밑줄로 톤만 바꿈("약간 신문 디자인처럼").
//  3. 4지면 동시 배치(2026-09-30 오후, "신문이 왼쪽 위에서 오른쪽 아래로
//     내려오는 게 중요한 순서... 4지면 동시 배치로 바꿔주세요") — 탭을
//     없애고 4개 지면(전체/증권/산업/시그널)을 한 화면에 동시 배치.
//  4. **현재**(2026-09-30 저녁, 3을 정정 — "4개의 탭으로 분류하고..
//     증권 탭 가면 레이아웃 유지하면서 4개가 존재하고.. 지금은 한 화면에
//     4개 유형이 다 들어가있네" — 3은 "동시 배치"라는 시각 언어는 맞았지만
//     그걸 "지면들 사이"가 아니라 "지면 안 기사들 사이"에 적용했어야 했다).
//     탭(전체/증권/산업/시그널)은 1·2처럼 유지 — 지면을 고르는 축은
//     탭이다. 고른 지면 "안의" 기사 최대 4건을 3의 레이아웃(히어로 1 +
//     작은 카드 3, 왼쪽 위→오른쪽 아래로 작아짐)으로 동시에 보여준다 —
//     화살표로 하나씩 넘기는 대신 한눈에 다 보인다. 히어로만 레터/웹툰/
//     팟캐스트/영상 4형식 타일을 갖고, 나머지 3개는 헤드라인만 — 클릭하면
//     해당 글 상세(4형식 전부 있는 곳)로 이동한다.
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

export function LensPreviewSection({ initialItems }: { initialItems?: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [showGuide, setShowGuide] = useState(false);
  // 탭(지면 선택) — 4지면 동시 배치(2026-09-30 오후)를 다시 되돌렸다.
  // 사용자가 원한 건 "4개 지면을 한 화면에"가 아니라 "탭으로 지면을
  // 고르고, 고른 지면 안에 4개 기사가 신문 1면처럼(큰 히어로+작은 3개)
  // 동시에 보이는 것"이었다("4개의 탭으로 분류하고.. 증권으로 탭
  // 가면.. 레이아웃 유지하면서 4개가 존재하고.. 지금은 한 화면에 4개
  // 유형이 다 들어가있네" — 2026-09-30 저녁, 방금 만든 4지면 동시 배치를
  // 혼동 없이 정정). 즉 "히어로+작은 카드 3개" 레이아웃 자체는 맞았고,
  // 그 4개가 "다른 지면들"이 아니라 "같은 지면의 다른 기사들"이어야 했다.
  const [activeTab, setActiveTab] = useState(0);
  // 온보딩 관심사와 일치하는 탭 인덱스 — "맞춤" 배지 표시용. activeTab과
  // 분리해두는 이유는 이전과 동일: 사용자가 탭을 수동으로 바꿔도 배지는
  // 원래 관심사 탭에 남아 있어야 한다.
  const [personalizedTab, setPersonalizedTab] = useState<number | null>(null);

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

  // 첫 방문 자동 팝업은 2026-09-29 요청으로 껐다(진입 즉시 모달이 뜨는 게
  // 방해된다는 판단) — GUIDE_SEEN_KEY/closeGuide는 그대로 둬서 ⓘ 버튼으로
  // 수동으로 여는 경로는 안 건드린다. 되돌릴 땐 아래 useEffect만 복원하면 됨:
  //   useEffect(() => {
  //     try {
  //       if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) setShowGuide(true);
  //     } catch {}
  //   }, []);

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
    setPersonalizedTab(idx);
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
  const allItems = items;

  function selectTab(i: number) {
    setActiveTab(i);
  }

  // 탭(지면) 하나 안의 기사 최대 4건 — 정렬 규칙은 기존과 동일
  // (display_order가 있으면 그 날짜 안에서 오름차순 우선, 날짜는 항상
  // 최신 우선). 이 4건을 "히어로 1 + 작은 카드 3"으로 동시에 보여준다
  // (2026-09-30 최종 정리 — "4개의 탭으로 분류하고.. 증권 탭 가면 레이아웃
  // 유지하면서 4개가 존재하고" 요청. 탭으로 지면을 고르고, 그 지면 "안의"
  // 4건을 신문 1면 레이아웃으로 동시 배치 — 지면들 사이가 아니라 기사들
  // 사이의 배치였다).
  const activeSection = SECTIONS[activeTab];
  const sectionArticles = allItems
    .filter((l) => l.paper_section === activeSection.paperSection)
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
    .slice(0, 4);

  const hero = sectionArticles[0] ?? null;
  const heroHref = hero ? lensPath(hero) : null;
  const heroPhoto = hero ? pickLensPhoto(hero) : null;
  const minorArticles = sectionArticles.slice(1, 4);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        /* 지면 탭 — 세리프 라벨 + 잉크색 밑줄, 미끄러지는 인디케이터
           (2026-09-30 최종 정리). */
        .lz-tabs { position: relative; display: flex; }
        .lz-tab { position: relative; transition: background .15s ease, color .15s ease; font-family: 'Noto Serif KR', serif; }
        .lz-tab:not(.is-active):hover { background: #faf9f7; color: #374151; }
        .lz-tab:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -3px; border-radius: 8px; }
        .lz-tab-ind { position: absolute; bottom: -1px; left: 0; height: 3px;
          border-radius: 0; background: #1c1917; pointer-events: none;
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
        .lz-hero-col { border-bottom: 1px solid rgba(17,24,39,0.09); }
        .lz-minor-col { display: grid; grid-template-columns: minmax(0, 1fr); }
        @media (min-width: 640px) {
          .lz-minor-col { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .lz-minor { display: block; padding: 16px clamp(14px, 2.4vw, 20px); text-decoration: none;
          border-bottom: 1px solid rgba(17,24,39,0.08); transition: background .15s ease; }
        .lz-minor:last-child { border-bottom: none; }
        @media (min-width: 640px) {
          .lz-minor { border-bottom: none; border-right: 1px solid rgba(17,24,39,0.08); }
          .lz-minor:nth-child(3n) { border-right: none; }
        }
        .lz-minor:hover { background: #faf9f7; }
        .lz-minor:hover .lz-minor-h { text-decoration: underline; text-underline-offset: 3px; }
        .lz-minor:hover .lz-minor-thumb-img { transform: scale(1.045); }
        .lz-minor:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }

        /* 가이드 ⓘ 트리거 — 제목 옆이라 시각 크기는 22px로 작게 두되,
           ::after로 히트 영역만 44×44로 넓힌다(레이아웃은 그대로).
           버튼을 실제로 44px로 키우면 h2 옆 여백이 벌어져 제목 정렬이
           깨진다. */
        .lz-info { position: relative; }
        .lz-info::after { content: ''; position: absolute; left: 50%; top: 50%;
          width: 44px; height: 44px; transform: translate(-50%, -50%); }
        .lz-info:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 3px; }

        .lz-issue:hover .lz-h { text-decoration: underline; text-underline-offset: 3px; }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        {/* 데이트라인 + 발행 도장(2026-09-30, "신문사다운 구조" 요청) — 이
            섹션이 UI 위젯이 아니라 "오늘 자 지면"이라는 걸 활자로 먼저
            알린다. "오늘의 지면" 라벨을 대체하지 않고 그 위에 얹는다(라벨은
            무슨 코너인지, 데이트라인은 언제 발행인지 — 역할이 다르다). */}
        <div className="flex items-center" style={{ gap: 6, marginBottom: 6 }}>
          <PublishSealIcon accent={LENS_ACCENT} className="w-[15px] h-[15px] flex-shrink-0" />
          <span style={{ fontFamily: "'Noto Serif KR', serif", fontSize: 12.5, color: '#78716c', letterSpacing: '0.01em' }}>
            {fullDateline(hero?.date ?? new Date().toISOString().slice(0, 10))} 발행
          </span>
        </div>
        <p className="text-gray-400" style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          오늘의 지면
        </p>
        {/* "전체 보기" 링크 삭제(2026-10-01, 사용자 요청) — 어차피 /lens로
            가는 같은 목적지 링크가 바로 아래 "최신 뉴스" 섹션 쪽으로
            옮겨갔다(LatestGridSection.tsx 참조). 이 헤더엔 제목+가이드
            버튼만 남긴다. */}
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
        {/* 사용법 설명을 줄였다(2026-08-24) — 탭·화살표·형식 타일이 각자
            생김새로 이미 역할을 말한다. 이 줄은 "왜 네 형식인가"만 말한다. */}
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'keep-all' }}>
          같은 기사를 네 가지 형식으로 담았어요. 원하는 방식으로 보세요.
        </p>
        {/* 신뢰 신호(2026-09-30, 메인 리디자인) — /about·AiDisclaimer.tsx(기사
            하단)엔 "AI 초안 → 사람 검수" 편집 프로세스가 이미 명시돼 있는데,
            홈에는 어디에도 이 설명이 없었다 — 처음 들어온 방문자는 기사를
            하나 클릭해서 맨 아래까지 스크롤해야만 "누가·어떻게 만들었는지"를
            알 수 있었다. 이 서비스의 핵심 콘텐츠(오늘의 이슈) 바로 위에 한
            줄로 짧게 — 법적 고지문이 아니라 신뢰를 위한 안내라 톤을
            가볍게(별도 박스·테두리 없이 캡션처럼). */}
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 7, wordBreak: 'keep-all' }}>
          서울경제신문 기자가 취재한 기사를 AI가 요약·재구성하고, 편집팀이 검수해 발행해요.
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
        {/* 지면 탭 — 1단계 선택(2026-09-30 최종). 세리프 라벨 + 잉크색
            밑줄, 미끄러지는 인디케이터. */}
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
                  fontSize: 14.5,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: '-0.005em',
                  border: 'none',
                  background: 'transparent',
                  // 잉크 #1c1917 on 흰 배경 ≈ 17.9:1, 비활성 #5b6472 ≈ 6:1 — 둘 다 AA 여유 있게 통과.
                  color: isActive ? '#1c1917' : '#5b6472',
                  cursor: 'pointer',
                }}
              >
                <span className="inline-flex items-center" style={{ gap: 5 }}>
                  {s.label}
                  {personalizedTab === i && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: '#2563eb',
                        background: 'rgba(37,99,235,0.1)',
                        padding: '2px 6px',
                        borderRadius: 999,
                        letterSpacing: 0,
                      }}
                    >
                      맞춤
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <span
            aria-hidden
            className="lz-tab-ind"
            style={{ width: `${100 / SECTIONS.length}%`, transform: `translateX(${activeTab * 100}%)` }}
          />
        </div>

        {!hero ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
              {activeSection.label}을 준비하고 있어요.
            </p>
          </div>
        ) : (
        <>
        <div className="lz-hero-col">
            {/* ── 히어로 기사 ── 이 지면의 대표 기사(최대 4건 중 1번). 사진이
                위(넓고 크게), 헤드라인·요약이 아래 — 실제 신문 리드 기사가
                큰 사진을 위에 걸고 그 아래 헤드라인을 넓게 쓰는 것과 같은
                순서(2026-09-30, "카드 세로 길이를 넓히고.. 지면신문처럼"). */}
            <Link href={heroHref!} prefetch className="lz-issue block" style={{ textDecoration: 'none' }}>
              {heroPhoto && (
                <span
                  style={{
                    display: 'block',
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '21 / 9',
                    overflow: 'hidden',
                    background: '#f3f4f6',
                  }}
                >
                  <Image
                    src={heroPhoto}
                    alt=""
                    fill
                    sizes="(max-width: 780px) 100vw, 700px"
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                  />
                </span>
              )}

              <span style={{ display: 'block', padding: 'clamp(16px, 2.6vw, 24px)' }}>
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
                    {kstDateTimeLabel(hero.published_at) ?? hero.date.replaceAll('-', '.')}
                  </span>
                </span>
                <span
                  className="lz-h"
                  style={{
                    display: '-webkit-box',
                    fontFamily: "'Noto Serif KR', serif",
                    fontSize: 'clamp(22px, 3.2vw, 30px)',
                    fontWeight: 700,
                    color: '#111827',
                    letterSpacing: '-0.015em',
                    lineHeight: 1.35,
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'keep-all',
                  }}
                >
                  {hero.headline}
                </span>
                {hero.context && (
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
                    {hero.context}
                  </span>
                )}
              </span>
            </Link>
        </div>

        {/* ── 같은 지면의 나머지 기사 최대 3건 ── 히어로 아래, 가로 3열
            (2026-09-30, "카드 세로 길이.. 지면신문처럼" 요청 — 실제 신문은
            리드 기사가 위쪽 전체를 차지하고 작은 기사들이 그 아래 좁은
            컬럼으로 나열된다. 세로로 좁게 쌓던 사이드바를 이 배치로
            바꾸면서 히어로·부기사 두 블록의 폭이 같아져, 사진을 뺐을 때
            생기던 높이 불일치도 같이 해소됐다). 작은 썸네일을 붙여 3열이
            허전해 보이지 않게 했다 — 헤드라인 크기는 셋 다 동일(가로
            나열이라 왼쪽부터 순서대로 읽히므로 크기 차등이 필요 없다,
            세로 스택일 때와 다른 점). 지면명은 반복 안 함(탭에 이미
            표시돼 있어 중복). */}
        {minorArticles.length > 0 && (
          <div className="lz-minor-col" style={{ borderTop: '1px solid rgba(17,24,39,0.09)' }}>
            {minorArticles.map((article) => {
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
                        borderRadius: 8,
                        overflow: 'hidden',
                        marginBottom: 10,
                        background: '#f3f4f6',
                      }}
                    >
                      <Image
                        src={photo}
                        alt=""
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
                    {article.headline}
                  </span>
                  <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: '#9ca3af', fontWeight: 600 }}>
                    {kstDateTimeLabel(article.published_at) ?? article.date.replaceAll('-', '.')}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>

      {showGuide && <LensFormatGuide onClose={closeGuide} />}
    </section>
  );
}
