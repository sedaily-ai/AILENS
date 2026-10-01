// 레터 본문의 소제목("## 소제목: 질문?" / "◾ 소제목")을 "구간"으로 뽑는다(2026-10-01, 챕터 내비게이션).
// 소제목 마커 규칙은 LensFormatPanel(렌더)·publish_utils.parse_letters(파이프라인)와 같다.

export interface LensChapter {
  /** 본문 소제목에 붙는 앵커 id. */
  id: string;
  /** 목차에 보이는 짧은 이름 — "삼락열처리 매각: 무슨 일이…?"이면 콜론 앞 "삼락열처리 매각". */
  label: string;
  /** 전체 소제목 문구(툴팁·접근성용). */
  full: string;
}

export const chapterId = (n: number) => `lens-ch-${n}`;

export function isSubPara(para: string): boolean {
  return para.startsWith('##') || para.startsWith('◾');
}

export function subText(para: string): string {
  return para.replace(/^(?:##|◾)\s*/, '').trim();
}

export function letterChapters(paragraphs?: string[] | null): LensChapter[] {
  if (!paragraphs) return [];
  const out: LensChapter[] = [];
  for (const para of paragraphs) {
    if (!isSubPara(para)) continue;
    const full = subText(para);
    if (!full) continue;
    const head = full.split(/[:：]/)[0].trim();
    out.push({ id: chapterId(out.length), label: head.length >= 2 ? head : full, full });
  }
  return out;
}
