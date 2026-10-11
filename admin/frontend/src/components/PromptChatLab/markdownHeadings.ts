/** 마크다운 제목 파싱·점프 헬퍼 — PromptVersionReference.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
/* 2026-09-27, 사용자 요청 — "설명,지침,파일 프롬프트 좌측에 목차처럼
   보이도록(마크다운 문법 활용)... 해당 부분 클릭하면 바로 넘어갈 수
   있도록": 처음엔 "# 제목"/"## 0. Role..." 마크다운 헤딩만 인식했는데,
   사용자 재지적 — "xml 태그같은거는 읽기 어렵겠죠?": 실제로 이 프롬프트의
   "지침" 필드는 마크다운이 아니라 <role>/<context>/<final_deliverable>
   같은 XML 스타일 태그로 섹션을 나누고 있어서(사용자가 스크린샷으로 보여준
   실제 내용), 마크다운만 보는 목차는 이 필드에서 통째로 안 떴다(헤딩
   0개로 판정 — 목차 칼럼 자체가 안 그려짐). 여는 태그가 한 줄에 단독으로
   있는 경우(`<tag>`)도 같이 인식하도록 넓혔다 — 두 관례가 프롬프트마다
   섞여 있어서 어느 쪽이든 목차가 뜨게. */
export interface MdHeading {
  level: number;
  text: string;
  offset: number;
  lineLength: number;
}
export function parseHeadingLine(line: string): { level: number; text: string } | null {
  const md = /^(#{1,6})\s+(.+)/.exec(line);
  if (md) return { level: md[1].length, text: md[2].trim() };
  const xml = /^<([a-zA-Z][\w-]*)>\s*$/.exec(line.trim());
  if (xml) return { level: 1, text: xml[1] };
  return null;
}
export function parseMdHeadings(text: string): MdHeading[] {
  const headings: MdHeading[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const parsed = parseHeadingLine(line);
    if (parsed) headings.push({ ...parsed, offset, lineLength: line.length });
    offset += line.length + 1;
  }
  return headings;
}
/** 비교(왼쪽) 텍스트에서 같은 제목의 헤딩을 찾는다 — 버전마다 레벨(#
 *  개수)이나 표기 방식(마크다운 ↔ XML 태그)이 바뀌었을 수 있어 텍스트만
 *  맞춘다(못 찾으면 그 버전엔 이 섹션이 없었다는 뜻 — 조용히 무시). */
export function findHeadingByText(text: string, headingText: string): { offset: number; lineLength: number } | null {
  let offset = 0;
  for (const line of text.split("\n")) {
    const parsed = parseHeadingLine(line);
    if (parsed && parsed.text === headingText) return { offset, lineLength: line.length };
    offset += line.length + 1;
  }
  return null;
}
/** 목차를 눌렀을 때 그 줄이 눈에 띄게 화면 위쪽으로 오도록 직접 스크롤한
 *  다음, 정확한 위치 확인용으로 그 줄을 선택 상태로 만든다 — 2026-09-27,
 *  사용자 재요청: "목차에 뜬 부분을 누르면.. 해당 부분으로 넘어가면
 *  가장 좋을듯요". 처음엔 setSelectionRange+focus만으로 브라우저가 알아서
 *  스크롤해주는 데 맡겼는데, 그건 "선택 영역이 보이기만 하면" 멈춰서 —
 *  이미 살짝 보이는 위치면 거의 안 움직이거나, 화면 아무 데나(맨 아래
 *  등) 걸치는 식으로 스크롤돼 "눌렀는데 그대로인 것 같다"는 인상을 줬다.
 *  줄바꿈(wrap) 렌더와 100% 일치하진 않지만(긴 줄이 여러 줄로 접히면
 *  살짝 어긋날 수 있음), 실제 컴포넌트 라인하이트를 읽어 계산하므로
 *  대부분의 경우 목표 줄을 화면 위쪽 여유 있게 보여준다. */
export function jumpTextareaToHeading(el: HTMLTextAreaElement | null, fullText: string, h: { offset: number; lineLength: number }) {
  if (!el) return;
  const lineNumber = fullText.slice(0, h.offset).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollTop = Math.min(maxScroll, Math.max(0, lineNumber * lineHeight - lineHeight * 2));
  el.focus();
  el.setSelectionRange(h.offset, h.offset + h.lineLength);
}
