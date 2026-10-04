// 타임라인 사건 타입 — 데이터 접근 계층(timelineEvents.ts)과 자동 생성 파일(.generated.ts)이 서로를 import하지 않도록 분리.
export interface EventSource {
  label: string;
  url: string;
}

export interface TimelineEvent {
  id: string;
  /** 사건 시작일 'YYYY-MM-DD'. 월 단위만 확인된 사건은 'YYYY-MM'. */
  date: string;
  /** 기간 사건의 끝. */
  endDate?: string;
  title: string;
  /** 홈 칩에 쓰는 짧은 이름(8자 안팎). */
  shortTitle?: string;
  /** 출처에서 확인된 사실만 쓴 설명. */
  description: string;
  /** 속한 시대 이름. */
  era?: string;
  /** 시대 페이지가 있으면 그 주소(slug). */
  eraSlug?: string;
  /** 사건 기간의 서울경제 기사를 찾을 검색어(앞이 가장 정확). */
  keywords: string[];
  /** 이 사건을 다룬 신문이 실린 날(보통 사건 다음 날). */
  paperDate?: string;
  /** 서로 독립된 출처(2개 이상). */
  sources: EventSource[];
  /** 출처 간 표현 차이 등 독자에게 밝힐 메모. */
  note?: string;
  /** 홈 "역사 속 그날" 칩에 올릴 대표 사건. */
  featured?: boolean;
}
