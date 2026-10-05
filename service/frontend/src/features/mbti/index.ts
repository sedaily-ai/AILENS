// MBTI 코너 공개 API — 외부(app 라우트)는 이 파일로만 가져다 쓴다(FSD index.ts 규칙).
export { MbtiLanding } from './components/MbtiLanding';
export { MbtiResult } from './components/MbtiResult';
export { MBTI_GROUP_INFO, MBTI_GROUP_ORDER, groupSlug, parseGroupSlug } from './lib/mbtiCorner';
