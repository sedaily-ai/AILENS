// 레터 본문 파서(lensBlocks.ts) 단위 시험 — `node --experimental-strip-types scripts/test-lens-blocks.mjs`
// 프롬프트가 바뀌어 본문 형식이 달라져도 화면에 마크다운 기호가 새지 않고 구조가 유지되는지 확인한다.
import assert from 'node:assert/strict';
import { parseLetterBlocks } from '../src/app/(economy)/_shared/components/format/lensBlocks.ts';

const types = (bs) => bs.map((b) => b.type).join(',');
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };

t('## / ### / ◾ 소제목과 "제목: 질문" 분리', () => {
  const bs = parseLetterBlocks(['도입이에요.', '## 매각: 무슨 일이에요?', '본문', '### 이력', '◾ 공정: 어떻게?', '본문2']);
  assert.equal(types(bs), 'lead,sub,p,sub,sub,p');
  assert.deepEqual(bs[1], { type: 'sub', no: 0, head: '매각', question: '무슨 일이에요?' });
  assert.deepEqual(bs[3], { type: 'sub', no: 1, head: '이력', question: '' });
  assert.equal(bs[4].no, 2);
});
t('한 줄 전체가 굵은 글씨면 소제목', () => {
  const bs = parseLetterBlocks(['도입', '**굵은 소제목**', '본문']);
  assert.equal(types(bs), 'lead,sub,p');
  assert.equal(bs[1].head, '굵은 소제목');
});
t('문장 속 굵게는 소제목이 아니다', () => {
  const bs = parseLetterBlocks(['도입', '이 문단에는 **굵은 강조**가 있어요.']);
  assert.equal(types(bs), 'lead,p');
});
t('불릿·번호 목록을 연속 문단 단위로 묶는다', () => {
  const bs = parseLetterBlocks(['도입', '- 가', '- 나', '1. 하나', '2) 둘']);
  assert.equal(types(bs), 'lead,ul,ol');
  assert.deepEqual(bs[1].items, ['가', '나']);
  assert.deepEqual(bs[2].items, ['하나', '둘']);
});
t('여러 줄짜리 한 문단의 목록', () => {
  const bs = parseLetterBlocks(['도입', '- 가\n- 나\n- 다']);
  assert.deepEqual(bs[1].items, ['가', '나', '다']);
});
t('인용과 구분선', () => {
  const bs = parseLetterBlocks(['도입', '> 한 줄', '> 두 줄', '---', '끝']);
  assert.equal(types(bs), 'lead,quote,hr,p');
  assert.equal(bs[1].text, '한 줄 두 줄');
});
t('빈 값·내용 없는 소제목 표식은 건너뛴다', () => {
  const bs = parseLetterBlocks(['', '##', '## ', '◾', '   ', '본문', '## 끝 제목:']);
  assert.equal(types(bs), 'lead,sub');
  assert.equal(bs[1].head, '끝 제목');
  assert.equal(bs[1].no, 0);
});
t('첫 문단이 "부서 | 제목 + 부제"면 제목을 떼고 부제만 도입으로', () => {
  const bs = parseLetterBlocks(['산업 | 삼락열처리 매각, 아니라고? 주관사는 준비, 회사는 아니래요', '## 구간: 질문?', '본문'], { headline: '산업 | 삼락열처리 매각, 아니라고?' });
  assert.equal(bs[0].type, 'lead');
  assert.equal(bs[0].text, '주관사는 준비, 회사는 아니래요');
});
t('첫 문단이 제목뿐이면 숨긴다', () => {
  const bs = parseLetterBlocks(['산업 | 제목만', '본문'], { headline: '산업 | 제목만' });
  assert.equal(types(bs), 'lead');
  assert.equal(bs[0].text, '본문');
});
t('null/빈 배열도 안전', () => {
  assert.deepEqual(parseLetterBlocks(null), []);
  assert.deepEqual(parseLetterBlocks([]), []);
});
t('좌우 비교 표기는 compare 블록으로, 한 가지만·에디터 노트는 box로', () => {
  const bs = parseLetterBlocks([
    '도입이에요.',
    '◾ ⚖️ 갈리는 전망: 앞으로는 어떻게 보나요?',
    '전망이 갈려요. 【A: 올라갈 근거】 첫째예요. 둘째예요. 【B: 반등 어려운 근거】 금리가 높아요. 【/】 결국 금리가 변수예요.',
    '◾ 💡 한 가지만 기억한다면',
    '금리를 보세요.',
    '◾ 🗳️ 투표: 어떻게 보세요',
    '① 사는 때 ② 대기',
  ]);
  const cmp = bs.find((b) => b.type === 'compare');
  assert.equal(cmp.intro, '전망이 갈려요.');
  assert.equal(cmp.a.label, '올라갈 근거');
  assert.equal(cmp.b.text, '금리가 높아요.');
  assert.equal(cmp.outro, '결국 금리가 변수예요.');
  assert.deepEqual(bs.filter((b) => b.type === 'box').map((b) => b.kind), ['takeaway', 'vote']);
});
t('짝이 안 맞는 표기는 일반 문단으로 둔다', () => {
  const bs = parseLetterBlocks(['도입', '## 구간: 질문?', '【A: 한쪽만】 내용']);
  assert.equal(bs.some((b) => b.type === 'compare'), false);
});
console.log(`\n${n} tests passed`);
