import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';

// STEP 5(결과 리빌) 카피 생성 공식 — 하드코딩 문장 대신 포맷×관심분야
// 조합을 전부 커버하는 템플릿. 문구는 lensPerspectiveAt()의 실제 tagline
// (레터="구조와 흐름까지 제대로 알고 싶다면" 등)과 톤을 맞춰 새로 썼다.

const FORMAT_TEXT: Record<number, { situation: string; action: string }> = {
  0: { situation: '차분히 읽고 싶을 때', action: '구조와 흐름을 짚어가며' },
  1: { situation: '이야기로 가볍게 보고 싶을 때', action: '8컷 만화로 스르륵 넘기며' },
  2: { situation: '이동 중 핵심만 듣고 싶을 때', action: '귀로 들으며' },
  3: { situation: '3초 안에 훑고 싶을 때', action: '자막·그래픽으로 훑으며' },
};

// "지면 특별 코너" 개별 카테고리(LensPreviewSection.tsx의 SECTIONS와 동일
// taxonomy) — 이 3개를 다 고르면 "전체"와 같은 뜻이라 흡수한다.
const ALL_CATEGORIES = ['증권', '산업', '시그널'];

/**
 * "전체" 선택 / 개별 3개 다 선택 / 스킵(빈 배열) 을 전부 하나의 ALL
 * 신호(['전체'])로 정규화한다. UI에서도 "전체"를 고르면 나머지가 자동
 * 해제되게 만들어야 이 정규화가 항상 안전하다(InterestStep 참조).
 */
export function normalizeInterests(selected: string[]): string[] {
  if (selected.length === 0) return ['전체'];
  if (selected.includes('전체')) return ['전체'];
  if (ALL_CATEGORIES.every((c) => selected.includes(c))) return ['전체'];
  return selected.filter((s) => s !== '전체');
}

export interface ResultCopy {
  headlineLines: [string, string];
  description: string;
  /** pill 태그 — 첫 번째는 항상 포맷, 나머지는 정규화된 관심분야. */
  tags: string[];
}

export function buildResultCopy(formatIndex: number, interests: string[]): ResultCopy {
  const fmt = FORMAT_TEXT[formatIndex] ?? FORMAT_TEXT[0];
  const formatLabel = lensPerspectiveAt(formatIndex).short;
  const norm = normalizeInterests(interests);
  const isAll = norm[0] === '전체';

  const interestHeadline = isAll ? '골고루 보는 타입' : `${norm.join('·')} 중심`;
  const interestDesc = isAll ? '여러 분야를 골고루' : `${norm.join('·')} 뉴스를 우선으로`;

  return {
    headlineLines: [fmt.situation, interestHeadline],
    description: `${formatLabel}로 ${fmt.action}, ${interestDesc} 받아보는 타입이에요.`,
    tags: [formatLabel, ...norm],
  };
}
