/**
 * API config 주입 — 플랫폼(웹=Next env, 앱=Expo app.config extra)이 런타임에 1회 주입한다.
 * api 모듈은 process.env 를 직접 읽지 않고 getApiConfig() 로 값을 얻는다 → 플랫폼 중립.
 */

export interface ApiConfig {
  /** MBTI/레거시 Lambda API Gateway 베이스 URL. */
  apiUrl: string;
  /** CMS 공개 조회(EC2) 베이스 URL. */
  cmsApiUrl: string;
  /** 챗봇 WebSocket 베이스 URL(선택). */
  wsUrl?: string;
}

let current: ApiConfig | null = null;

/** 앱/웹 진입점에서 1회 호출해 베이스 URL 을 주입한다. */
export function configureApiClient(config: ApiConfig): void {
  current = config;
}

/** 주입된 config 를 돌려준다. 미주입 시 명시적으로 실패시켜 "조용히 잘못된 URL" 을 막는다. */
export function getApiConfig(): ApiConfig {
  if (!current) {
    throw new Error(
      '[api-client] configureApiClient() 가 호출되지 않았습니다. 앱/웹 진입점에서 베이스 URL 을 주입하세요.'
    );
  }
  return current;
}
