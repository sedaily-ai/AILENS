// 기획안 v3 자산 카드(주식·집·코인·금)의 시세 자료 자리. 2026-10-19 기준 검증된 시계열이 없어 모두 비어 있고,
// 화면은 "자료 준비 중"으로 보인다. 아래 배열을 채우면 계산(lib/birthdayAssets.ts)과 카드가 그대로 켜진다.
// 값은 수집 배치가 원자료에서 만든 것만 넣는다. 기사·블로그의 어림값이나 추정치를 손으로 넣지 않는다.

/** 일별 값. date는 YYYY-MM-DD(KST), 오름차순. */
export interface DailyPoint { date: string; value: number }
/** 월별 값. period는 YYYY-MM, 오름차순. */
export interface MonthlyPoint { period: string; value: number }
/** 연도별 품목 가격(원). 오름차순. */
export interface YearPrice { year: number; price: number }

export type StockId = 'samsung' | 'skhynix';
export type SavingItem = 'coffee' | 'lunch' | 'chicken';

export interface StockSeries {
  id: StockId;
  name: string;
  /** 일별 종가(원). 첫 값이 상장일(또는 자료 시작일)이다. */
  prices: DailyPoint[];
  /** 1주가 몇 주가 됐는지(액면분할·병합·무상증자). date는 효력 발생일. */
  capitalEvents: { date: string; ratio: number; label: string }[];
  /** 자본 변동 이력을 원자료와 대조했는가. false면 시세가 있어도 계산하지 않는다. */
  capitalEventsVerified: boolean;
  source: string;
}

export interface AssetData {
  /** 시세 기준일. 자료를 넣을 때 함께 적는다. */
  asOf: string | null;
  stocks: StockSeries[];
  apartment: {
    /** 서울 아파트 월간 매매가격지수. */
    index: MonthlyPoint[];
    /** 오늘 평균가 앵커(원)와 그 기준 월. 지수 비율로 그때 평균가를 역산한다. */
    anchor: { period: string; price: number } | null;
    source: string;
  };
  bitcoin: {
    /** 비트코인 원화 일별 종가(한 거래소로 통일). */
    prices: DailyPoint[];
    /** 아낀 품목의 연도별 가격. */
    items: Record<SavingItem, YearPrice[]>;
    source: string;
  };
  gold: {
    /** KRX 금시장 99.99 1g 종가(원). 2014년 3월 개장 이후. */
    krx: DailyPoint[];
    /** 국제 금값(USD/트로이온스) — KRX 개장 전 환산용. */
    international: DailyPoint[];
    /** 원/달러 매매기준율 — KRX 개장 전 환산용. */
    usdkrw: DailyPoint[];
    source: string;
  };
}

export const SAVING_ITEMS: { id: SavingItem; label: string }[] = [
  { id: 'coffee', label: '커피 한 잔' },
  { id: 'lunch', label: '점심 한 끼' },
  { id: 'chicken', label: '치킨 한 마리' },
];

export const ASSET_DATA: AssetData = {
  asOf: null,
  stocks: [
    {
      id: 'samsung', name: '삼성전자', prices: [],
      // 2018년 50대1 액면분할(기획안 v3). 원자료(DART·거래소 수정주가)와 대조하기 전이라 검증 표시는 하지 않는다.
      capitalEvents: [{ date: '2018-05-04', ratio: 50, label: '2018년 50대1 액면분할' }],
      capitalEventsVerified: false,
      source: '한국거래소 일별 종가 · DART 주식 발행 내역',
    },
    {
      id: 'skhynix', name: 'SK하이닉스', prices: [],
      // 현대전자 시절 이후 감자·증자 이력이 있어 1주 환산 보정표를 따로 만들어야 한다(기획안 v3).
      capitalEvents: [],
      capitalEventsVerified: false,
      source: '한국거래소 일별 종가 · DART 주식 발행 내역',
    },
  ],
  apartment: { index: [], anchor: null, source: 'KB·한국부동산원 서울 아파트 매매가격지수' },
  bitcoin: { prices: [], items: { coffee: [], lunch: [], chicken: [] }, source: '국내 거래소 비트코인 원화 시세 · 품목 가격 연표' },
  gold: { krx: [], international: [], usdkrw: [], source: 'KRX 금시장 · 국제 금값 · 한국은행 원/달러' },
};
