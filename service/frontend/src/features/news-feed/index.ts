export { NewsFeedTab } from './components/NewsFeedTab';
// 레터 본문 퀴즈·투표 블록. 관리자 에디터의 AI 퀴즈(admin aiQuizExtension·AiQuizFields)가 이 모양에 맞춰 저장한다.
// 지금 웹에서 렌더하는 곳은 없지만, 관리자 기능이 기대하는 렌더러라 2026-10-20 기능 다이어트에서 남겼다.
export { InteractiveBlock } from './components/cards/InteractiveBlock';
export type { InteractiveBlockData } from './components/cards/InteractiveBlock';
export { NewsletterCTA } from './components/NewsletterCTA';

// "지난 지면" 페이지(app/(content)/paper/[date])가 홈과 같은 4탭 카드를 재사용한다(variant="archive").
export { LensPreviewSection } from './components/sections/LensPreviewSection';

export { default as BirthdayMarket } from './components/birthday/BirthdayMarket';
export { BIRTHDAY_MARKET_PATH } from './components/birthday/data/birthdayRoutes';
// 그날 신문 카드의 QR이 여는 도착 페이지(/birthday-market/날짜). 주소 검증·제목은 서버 라우트도 쓰므로 훅이 없는 파일에서만 내보낸다.
export { BirthdayArrival } from './components/birthday/BirthdayArrival';
export { ARRIVAL_DESCRIPTION, arrivalTitle, parseArrivalDate } from './components/birthday/lib/birthdayArrival';
