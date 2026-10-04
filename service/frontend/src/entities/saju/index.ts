// 엔진(engine.ts)은 여기서 직접 내보내지 않는다 — 정적으로 import되면 만세력 라이브러리(≈260KB)가 첫 화면 번들에 들어간다.
// 계산이 필요할 때 loadSajuEngine()으로 불러온다.
export { CG_OH } from './lib/ganOh';
export { loadSajuEngine } from './lib/loadEngine';
