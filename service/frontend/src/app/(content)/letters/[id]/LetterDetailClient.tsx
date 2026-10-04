'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EditorCommentsSection } from '@/features/news-feed';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { trackArticleRead } from '@/shared/lib/tracking/readingTracker';
import { fetchCmsPostBySlug } from '@/shared/lib/api/cmsPostsApi';
import {
  fetchTodayLetters,
  withDisplayMeta,
  type ApiLetter,
  type DisplayLetter,
  type TodayLetterCardLike,
} from '@/shared/lib/api/todayLettersApi';
import { LetterBody, type NeighborLetter } from './components';

// 다른 날짜 letter를 스캔할 때 훑는 최근 일수 — app/letters/[id]/page.tsx의 SEED_DAYS와 같은 값.
const LOOKBACK_DAYS = 14;

// 헤더 메타줄·공유 아이콘은 shared/ui로 추출해 lens 상세와 공유한다. 글자크기만 CSS 변수·localStorage 키를 페이지별로 넘긴다(본문 fontSize를 calc(var())로 배선하는 지점이 lens와 다르다).
interface Props {
  letterId: string;
  // 서버에서 findLetter()로 이미 가져온 글. SSG HTML에 본문이 바로 포함되도록(크롤러가 JS 없이도 볼 수 있게) 초기 상태를 이것으로 채우며, 이후 useEffect는 재검증용으로 다시 돈다.
  initialLetter?: DisplayLetter | null;
  // 이전/다음 레터 내비게이션용 — 서버(page.tsx)가 findNeighbors()로 미리 조회해 내려준다.
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
  // 우측 사이드바 "요즘 가장 많이 읽힌 글" 서버 프리페치 — SideRail.tsx 참조.
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

      // 2) CMS에 없으면 AI 레터 — id에 날짜가 인코딩되어 있지 않으므로 최근 LOOKBACK_DAYS일을 훑으며 .id가 일치하는 레터를 찾는다.
      //    개별 날짜 fetch 실패는 건너뛰고 계속 스캔한다.
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

  // !mounted만으로 게이트하면 SSG 렌더는 항상 mounted=false라 빈 <div>만 출력된다.
  // initialLetter로 검증된 데이터가 있으면 mount를 기다리지 않고 바로 렌더한다(크롤러가 받는 정적 HTML에 본문 포함).
  if (loadState === 'loading' || !letter || (!mounted && !initialLetter)) {
    return <div className="min-h-screen bg-white" />;
  }

  // Header·검색 오버레이·그리드·사이드바 배선은 ArticlePageShell에서 홈/카테고리/lens 페이지와 동일하게 처리한다.
  return (
    <ArticlePageShell
      sidebar={<HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />}
      afterContent={
        <>
          <div id="letter-other-lens" style={{ scrollMarginTop: 80 }}>
            <EditorCommentsSection otherLetters={otherLetters} />
          </div>
          <div className="h-24" />
        </>
      }
    >
      <main style={{ maxWidth: 720, minWidth: 0 }}>
        <LetterBody letter={letter} nextLetter={nextLetter} prevLetter={prevLetter} />
      </main>
    </ArticlePageShell>
  );
}

