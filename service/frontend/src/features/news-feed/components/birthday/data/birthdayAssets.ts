// "스무 살의 내가 100만 원을 어디에 뒀다면" 칸의 자료 형식. 값은 수집 스크립트(service/backend/scripts/build_birthday_assets.py)가
// 한국은행 ECOS에서 받은 것만 쓴다. 정적 파일 public/data/birthday-assets/{연도}.json·latest.json으로 나가며 손으로 고치지 않는다.
// 기사·블로그의 어림값이나 추정치를 넣지 않는다.

/** [시점, 값]. 시점은 일별 YYYY-MM-DD(KST)·월별 YYYY-MM, 배열은 시점 오름차순. */
export type AssetPoint = [string, number];

/** 연도 파일(연도 = 기준일 연도). 허용되지 않은 출처의 키는 없고, 자료 시작 전 연도는 빈 배열이다. */
export interface AssetYearFile {
  year: number;
  /** 소비자물가지수 월별(901Y009, 2020=100). */
  cpi?: AssetPoint[];
  /** 정기예금 월초 누적지수 I(m)(121Y002 금리로 스크립트가 계산, 금리가 발표된 달만). */
  deposit?: AssetPoint[];
  /** 원/달러 일별 종가(731Y003, 전년 마지막 영업일 몇 개 포함)·월평균(731Y004). */
  usdkrw?: { daily: AssetPoint[]; monthly: AssetPoint[] };
  /** 서울 아파트 실거래가격지수 월별(901Y089). */
  apartment?: AssetPoint[];
  /** 생산자물가지수 품목별 금괴 월별(404Y016, 한국은행, 2020=100). */
  gold?: AssetPoint[];
}

/** latest.json — 계열별 "지금" 값. */
export interface AssetLatest {
  generatedAt: string;
  until: string;
  sources: Record<string, string>;
  /** ECOS 원계열별 마지막 시점(예금은 마지막 금리 달 deposit_rate). */
  last: Record<string, string>;
  cpi?: AssetPoint;
  /** 마지막 금리 달의 다음 달 월초 누적지수. */
  deposit?: AssetPoint;
  usdkrw?: { daily: AssetPoint; monthly: AssetPoint };
  apartment?: AssetPoint;
  gold?: AssetPoint;
}

/** 칸별·물가 줄(cpi) 작성기관과 통계 이름(출처 줄). */
export const ASSET_SOURCE_INFO: Record<'cpi' | 'deposit' | 'usd' | 'apartment' | 'gold', { org: string; name: string }> = {
  cpi: { org: '국가데이터처', name: '소비자물가지수' },
  deposit: { org: '한국은행', name: '예금은행 정기예금 신규취급액 가중평균 금리' },
  usd: { org: '한국은행', name: '원/달러 환율' },
  apartment: { org: '한국부동산원', name: '서울 아파트 실거래가격지수' },
  gold: { org: '한국은행', name: '생산자물가지수(금괴)' },
};

/** 자료 시작일. fx: 원/달러 월평균(731Y004) 시작 — 이보다 앞선 기준일은 칸을 만들지 않는다. usdDaily: 일별 종가(731Y003) 시작. */
export const ASSET_SERIES_FROM = { fx: '1964-05-04', usdDaily: '1990-03-02' } as const;
