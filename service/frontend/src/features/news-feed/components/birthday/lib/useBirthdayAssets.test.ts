import { expect, test } from 'vitest';
import { ASSET_LATEST_URL, assetYearUrl, parseAssetLatest, parseAssetYear } from './useBirthdayAssets';

const yearFile = {
  year: 2010,
  cpi: [['2010-05', 81.4]],
  deposit: [['2010-05', 1.98]],
  usdkrw: { daily: [['2009-12-30', 1164.5], ['2010-01-04', 1154.4]], monthly: [['2010-01', 1138.9]] },
  apartment: [['2010-05', 47.3]],
};
const latestFile = {
  generatedAt: '2026-10-21T13:40:20+09:00', until: '2026-10-20',
  sources: { cpi: '국가데이터처 소비자물가지수(한국은행 ECOS 901Y009)' },
  last: { cpi: '2026-09', deposit_rate: '2026-08', usdkrw_daily: '2026-10-20' },
  cpi: ['2026-09', 120.43], deposit: ['2026-09', 3.5601204401],
  usdkrw: { daily: ['2026-10-20', 1328.1], monthly: ['2026-09', 1359.0] }, apartment: ['2026-07', 101.9],
};

test('요청 주소는 연도 파일과 latest.json뿐이고 연도만 담는다', () => {
  expect(assetYearUrl(2010)).toBe('/data/birthday-assets/2010.json');
  expect(ASSET_LATEST_URL).toBe('/data/birthday-assets/latest.json');
});

test('연도 파일: 정상 형식은 그대로, 자료 시작 전 빈 배열도 받는다', () => {
  expect(parseAssetYear(yearFile, 2010)).toEqual(yearFile);
  expect(parseAssetYear({ year: 1964, cpi: [], usdkrw: { daily: [], monthly: [['1964-05', 255.77]] } }, 1964))
    .toEqual({ year: 1964, cpi: [], usdkrw: { daily: [], monthly: [['1964-05', 255.77]] } });
});

test('연도 파일: 연도 불일치·점 형식·시점 형식·순서·환율 묶음 오류는 null', () => {
  expect(parseAssetYear(yearFile, 2011)).toBeNull();
  expect(parseAssetYear(null, 2010)).toBeNull();
  expect(parseAssetYear([], 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, cpi: { '2010-05': 81.4 } }, 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, cpi: [['2010/05', 81.4]] }, 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, cpi: [['2010-05', '81.4']] }, 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, cpi: [['2010-05', null]] }, 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, cpi: [['2010-06', 1], ['2010-05', 2]] }, 2010)).toBeNull();
  expect(parseAssetYear({ ...yearFile, usdkrw: { daily: [] } }, 2010)).toBeNull();
});

test('latest.json: 정상 형식은 그대로, 필수 값이 없거나 점 형식이 틀리면 null', () => {
  expect(parseAssetLatest(latestFile)).toEqual(latestFile);
  expect(parseAssetLatest({ ...latestFile, gold: { usd: ['2026-09', 4319], usdkrw: ['2026-09', 1359] } })?.gold)
    .toEqual({ usd: ['2026-09', 4319], usdkrw: ['2026-09', 1359] });
  const noGeneratedAt: Record<string, unknown> = { ...latestFile };
  delete noGeneratedAt.generatedAt;
  expect(parseAssetLatest(noGeneratedAt)).toBeNull();
  expect(parseAssetLatest({ ...latestFile, last: { cpi: 202609 } })).toBeNull();
  expect(parseAssetLatest({ ...latestFile, cpi: [['2026-09', 120.43]] })).toBeNull();
  expect(parseAssetLatest({ ...latestFile, usdkrw: { daily: ['2026-10-20', 1328.1] } })).toBeNull();
  expect(parseAssetLatest({ ...latestFile, apartment: ['2026.07', 101.9] })).toBeNull();
  expect(parseAssetLatest('latest')).toBeNull();
});
