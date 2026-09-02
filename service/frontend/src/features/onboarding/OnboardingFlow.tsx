'use client';

import { useEffect, useState } from 'react';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { GoalStep, type OnboardingGoal } from './components/GoalStep';
import { FormatStep } from './components/FormatStep';
import { ConsumeStep } from './components/ConsumeStep';
import { InterestStep } from './components/InterestStep';
import { ResultStep } from './components/ResultStep';
import { SubscribeStep } from './components/SubscribeStep';
import { DoneStep } from './components/DoneStep';
import { saveFormat, saveInterests, markOnboardingCompleted } from './lib/onboardingStorage';

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
  const [step, setStep] = useState<Step>('goal');
  const [lens, setLens] = useState<CmsLens | null>(null);
  const [formatIndex, setFormatIndex] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((posts) => {
      if (!cancelled) setLens(pickTopArticle(posts));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToInterest = () => setStep('interest');

  const handleFormatSelect = (index: number) => {
    setFormatIndex(index);
    saveFormat(index);
    // 오늘의 1면이 아직 없거나 해당 포맷 슬롯이 비어있으면 소비 단계를
    // 건너뛰고 바로 관심분야로 — 막다른 화면을 만들지 않는다.
    if (lens?.lenses?.[index]) setStep('consume');
    else goToInterest();
  };

  const handleInterestContinue = (selected: string[]) => {
    setInterests(selected);
    saveInterests(selected);
    setStep('result');
  };

  const handleSubscribed = () => {
    setSubscribed(true);
    markOnboardingCompleted();
    setStep('done');
  };

  const handleSkipToEnd = () => {
    markOnboardingCompleted();
    setStep('done');
  };

  switch (step) {
    case 'goal':
      return (
        <GoalStep
          onSelect={(goal) => {
            setInterests(GOAL_TO_INTEREST[goal]);
            setStep('format');
          }}
          onSkip={() => setStep('format')}
        />
      );
    case 'format':
      return <FormatStep lens={lens} onSelect={handleFormatSelect} onSkip={goToInterest} />;
    case 'consume':
      return lens ? (
        <ConsumeStep lens={lens} formatIndex={formatIndex} onContinue={goToInterest} />
      ) : (
        <FormatStep lens={lens} onSelect={handleFormatSelect} onSkip={goToInterest} />
      );
    case 'interest':
      return <InterestStep initialSelected={interests} onContinue={handleInterestContinue} onSkip={() => setStep('result')} />;
    case 'result':
      return <ResultStep formatIndex={formatIndex} interests={interests} onContinue={() => setStep('subscribe')} />;
    case 'subscribe':
      return (
        <SubscribeStep
          formatIndex={formatIndex}
          interests={interests}
          onEdit={() => setStep('interest')}
          onSubscribed={handleSubscribed}
          onSkip={handleSkipToEnd}
        />
      );
    case 'done':
      return <DoneStep lens={lens} formatIndex={formatIndex} subscribed={subscribed} />;
    default:
      return null;
  }
}
