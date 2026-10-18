import type { MarketItem } from './birthdayTypes';

// 공식 자료 확인일: 2026-10-18. 고정 자료이며 실시간 시세가 아니다.
export const AS_OF = "2026-10-18";

export const CPI_LATEST = {
  "period": "2026-09",
  "value": 120.43
};

export const CPI_MONTHLY: Record<string, number> = {
  "1988-02": 32.805
};

export const SOURCES: Record<string, { name: string; url: string }> = {
  "ecos": {
    "name": "한국은행 ECOS",
    "url": "https://ecos.bok.or.kr/api/#/DevGuide/DevSpeciflcation"
  },
  "cpi": {
    "name": "ECOS 소비자물가지수 · 국가데이터처",
    "url": "https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/901Y009/M/198802/198802/0"
  },
  "wage": {
    "name": "최저임금위원회 연도별 결정현황",
    "url": "https://www.minimumwage.go.kr/minWage/policy/decisionMain.do"
  },
  "pension": {
    "name": "국민연금공단 노령연금 안내",
    "url": "https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0056M0.do?menuId=MN24001118"
  },
  "reform": {
    "name": "국민연금공단 연금개혁 안내",
    "url": "https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0104M0.do"
  },
  "pensionHistory": {
    "name": "국민연금공단 과거 급여 산정 안내",
    "url": "https://nps.or.kr/html/download/easy/easy_20120427.pdf"
  },
  "krx": {
    "name": "KRX 데이터 제공 목록",
    "url": "https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd"
  },
  "consumer": {
    "name": "한국소비자원 생필품 가격 정보",
    "url": "https://www.data.go.kr/data/15083256/fileData.do"
  },
  "dart": {
    "name": "DART 기업개황 명세",
    "url": "https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019002"
  },
  "gold": {
    "name": "세계은행 월별 상품가격",
    "url": "https://www.worldbank.org/en/research/commodity-markets"
  },
  "kb": {
    "name": "KB 월간 아파트 매매가격지수",
    "url": "https://data.kbland.kr/kbstats/wmh?tIdx=HT01&tsIdx=monthAptSalePriceInx"
  },
  "births": {
    "name": "KOSIS 출생아 수",
    "url": "https://kosis.kr/visual/nsportalStats/detailContents.do?listId=A&statJipyoId=3641&vStatJipyoId=4860"
  },
  "life": {
    "name": "KOSIS 기대수명",
    "url": "https://kosis.kr/visual/nsportalStats/detailContents.do?listId=D&statJipyoId=3668&vStatJipyoId=5093"
  },
  "export": {
    "name": "관세청 수출입총괄 API",
    "url": "https://www.data.go.kr/data/15102108/openapi.do"
  }
};

export const GROUPS = [
  "그날 시황",
  "생활물가",
  "일과 소득",
  "주식·자산",
  "나라 경제·인구",
  "국민연금",
  "그래프"
];

export const WAGES: readonly (readonly [string, number])[] = [
  [
    "1988-01-01",
    487.5
  ],
  [
    "1989-01-01",
    600
  ],
  [
    "1990-01-01",
    690
  ],
  [
    "1991-01-01",
    820
  ],
  [
    "1992-01-01",
    925
  ],
  [
    "1993-01-01",
    1005
  ],
  [
    "1994-01-01",
    1085
  ],
  [
    "1994-09-01",
    1170
  ],
  [
    "1995-09-01",
    1275
  ],
  [
    "1996-09-01",
    1400
  ],
  [
    "1997-09-01",
    1485
  ],
  [
    "1998-09-01",
    1525
  ],
  [
    "1999-09-01",
    1600
  ],
  [
    "2000-09-01",
    1865
  ],
  [
    "2001-09-01",
    2100
  ],
  [
    "2002-09-01",
    2275
  ],
  [
    "2003-09-01",
    2510
  ],
  [
    "2004-09-01",
    2840
  ],
  [
    "2005-09-01",
    3100
  ],
  [
    "2007-01-01",
    3480
  ],
  [
    "2008-01-01",
    3770
  ],
  [
    "2009-01-01",
    4000
  ],
  [
    "2010-01-01",
    4110
  ],
  [
    "2011-01-01",
    4320
  ],
  [
    "2012-01-01",
    4580
  ],
  [
    "2013-01-01",
    4860
  ],
  [
    "2014-01-01",
    5210
  ],
  [
    "2015-01-01",
    5580
  ],
  [
    "2016-01-01",
    6030
  ],
  [
    "2017-01-01",
    6470
  ],
  [
    "2018-01-01",
    7530
  ],
  [
    "2019-01-01",
    8350
  ],
  [
    "2020-01-01",
    8590
  ],
  [
    "2021-01-01",
    8720
  ],
  [
    "2022-01-01",
    9160
  ],
  [
    "2023-01-01",
    9620
  ],
  [
    "2024-01-01",
    9860
  ],
  [
    "2025-01-01",
    10030
  ],
  [
    "2026-01-01",
    10320
  ],
  [
    "2027-01-01",
    10700
  ]
];

