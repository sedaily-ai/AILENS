// 용어 설명 사전(목업, 2026-10-11). 레터 본문에 나오면 점선 밑줄과 호버 설명이 붙는다. 설명은 사실 정의만 쓰고 해석·권유는 쓰지 않는다(중립 원칙).
// 정식 단계에서는 레터 생성 규칙의 용어 목록(주제 사전 옆)에서 서버가 내려 준다. 레터 한 편에서 같은 용어는 처음 한 번만 표시한다.
/** 기존 1기사형 레터의 용어 해설과 같은 모양({term, explain}). */
export interface GlossaryEntry { term: string; explain: string }

export const GLOSSARY: readonly GlossaryEntry[] = [
  { term: '젠트리피케이션', explain: '낙후됐던 지역이 인기를 얻어 임대료가 오르면서 기존 상인과 주민이 밀려나는 현상이에요.' },
  { term: '글로벌 리밸런싱', explain: '지역별 성장성에 따라 해외 사업의 자원을 다시 나눠 배치하는 전략이에요.' },
  { term: '리밸런싱', explain: '비중이나 자원 배분을 다시 맞추는 일이에요.' },
  { term: '영업이익', explain: '매출에서 원가와 판매·관리비를 뺀, 본업으로 번 이익이에요.' },
  { term: '당기순이익', explain: '한 해 동안 모든 수익과 비용, 세금을 반영한 최종 이익이에요.' },
  { term: '상가임대차보호법', explain: '상가 세입자의 계약 갱신과 임대료 인상 한도를 정한 법이에요.' },
  { term: '계약갱신요구권', explain: '세입자가 임대 계약을 연장해 달라고 요구할 수 있는 권리예요.' },
  { term: '테마주', explain: '실적과 상관없이 특정 이슈나 소문에 따라 주가가 움직이는 종목을 가리켜요.' },
  { term: '공모가', explain: '주식을 처음 일반에 파는 공모 때 정한 1주당 가격이에요.' },
  { term: '기준금리', explain: '중앙은행이 정하는 금리로, 시중 금리의 기준이 돼요.' },
  { term: '환율', explain: '서로 다른 두 나라 돈을 바꾸는 비율이에요.' },
  { term: 'ETF', explain: '주식처럼 거래소에서 사고팔 수 있는 상장지수펀드예요.' },
];

type Piece = { text: string } | { term: GlossaryEntry; text: string };

/** 본문 문자열을 용어 단위로 나눈다. 레터 한 편 안에서 같은 용어는 처음 한 번만 표시한다(seen 으로 공유).
 *  다른 용어 안에 완전히 들어 있는 후보('글로벌 리밸런싱' 안의 '리밸런싱')는 버리고, 시작이 가장 앞선 것을, 시작이 같으면 더 긴 것을 고른다. */
export function splitByGlossary(text: string, seen: Set<string>): Piece[] {
  const out: Piece[] = [];
  let rest = text;
  while (rest.length > 0) {
    const hits: { idx: number; entry: GlossaryEntry }[] = [];
    for (const entry of GLOSSARY) {
      const idx = rest.indexOf(entry.term);
      if (idx >= 0) hits.push({ idx, entry });
    }
    const kept = hits.filter((h) => !hits.some((o) => o !== h && o.idx <= h.idx && o.idx + o.entry.term.length >= h.idx + h.entry.term.length && o.entry.term.length > h.entry.term.length));
    kept.sort((a, b) => a.idx - b.idx || b.entry.term.length - a.entry.term.length);
    const next = kept.find((h) => !seen.has(h.entry.term));
    if (!next) { out.push({ text: rest }); break; }
    if (next.idx > 0) out.push({ text: rest.slice(0, next.idx) });
    seen.add(next.entry.term);
    out.push({ term: next.entry, text: next.entry.term });
    rest = rest.slice(next.idx + next.entry.term.length);
  }
  return out;
}
