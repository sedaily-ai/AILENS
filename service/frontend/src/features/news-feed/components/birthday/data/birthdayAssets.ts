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
  /** 국제 금값 월평균 $/troy oz(세계은행 Pink Sheet, 허용 시에만). */
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
  /** 금·환율 월평균이 둘 다 있는 마지막 달. */
  gold?: { usd: AssetPoint; usdkrw: AssetPoint };
}

/** 칸별 작성기관과 통계 이름(출처 줄). */
export const ASSET_SOURCE_INFO: Record<'cash' | 'deposit' | 'usd' | 'apartment' | 'gold', { org: string; name: string }> = {
  cash: { org: '국가데이터처', name: '소비자물가지수' },
  deposit: { org: '한국은행', name: '예금은행 정기예금 신규취급액 가중평균 금리' },
  usd: { org: '한국은행', name: '원/달러 환율' },
  apartment: { org: '한국부동산원', name: '서울 아파트 실거래가격지수' },
  gold: { org: '세계은행', name: 'Pink Sheet 국제 금값 월평균' },
};

/** 자료 시작일. fx: 원/달러 월평균(731Y004) 시작 — 이보다 앞선 기준일은 칸을 만들지 않는다. usdDaily: 일별 종가(731Y003) 시작. */
export const ASSET_DATA_FROM = { fx: '1964-05-04', usdDaily: '1990-03-02' } as const;

// ↓ 기획안 v3(주식·집·코인·금 시나리오)의 옛 자료 형식. 화면이 새 칸으로 바뀌면 지운다.

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
