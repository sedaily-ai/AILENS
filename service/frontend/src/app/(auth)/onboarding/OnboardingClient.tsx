'use client';

import { FooterSection } from "./sections/FooterSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { NewsletterSection } from "./sections/NewsletterSection";
import { ProblemSection } from "./sections/ProblemSection";
import { SampleLetterSection } from "./sections/SampleLetterSection";

/**
 * /onboarding — AI LENS 서비스 소개 랜딩 페이지(스크롤형, 정적).
 *
 * 기존 5단계 질문형 onboarding (welcome/motivation/context/result/letter) 폐기.
 * 새로 about 톤 + 인터랙티브 스크롤 랜딩으로 교체.
 * 옛 steps/ data/ components/ 폴더는 미사용 확인 후 제거함.
 *
 * MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) — 페르소나 소개·선택 섹션을
 * 걷어내고, 단일 편집팀(AI LENS)이 매일 한 통을 정리해 보낸다는 소개로
 * 교체했다. `todayLettersApi.ts` 의 DEFAULT_META 와 같은 톤.
 *
 * ⚠️ 이름 헷갈림 주의(2026-09-04, 리팩토링 감사에서 발견) — "온보딩"이라는
 * 이름을 가진 화면이 이거 말고 하나 더 있다: `features/onboarding/
 * OnboardingFlow.tsx`(Goal→Format→Consume→Interest→Result→Subscribe→Done
 * 6단계 실제 인터랙티브 위저드)는 `/start` 라우트에서 돈다. 위 "폐기"
 * 문구는 이 파일이 대체했던 **옛** 5단계 흐름 얘기지, `/start`의 살아있는
 * 위저드를 가리키는 게 아니다 — "온보딩 흐름 고쳐줘" 요청을 받으면 둘 중
 * 어느 화면 얘기인지 먼저 확인할 것.
 */

export function OnboardingClient() {
  return (
    <div style={{ background: '#fff', color: '#111827', overflow: 'hidden' }}>
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <SampleLetterSection />
      <NewsletterSection />
      <FooterSection />
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
// ── 작동 방식 ──────────────────────────────────────────────────────
// ── 샘플 letter (오늘의 한 통 미리보기) ───────────────────────────
// ── 뉴스레터 구독 ──────────────────────────────────────────────────
// ── 푸터 한 줄 + 메인 진입 ─────────────────────────────────────────
