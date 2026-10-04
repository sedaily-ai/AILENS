/**
 * API Configuration
 * 서버/클라이언트에서 동일한 API URL 사용 보장
 */

// MBTI 전용 API Gateway
const PROD_URL = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? PROD_URL;

// CMS 글 공개 조회 전용(v1.20) — Lambda+DynamoDB에서 상시 서버(EC2, PM2)+
// PostgreSQL로 이전, 위 API_URL(Lambda API Gateway)과는 별개 오리진이다.
// ailens.sedaily.ai 를 서빙하는 CloudFront(E1QS7PY350VHF6)에 새 오리진 +
// /api/v2/posts* cache behavior 를 추가해 라우팅한다(docs/architecture/
// db-changelog/postgres/v1.20 참조) — 절대 URL을 쓰는 이유는 API_URL과
// 동일: Next.js 서버사이드 fetch는 상대 경로를 못 쓴다.
const CMS_API_PROD_URL = 'https://ailens.sedaily.ai';
export const CMS_API_URL = process.env.NEXT_PUBLIC_CMS_API_URL ?? CMS_API_PROD_URL;

// MBTI 챗봇 WebSocket (Sonnet 4.6 페르소나 토큰 streaming)
const WS_PROD_URL = 'wss://8181gs7j41.execute-api.us-east-1.amazonaws.com/dev';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? WS_PROD_URL;

// 영문사이트(en.sedaily.com) 실시간 시장지표 대시보드 — 위 MBTI API Gateway와는
// 별개 게이트웨이(2026-08-23, 코드 리팩토링 감사에서 marketLive.ts가 이걸
// env override 없이 하드코딩하고 있던 걸 발견해 이리로 이관).