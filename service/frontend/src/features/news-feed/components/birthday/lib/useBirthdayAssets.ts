'use client';

// "100만 원을 어디에 뒀다면" 칸의 자료 — 같은 출처 정적 파일 두 개(기준일 연도 파일, latest.json)만 받는다.
// 주소에 드러나는 것은 연도뿐이고 생년월일·월·일은 어떤 요청에도 담지 않는다. 계산은 이 기기에서 한다(lib/birthdayAssets.ts).
import { useEffect, useState } from 'react';
import type { AssetLatest, AssetPoint, AssetYearFile } from '../data/birthdayAssets';

export const assetYearUrl = (year: number) => `/data/birthday-assets/${year}.json`;
export const ASSET_LATEST_URL = '/data/birthday-assets/latest.json';

const PERIOD = /^\d{4}-\d{2}(-\d{2})?$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isPeriod = (value: unknown): value is string => typeof value === 'string' && PERIOD.test(value);
const isPoint = (value: unknown): value is AssetPoint =>
  Array.isArray(value) && value.length === 2 && isPeriod(value[0]) && typeof value[1] === 'number' && Number.isFinite(value[1]);
/** 점 배열 — 이진 탐색(onOrBefore)이 기대는 시점 오름차순까지 확인한다. */
const isPoints = (value: unknown): value is AssetPoint[] =>
  Array.isArray(value) && value.every((point, index) => isPoint(point) && (index === 0 || (value[index - 1] as AssetPoint)[0] < point[0]));
const isStrings = (value: unknown, check: (item: unknown) => boolean): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(check);

/** 연도 파일 형식 검사. year가 다르거나 있는 키의 형식이 틀리면 null. */
export function parseAssetYear(raw: unknown, year: number): AssetYearFile | null {
  if (!isRecord(raw) || raw.year !== year) return null;
  const file: AssetYearFile = { year };
  for (const key of ['cpi', 'deposit', 'apartment', 'gold'] as const) {
    const points = raw[key];
    if (points === undefined) continue;
    if (!isPoints(points)) return null;
    file[key] = points;
  }
  if (raw.usdkrw !== undefined) {
    const usdkrw = raw.usdkrw;
    if (!isRecord(usdkrw) || !isPoints(usdkrw.daily) || !isPoints(usdkrw.monthly)) return null;
    file.usdkrw = { daily: usdkrw.daily, monthly: usdkrw.monthly };
  }
  return file;
}

/** latest.json 형식 검사. generatedAt·until·sources·last가 없거나 있는 점의 형식이 틀리면 null. */
export function parseAssetLatest(raw: unknown): AssetLatest | null {
  if (!isRecord(raw)) return null;
  const { generatedAt, until, sources, last } = raw;
  if (typeof generatedAt !== 'string' || !generatedAt || !isPeriod(until)
    || !isStrings(sources, item => typeof item === 'string') || !isStrings(last, isPeriod)) return null;
  const latest: AssetLatest = { generatedAt, until, sources, last };
  for (const key of ['cpi', 'deposit', 'apartment'] as const) {
    const point = raw[key];
    if (point === undefined) continue;
    if (!isPoint(point)) return null;
    latest[key] = point;
  }
  if (raw.usdkrw !== undefined) {
    const usdkrw = raw.usdkrw;
    if (!isRecord(usdkrw) || !isPoint(usdkrw.daily) || !isPoint(usdkrw.monthly)) return null;
    latest.usdkrw = { daily: usdkrw.daily, monthly: usdkrw.monthly };
  }
  if (raw.gold !== undefined) {
    const gold = raw.gold;
    if (!isRecord(gold) || !isPoint(gold.usd) || !isPoint(gold.usdkrw)) return null;
    latest.gold = { usd: gold.usd, usdkrw: gold.usdkrw };
  }
  return latest;
}

export type AssetLoadState =
  | { status: 'off' }
  | { status: 'loading'; year: number }
  | { status: 'ready'; year: number; file: AssetYearFile; latest: AssetLatest }
  | { status: 'error'; year: number };
type Loaded = Extract<AssetLoadState, { status: 'ready' | 'error' }>;

/** 두 파일을 함께 받는다. 응답 오류·JSON 오류·형식 오류는 모두 error. */
async function loadAssets(year: number): Promise<Loaded> {
  try {
    const [yearResponse, latestResponse] = await Promise.all([fetch(assetYearUrl(year)), fetch(ASSET_LATEST_URL)]);
    if (!yearResponse.ok || !latestResponse.ok) return { status: 'error', year };
    const [yearRaw, latestRaw]: unknown[] = await Promise.all([yearResponse.json(), latestResponse.json()]);
    const file = parseAssetYear(yearRaw, year), latest = parseAssetLatest(latestRaw);
    return file && latest ? { status: 'ready', year, file, latest } : { status: 'error', year };
  } catch {
    return { status: 'error', year };
  }
}

/** year가 null이면(기준일이 1964-05-04보다 앞섬) 아무것도 요청하지 않는다. ready 상태는 저장된 같은 객체라 useMemo 의존성으로 쓸 수 있다. */
export function useBirthdayAssets(year: number | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    void loadAssets(year).then(result => {
      if (!cancelled) setLoaded(result);
    });
    return () => { cancelled = true; };
  }, [year, attempt]);

  const state: AssetLoadState = year === null ? { status: 'off' }
    : loaded && loaded.year === year ? loaded
    : { status: 'loading', year };
  return {
    state,
    retry: () => { setLoaded(null); setAttempt(value => value + 1); },
  };
}
