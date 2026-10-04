// 레터 본문 문단 배열 → 화면 블록(2026-10-01, "프롬프트를 바꿔 글 구조가 달라져도 자연스럽게" 요청).
//
// 발행 파이프라인(letters 프롬프트)의 출력 형식은 계속 바뀐다 — 소제목이 "◾"였다가 "##"로 바뀌었고, 앞으로
// 마크다운이 더 섞여도 이상하지 않다. 그래서 렌더러가 "정해진 약속"에만 기대지 않고, 흔한 마크다운·변형을 전부
// 읽을 수 있는 형태로 풀어내고, 모르는 모양은 일반 문단으로 안전하게 떨어뜨린다(기호가 화면에 그대로 새지 않게).
//
// 인식하는 것: 소제목(# ~ ###### · ◾ · 한 줄 전체가 굵은 글씨), 불릿(- * •), 번호 목록(1. 1)), 인용(>), 구분선(--- *** ___),
// 빈 줄·빈 소제목(무시). 인라인 **굵게** / *기울임*은 렌더 단계(inline.tsx)가 처리한다.
// UI 프레임워크에 의존하지 않는 순수 함수라 노드 스크립트로 바로 시험할 수 있다(scripts/test-lens-blocks.mjs).

export type LetterBlock =
  | { type: 'lead'; text: string }
  | { type: 'sub'; no: number; head: string; question: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' };

const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const HASH = /^#{1,6}\s*(.*)$/;
const SQUARE = /^◾\s*(.*)$/;
// 한 줄 전체가 굵은 글씨이고 짧으면 소제목으로 본다("**소제목**" / "**소제목:**").
const BOLD_LINE = /^\*\*([^*\n]{1,60}?)\*\*\s*:?$/;
const UL = /^[-*•]\s+(.*)$/;
const OL = /^\d{1,2}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

function splitHeading(text: string): { head: string; question: string } {
  const [head, ...rest] = text.split(/[:：]/);
  return { head: head.trim(), question: rest.join(':').trim() };
}

/** 소제목 줄이면 그 내용을, 아니면 null. 소제목 표식인데 내용이 비면 ''(= 무시 대상). */
function headingText(line: string): string | null {
  const h = HASH.exec(line) ?? SQUARE.exec(line);
  if (h) return h[1].trim();
  const b = BOLD_LINE.exec(line);
  if (b) return b[1].trim();
  return null;
}

export function parseLetterBlocks(paragraphs: string[] | null | undefined, opts: { headline?: string } = {}): LetterBlock[] {
  const blocks: LetterBlock[] = [];
  let subNo = 0;
  const raw = (paragraphs ?? []).map((p) => (p ?? '').trim());

  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (!line) continue;

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      continue;
    }

    const ht = headingText(line);
    if (ht !== null) {
      if (!ht) continue; // 표식만 있고 내용이 없는 소제목은 건너뛴다.
      const { head, question } = splitHeading(ht);
      blocks.push({ type: 'sub', no: subNo, head: head || ht, question });
      subNo += 1;
      continue;
    }

    // 목록 — 연속된 불릿/번호 문단(또는 여러 줄짜리 한 문단)을 한 목록으로 묶는다.
    const ulMatch = UL.exec(line.split('\n')[0]);
    const olMatch = OL.exec(line.split('\n')[0]);
    if (ulMatch || olMatch) {
      const kind = ulMatch ? 'ul' : 'ol';
      const re = ulMatch ? UL : OL;
      const items: string[] = [];
      let j = i;
      while (j < raw.length) {
        const cand = raw[j];
        if (!cand) break;
        const lines = cand.split('\n');
        if (!lines.every((l) => re.test(l.trim()))) break;
        for (const l of lines) items.push((re.exec(l.trim()) as RegExpExecArray)[1].trim());
        j += 1;
      }
      if (items.length > 0) {
        blocks.push({ type: kind, items });
        i = j - 1;
        continue;
      }
    }

    const q = QUOTE.exec(line);
    if (q) {
      // 연속된 인용 줄은 한 인용으로.
      const parts = [q[1].trim()];
      let j = i + 1;
      while (j < raw.length && QUOTE.test(raw[j])) {
        parts.push((QUOTE.exec(raw[j]) as RegExpExecArray)[1].trim());
        j += 1;
      }
      blocks.push({ type: 'quote', text: parts.filter(Boolean).join(' ') });
      i = j - 1;
      continue;
    }

    blocks.push({ type: 'p', text: line });
  }

  // 첫 일반 문단은 도입(lead) — 10/1 발행분부터 첫 문단이 "부서 | 제목 + 부제" 한 줄로 나오므로, 맨 위 제목과
  // 겹치는 앞부분(부서명 접두어 + 제목)은 떼고 남는 부제만 도입으로 쓴다. 남는 게 없으면 그 문단은 숨긴다.
  const firstIdx = blocks.findIndex((b) => b.type === 'p');
  const firstBlock = blocks[0];
  if (firstIdx === 0 && firstBlock.type === 'p') {
    let t = firstBlock.text.replace(/^\s*(?:증권|증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|생활|스포츠|오피니언|IT|과학|건강|교육|환경|노동)\s*[|｜]\s*/, '');
    const h = (opts.headline ?? '').replace(/^\s*(?:증권|증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|생활|스포츠|오피니언|IT|과학|건강|교육|환경|노동)\s*[|｜]\s*/, '').trim();
    if (h && t.startsWith(h)) t = t.slice(h.length).trim();
    if (!t) {
      blocks.shift();
      // 제목 반복 문단을 숨기면 그다음 첫 일반 문단이 도입이 된다.
      const next = blocks[0];
      if (next && next.type === 'p') blocks[0] = { type: 'lead', text: next.text };
    } else {
      blocks[0] = { type: 'lead', text: t };
    }
  }
  return blocks;
}
