'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronLeft, ChevronRight, Headphones, Image as ImageIcon, Video } from 'lucide-react';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { LENS_ACCENT, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { lensPath } from '@/shared/lib/lensUrl';
import dynamic from 'next/dynamic';

// 안내 모달은 칩을 눌렀을 때만 필요하다 — 첫 화면 번들에서 빼고(경량화, 2026-10-04) 눌렀을 때 불러온다. 서버 렌더에는 원래 없는 UI(포털)라 ssr: false.
const LensFormatGuide = dynamic(() => import('./LensFormatGuide').then((m) => m.LensFormatGuide), { ssr: false });

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

// 헤더의 네 칩(2026-10-04) — 순서는 lensPerspectives(레터·웹툰·팟캐스트·영상)와 같다. 라벨은 "무엇을 하는지"로 짧게.
const WAYS = [
  { label: '읽기', full: '레터', icon: BookOpen },
  { label: '웹툰', full: '웹툰', icon: ImageIcon },
  { label: '듣기', full: '팟캐스트', icon: Headphones },
  { label: '영상', full: '영상', icon: Video },
] as const;

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

// variant(2026-10-04): 'home'은 기존 그대로(소개 카피·형식 칩 포함). 'archive'는 "지난 지면" 페이지(/paper/[date])용 —
// 홈의 소개 헤더를 빼고 지면 4탭 카드만 그린다(날짜 제목·날짜 이동은 페이지가 따로 그린다).
/** "10월 3일 금요일 지면" — 날짜가 없으면 그냥 "오늘의 지면". 요일은 UTC 정오 기준으로 계산해 시간대에 흔들리지 않는다. */
/** 탭(지면) 하나의 기사 최대 4건 — 날짜 최신 우선, 같은 날은 display_order 오름차순. */
function pickSection(source: CmsLens[], tabIdx: number): CmsLens[] {
  const section = SECTIONS[tabIdx].paperSection;
  return source
    .filter((l) => l.paper_section === section)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      const oa = a.display_order;
      const ob = b.display_order;
      if (oa != null && ob != null) return oa - ob;
      if (oa != null) return -1;
      if (ob != null) return 1;
      return 0;
    })
    .slice(0, 4);
}

