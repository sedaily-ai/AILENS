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
}

export interface LetterVote {
  kind: 'emotion' | 'binary';
  question: string;
  options: { key: string; label: string; hint?: string }[];
}

export interface IssueLetter {
  slug: string;
  issueNumber: number;
  title: string;
  /** 목록 카드의 한 줄 요약. */
  deck: string;
  /** 3축 배지 옆에 붙는 짧은 설명(카드·헤더). */
  axisLabels: { axis: LetterAxis; label: string }[];
  /** 주 분류 + 보조 분류(사이트 9개 분류 이름). 첫 값이 주 분류. */
  categories: string[];
  publishedAt: string;
  readMinutes: number;
  featured?: boolean;
  /** 1분 요약(접기 영역). */
  summary: string[];
  sections: LetterSection[];
  editorNote: string;
  vote: LetterVote;
  sources: LetterSource[];
  /** 목업 문구 여부 — 기획서 예시만으로 채운 레터는 true(상세 상단에 안내 표시). */
  mock?: boolean;
}

export const AXIS_META: Record<LetterAxis, { label: string; tone: string; soft: string }> = {
  news: { label: '소식', tone: '#2f6fe0', soft: '#eaf1fd' },
  substance: { label: '실체', tone: '#0f8a7c', soft: '#e5f5f2' },
  other: { label: '다른 시각', tone: '#b86a12', soft: '#fdf1e2' },
};
