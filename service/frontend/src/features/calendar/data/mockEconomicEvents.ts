export type EventCategory =
  | 'fed'           // FOMC·점도표·연준 발표
  | 'macro'         // CPI·PPI·고용·GDP·BOK 금통위
  | 'earnings'      // 실적 발표·컨퍼런스콜
  | 'index'         // MSCI·FTSE 편입·리뷰
  | 'policy'        // 정부 정책·법안·규제
  | 'corporate';    // 공시·IPO·주요 인수합병

export interface EconomicEvent {
  id: string;
  date: string;              // ISO yyyy-mm-dd
  time?: string;             // "03:00 (KST)" — 시간 미정이면 종일
  category: EventCategory;
  title: string;
  brief: string;             // 한 줄 요약
  impactLevel: 'high' | 'mid' | 'low';
  relatedLetterId?: string;  // /letters/[id] 매핑 (있으면 클릭 시 글 보기)
}

const CATEGORY_META: Record<EventCategory, { label: string; accent: string; soft: string }> = {
  fed:       { label: '연준',     accent: '#7c3aed', soft: '#ede9fe' },
  macro:     { label: '거시지표', accent: '#0891b2', soft: '#cffafe' },
  earnings:  { label: '실적',     accent: '#059669', soft: '#d1fae5' },
  index:     { label: '지수',     accent: '#d97706', soft: '#fef3c7' },
  policy:    { label: '정책',     accent: '#dc2626', soft: '#fee2e2' },
  corporate: { label: '공시',     accent: '#6366f1', soft: '#e0e7ff' },
};

export function getCategoryMeta(cat: EventCategory) {
  return CATEGORY_META[cat];
}

