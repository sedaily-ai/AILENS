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