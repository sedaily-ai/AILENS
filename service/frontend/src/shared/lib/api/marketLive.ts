/**
 * 실시간 시장 지표 페치 — 영문사이트(en.sedaily.com) market dashboard API 사용.
 * 출처: Naver Finance(코스피·코스닥), ECOS 한은(USD/KRW), Yahoo Finance(폴백).
 * 캐시: 백엔드에서 30분 TTL.
 *
 * Timemachine 'Then vs Now' 의 Now 쪽 + 다른 곳에서 재사용 가능.
 */
import { MARKET_API_URL } from '@/shared/config/apiClient';

const API = `${MARKET_API_URL}/api/market/dashboard`;

export interface LiveMarket {
  kospi: number | null;
  kospiAsOf: string | null;
  usdKrw: number | null;
  usdKrwAsOf: string | null;
  fetchedAt: number;
}

let cached: { value: LiveMarket; expires: number } | null = null;
const CLIENT_TTL_MS = 5 * 60_000; // 5분 — 백엔드 30분과 별개로 클라 캐시

export async function fetchLiveMarket(): Promise<LiveMarket | null> {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;

  try {
    const res = await fetch(API, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const kospiItem = (data.indices ?? []).find((i: { symbol: string }) => i.symbol === 'KOSPI');
    const usdItem = (data.fx ?? []).find((f: { pair: string }) => f.pair === 'USD/KRW');
    const value: LiveMarket = {
      kospi: typeof kospiItem?.price === 'number' ? kospiItem.price : null,
      kospiAsOf: kospiItem?.as_of ?? null,
      usdKrw: typeof usdItem?.rate === 'number' ? usdItem.rate : null,
      usdKrwAsOf: usdItem?.as_of ?? null,
      fetchedAt: now,
    };
    cached = { value, expires: now + CLIENT_TTL_MS };
    return value;
  } catch {
    return null;
  }
}
