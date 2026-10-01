// 화면에 보이는 제목에서 부서명 접두어를 뗀다(2026-10-01, 사용자 결정).
//
// 발행 제목이 "산업 | 노로바이러스 백신 개발…"처럼 부서명을 접두어로 달고 나온다(10/1 발행분부터
// 파이프라인 출력 형식). 카테고리 라벨·아이브로우가 이미 같은 정보를 보여줘서 "산업 산업 |"로
// 겹쳐 보이고 지면이 지저분해진다. 표시용으로만 떼고 원본 제목은 건드리지 않는다 — <title>·
// JSON-LD·RSS·사이트맵·공유 텍스트·이미지 alt 같은 SEO/외부 노출용은 원문 그대로 둔다.
//
// 부서명 목록에 해당할 때만 뗀다 — "단독 |"처럼 의미가 있는 머리말은 지우지 않기 위해서다.
const SECTION_PREFIX = /^\s*(?:증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|스포츠|오피니언)\s*[|｜]\s*/;

export function displayHeadline(headline: string): string {
  const out = headline.replace(SECTION_PREFIX, '');
  return out.trim() ? out : headline;
}
