'use client';

import Link from 'next/link';
import { Header } from "@/widgets/Header";
import { useEffect, useState } from 'react';
import { EditorCommentsSection } from '@/features/news-feed';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { trackArticleRead } from '@/shared/lib/tracking/readingTracker';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPostBySlug } from '@/shared/lib/api/cmsPostsApi';
import {
  fetchTodayLetters,
  withDisplayMeta,
  type ApiLetter,
  type DisplayLetter,
  type TodayLetterCardLike,
} from '@/shared/lib/api/todayLettersApi';
import { LetterBody, type NeighborLetter } from './components';

// 다른 날짜 letter 를 스캔할 때 훑는 최근 일수 — app/letters/[id]/page.tsx 의
// SEED_DAYS 와 같은 값(그룹-날짜 합성 id 스킴 폐지 이후 findLetter 와 동일 패턴).
const LOOKBACK_DAYS = 14;

// 헤더 메타줄·공유 아이콘 — 처음엔 /lens/[slug]/LensViewClient.tsx에서 만든
// 걸 이 파일도 로컬 복제해 뒀었는데(2026-08-18, "헤더부분? 공유버튼?
// 발행일? 카테고리? ... 이거 전체 글들에 동일하게 적용되어야합니다"), 두
// 페이지가 완전히 동일한 ~150줄을 각자 들고 있는 게 유지보수 부담이라
// shared/ui로 추출해 합쳤다(같은 날 후속). 글자크기만 CSS 변수·
// localStorage 키를 페이지별로 다르게 넘긴다 — 본문 fontSize를
// calc(var())로 배선하는 지점(LetterBlock 여러 분기)이 lens와 달라서.
interface Props {
  letterId: string;
  // 서버(빌드타임)에서 findLetter()로 이미 가져온 글 — SSG 결과물 HTML에 실제
  // 본문이 바로 박히게(크롤러가 JS 없이도 볼 수 있게) 초기 상태를 이걸로
  // 채운다. 이후 useEffect는 그대로 재검증용으로 다시 돈다(2026-08-07,
  // JSON-LD/OG 태그는 있는데 정작 화면 본문은 client fetch 전까지 비어있던
  // 문제 — /letters/[id]/page.tsx 의 findLetter 결과를 그대로 내려받는다).
  initialLetter?: DisplayLetter | null;
  // 이전/다음 레터 내비게이션용(2026-08-21, GEO 재감사) — 서버(page.tsx)가
  // findNeighbors()로 미리 조회해 내려준다.
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
  // 우측 사이드바 "요즘 가장 많이 읽힌 글" 서버 프리페치(2026-08-23) —
  // SideRail.tsx 참조.
  initialHotLetters?: TodayLetterCardLike[];
}

