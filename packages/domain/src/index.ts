// @ailens/domain — 공유 도메인 타입·순수 로직(플랫폼 비의존).
// 웹·앱(Expo) 공용. 참고: docs/architecture/apps-mobile-Expo-설계.md
//
// 상대 import 는 .js 확장자를 명시한다 — 빌드된 dist 를 Node ESM 런타임(Next standalone 서버)이
// 확장자 없이는 해석하지 못하기 때문. TS 소스에서 .js 로 적어도 ./poll/optimisticVote.ts 를 가리킨다.
//
// M0-b 진행 중: 순수 모듈을 하나씩 shared 에서 이 패키지로 승격한다.
//   [완료] poll, types, content/{letterHref,displayHeadline,lensUrl}, constants/{econCategories,econSubcategories}
//   [예정] api-client, content 나머지, date
export * from './poll/optimisticVote.js';
export * from './types/mbti.js';
export * from './types/question.js';
export * from './content/letterHref.js';
export * from './content/displayHeadline.js';
export * from './content/lensUrl.js';
export * from './constants/econCategories.js';
export * from './constants/econSubcategories.js';
export * from './search/searchIndex.js';
