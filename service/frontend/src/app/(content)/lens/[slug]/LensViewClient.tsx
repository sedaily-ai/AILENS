'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import {
  LENS_ACCENT,
  LENS_CARD_BORDER,
  LENS_CARD_SHADOW,
  lensFormatAt,
  lensPanelId,
  parseLensView,
  pickLensPhoto,
} from '@/shared/constants/lensPerspectives';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/ArticlePrintButton';
import { AiDisclaimer } from '@/shared/ui/AiDisclaimer';
import { Check, Zap, Calendar } from 'lucide-react';
import { coreSummaryBullets, FormatPicker, LensFormatPanel } from './components';

// "오늘의 이슈, 4가지 시선" 상세.
//
// 2026-08-14 재설계(3차) — 박스를 걷어내고 타이포·여백·헤어라인으로 구조를
// 만든다. 직전 버전은 한 카드에 테두리 + 그림자 + 컬러 tint 밴드 + 4px 상단선
// 네 가지 틀이 겹쳐 있어서 기사가 아니라 앱 UI 컴포넌트처럼 보였다.
//
// 바뀐 원칙:
//  · 구조는 **위계**로 만든다 — 헤드라인 40 > 질문 32 > 역할명 24 > 리드 18 >
//    본문 16 > 메타 13. 크기 차이가 충분해야 박스 없이도 덩어리가 읽힌다
//    (스티어링 §4: 강조 우선순위 크기 > 굵기 > 대비 > 색상).
//  · 색은 **작은 표식에만** 쓴다(서수·짧은 액센트 바·불릿 점). 넓은 면을
//    채우면 읽는 데 방해가 되고 "강조는 하나만" 원칙도 깨진다.
//  · 구획은 **헤어라인**으로 나눈다. 그림자 카드를 반복하면 스티어링 §4의
//    "카드 반복의 함정"에 걸린다.
//  · 탭은 알약 칩 대신 **밑줄 탭**(신문 섹션 내비게이션 관습). 칩 안에 이미지를
//    넣으면 선택 컨트롤이 과하게 무거워진다 — 캐릭터는 카드 안에서만 쓴다.
//
// ⚠️ SEO — 비활성 시선도 DOM 에는 항상 렌더하고 hidden 으로만 감춘다.
// 조건부 렌더로 3개를 빼면 page.tsx 의 NewsArticle articleBody / mainEntity
// (Question+acceptedAnswer 4쌍)와 실제 본문이 어긋난다.

/**
 * 팟캐스트·영상 목업의 길이 표기 — 고정값("약 1분 30초", "0:45") 대신 실제
 * 불릿 개수에 비례해 계산한다(2026-08-18, "내용이 부실해서 데이터 잘
 * 맞춰서 채워달라" 요청). 인트로 15초 + 사실 1건당 18초 내레이션 가정 —
 * 실측치가 아니라 "그럴듯한 추정"이지만, 불릿이 3개면 4개짜리보다 항상
 * 짧게 나와서 최소한 내용량과 방향이 어긋나지는 않는다.
 */
