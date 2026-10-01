// 레터 본문의 소제목을 "구간"으로 뽑는다(2026-10-01, 챕터 내비게이션). 파싱은 렌더러와 같은 parseLetterBlocks를 써서
// 목차와 본문 소제목이 항상 일치한다(마크다운 변형·빈 소제목도 같은 규칙으로 처리).
import { parseLetterBlocks } from './lensBlocks';

export interface LensChapter {
  /** 본문 소제목에 붙는 앵커 id. */
  id: string;
  /** 목차에 보이는 짧은 이름 — "삼락열처리 매각: 무슨 일이…?"이면 콜론 앞 "삼락열처리 매각". */
  label: string;
  /** 전체 소제목 문구(툴팁·접근성용). */
  full: string;
}

export const chapterId = (n: number) => `lens-ch-${n}`;

export function letterChapters(paragraphs?: string[] | null): LensChapter[] {
  return parseLetterBlocks(paragraphs).flatMap((b) =>
    b.type === 'sub'
      ? [{ id: chapterId(b.no), label: b.head, full: b.question ? `${b.head}: ${b.question}` : b.head }]
      : [],
  );
}
