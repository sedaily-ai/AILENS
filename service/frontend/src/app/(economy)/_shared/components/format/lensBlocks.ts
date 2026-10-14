// 레터 본문 문단 배열 → 화면 블록. 파서는 웹·앱 공용이라 @ailens/domain 으로 옮겼다(이 파일은 기존 import 경로를 지키는 재수출).
// 단위 시험: `node --experimental-strip-types scripts/test-lens-blocks.mjs`
export { BADGE_HEAD, parseLetterBlocks } from '@ailens/domain';
export type { LetterBlock, BoxKind } from '@ailens/domain';