export function LensViewClient({
  slug,
  initialLens = undefined,
  otherLens = [],
  initialHotLetters,
}: {
  slug: string;
  initialLens?: CmsLens | null;
  otherLens?: CmsLens[];
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!slug || initialLens) return;
    let cancelled = false;
    fetchLensBySlug(slug).then((l) => {
      if (!cancelled) setLens(l);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialLens]);

  const count = lens?.lenses?.length ?? 0;

  // 홈에서 고른 시선(?v=N)을 연다. 스크롤은 건드리지 않는다 — 제목·사진·리드가
  // "무슨 뉴스인지" 주는 맥락이라 항상 최상단부터 보여야 한다.
  useEffect(() => {
    if (count === 0) return;
    const i = parseLensView(window.location.search);
    if (i === null || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
  }, [count]);

  // 클릭 직후 아래 내용이 바뀐 걸 못 느낀다는 피드백(2026-08-18, "클릭했는데
  // 화면이 안 바뀐 것처럼 느낄 수 있다")으로 스크롤 보정을 뒀었으나, 배경을
  // 잠깐 물들이는 클릭 피드백은 같은 날 "그 배경색 없애달라"는 요청으로
  // 뺐다 — 위 타일 선택 상태(색 테두리+그림자+체크)만으로도 선택은 이미
  // 충분히 보인다. 딥링크(?v=N) 최초 진입은 여전히 select()가 아니라
  // setActive()를 직접 불러서(위 useEffect) 이 스크롤이 안 걸린다 —
  // "항상 최상단부터 랜딩" 원칙은 그대로 유지.
  // KPI 계측(2026-08-23, "포맷 전환율" — 빠른 포맷으로 훑고 깊은 포맷으로
  // 돌아오는지가 4유형 설계 자체의 가설 검증 지표). setActive를 함수형
  // 업데이트로 불러서 직전 active 값을 deps 없이 읽는다 — select 자체를
  // useCallback([])로 유지해야 위 onTabKeyDown 등 다른 곳에서 참조가 안
  // 깨진다.
  const select = useCallback((i: number) => {
    setActive((prev) => {
      if (prev !== i && lens) {
        trackEvent('format_switch', {
          article_id: lens.id,
          from_format: lensFormatAt(prev),
          to_format: lensFormatAt(i),
        });
      }
      return i;
    });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(i + 1));
      window.history.replaceState(null, '', url);
      // block:'nearest' — 패널이 이미 화면 안에 있으면(대부분의 경우, 타일
      // 바로 아래라) 아예 스크롤하지 않고, 화면 밖으로 밀려나 있을 때만
      // 최소한으로 당겨온다. 'start'를 쓰면 매번 패널을 뷰포트 맨 위로
      // 붙여서 방금 누른 타일까지 화면 밖으로 밀려나 버린다.
      document.getElementById(lensPanelId(i))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lens]);

  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent, i: number) => {
      if (count === 0) return;
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (i + 1) % count;
      else if (e.key === 'ArrowLeft') next = (i - 1 + count) % count;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      tabRefs.current[next]?.focus();
    },
    [count, select],
  );

  if (!slug || lens === null) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
        <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </div>
    );
  }

  if (!lens) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
      </div>
    );
  }

  const photo = pickLensPhoto(lens);
  const lenses = lens.lenses ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <style>{`
        /* 폭을 하나로 통일한다(2026-08-14 최종).
           앞서 헤드라인용 넓은 폭(1080)과 본문용 좁은 폭(748)을 나눴는데,
           두 값을 어떻게 배치해도 문제가 났다 — 형제로 두고 각자 중앙 정렬하면
           좌측선이 166px 어긋나고, 자식으로 중첩하고 마진을 없애면 본문이 넓은
           영역의 왼쪽 끝에 붙어 화면 전체가 왼쪽으로 쏠렸다.
           해결: 컬럼은 하나(.lw)만 두고 모든 블록을 그 안에서 **대칭으로**
           중앙 배치한다. 좌우 여백이 같아지므로 "왼쪽으로 쏠린" 느낌이 없다.
           읽기 폭이 필요한 문단만 .lm 으로 좁히되, 그것도 margin:0 auto 로
           중앙에 둬서 양쪽 여백을 대칭으로 유지한다. */
        .lw { max-width: 880px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        /* 본문 폭 = 사진 폭(2026-08-14 요청). 예전엔 읽기 편한 줄 길이를 위해
           680px 로 좁혔는데, 그러면 사진(컬럼 전체 824px)보다 좁아 좌우가 어긋나
           보였다. 이제 컬럼 폭을 그대로 써서 사진·요약·질문·근거의 좌우선이
           완전히 일치한다.
           트레이드오프: 16px 기준 한 줄이 약 50자가 되어 스티어링 권장(25~40자)을
           넘는다. 정렬 일관성을 우선한 선택이다. */
        .lm { max-width: 100%; }
        .rule { height: 1px; background: rgba(17,24,39,0.1); }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 원문 링크 — 테두리 없는 텍스트 링크. 요약 아래 우측에 붙는다.
           보조 동작이라 시각적 무게를 최소로 두되 밑줄로 링크임을 명확히 한다. */
        .src { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          color: #6b7280; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.25); }
        .src:hover { color: #111827; text-decoration-color: currentColor; }
        .src:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 사람 타일 선택기 — 모바일 2열, 480px 이상 4열.
           네 칸이 완전히 같은 크기·형태라 "넷 중 하나를 고른다"가 즉시 읽힌다. */
        .picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 480px) { .picks { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .pick { position: relative; display: flex; flex-direction: column; align-items: center;
          gap: 6px; padding: 16px 12px 14px; border-radius: 14px; border: 1px solid;
          cursor: pointer; min-height: 148px; text-align: center;
          transition: background .16s ease, border-color .16s ease, transform .12s ease; }
        .pick:hover { transform: translateY(-2px); }
        .pick:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }
        .pick-on { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px;
          border-radius: 999px; display: flex; align-items: center; justify-content: center; }



        @media (prefers-reduced-motion: no-preference) {
          .panel { animation: swap .22s ease-out; }
          @keyframes swap { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
      `}</style>

      {/* 글로벌 헤더(2026-08-17) — 이 페이지엔 원래 헤더가 아예 없었다
          ("박스 걷어내고 타이포·여백·헤어라인으로만 구조를 만든다"는
          읽기 전용 설계 원칙, 위 주석 참조). 사용자가 본지(en.sedaily.com)
          스크린샷을 직접 보여주며 "영문사이트는 기사 상세 들어가도
          네비게이션이나 헤더는 다 유지하거든요, 저희도 그렇게 하면
          좋겠어요"라고 확인 — 뒤로가기 말고는 다른 곳으로 이동할 방법이
          없어 "뒤로가기가 이상하다"고 느꼈던 것도 이걸로 같이 해결된다.
          LetterDetailClient.tsx가 이미 쓰는 것과 같은 패턴. */}
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* 우측 사이드바(2026-08-17, 사용자 확인: "홈페이지와 동일 — 인기글+사주")
          — 홈(NewsFeedTab.tsx)과 같은 HomeSideBar를 재사용. 이 페이지는
          원래 .lw(880px) 하나만 중앙 정렬하는 단일 컬럼이었는데("양옆이
          허전하다"는 피드백), 그 .lw 블록들을 감싸는 그리드를 새로 씌워
          왼쪽 칸(본문)+오른쪽 칸(사이드바) 2열로 바꿨다. .lw 자체는
          이 파일 곳곳에서 그대로 재사용되므로 손 안 댔다 — 이제 왼쪽 칸
          (본문 폭, sidebar 없을 때보다 좁음) 안에서 여전히 margin:0 auto로
          중앙 정렬된다. lg 미만에서는 사이드바가 아예 안 뜬다. */}
      {/* 좌우 패딩을 홈(NewsFeedTab.tsx)과 동일한 clamp(24px,3.5vw,44px)로
          맞췄다(2026-08-23) — 원래 clamp(20px,4vw,28px)였는데, 카테고리
          페이지에 사이드바를 새로 붙이며 같은 문제(사이드바가 홈보다
          오른쪽으로 밀려 보임)를 발견해 이 페이지도 같이 정정한다.
          위쪽 패딩도 홈과 같은 clamp(8px,2vw,16px)를 추가했다 — 아래
          사이드바 쪽 주석 참조. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <div style={{ gridColumn: 1, minWidth: 0 }}>
      {/* "◀ 시선" 뒤로가기 링크는 걷어냈다(2026-08-17, 사용자 피드백:
          "시선 화살표... 저거는 빼면 어떨까요, 디자인이 구린듯" — 바로
          위에 전역 헤더가 새로 생겨서 그 아래 또 있는 텍스트 뒤로가기
          링크가 중복 내비게이션처럼 보였다). "4가지 시선" 카테고리
          라벨(아래 <main> 첫 줄)은 다른 섹션들과 같은 관례(예: "타임머신"
          위 "그날로 떠나요")라 그대로 유지. */}

      <main id="main-content">
        {/* ── 기사 머리 ── 위계: 아이브로우 13 → 헤드라인 40 → 메타 13 */}
        {/* 2026-08-17엔 헤더 바로 아래 여백을 clamp(28px,4.5vw,40px)로 넓혔었다
            ("헤더랑 타이틀이 좀 너무 달라붙은 느낌"). 그런데 2026-08-23,
            사용자가 사이드바 위치를 모든 페이지에서 동일하게 맞춰달라고
            요청 — 본문에만 이 추가 여백이 있으면 사이드바(그리드 맨 위,
            바깥 wrapper의 clamp(8px,2vw,16px)만 적용)와 시작선이 어긋난다.
            바깥 wrapper의 여백만 쓰도록 이 추가 paddingTop을 뺀다 —
            홈(NewsFeedTab.tsx)도 같은 바깥 여백 하나만 쓰고 안쪽에 따로
            안 준다. */}
        <div className="lw">
          {/* 헤드라인 — 한 줄에 들어가도록 넓은 폭(.lw)을 쓰고 크기를 38px로
              한 단계 낮췄다. 다만 이 서비스의 헤드라인 길이는 편차가 커서
              (실측 최장 40자 이상) 긴 제목은 결국 줄바꿈된다. 그때 한 줄만
              길고 다음 줄이 짧아지는 어색한 모양을 막으려고 text-wrap: balance
              를 준다. */}
          {/* 컬럼을 880px 로 통일했으므로 가용 폭이 824px 다. 이 기사 제목의
              예상 폭이 38px 에서 856px 였으므로 36px 로 낮춰 한 줄을 유지한다. */}
          <h1
            data-speakable="headline"
            style={{
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              fontWeight: 800,
              color: '#111827',
              letterSpacing: '-0.03em',
              lineHeight: 1.25,
              marginBottom: 14,
              textWrap: 'balance',
              wordBreak: 'keep-all',
            }}
          >
            {lens.headline}
          </h1>
          {/* 달력 아이콘(2026-08-17, "달력 일러스트? 그거는?") — 원본
              헤더의 <Calendar/> 아이콘도 그대로 이식. 원본은 이 옆에
              <User/> 아이콘 + 기자 바이라인도 있지만, 이 콘텐츠는 특정
              기자 바이라인이 없는 형식이라 그 부분은 스킵.
              "4가지 시선" 배지를 헤드라인 위 별도 줄에서 이 메타 줄
              오른쪽으로 옮겼다가(2026-08-17, "4가지 시선을... 서울경제..
              날짜 오른쪽이랑 교체하면 안되나"), 다시 왼쪽으로 되돌렸다
              (2026-08-18, "카테고링 위치... 좌측으로 가면안되나" — 카테고리
              태그는 독자 시선이 가장 먼저 닿는 좌상단에 있어야 "이게 무슨
              분류의 글인지"가 헤드라인보다 먼저 읽힌다, justify-between으로
              멀리 떨어뜨려 놓으면 그 신호가 늦게 눈에 띈다). */}
          {/* "구글 검색 선호 출처로 추가"를 오른쪽 끝에 따로 뒀더니(2026-08-18
              첫 시도) 배지·날짜와 시선이 끊겨 "따로 논다"는 인상을 줬다
              (2026-08-18, "이것도 좌측으로 몰면 깔끔하지 않을까?"). 배지→
              날짜→구글 링크 세 요소를 전부 한 줄, 왼쪽 시작점에 나란히
              둬서 "이 글의 성격(배지) → 언제·어디서(날짜) → 부가 기능
              (구글 링크)" 순으로 시선이 한 방향으로만 흐르게 정리했다.
              중요도가 진한 배지 → 중간 톤 날짜 → 가장 옅은 회색 링크 순으로
              색 무게도 같이 옅어져서, 굳이 위치를 나누지 않아도 셋의 우선
              순위가 저절로 읽힌다. */}
          {/* 날짜 앞에 "입력" 라벨을 붙였다(2026-08-18, "발행일 인지, 입력인지
              수정인지.. 그런거 표기하면 좋겠고" — sedaily.com 실제 화면의
              "입력 2026-08-17 17:32" 표기를 참고). 2026-08-23까지는 CmsLens
              데이터에 날짜만 있고 시:분이 없어 "입력 2026.08.14"까지만
              표기했는데, 사용자가 "여기는 날짜만 나와서"라고 다시 지적 —
              백엔드가 published_at(발행 완료 시각, ISO)을 내려주도록 고쳐서
              이제 시:분까지 표기한다(kstDateTimeLabel). 옛 글처럼
              published_at이 없는 경우만 날짜만 표기로 폴백. "· 서울경제"는
              뺐다(2026-08-18, "서울경제 라는 키워드는 빼는게 어떤가요" —
              바로 앞 사진 캡션에도 "사진 · 서울경제"가 있고 페이지 전체가
              이미 서울경제 브랜드라 매 줄마다 반복할 필요가 없다는 판단에
              동의). */}
          <div className="flex items-center flex-wrap" style={{ gap: 12, marginBottom: 10 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                background: `${LENS_ACCENT}14`,
                color: LENS_ACCENT,
              }}
            >
              4가지 시선
            </span>
            <p className="flex items-center" style={{ gap: 5, fontSize: 13, color: '#6b7280', fontWeight: 600, margin: 0 }}>
              <Calendar className="w-4 h-4" aria-hidden />
              입력 {kstDateTimeLabel(lens.published_at) ?? lens.date.replaceAll('-', '.')}
            </p>
            <a
              href="https://www.google.com/preferences/source?q=ailens.sedaily.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
              style={{ gap: 5, fontSize: 11.5, color: '#9ca3af', textDecoration: 'none' }}
            >
              <GoogleIcon className="w-3 h-3" />
              구글 검색 선호 출처로 추가
            </a>
          </div>

          {/* 기사 툴바 — 로컬 참고 경로 1_ailink/globe/dev/frontend/src의
              article-toolbar 마크업(border-y 구분선 + 아이콘 행)을 그대로
              가져왔다(2026-08-17, 사용자가 실제 마크업을 붙여주며 "영문
              사이트 컴포넌트 활용해주시죠", 이어서 "글자 크기랑 인쇄는?").
              원본의 AI 요약·저장은 스킵(로그인 저장 기능 없음, 이미 AI로
              재구성된 콘텐츠라 별도 AI 요약 불필요) — 공유·글자크기·인쇄만
              이식. */}
          <div
            className="flex items-center justify-between flex-wrap"
            style={{ marginTop: 'clamp(14px, 2.4vw, 20px)', marginBottom: 'clamp(18px, 3vw, 24px)', gap: 12, padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
              <ArticleShareButtons title={lens.headline} url={`https://ailens.sedaily.ai/lens/${slug}`} />
            </div>
            {/* 글자크기(알약 모양)와 인쇄(각진 정사각) 버튼이 각자
                테두리를 갖고 있어 8px 간격을 두고 붙어 있으니 "한 세트"가
                아니라 "따로 붙은 두 부품"처럼 보였다(2026-08-18, "각 요소들
                배치가 어때요?" 리뷰 후 "넵 개선하세요"). 두 컴포넌트의
                개별 border를 빼고, 여기서 테두리 하나로 감싸 얇은 구분선만
                중간에 넣어 하나의 컨트롤 그룹으로 통일했다. */}
            <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
              <ArticleFontSizeControl cssVar="--lens-font-scale" storageKey="lens-font-size" />
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
              <ArticlePrintButton />
            </div>
          </div>
        </div>

        {/* 사진 — 컬럼 폭을 꽉 채우고 높이는 사진이 정한다(레터박스 없음,
            좌우가 본문 가이드라인과 정확히 일치). 라운드·테두리를 없애 기사
            사진처럼 판면에 얹힌 느낌으로 뒀다. */}
        {/* 사진 — 세로가 길어지는 문제를 두 겹으로 막는다.
            (1) 본문 컬럼(.lw, 880px) 안에 두어 폭을 제한한다. 전체 폭이면
                거의 정사각인 사진이 700px 넘게 높아진다.
            (2) 2:1 컨테이너 + cover 로 높이를 확정한다(약 412px). 원본을 2:1 로
                다시 잘라뒀기 때문에 cover 가 잘라내는 양이 거의 없다.
            aspect-ratio 라 자리를 미리 잡아 레이아웃 이동(CLS)도 없다. */}
        {photo && (
          <div className="lw">
            <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0 }}>
              <Image
                src={photo}
                alt={lens.headline}
                fill
                sizes="(min-width: 920px) 880px, 100vw"
                priority
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            {/* 사진 출처 캡션 — 실제 뉴스 사이트는 사진 밑에 거의 예외
                없이 이 한 줄이 붙는데 우리는 없어서 "미완성" 인상을
                가장 크게 줬다(2026-08-17 피드백, 워싱턴포스트 비교).
                기사별 캡션 텍스트는 CmsLens에 아직 없는 데이터라(백엔드
                확장 필요) 지어내지 않고, 원문 링크가 있으면 그쪽으로
                출처를 붙인다. */}
            <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 8 }}>
              {lens.source_url ? (
                <>
                  사진 ·{' '}
                  <a href={lens.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    서울경제
                  </a>
                </>
              ) : (
                '사진 · 서울경제'
              )}
            </p>
          </div>
        )}

        {/* ── 리드 + 원문 링크 ── 사진과 같은 .lc 폭이라 좌우선이 맞는다. */}
        <div className="lw" style={{ paddingTop: 'clamp(20px, 3.4vw, 28px)' }}>
        <div>
          {lens.context && (
            <p
              data-speakable="summary"
              className="lm"
              style={{ fontSize: 'calc(18px * var(--lens-font-scale, 1))', lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}
            >
              {lens.context}
            </p>
          )}

          {lens.source_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <a
                href={lens.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="src"
                onClick={() => trackEvent('source_link_click', { article_id: lens.id, format: lensFormatAt(active) })}
              >
                기사 원문 보기
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17 17 7" />
                  <path d="M8 7h9v9" />
                </svg>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                  (새 창으로 열립니다)
                </span>
              </a>
            </div>
          )}
        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 'clamp(28px, 4.4vw, 40px)' }}>
          <div>
            {/* 핵심 요약("30초 핵심") — 실 데이터 기반(2026-08-20, GEO 개선).
                이전엔 데모 기사 하나에만 하드코딩된 오버라이드였는데,
                coreSummaryBullets()로 교체해 실제 발행된 모든 lens 글에서
                동작한다. 네 시선을 고르기 전에 기사 전체의 핵심(수치·사실
                위주)을 먼저 준다 — data-speakable="summary"를 붙여 위
                리드 문단과 함께 "인용하기 쉬운 요약 블록"으로 묶는다. */}
            {coreSummaryBullets(lens).length > 0 && (
              <div
                data-speakable="summary"
                style={{
                  border: LENS_CARD_BORDER,
                  borderRadius: 16,
                  padding: 18,
                  background: '#fff',
                  boxShadow: LENS_CARD_SHADOW,
                  marginBottom: 'clamp(24px, 3.4vw, 32px)',
                }}
              >
                <p className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 800, color: LENS_ACCENT, marginBottom: 12 }}>
                  <Zap size={14} fill="currentColor" aria-hidden />
                  30초 핵심
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                  {coreSummaryBullets(lens).map((s, si) => (
                    <li key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5, lineHeight: 1.6, color: '#1f2937', wordBreak: 'keep-all' }}>
                      <Check size={15} style={{ flexShrink: 0, marginTop: 3, color: LENS_ACCENT }} aria-hidden />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rule" />

            {/* ── 형식 선택 ──
                밑줄 텍스트 탭에서 **타일**로 되돌렸다(2026-08-14).
                이 페이지의 핵심 동작이 "어떤 형식으로 볼지 고르기"인데, 앞선
                버전은 그 컨트롤을 회색 16px 텍스트로 낮춰서 화면에서 가장 약한
                요소가 됐다(눈에 안 들어온다는 피드백). 게다가 선택하는 순간에
                형식을 표시하는 요소가 없어서 "넷 중 고른다"는 것이 직관적으로
                전달되지 않았다.
                네 타일을 같은 크기로 나란히 놓으면 선택지가 넷이라는 사실과
                각자가 무슨 형식인지가 한눈에 오고, 선택 상태는 색 채움 + 테두리 +
                체크 3중으로 표시해 색만으로 구분하지 않는다.
                2026-08-20 — 문구를 "누구의 눈으로"(인물 선택)에서 "어떤
                형식으로"(포맷 선택)로 고쳤다. 2026-08-18에 산출물이 4가지
                형식(레터/웹툰/팟캐스트/영상)으로 확정된 뒤에도 이 문구만
                옛 "독자 관점 선택" 프레이밍에 남아있어서, 실제로 고르는 것과
                질문이 어긋나 있었다(사용자가 실제 발행 글에서 직접 발견) —
                아래 lensPerspectives.ts의 LENS_PERSPECTIVES도 같이 고쳤다. */}
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', margin: 'clamp(24px, 3.4vw, 32px) 0 6px' }}>
              이 뉴스, 어떤 형식으로 볼까요?
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 'clamp(14px, 2.2vw, 18px)', wordBreak: 'keep-all' }}>
              고르면 아래 내용이 그 형식으로 바뀝니다.
            </p>

            <FormatPicker lenses={lenses} active={active} select={select} onTabKeyDown={onTabKeyDown} tabRefs={tabRefs} />

            {/* ── 선택된 시선 ── 박스 없이 위계로만 구성 */}
            {lenses.map((l, i) => (
              <LensFormatPanel key={i} lens={lens} l={l} i={i} active={active} count={count} photo={photo} select={select} tabRefs={tabRefs} />
            ))}

            {/* 구획 마감 — 본문이 끝났는데 아무 표시가 없어 브랜드 문구로 바로
                넘어가는 게 갑작스러웠다. 출처 한 줄로 닫는다: 뉴스에서 "이 사실이
                어디서 왔는지"는 신뢰의 마지막 조각이고, 네 시선이 모두 같은
                기사에서 나왔다는 것도 여기서 확인된다. */}
            <p
              style={{
                marginTop: 'clamp(28px, 4vw, 38px)',
                paddingTop: 16,
                borderTop: '1px solid rgba(17,24,39,0.09)',
                fontSize: 13,
                color: '#6b7280',
                lineHeight: 1.6,
                wordBreak: 'keep-all',
                marginBottom: 16,
              }}
            >
              네 시선 모두 같은 기사를 바탕으로 정리했어요.
            </p>

            {/* AI 생성 콘텐츠 고지(2026-08-21, 사용자 요청 — 서울경제 영문
                CMS의 "AI-translated from Korean..." 박스를 레퍼런스로
                "면책조항 걸어주세요"). 원문 링크는 이 박스 안으로 흡수 —
                위 문단에 있던 "원문 기사" 인라인 링크는 중복이라 뺐다. */}
            <AiDisclaimer sourceUrl={lens.source_url} articleId={lens.id} format={lensFormatAt(active)} />
          </div>
          </div>
        )}

        <div className="lw" style={{ paddingTop: 'clamp(44px, 6vw, 64px)', paddingBottom: 100 }}>
        <div>
          <div className="rule" />

          {/* "다른 시선" 미리보기(2026-08-16) — 마감부가 문구 한 줄 + 링크
              하나뿐이라 "허전하다"는 피드백. page.tsx가 fetchAllLens()
              in-flight 캐시에 편승해 이미 가져온 값 중 현재 글만 뺀 3개를
              넘겨준다(추가 API 호출 없음). */}
          {otherLens.length > 0 && (
            <div style={{ margin: '28px 0 8px' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 }}>
                다른 시선
              </p>
              <div>
                {otherLens.map((l) => {
                  const photo = pickLensPhoto(l);
                  return (
                    <Link
                      key={l.id}
                      href={`/lens/${encodeURIComponent(l.id)}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 0',
                        textDecoration: 'none',
                        borderTop: '1px solid rgba(17,24,39,0.07)',
                      }}
                    >
                      {photo && (
                        <span
                          className="flex-shrink-0"
                          style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}
                        >
                          <Image src={photo} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                        </span>
                      )}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 3 }}>
                          {kstDateTimeLabel(l.published_at) ?? l.date.replaceAll('-', '.')}
                        </span>
                        <span
                          style={{
                            display: '-webkit-box',
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#111827',
                            lineHeight: 1.4,
                            letterSpacing: '-0.01em',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {l.headline}
                        </span>
                      </span>
                      <span aria-hidden className="flex-shrink-0" style={{ color: '#c0c5cc', fontSize: 16 }}>
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '28px 0 4px', lineHeight: 1.5 }}>
            일상 속의 모든 소식, 신속하고 정확한 전달
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>통찰력 있는 이야기 · 인스타그램 @lens.sedaily</p>
          <Link
            href="/lens"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14, fontWeight: 700, color: LENS_ACCENT, textDecoration: 'none' }}
          >
            다른 시선 보기 →
          </Link>
        </div>
        </div>
      </main>
          </div>

          {/* 2026-08-18엔 본문 칼럼 안쪽 .lw div의 paddingTop(clamp(28px,
              4.5vw,40px), 헤드라인 전용 여백)을 사이드바에도 그대로
              줬었다("사이드바가 헤더에 바짝 붙어 보인다" 피드백) — 그런데
              2026-08-23에 사용자가 이번엔 반대로 "홈에 비해 사이드바가
              아래로 쏠려 보인다"고 지적했다. 비교 기준이 이 페이지 안의
              본문이 아니라 홈의 사이드바 위치였던 것 — 그래서 바깥 grid
              wrapper에 홈과 같은 clamp(8px,2vw,16px) 위 패딩을 추가하고
              (위 주석 참조), 사이드바 자체의 paddingTop 오버라이드는
              없앤다. 본문 헤드라인의 28~40px 여백은 그대로 유지 — 헤더와
              헤드라인 사이 간격 자체는 2026-08-17에 확정한 의도적인 값. */}
          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
        </div>
      </div>
    </div>
  );
}
