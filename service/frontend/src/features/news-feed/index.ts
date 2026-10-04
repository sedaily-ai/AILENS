export { NewsFeedTab } from './components/NewsFeedTab';
export { fetchFollowingWordTerms } from './lib/wordsTerms';
export type { Term } from './lib/wordsTerms';

// app/letters/[id]/LetterDetailClient.tsx와 app/onboarding/OnboardingClient.tsx가 컴포넌트 경로를 직접 import(딥임포트)하지 않고 이 배럴을 거치도록 export를 제공한다.
export { EditorCommentsSection } from './components/sections/EditorCommentsSection';
export { InteractiveBlock } from './components/cards/InteractiveBlock';
export type { InteractiveBlockData } from './components/cards/InteractiveBlock';
export { NewsletterCTA } from './components/NewsletterCTA';

// "지난 지면" 페이지(app/(content)/paper/[date])가 홈과 같은 4탭 카드를 재사용한다(variant="archive").
export { LensPreviewSection } from './components/sections/LensPreviewSection';
