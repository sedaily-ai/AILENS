/**
 * API Configuration (웹) — @ailens/api-client 의 config 홀더에 Next env 로 주입한다.
 *
 * 베이스 URL 정의는 @ailens/api-client(공용)로 옮겼고, 여기서는 웹 플랫폼의 값
 * (process.env.NEXT_PUBLIC_* ?? prod 기본값)을 모듈 로드 시 1회 주입한다.
 * 기존 export(API_URL/CMS_API_URL/WS_URL)는 그대로 유지해 api 모듈·호출부는 수정 없이 동작한다.
 */
import { configureApiClient, getApiConfig } from '@ailens/api-client';

// prod 기본값(환경변수 미설정 시) — 기존 동작 보존.
const PROD_URL = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
const CMS_API_PROD_URL = 'https://ailens.sedaily.ai';
const WS_PROD_URL = 'wss://8181gs7j41.execute-api.us-east-1.amazonaws.com/dev';

// 모듈 로드 시 즉시 주입(SSR·클라이언트 양쪽). 웹은 Next 가 NEXT_PUBLIC_* 를 빌드타임 치환한다.
configureApiClient({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? PROD_URL,
  cmsApiUrl: process.env.NEXT_PUBLIC_CMS_API_URL ?? CMS_API_PROD_URL,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? WS_PROD_URL,
});

// 기존 상수 export 유지 — api 모듈과 호출부가 그대로 쓴다(동작 불변).
export const API_URL = getApiConfig().apiUrl;
export const CMS_API_URL = getApiConfig().cmsApiUrl;
export const WS_URL = getApiConfig().wsUrl ?? WS_PROD_URL;
