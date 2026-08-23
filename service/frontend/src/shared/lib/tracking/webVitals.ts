import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { trackEvent } from './trackEvent';

/**
 * Core Web Vitals를 GA4로 실사용자 측정치(field data)로 보낸다(2026-08-23,
 * 사용자 요청 — "속도 KPI 어떻게 재나" 대화의 연장). Search Console의
 * "핵심 웹 지표" 리포트도 같은 3개 지표(LCP/INP/CLS)를 CrUX 기반으로
 * 보여주지만 사이트 전체 단위라 페이지·포맷별로는 못 쪼갠다 — GA4로
 * 같이 보내면 page_path별로 갈라볼 수 있다.
 *
 * GA4 권장 파라미터 이름(metric_name/value/id/rating)을 그대로 따른다 —
 * 이후 BigQuery에서 GA4 표준 web vitals 쿼리 예제를 그대로 재사용할 수
 * 있게. value는 CLS만 소수점(예: 0.05)이라 반올림하지 않고 그대로 보내고,
 * 나머지(LCP/INP/TTFB/FCP, 밀리초)는 정수로 반올림한다.
 */
function report(metric: Metric) {
  trackEvent('web_vitals', {
    metric_name: metric.name,
    metric_value: metric.name === 'CLS' ? metric.value : Math.round(metric.value),
    metric_id: metric.id,
    metric_rating: metric.rating,
    page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
  });
}

export function reportWebVitals() {
  onLCP(report);
  onINP(report);
  onCLS(report);
  // TTFB/FCP는 Core Web Vitals 공식 3종은 아니지만, 로딩 단계를 더
  // 세분화해서 볼 수 있어 같이 보낸다(가볍고, 이미 같은 라이브러리 안에
  // 있어 추가 비용 없음).
  onTTFB(report);
  onFCP(report);
}