// "YYYY-MM-DD" 최근 n 일 (오늘 포함, 내림차순) — app/letters/[id]/page.tsx 의
// 동명 헬퍼와 동일 로직. findLetter 가 빌드타임에 쓰는 것과 달리 여기는
// 클라이언트에서 letterId 로 날짜를 스캔해 찾는 용도로 쓴다.
function recentDatesISO(days: number): string[] {
  const out: string[] = [];
  const t = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function LetterDetailClient({ letterId, initialLetter = null, nextLetter = null, prevLetter = null, initialHotLetters }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [letter, setLetter] = useState<DisplayLetter | null>(initialLetter);
  // 오늘 함께 발행된, 지금 보고 있는 레터를 제외한 다른 레터들 — Another Lens 섹션에 전달.
  const [otherLetters, setOtherLetters] = useState<ApiLetter[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    initialLetter ? 'ready' : 'loading',
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, 클라이언트 hydration 완료 플래그
    setMounted(true);
  }, []);

  // 레터 완독률 — 스크롤 90% 이상 도달 시 한 번만 발송 (letterId 단위)
  useEffect(() => {
    if (loadState !== 'ready') return;
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total > 0 && scrolled / total >= 0.9) {
        fired = true;
        trackEvent('letter_complete', { letter_id: letterId });
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loadState, letterId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) CMS 글(admin 이 slug 로 발행) 먼저 시도 — 기존 동작 그대로.
      try {
        const post = await fetchCmsPostBySlug('letters', letterId);
        if (cancelled) return;
        if (post) {
          setLetter(withDisplayMeta(post));
          setOtherLetters([]);
          setLoadState('ready');
          trackArticleRead(letterId);
          return;
        }
      } catch {
        if (!cancelled) setLoadState('error');
        return;
      }

      // 2) CMS 에 없으면 AI 레터 — id 에 더 이상 날짜가 인코딩돼있지 않아
      //    (그룹-날짜 합성 id 스킴 폐지, 2026-08-07) 최근 LOOKBACK_DAYS 일을
      //    훑으며 .id 가 일치하는 레터를 찾는다. 개별 날짜 fetch 실패는 건너뛰고
      //    계속 스캔 — 하나가 실패했다고 전체를 에러로 처리하지 않는다.
      for (const date of recentDatesISO(LOOKBACK_DAYS)) {
        if (cancelled) return;
        try {
          const res = await fetchTodayLetters(date);
          if (cancelled) return;
          const target = res.letters.find((l) => l.id === letterId);
          if (target) {
            setLetter(withDisplayMeta(target));
            setOtherLetters(res.letters.filter((l) => l.id !== letterId));
            setLoadState('ready');
            // 읽기 streak 카운트 — letterId 단위 dedup, 일별 누적
            trackArticleRead(letterId);
            return;
          }
        } catch {
          // 이 날짜만 실패 — 다음 날짜로 계속.
        }
      }
      if (!cancelled) setLoadState('not-found');
    })();
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  if (loadState === 'not-found' || loadState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">
            {loadState === 'error' ? '잠시 후 다시 시도해주세요.' : '글을 찾을 수 없어요.'}
          </p>
          <Link href="/" className="text-sm text-gray-700 hover:underline">
            오늘로 돌아가기 →
          </Link>
        </div>
      </div>
    );
  }

  // !mounted 만으로 게이트하면 빌드타임(SSG) 렌더는 항상 mounted=false라 이
  // 블록에 걸려 빈 <div>만 출력된다 — initialLetter로 이미 검증된 데이터가
  // 있는 경우엔 mount를 기다리지 않고 바로 렌더한다(2026-08-07, 크롤러가
  // JS 없이 받는 정적 HTML에 실제 본문이 비어있던 원인).
  if (loadState === 'loading' || !letter || (!mounted && !initialLetter)) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 글로벌 헤더 — /editors 페이지와 동일한 마크업 (전체 페이지에서 고정).
          'feed' 탭은 2026-08-17 상단 탭 개편으로 nav에서 빠졌다(headerTabs.ts
          참조) — 강조할 대응 탭이 더 없다. */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs()}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main>
        {/* 우측 사이드바를 홈/카테고리/lens 페이지와 완전히 동일한 그리드로
            통일했다(2026-08-23, 사용자 지적 — "사이드바 들어가는 모든 경로의
            위치가 x, y 그리고 포지션도 동일한 위치였으면"). 예전엔 이 페이지만
            별도 폭(1040)·별도 컬럼비(720/260)·별도 사이드바 컴포넌트
            (SideRail.tsx — HomeSideBar와 별개로 존재하던 구현체, lg:sticky
            까지 걸려있어 다른 페이지와 스크롤 동작 자체가 달랐다)를 썼다.
            이제 HomeSideBar를 그대로 쓰고, 바깥 grid도 다른 페이지와 같은
            maxWidth 1320 + clamp(24px,3.5vw,44px) 좌우 패딩 +
            clamp(8px,2vw,16px) 위 패딩을 쓴다 — 본문 가독성 폭(720)은 안쪽
            div에서만 유지한다. */}
        <div
          className="mx-auto"
          style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
            <div style={{ maxWidth: 720, minWidth: 0 }}>
              <LetterBody letter={letter} nextLetter={nextLetter} prevLetter={prevLetter} />
            </div>
            <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
          </div>
        </div>

        <div id="letter-other-lens" style={{ scrollMarginTop: 80 }}>
          <EditorCommentsSection otherLetters={otherLetters} />
        </div>
      </main>

      <div className="h-24" />
    </div>
  );
}