// V1.5 mock — 2-3주 분량
export const MOCK_ECONOMIC_EVENTS: EconomicEvent[] = [
  // 5/13 수
  {
    id: 'evt-fomc-may',
    date: '2026-05-13',
    time: '03:00 (KST)',
    category: 'fed',
    title: 'FOMC 5월 회의 결과·점도표 발표',
    brief: '연준 기준금리 결정 + 9월 컷 시그널 여부',
    impactLevel: 'high',
    relatedLetterId: 'nt-2026-05-12',
  },
  {
    id: 'evt-msci-may',
    date: '2026-05-13',
    time: '오전 발표',
    category: 'index',
    title: 'MSCI 5월 분기 리뷰',
    brief: '한국 종목 편입·편출 결과',
    impactLevel: 'mid',
    relatedLetterId: 'st-2026-05-12',
  },
  // 5/14 목
  {
    id: 'evt-samsung-q1',
    date: '2026-05-14',
    time: '16:00',
    category: 'earnings',
    title: '삼성전자 1Q 실적 컨퍼런스콜',
    brief: 'HBM3E 양산 가이던스 + 메모리 사이클 코멘트',
    impactLevel: 'high',
    relatedLetterId: 'nt-2026-05-12',
  },
  {
    id: 'evt-cpi-apr',
    date: '2026-05-14',
    time: '21:30 (KST)',
    category: 'macro',
    title: '미국 4월 CPI 발표',
    brief: '컨센서스 3.4% — 점도표 후 인플레 확인',
    impactLevel: 'high',
  },
  // 5/15 금
  {
    id: 'evt-kospi-special',
    date: '2026-05-15',
    time: '종일',
    category: 'policy',
    title: '지방선거 공약 토론회 (부산시장)',
    brief: '해양수도·AI 벨트 공약 토론',
    impactLevel: 'mid',
    relatedLetterId: 'sf-2026-05-12',
  },
  // 5/16 토 — 휴장
  // 5/17 일 — 휴장
  // 5/18 월
  {
    id: 'evt-bok-may',
    date: '2026-05-18',
    time: '10:00',
    category: 'macro',
    title: '한국은행 5월 금통위',
    brief: '기준금리 결정 + 총재 기자회견',
    impactLevel: 'high',
  },
  {
    id: 'evt-hyundai-q1',
    date: '2026-05-18',
    time: '14:00',
    category: 'earnings',
    title: '현대차 1Q 실적 컨콜',
    brief: '북미 전기차 가이던스 코멘트',
    impactLevel: 'mid',
  },
  // 5/19 화
  {
    id: 'evt-doosan',
    date: '2026-05-19',
    time: '09:00',
    category: 'corporate',
    title: '두산에너빌리티 SMR 컨소시엄 발표',
    brief: '폴란드 SMR 수출 계약 진척 공시',
    impactLevel: 'high',
  },
  // 5/20 수
  {
    id: 'evt-nvidia-q1',
    date: '2026-05-20',
    time: '05:00 (KST)',
    category: 'earnings',
    title: '엔비디아 1Q 실적 발표',
    brief: 'HBM 수요·블랙웰 가이던스',
    impactLevel: 'high',
  },
  // 5/21 목
  {
    id: 'evt-ipo-aimall',
    date: '2026-05-21',
    time: '종일',
    category: 'corporate',
    title: 'AIMall IPO 상장 (코스닥)',
    brief: 'AI 쇼핑 플랫폼 — 청약 경쟁률 1,200:1',
    impactLevel: 'mid',
  },
  // 5/22 금
  {
    id: 'evt-bok-minutes',
    date: '2026-05-22',
    time: '오전',
    category: 'macro',
    title: '한국은행 5월 의사록 공개',
    brief: '금통위 위원별 의견 분포',
    impactLevel: 'low',
  },
  // 5/26 월
  {
    id: 'evt-jackson-hole',
    date: '2026-05-26',
    time: '미국 시간',
    category: 'fed',
    title: '잭슨홀 미팅 사전 발표 (옐런 연설)',
    brief: '8월 잭슨홀 미팅 핵심 주제 시그널',
    impactLevel: 'mid',
  },
  // 5/28 수
  {
    id: 'evt-naver-q1',
    date: '2026-05-28',
    time: '14:00',
    category: 'earnings',
    title: '네이버 1Q 실적 컨콜',
    brief: '검색 AI·커머스 가이던스',
    impactLevel: 'mid',
  },

  // ── 8월 첫째 주 — "오늘의 한 통"(8/5) 발행 4편과 실제로 연결되는 주간 ──
  // 8/3 월
  {
    id: 'evt-boj-preview-0803',
    date: '2026-08-03',
    time: '09:00',
    category: 'fed',
    title: 'BOJ 8월 통화정책 프리뷰',
    brief: '엔화 방어 개입 가능성 사전 점검',
    impactLevel: 'mid',
  },
  {
    id: 'evt-china-cpi-0803',
    date: '2026-08-03',
    time: '10:30 (KST)',
    category: 'macro',
    title: '중국 7월 CPI·PPI 발표',
    brief: '내수 디플레이션 압력 지속 여부',
    impactLevel: 'mid',
  },
  // 8/4 화
  {
    id: 'evt-samsung-sk-0804',
    date: '2026-08-04',
    time: '16:00',
    category: 'earnings',
    title: '삼성전자·SK하이닉스 파운드리 컨콜',
    brief: '중국 반도체 저가 공세 대응 전략 질의',
    impactLevel: 'high',
    relatedLetterId: 'st-2026-08-05',
  },
  // 8/5 수 — 오늘
  {
    id: 'evt-spacex-lockup-0805',
    date: '2026-08-05',
    time: '종일',
    category: 'corporate',
    title: '스페이스X 상장 후 첫 보호예수 해제 임박',
    brief: '33조 원 규모 공매도, 락업 해제 앞두고 매도 압력 확대',
    impactLevel: 'high',
    relatedLetterId: 'nt-2026-08-05',
  },
  {
    id: 'evt-us-china-ai-0805',
    date: '2026-08-05',
    time: '오전 발표',
    category: 'macro',
    title: '美中 AI 모델 벤치마크 비교 리포트 공개',
    brief: '아레나리더보드 기준 성능 격차 2.7%까지 좁혀져',
    impactLevel: 'mid',
    relatedLetterId: 'sf-2026-08-05',
  },
  {
    id: 'evt-china-wafer-0805',
    date: '2026-08-05',
    time: '종일',
    category: 'macro',
    title: '중국 반도체 웨이퍼 생산량 발표',
    brief: '10년 새 4배 성장 — 삼성·SK 저가 공세 비상',
    impactLevel: 'mid',
    relatedLetterId: 'st-2026-08-05',
  },
  {
    id: 'evt-usdjpy-intervention-0805',
    date: '2026-08-05',
    time: '09:00 (도쿄)',
    category: 'fed',
    title: '美·日 엔화 공동 방어 개입',
    brief: '28년 만의 공동 개입 — 개입 확대 가능성 시사',
    impactLevel: 'high',
    relatedLetterId: 'nf-2026-08-05',
  },
  // 8/6 목
  {
    id: 'evt-us-jobless-0806',
    date: '2026-08-06',
    time: '21:30 (KST)',
    category: 'macro',
    title: '미국 주간 실업수당 청구건수',
    brief: '고용 냉각 속도 확인',
    impactLevel: 'low',
  },
  {
    id: 'evt-amazon-cloud-0806',
    date: '2026-08-06',
    time: '06:00 (KST)',
    category: 'earnings',
    title: '아마존 클라우드 부문 후속 가이던스',
    brief: '분기 매출 2000억 달러 돌파 이후 코멘트',
    impactLevel: 'mid',
  },
  // 8/7 금
  {
    id: 'evt-bok-financial-stability-0807',
    date: '2026-08-07',
    time: '10:00',
    category: 'policy',
    title: '한국은행 금융안정보고서 발표',
    brief: '가계부채·부동산 리스크 점검',
    impactLevel: 'mid',
  },
];

export function getEventsByDate(date: string): EconomicEvent[] {
  return MOCK_ECONOMIC_EVENTS.filter(e => e.date === date);
}

export function getEventsCountByDate(): Record<string, number> {
  const map: Record<string, number> = {};
  MOCK_ECONOMIC_EVENTS.forEach(e => {
    map[e.date] = (map[e.date] ?? 0) + 1;
  });
  return map;
}
