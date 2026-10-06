// 제목에서 부서명 접두어를 뗀다.
//
// 발행 제목이 "산업 | 노로바이러스 백신 개발…"처럼 부서명을 접두어로 달고 나온다(파이프라인 출력 형식).
// 카테고리 라벨·아이브로우가 이미 같은 정보를 보여 줘서 "산업 산업 |"로 겹쳐 보이므로 뗀다.
// - displayHeadline: 화면 표시용. 접두어만 뗀다(이모지는 지면의 일부라 유지).
// - seoHeadline: <title>·og·JSON-LD·RSS·사이트맵·공유 텍스트·alt처럼 밖으로 나가는 곳용. 접두어 + 이모지를 뗀다(검색 결과 제목이 길게 잘리는 것을 막는다).
// 원본 데이터(CMS headline)는 건드리지 않아 기존 발행분에도 바로 적용된다.
//
// 부서명 목록에 해당할 때만 뗀다("단독 |"처럼 의미가 있는 머리말은 지우지 않는다).
// 목록은 실데이터의 접두사(산업·금융·국제·사회·경제·부동산·정치·생활·문화·증권)로 정했다.
// lensBlocks.ts에 같은 정규식이 한 벌 더 있으니 목록을 바꾸면 둘 다 고칠 것.
const SECTION_PREFIX = /^\s*(?:증권|증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|생활|스포츠|오피니언|IT|과학|건강|교육|환경|노동)\s*[|｜]\s*/;

// 이모지 본체 + 변형 선택자·ZWJ·키캡·피부색 수식자. 한글·숫자·기호(?, %, ·)는 건드리지 않는다.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;

/** 제목 접두어의 부서명("사회 | …" → "사회"). 분류(category) 값이 비어 있는 글의 대체 라벨로 쓴다. 없으면 null. */
export function headlineSection(headline: string): string | null {
  const m = /^\s*(증권|증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|생활|스포츠|오피니언|IT|과학|건강|교육|환경|노동)\s*[|｜]/.exec(headline);
  return m ? m[1] : null;
}

export function displayHeadline(headline: string): string {
  const out = headline.replace(SECTION_PREFIX, '');
  return out.trim() ? out : headline;
}

export function seoHeadline(headline: string): string {
  const base = displayHeadline(headline);
  const out = base.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
  return out || base;
}
