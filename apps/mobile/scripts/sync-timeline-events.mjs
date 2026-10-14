// 웹의 "그날로 떠나요" 사건 데이터(자동 생성 파일)를 앱으로 복사한다.
//   node apps/mobile/scripts/sync-timeline-events.mjs
// 원본: service/frontend/src/shared/data/timelineEvents.generated.ts (생성기: scripts/build-timeline-events.py, 원자료 docs/product/time-machine-events/*.json)
// 데이터가 바뀌면 이 스크립트를 다시 실행한다. 장기적으로는 생성기 출력 위치를 @ailens/domain 으로 옮겨 복사 자체를 없앤다(docs/architecture/apps-mobile-홈-설계.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = readFileSync(resolve(root, 'service/frontend/src/shared/data/timelineEvents.generated.ts'), 'utf8');
const out = src
  .replace("// 자동 생성 파일 — 직접 고치지 말 것.", "// 자동 생성 파일(웹 데이터의 복사본) — 직접 고치지 말 것. 갱신: node apps/mobile/scripts/sync-timeline-events.mjs\n// 웹 원본 헤더:")
  .replace("from './timelineEventTypes'", "from './eventTypes'");
writeFileSync(resolve(root, 'apps/mobile/src/features/timeline/events.generated.ts'), out);
const types = readFileSync(resolve(root, 'service/frontend/src/shared/data/timelineEventTypes.ts'), 'utf8');
writeFileSync(resolve(root, 'apps/mobile/src/features/timeline/eventTypes.ts'), types);
console.log('synced', (src.match(/"id":/g) ?? []).length, 'events');