export const CATALOG: MarketItem[] = [
  {
    "id": "front-page",
    "group": 0,
    "title": "서울경제 1면 머리기사",
    "subtitle": "그날의 경제를 기록한 첫 문장",
    "availability": "지면 자료 연결 전",
    "explanation": "실제 인쇄일과 1면 TOP 정보를 검수한 뒤 연결합니다. 그날 검색된 첫 기사를 1면 머리기사로 대신하지 않습니다.",
    "sourceIds": [],
    "number": 1
  },
  {
    "id": "market-snapshot",
    "group": 0,
    "title": "코스피·원/달러·금리",
    "subtitle": "그날의 시장 풍경",
    "availability": "일부 자료 확인",
    "explanation": "환율은 매매기준율입니다. 현재 자료에는 1988-02-03과 최근 확인값만 포함돼 있습니다. 코스피 장기 일별 자료는 이용 계약이 필요하며, 2008년 이전 금리는 다른 제도와 구별해야 합니다.",
    "sourceIds": [
      "ecos",
      "krx"
    ],
    "number": 2
  },
  {
    "id": "cpi",
    "group": 1,
    "title": "물가 전체",
    "subtitle": "그때 1억 원은 지금 얼마일까",
    "availability": "비교 가능",
    "explanation": "최근 CPI ÷ 과거 CPI × 1억 원. 1988년 2월은 월별 실제값, 다른 해는 확인한 연평균을 사용합니다. 일별 물가로 해석하지 않습니다. 모든 값은 2020=100 기준입니다.",
    "sourceIds": [
      "cpi"
    ],
    "number": 3
  },
  {
    "id": "living-prices",
    "group": 1,
    "title": "짜장면 등 생활 품목·소형차 값",
    "subtitle": "일상의 가격표",
    "availability": "과거 가격 검수 중",
    "explanation": "지역·품목이 같은 가격을 비교합니다. 과거 가격을 품목 물가지수로 역산하면 추정이라고 표시합니다. 소형차는 모델·연식·등급을 함께 확인합니다.",
    "sourceIds": [
      "consumer"
    ],
    "number": 4
  },
  {
    "id": "same-product",
    "group": 1,
    "title": "같은 상품 값",
    "subtitle": "포카칩, 한 봉지보다 1g의 가격",
    "availability": "출시가·중량 확인 중",
    "explanation": "출시 가격과 중량, 현재 같은 제품의 가격과 중량을 함께 확보해야 합니다. 포장 크기나 맛이 다른 상품을 같은 상품으로 연결하지 않습니다.",
    "sourceIds": [
      "consumer"
    ],
    "number": 5
  },
  {
    "id": "minimum-wage",
    "group": 2,
    "title": "최저시급",
    "subtitle": "한 시간 일한 대가",
    "availability": "비교 가능",
    "explanation": "출생일 당시 시행 중인 시간급과 2026년 시간급을 비교합니다. 1988년은 HTML 기획안대로 2그룹 487.5원을 사용합니다. 당시 1그룹은 462.5원입니다.",
    "sourceIds": [
      "wage"
    ],
    "number": 6
  },
  {
    "id": "samsung",
    "group": 3,
    "title": "삼성전자 주가",
    "subtitle": "같은 한 주의 기준으로",
    "availability": "장기 수정주가 연결 전",
    "explanation": "50대1 액면분할 등 자본 변동을 반영한 수정주가가 필요합니다. 현금배당·세금·수수료는 제외합니다. 원시 과거 주가와 오늘 주가를 바로 나누지 않습니다.",
    "sourceIds": [
      "krx"
    ],
    "number": 7
  },
  {
    "id": "market-cap-top10",
    "group": 3,
    "title": "그날 시총 상위 10개 기업",
    "subtitle": "그때의 1등은 지금 어디에",
    "availability": "과거 전 종목 자료 연결 전",
    "explanation": "당시 상장 보통주 전체에서 상위 10개를 고른 뒤 현재 순위와 상태를 추적합니다. 상장폐지·합병 기업도 포함해야 합니다.",
    "sourceIds": [
      "krx"
    ],
    "number": 8
  },
  {
    "id": "same-age-companies",
    "group": 3,
    "title": "동갑 기업",
    "subtitle": "나와 같은 해에 태어난 회사",
    "availability": "기업 설립일 연결 전",
    "explanation": "DART 법인 설립연도가 같은 현재 상장사를 시가총액 순으로 보여 줍니다. 브랜드 창업일과 법인 설립일은 다를 수 있습니다.",
    "sourceIds": [
      "dart"
    ],
    "number": 9
  },
  {
    "id": "gold-ring",
    "group": 3,
    "title": "돌반지 한 돈",
    "subtitle": "첫돌에 받은 금 3.75g",
    "availability": "일별 금값·환율 연결 전",
    "explanation": "첫돌 날짜의 금 USD/트로이온스 × 같은 날짜 원/달러 × 3.75 ÷ 31.1034768. 공임·세금은 제외합니다. 세계은행 월평균 값은 존재하지만 당일 원화 가격으로 대신하지 않습니다.",
    "sourceIds": [
      "gold",
      "ecos"
    ],
    "number": 10
  },
  {
    "id": "seoul-apartment",
    "group": 3,
    "title": "서울 아파트값",
    "subtitle": "서울의 집값은 얼마나 달라졌을까",
    "availability": "KB 장기 지수 연결 전",
    "explanation": "KB 서울 월간 아파트 매매가격지수로 비교합니다. 실제 아파트 한 채의 수익이 아닙니다. 장기 원본과 상업 재이용 조건을 확인한 뒤 연결합니다.",
    "sourceIds": [
      "kb"
    ],
    "number": 11
  },
  {
    "id": "million-won",
    "group": 3,
    "title": "그날 100만 원",
    "subtitle": "현금·예금·코스피·삼성전자·금·아파트",
    "availability": "현금 구매력 계산 가능",
    "explanation": "여섯 갈래 모두 유지합니다. 현금의 명목 잔액과 물가를 반영한 구매력은 다릅니다. 다른 자산은 같은 시작·종료 시점의 검증된 자료가 있어야 계산합니다.",
    "sourceIds": [
      "cpi"
    ],
    "number": 12
  },
  {
    "id": "national-economy",
    "group": 4,
    "title": "1인당 국민총소득·수출",
    "subtitle": "나라 경제의 크기",
    "availability": "국민총소득 비교 가능",
    "explanation": "1인당 GNI는 명목 달러 기준의 연간 국민소득 지표입니다. 개인 연봉이 아닙니다. 수출은 통관 수출액이 필요하며 수출금액지수로 대체하지 않습니다.",
    "sourceIds": [
      "ecos",
      "export"
    ],
    "number": 13
  },
  {
    "id": "births",
    "group": 4,
    "title": "출생아 수",
    "subtitle": "같은 해 태어난 우리",
    "availability": "원 통계표 연결 전",
    "explanation": "해당 출생연도 전국 출생아 수입니다. 지금 살아 있는 동갑 인구나 국민연금 가입자 수와는 다릅니다. 기획안의 예시를 검증 없이 운영값으로 넣지 않았습니다.",
    "sourceIds": [
      "births"
    ],
    "number": 14
  },
  {
    "id": "life-expectancy",
    "group": 4,
    "title": "기대수명",
    "subtitle": "그해 태어난 사람의 생명표",
    "availability": "성별 통계표 연결 전",
    "explanation": "성별 미선택은 전체의 0세 기대여명을 사용합니다. 선택 성별은 이 항목에만 적용되며 서버에 저장하지 않습니다. 개인의 남은 수명을 예측하는 수치가 아닙니다.",
    "sourceIds": [
      "life"
    ],
    "number": 15
  },
  {
    "id": "pension-rules",
    "group": 5,
    "title": "내는 돈·받는 돈",
    "subtitle": "국민연금의 제도상 비율",
    "availability": "비교 가능",
    "explanation": "사업장가입자 총 보험료율과 평균소득자 40년 가입 기준의 소득대체율입니다. 지역가입자의 과거 요율 이력은 다를 수 있습니다. 태어난 해의 제도를 개인의 가입 이력으로 해석하지 않습니다.",
    "sourceIds": [
      "reform",
      "pensionHistory"
    ],
    "number": 16
  },
  {
    "id": "pension-calendar",
    "group": 5,
    "title": "연금 달력",
    "subtitle": "당겨 받기·정상·미뤄 받기",
    "availability": "날짜 계산 가능",
    "explanation": "현행법의 출생연도별 개시 연령에 해당하는 생일을 표시합니다. 실제 지급일이나 개인 수급권 확정이 아닙니다. 가입 10년, 조기 수령의 소득 요건 등을 충족해야 합니다.",
    "sourceIds": [
      "pension"
    ],
    "number": 17
  },
  {
    "id": "history-chart",
    "group": 6,
    "title": "코스피·물가와 큰 경제 사건",
    "subtitle": "숫자가 지나온 시간",
    "availability": "물가·사건 탐색 가능",
    "explanation": "현재 그래프는 검증한 연평균 CPI만 연결합니다. 코스피는 연속 시계열을 확보한 뒤 더합니다. 사건 발생일과 기사 지면일을 구분합니다.",
    "sourceIds": [
      "cpi"
    ],
    "number": 18
  }
];
