'use client';

/**
 * /start — 질문 2개 + 결과 온보딩(2026-10-04 재설계).
 *   1) 상황("뉴스, 주로 언제 보게 되나요?") — 누르면 바로 다음
 *   2) 인지 유형("그때 무엇이 먼저 보이나요?" 숫자·글·그림·소리) — 누르면 바로 결과
 *   3) 내 유형 결과 + 그 자리에서 오늘 기사 바로 체험
 * 예전 6~7단계 위저드(목표→포맷→체험→관심분야→결과→구독→완료)는 이탈이 커서 걷어냈다.
 * 구독·관심분야는 온보딩에서 묻지 않는다.
 *
 * ⚠️ 이름 헷갈림 주의 — `/onboarding` 라우트(`app/(auth)/onboarding/OnboardingClient.tsx`)도 "온보딩"이라는
 * 이름을 쓰지만 서비스 소개용 정적 스크롤 랜딩이고, 이 흐름과는 완전히 다른 화면이다.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchLensPosts, fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { saveFormat, markOnboardingCompleted } from '@/shared/lib/onboardingStorage';
import { MomentStep } from './components/MomentStep';
import { MomentResult } from './components/MomentResult';
import { resolveFormat, type Glance, type Moment } from './lib/moments';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { GlanceStep } from './components/GlanceStep';

/** 오늘의 1면 — paper_section이 "전체"인 것 중 display_order 우선, 없으면 API 정렬(발행일 내림차순)의 첫 건. */
function pickTopArticle(posts: CmsLens[]): CmsLens | null {
  const candidates = posts.filter((p) => p.paper_section === '전체');
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const oa = a.display_order;
    const ob = b.display_order;
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    return 0;
  });
  return sorted[0];
}

export function OnboardingFlow() {
  const router = useRouter();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [glance, setGlance] = useState<Glance | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [lens, setLens] = useState<CmsLens | null>(null);

  // 결과 화면의 미리보기용 — 목록에서 오늘의 1면을 고른 뒤 단건 조회(목록 API는 축약판이라 headline만 필요해도 단건이 안전하다).
  useEffect(() => {
    let cancelled = false;
    fetchLensPosts(100).then((posts) => {
      const top = pickTopArticle(posts);
      if (!top) return;
      fetchLensBySlug(top.id).then((full) => {
        if (!cancelled) setLens(full);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // "나중에 할게요" — 온보딩을 그만두고 홈으로. 다시 안 뜨게 완료로 기록하되, 홈 헤더 링크로 언제든 다시 올 수 있다.
  const exitToHome = () => {
    markOnboardingCompleted();
    router.push('/');
  };

  if (!moment) {
    return <MomentStep onSelect={setMoment} onSkip={exitToHome} />;
  }

  if (!glance) {
    return (
      <GlanceStep
        moment={moment}
        onSelect={(g) => {
          const r = resolveFormat(moment, g);
          setGlance(g);
          setFormatIndex(r.formatIndex);
          saveFormat(r.formatIndex);
          markOnboardingCompleted(); // 두 질문에 답했으면 온보딩은 끝난 것 — 결과 화면에서 바로 체험한다.
          trackEvent('onboarding_result', { moment: moment.id, glance: g.id, format: r.formatIndex, adjusted: r.reason !== null });
        }}
        onBack={() => setMoment(null)}
        onSkip={exitToHome}
      />
    );
  }

  return (
    <MomentResult
      moment={moment}
      glance={glance}
      resolved={resolveFormat(moment, glance)}
      formatIndex={formatIndex}
      lens={lens}
      onChangeFormat={(i) => {
        setFormatIndex(i);
        saveFormat(i);
      }}
      onBack={() => setGlance(null)}
      onLater={exitToHome}
    />
  );
}
