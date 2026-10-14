// H5 게임 목록 단일 출처는 웹·앱 공용이라 @ailens/domain 으로 옮겼다(기존 import 경로를 지키는 재수출). 새 게임은 packages/domain/src/content/games.ts 의 GAMES 에만 더한다.
export { GAMES, GAMES_BY_SLUG } from '@ailens/domain';
export type { Game } from '@ailens/domain';
