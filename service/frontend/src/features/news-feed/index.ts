export { NewsFeedTab } from './components/NewsFeedTab';
export { fetchFollowingWordTerms } from './lib/wordsTerms';
export type { Term } from './lib/wordsTerms';

// 2026 리팩토링 — app/letters/[id]/LetterDetailClient.tsx와
// app/onboarding/OnboardingClient.tsx가 배럴을 거치지 않고 컴포넌트
// 경로를 직접 import하던 딥임포트 위반을 여기 추가해서 해소.
export { EditorCommentsSection } from './components/EditorCommentsSection';
export { SideRail } from './components/SideRail';
export { InteractiveBlock } from './components/InteractiveBlock';
export type { InteractiveBlockData } from './components/InteractiveBlock';
export { NewsletterCTA } from './components/NewsletterCTA';
