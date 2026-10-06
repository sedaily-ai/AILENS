'use client';

import { FooterSection } from "./sections/FooterSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { NewsletterSection } from "./sections/NewsletterSection";
import { ProblemSection } from "./sections/ProblemSection";
import { SampleLetterSection } from "./sections/SampleLetterSection";

/**
 * /onboarding — AI LENS 서비스 소개 랜딩 페이지(스크롤형, 정적).
 * 단일 편집팀(AI LENS)이 매일 한 통을 정리해 보낸다는 소개이며, `todayLettersApi.ts`의 DEFAULT_META와 같은 톤이다.
 *
 * ⚠️ 이름 혼동 주의 — "온보딩" 화면이 하나 더 있다. `features/onboarding/OnboardingFlow.tsx`(Goal→Format→Consume→Interest→Result→Subscribe→Done 6단계 인터랙티브 위저드)는 `/start` 라우트에서 동작한다.
 * 온보딩 흐름 수정 요청은 둘 중 어느 화면인지 먼저 확인할 것.
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
