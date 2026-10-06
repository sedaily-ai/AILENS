import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 순수 함수 단위 테스트 전용 — 컴포넌트·Next 런타임은 다루지 않는다(CI 없음, 로컬에서 npm test).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
