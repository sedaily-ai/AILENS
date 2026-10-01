'use client';

/**
 * /start — Goal→Format→Consume→Interest→Result→Subscribe→Done 6단계 온보딩
 * 위저드(실제 인터랙티브 플로우, 라이브).
 *
 * ⚠️ 이름 헷갈림 주의(2026-09-04, 리팩토링 감사에서 발견) — `/onboarding`
 * 라우트(`app/(auth)/onboarding/OnboardingClient.tsx`)도 "온보딩"이라는
 * 이름을 쓰지만 이건 서비스 소개용 정적 스크롤 랜딩이고, 이 6단계 위저드와는
 * 완전히 다른 화면이다. "온보딩 흐름 고쳐줘" 요청을 받으면 둘 중 어느
 * 화면 얘기인지 먼저 확인할 것.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchLensPosts, fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { GoalStep, type OnboardingGoal } from './components/GoalStep';
import { FormatStep } from './components/FormatStep';
import { ConsumeStep } from './components/ConsumeStep';
import { InterestStep } from './components/InterestStep';
import { ResultStep } from './components/ResultStep';
import { SubscribeStep } from './components/SubscribeStep';
import { DoneStep } from './components/DoneStep';
import { saveFormat, saveInterests, markOnboardingCompleted } from '@/shared/lib/onboardingStorage';

type Step = 'goal' | 'format' | 'consume' | 'interest' | 'result' | 'subscribe' | 'done';

// STEP 1(목표) → STEP 4(관심분야) 프리체크 — "왜 STEP1이 장식이냐"는 리뷰
// 지적에 대한 최소 해결책. 그 외엔 목표 답이 아무 데도 안 쓰인다.
const GOAL_TO_INTEREST: Record<OnboardingGoal, string[]> = {
  work: ['산업'],
  invest: ['증권'],
  culture: [],
};

/** 오늘의 1면 — paper_section이 "전체"인 것 중 display_order 우선, 없으면
 *  API가 이미 정렬해 내려주는 순서(발행일 내림차순)의 첫 건. */
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
  const [step, setStep] = useState<Step>('goal');
  // 실제로 지나온 단계만 쌓는 이력(2026-09-03, "이전으로 가기도 있는건가요?"
  // 지적으로 추가) — 고정된 순서 배열이 아니라 이동 시점마다 push하는
  // 방식이라, 스킵으로 건너뛴 단계(예: consume 슬롯이 비어 자동 스킵되는
  // 경우)는 이력에 안 남는다. 그래서 뒤로가기를 눌러도 빈 화면으로
  // 돌아가지 않고 실제로 있었던 이전 화면으로 간다.
  const [history, setHistory] = useState<Step[]>([]);
  const [lens, setLens] = useState<CmsLens | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState(false);

  // 2026-09-03 — fetchLensPosts()(목록)가 이제 백엔드 축약판(label/
  // question/bullets만)을 돌려준다(lens 채널 500 근본 수정 — 목록 API가
  // 4포맷 전체를 다 담아서 무거웠던 게 원인). 온보딩은 실제로 포맷 콘텐츠
  // 전체(문단·웹툰 컷·대본)를 렌더링해야 하니, 목록에서 "오늘의 1면"을
  // 고른 뒤 그 한 건만 단건 조회(fetchLensBySlug)로 다시 받는다 — lens/
  // webtoon 상세 페이지가 오늘 이미 쓰기 시작한 것과 같은 패턴.
  useEffect(() => {
    let cancelled = false;
    // "오늘의 1면"만 고르면 되므로 최신 100건이면 충분(전체 지면 글이 그 안에 8건 이상).
    fetchLensPosts(100).then((posts) => {
      const top = pickTopArticle(posts);
      if (!top) {
        if (!cancelled) setLens(null);
        return;
      }
      fetchLensBySlug(top.id).then((full) => {
        if (!cancelled) setLens(full);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goTo = (next: Step) => {
    setHistory((h) => [...h, step]);
    setStep(next);
  };

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setStep(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };
  const onBack = history.length > 0 ? goBack : undefined;

  const goToInterest = () => goTo('interest');

  // "건너뛰기" 의미 변경(2026-09-03, 사용자 지적: "건너뛰기를 누르면
  // 다음으로 이동하네... 메인페이지로 이동하는게 좋지 않나?") — 이전엔
  // 단계마다 "그 질문 하나만" 건너뛰고 온보딩 자체는 계속 진행됐다(끝까지
  // 가면 결과 화면까지 보임). 이제 "건너뛰기"는 온보딩 전체를 그만두고
  // 실제 홈으로 나가는 것으로 통일한다 — markOnboardingCompleted()도 같이
  // 호출해서 "이 사람은 온보딩을 안 하기로 했다"는 걸 기록, 다시 안 뜨게.
  const exitToHome = () => {
    markOnboardingCompleted();
    router.push('/');
  };

  const handleFormatSelect = (index: number) => {
    setFormatIndex(index);
    saveFormat(index);
    // 오늘의 1면이 아직 없거나 해당 포맷 슬롯이 비어있으면 소비 단계를
    // 건너뛰고 바로 관심분야로 — 막다른 화면을 만들지 않는다.
    if (lens?.lenses?.[index]) goTo('consume');
    else goToInterest();
  };

  const handleInterestContinue = (selected: string[]) => {
    setInterests(selected);
    saveInterests(selected);
    goTo('result');
  };

  // 완료(done)는 종착점이라 이력에 안 쌓는다 — 뒤로가기 UI 자체가 없다.
  const handleSubscribed = () => {
    setSubscribed(true);
    markOnboardingCompleted();
    setStep('done');
  };

  switch (step) {
    case 'goal':
      return (
        <GoalStep
          onSelect={(goal) => {
            setInterests(GOAL_TO_INTEREST[goal]);
            goTo('format');
          }}
          onSkip={exitToHome}
        />
      );
    case 'format':
      return <FormatStep lens={lens} onSelect={handleFormatSelect} onSkip={exitToHome} onBack={onBack} />;
    case 'consume':
      return lens ? (
        <ConsumeStep lens={lens} formatIndex={formatIndex} onContinue={goToInterest} onBack={onBack} />
      ) : (
        <FormatStep lens={lens} onSelect={handleFormatSelect} onSkip={exitToHome} onBack={onBack} />
      );
    case 'interest':
      return <InterestStep initialSelected={interests} onContinue={handleInterestContinue} onSkip={exitToHome} onBack={onBack} />;
    case 'result':
      return <ResultStep formatIndex={formatIndex} interests={interests} onContinue={() => goTo('subscribe')} onBack={onBack} />;
    case 'subscribe':
      return (
        <SubscribeStep
          formatIndex={formatIndex}
          interests={interests}
          onEdit={goToInterest}
          onSubscribed={handleSubscribed}
          onSkip={exitToHome}
          onBack={onBack}
        />
      );
    case 'done':
      return <DoneStep lens={lens} formatIndex={formatIndex} subscribed={subscribed} />;
    default:
      return null;
  }
}