function paperTitle(iso?: string): string {
  if (!iso) return '오늘의 지면';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${m}월 ${d}일 ${wd}요일 지면`;
}

export function LensPreviewSection({ initialItems, variant = 'home', paperDates }: { initialItems?: CmsLens[]; variant?: 'home' | 'archive'; /** 홈 헤더 ◀ ▶로 넘길 수 있는 지면 날짜(최신순, 첫 값 = 지금 보여 주는 날). 없으면 화살표를 그리지 않는다. */ paperDates?: string[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  function openGuide(i: number) {
    setGuideIndex(i);
    setShowGuide(true);
  }
  // 가이드를 본 적이 있는지(2026-10-04) — 처음 온 사람에게만 안내 버튼이 숨 쉬듯 반짝여 "눌러 보세요"를 알린다.
  // 서버 HTML과 어긋나지 않게 true(=반짝임 없음)로 시작해 마운트 후 localStorage를 읽는다.
  const [guideSeen, setGuideSeen] = useState(true);
  const router = useRouter();
  useEffect(() => {
    try {
      setGuideSeen(!!window.localStorage.getItem(GUIDE_SEEN_KEY));
    } catch {
      // 저장소 접근 불가 — 반짝임 없이 둔다.
    }
  }, []);
  // 탭(지면 선택) — 4지면 동시 배치(2026-09-30 오후)를 다시 되돌렸다.
  // 사용자가 원한 건 "4개 지면을 한 화면에"가 아니라 "탭으로 지면을
  // 고르고, 고른 지면 안에 4개 기사가 신문 1면처럼(큰 히어로+작은 3개)
  // 동시에 보이는 것"이었다("4개의 탭으로 분류하고.. 증권으로 탭
  // 가면.. 레이아웃 유지하면서 4개가 존재하고.. 지금은 한 화면에 4개
  // 유형이 다 들어가있네" — 2026-09-30 저녁, 방금 만든 4지면 동시 배치를
  // 혼동 없이 정정). 즉 "히어로+작은 카드 3개" 레이아웃 자체는 맞았고,
  // 그 4개가 "다른 지면들"이 아니라 "같은 지면의 다른 기사들"이어야 했다.
  const [activeTab, setActiveTab] = useState(0);
  const [turnDir, setTurnDir] = useState<1 | -1>(1);

  // 홈에서 날짜를 넘기기(2026-10-04, 사용자 요청 — "화살표를 누르면 paper 페이지로 가지 말고 메인에서 바로 보이도록").
  // dayIdx 0 = 서버가 보내 준 오늘의 지면. 그 앞날들은 눌렀을 때 한 번 받아 두고(날짜별 캐시) 같은 카드에 갈아 끼운다.
  const [dayIdx, setDayIdx] = useState(0);
  const [pastItems, setPastItems] = useState<Record<string, CmsLens[]>>({});
  const bookRef = useRef<HTMLDivElement>(null);
  const days = paperDates ?? [];
  // 날짜 넘김(2026-10-04): 책장 넘김 연출은 면 일부만 넘어가 어색해서 걷어냈다(사용자 지시). 데이터가 준비되면 면 안의 내용이 부드럽게 갈아 끼워진다.
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

  useEffect(() => {
    // 서버가 이미 최신 100건을 HTML에 심어 보냈다 — 같은 100건을 브라우저가 다시 받아(약 300KB) 갈아 끼우지 않는다(2026-10-03).
    // 이 섹션은 bullets를 읽지 않아 SSR 요약본으로 충분하다. 새 글은 발행 때 서버 캐시 무효화로 HTML에 반영된다.
    if (initialItems && initialItems.length > 0) return;
    let cancelled = false;
    // 4개 지면 탭(전체·증권·산업·시그널)이 각각 최신 4건씩만 쓴다 — 최신 100건이면 각 지면 8건 이상 확보.
    fetchLensPosts(100).then((data) => {
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

  // 기본 탭은 항상 "지면 1면"(전체)이다(2026-10-03, 사용자 요청). 예전엔 온보딩(/start)에서 고른 관심분야(getSavedInterests)로
  // 마운트 직후 탭을 바꿨는데, 그러면 (1) 사용자마다 첫 탭이 달라 "산업 1면이 먼저 나온다"는 혼란이 생기고 (2) 서버 HTML은
  // 지면 1면인데 브라우저가 뜬 뒤 탭이 바뀌어 화면이 한 번 갈아 끼워졌다. 관심분야 저장 자체(onboardingStorage)는 그대로 둔다.

  // useCallback으로 고정한다 — LensFormatGuide가 이 함수를 ESC 리스너
  // 의존성으로 쓰기 때문에(2026-08-21 재설계에서 ESC 처리를 모달 안으로
  // 옮겼다), 매 렌더 재생성되면 리스너가 계속 재구독된다.
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

  // 탭 전환 방향(2026-10-04) — 오른쪽 탭으로 가면 지면이 왼쪽으로 "넘어가는" 모션, 왼쪽이면 반대. 종이를 넘기는 감각.
  function selectTab(i: number) {
    if (i === activeTab) return;
    setTurnDir(i > activeTab ? 1 : -1);
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
  const sectionArticles = pickSection(allItems, activeTab);

  const hero = sectionArticles[0] ?? null;
  const heroHref = hero ? lensPath(hero) : null;
  // 가이드 하단 버튼("지금 읽으러 갈래요" 등) — 고른 형식으로 지금 보고 있는 지면의 1면 기사를 바로 연다(?v=1~4가 형식 탭이다).
  function goToFormat(formatIndex: number) {
    closeGuide();
    if (heroHref) router.push(`${heroHref}?v=${formatIndex + 1}`);
  }
  const heroPhoto = hero ? pickLensPhoto(hero) : null;
  const minorArticles = sectionArticles.slice(1, 4);

  // 한 면의 내용(히어로 + 보조 카드 3)을 그리는 함수 — 책장 넘김 중에는 두 날짜의 면을 동시에 그려야 해서 분리했다(2026-10-04).
  const pageBody = (sa: CmsLens[]) => {
    const h = sa[0];
    if (!h) return null;
    const hHref = lensPath(h);
    const hPhoto = pickLensPhoto(h);
    const minor = sa.slice(1, 4);
    return (
      <>
        <div className="lz-hero-col">
            {/* ── 히어로 기사 ── 이 지면의 대표 기사(최대 4건 중 1번). 사진이
                위(넓고 크게), 헤드라인·요약이 아래 — 실제 신문 리드 기사가
                큰 사진을 위에 걸고 그 아래 헤드라인을 넓게 쓰는 것과 같은
                순서(2026-09-30, "카드 세로 길이를 넓히고.. 지면신문처럼"). */}
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
                    alt=""
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
                    {displayHeadline(article.headline)}
                  </span>
                  {/* 본문 미리보기 1줄 추가(2026-10-01, 사용자 지적 —
                      히어로엔 article.context가 있는데 이 3개 보조기사엔
                      빠져있었다). 그리드 카드(ArticleCard.tsx)와 같은
                      톤·크기로 맞춘다. */}
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
        {/* 사용법 설명(무슨 기능인가)과 신뢰 신호(누가·어떻게 만들었나,
            2026-09-30 메인 리디자인 때 추가 — /about·AiDisclaimer.tsx에만
            있던 "AI 초안 → 사람 검수" 설명을 핵심 콘텐츠 바로 위에도
            노출)가 원래 톤·줄 간격이 다른 두 문단으로 따로 떠 있어 어수선해
            보였다(2026-10-01, 사용자 지적) — 한 문단으로 합쳐 한 호흡에
            읽히게 했다. 정보 두 가지(기능 설명+제작 방식)는 그대로 유지. */}
        {/* 카피 구성(2026-10-04): ① 페인포인트를 짚고 곧바로 해결을 말하는 한 줄(큰 글씨) → ② 어떻게 해결하는지(읽고·듣고·보는 네 가지) →
            제작 방식(AI 요약·편집팀 검수) 고지는 이 자리에서 뺐다(2026-10-04, 사용자 — 여기엔 불필요). 기사 하단 AiDisclaimer·푸터에 그대로 있다. */}
        {/* 질문(큰 세리프)과 답(작은 고딕)을 한 줄에 — 넓은 화면에선 기준선을 맞춰 나란히, 좁은 화면에선 자연스럽게 아래로 줄바꿈. */}
        {/* 소개 영역 압축(2026-10-04): 왼쪽 문구 두 줄, 오른쪽 형식 칩. 한 덩어리로 줄여 기사까지의 거리를 짧게 한다. */}
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
        {/* "내 일상이 뭐지?"라는 다음 질문에 바로 답하는 진입(2026-10-04) — 하루의 틈 장면을 고르는 /start로 이어진다. 예전 상단 DiscoveryBanner를 대체. */}
        <Link href="/start" className="lz-find">
          내 일상이 뭔지 모르겠다면, 하루를 같이 떠올려볼까요 <span aria-hidden>→</span>
        </Link>
        </div>
        {/* 시선의 흐름(질문 → 답 → 다음 행동) 맨 끝에 "어떻게 볼 수 있는지"를 미리 보여 주는 네 칩(2026-10-04, 사용자 — "오른쪽 위 버튼은 시선과
            멀어서 클릭될지 모르겠다, 같은 흐름에 두거나 미리 보여 달라"). 칩 하나가 곧 버튼이다: 누르면 그 형식부터 움직이는 소개가 열린다.
            처음 온 사람에게는 첫 칩에 링이 3번 퍼져 "눌러 보세요"를 알린다. */}
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
        {/* 데이트라인을 "오늘의 지면" 라벨과 한 줄로 합쳤다(2026-10-01,
            사용자 피드백 — 배너·eyebrow·데이트라인·제목·부제·고지문까지
            히어로 이미지 전에 7줄이 쌓여 "그러네요"로 지적받음). 도장
            아이콘+세리프 전용 줄로 따로 뺐던 이전 버전(2026-09-30,
            "신문사다운 구조")은 그 자체로는 맞는 방향이었지만 줄 수를
            늘리는 비용이 더 컸다 — 같은 정보(언제 발행)를 라벨 옆 보조
            텍스트로 압축. */}
        {/* 2026-10-04 헤더 타이포 재구성 — 제목("오늘의 이슈, 4가지 시선")은 검색·정체성 때문에 그대로 두되 작은 머리글(kicker)로 내리고,
            그 아래에 페인포인트→해결 한 줄(세리프 큰 글씨)이 주인공이 된다. 매일 아침 같은 자리에서 같은 결로 읽히도록 세리프 + 넉넉한
            행간 + 따뜻한 먹색으로 차분하게, 핵심 단어("아침 3분")만 손으로 그은 앰버 밑줄(가이드 모달의 스케치 밑줄과 같은 결)로 짚는다. */}
      </header>
      )}

      <div
        className="lz-paper"
        style={{
          // 2026-10-04 지면 영역 구분 — 장식 없이 연한 종이색 면 하나 + 얇은 테두리 + 둥근 모서리(제호 줄 같은 신문 흉내는 과해서 뺐다).
          // 종이의 입체감(2026-10-04, 연구 근거: 은은한 깊이·질감은 따뜻함·신뢰를 주지만 과하면 가독성·성능을 해친다 → "알아채지 못하지만 느껴지는" 강도).
          // 가까운 얇은 그림자 + 넓고 옅은 그림자 + 위쪽 안쪽 하이라이트, 위에 6% 종이결 노이즈(SVG feTurbulence data URI, 네트워크 요청 없음).
          backgroundColor: '#f8f8f6',
          boxShadow: '0 1px 2px rgba(60,55,45,.06), 0 8px 24px -14px rgba(60,55,45,.16)',
          border: '1px solid #e4e4df',
          borderRadius: 12,
          padding: 'clamp(22px, 3vw, 34px) clamp(16px, 2.4vw, 26px) clamp(16px, 2.4vw, 26px)',
        }}
      >
        {/* 신문 안으로 넣은 제호 줄(2026-10-04) — 이중선 아래 왼쪽 "10월 3일 토요일 지면"(구역 제목), 가운데 제호, 오른쪽 날짜 이동·전체 보기. 면 안에서 이 줄이 머리띠 역할을 한다. */}
        <div className="lz-mast" style={{ position: 'relative' }}>
          <svg viewBox="0 0 600 6" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -3, width: '100%', height: 6, pointerEvents: 'none' }}>
            <path d="M0 3.2 C60 1.8, 120 4.4, 180 3 S300 2, 360 3.4 S480 4.2, 540 2.6 S590 3.2, 600 3" fill="none" stroke="#c4c7cd" strokeWidth={1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="lz-mast-brand" aria-hidden>AI LENS · 서울경제신문</span>
          <div className="lz-mast-l">
            {/* "오늘의"를 빼고 실제 날짜로(2026-10-04, 사용자 제안) — 어제·그제로 넘겨 봐도 제목이 그대로 맞고, 몇 일자 지면인지 바로 읽힌다. */}
            <h2 className="lz-kick">{paperTitle(viewDay ?? hero?.date)}</h2>
          </div>
          {/* 지난 날짜의 지면 4개를 볼 수 있는 페이지(2026-10-04, 사용자 요청) — /paper는 리다이렉트라 전환 중 빈 화면에 푸터만 비쳐서(2026-10-04) 홈에서는 지면 날짜로 바로 간다. 다른 섹션("최신 뉴스" 등)과 같은 헤더 우측 "전체 보기 →" 자리·스타일. 날짜 이동은 그 페이지에서 한다. */}
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
            <Link href={viewDay ?? hero?.date ? `/paper/${viewDay ?? hero?.date}` : '/paper'} className="flex-shrink-0 text-gray-600 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 700, marginLeft: 6 }}>
              전체 보기 →
            </Link>
          </div>
        </div>
        {/* 지면 탭 — 1단계 선택(2026-09-30 최종). 세리프 라벨 + 잉크색
            밑줄, 미끄러지는 인디케이터. */}
        {/* 2026-10-04 탭 재디자인(사용자: "파란 막대 효과가 어색") — 밑줄 막대를 없애고 토스식 세그먼트 알약으로: 연한 회색 트랙 안에서 선택된 탭이 흰 알약으로 떠오른다. */}
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
