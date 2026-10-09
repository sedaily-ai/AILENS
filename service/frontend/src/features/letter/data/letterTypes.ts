// 모아쓰기 레터(이슈 레터) 화면용 타입 — 목업 단계(2026-10-09). 백엔드 모델 확정 전이라 화면이 필요로 하는 모양만 정의한다.
// 설계 기준: docs/product/모아쓰기레터/README.md §4 (issue_letters · sections · sources · votes).

/** 3축. 소식(무슨 일이 있었나) → 실체(왜·어떻게) → 다른 시각(그래서 어떤가/반대 면). */
export type LetterAxis = 'news' | 'substance' | 'other';

/** 본문 조각: 문자열 또는 인라인 링크(원문 기사로 이동). 하단에 링크를 몰지 않고 관련 문구에 건다. */
export type LetterSegment = string | { text: string; href: string };

export interface LetterSection {
  axis: LetterAxis;
  heading: string;
  /** "핵심:" 한 줄. 각 섹션 상단에 노출. */
  keyLine: string;
  paragraphs: LetterSegment[][];
}

export interface LetterSource {
  title: string;
  outlet: string;
  href: string;
  axes: LetterAxis[];
  /** 서울경제·AI LENS 기사 여부(역연결 대상). */
  internal: boolean;
  /** 목업용 자리표시 소스 — 실제 기사를 확인하지 못한 항목. 링크 없이 "예시"로 표시하고 지어낸 매체·제목을 쓰지 않는다. */
  placeholder?: boolean;
}

export interface LetterVote {
  kind: 'emotion';
  question: string;
  options: { key: string; label: string; hint?: string }[];
}

export interface IssueLetter {
  slug: string;
  issueNumber: number;
  title: string;
  /** 목록 카드의 한 줄 요약. */
  deck: string;
  /** 3축 배지 옆에 붙는 짧은 설명(상세 헤더). */
  axisLabels: { axis: LetterAxis; label: string }[];
  /** 지난 레터 카드의 키워드 배지(기획서 v3: 방법론·젠트리피케이션·가짜뉴스 등). 없으면 3축 이름을 그대로 쓴다. */
  cardTags?: { axis: LetterAxis; label: string }[];
  /** 주 분류 + 보조 분류(사이트 9개 분류 이름). 첫 값이 주 분류. */
  categories: string[];
  publishedAt: string;
  readMinutes: number;
  featured?: boolean;
  /** 레터의 주제 태그(주제 사전의 이름). 주 주제가 앞에 온다. 목록 카드·상세 머리에 보이고, 이후 독자의 관심 설정·추천의 기준이 된다. */
  topics?: string[];
  /** 독자 관심과 겹친 이유(사실형 한 문장). 관심 기반 추천에서만 있다. */
  reason?: string;
  /** 목록 카드용 기사 수. 목록 API는 출처 전체를 내려주지 않아 숫자만 받는다(상세는 sources.length). */
  sourceCount?: number;
  /** 1분 요약(접기 영역). */
  summary: string[];
  sections: LetterSection[];
  editorNote: string;
  /** 투표가 없는 레터도 있다. */
  vote: LetterVote | null;
  sources: LetterSource[];
  /** 목업 문구 여부 — 기획서 예시만으로 채운 레터는 true(상세 상단에 안내 표시). */
  mock?: boolean;
}

export const AXIS_META: Record<LetterAxis, { label: string; tone: string; soft: string }> = {
  // 글자색은 배경 대비 4.5:1 이상(WCAG AA)으로 맞췄다.
  news: { label: '소식', tone: '#1f56c0', soft: '#eaf1fd' },
  substance: { label: '실체', tone: '#0b6b60', soft: '#e5f5f2' },
  other: { label: '다른 시각', tone: '#8f4f0a', soft: '#fdf1e2' },
};
