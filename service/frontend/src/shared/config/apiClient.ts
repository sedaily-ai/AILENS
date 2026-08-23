/**
 * API Configuration
 * 서버/클라이언트에서 동일한 API URL 사용 보장
 */

// MBTI 전용 API Gateway
const PROD_URL = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? PROD_URL;

// MBTI 챗봇 WebSocket (Sonnet 4.6 페르소나 토큰 streaming)
const WS_PROD_URL = 'wss://8181gs7j41.execute-api.us-east-1.amazonaws.com/dev';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? WS_PROD_URL;

// 영문사이트(en.sedaily.com) 실시간 시장지표 대시보드 — 위 MBTI API Gateway와는
// 별개 게이트웨이(2026-08-23, 코드 리팩토링 감사에서 marketLive.ts가 이걸
// env override 없이 하드코딩하고 있던 걸 발견해 이리로 이관).
const MARKET_PROD_URL = 'https://7w5nco7xn4.execute-api.us-east-1.amazonaws.com/dev';
export const MARKET_API_URL = process.env.NEXT_PUBLIC_MARKET_API_URL ?? MARKET_PROD_URL;