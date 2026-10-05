// MBTI 코너 순수 로직 시험 — `npm run test:mbti` (node --experimental-strip-types)
// 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
import assert from 'node:assert/strict';
import {
  MBTI_TYPES, MBTI_GROUP_ORDER, MBTI_GROUP_INFO, FORMAT_CTA, QUICK_CHECK,
  parseMbtiType, groupOfType, typesOfGroup, parseGroupSlug, groupSlug,
  viewParamOf, issueHref, resultPath, displayTypeFor,
  nextQuickCheckQuestion, scoreQuickCheck,
  pickTodayIssues, issuesDateLabel, sectionLabel,
  parseSavedMbti, savedShortcutLabel,
} from '../src/features/mbti/lib/mbtiCorner.ts';

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log('ok -', name); };

t('16유형 → 4그룹(가운데 두 글자)', () => {
  assert.equal(MBTI_TYPES.length, 16);
  assert.deepEqual(typesOfGroup('NT'), ['INTJ', 'INTP', 'ENTJ', 'ENTP']);
  assert.deepEqual(typesOfGroup('NF'), ['INFJ', 'INFP', 'ENFJ', 'ENFP']);
  assert.deepEqual(typesOfGroup('ST'), ['ISTJ', 'ISTP', 'ESTJ', 'ESTP']);
  assert.deepEqual(typesOfGroup('SF'), ['ISFJ', 'ISFP', 'ESFJ', 'ESFP']);
  for (const type of MBTI_TYPES) assert.equal(groupOfType(type), type[1] + type[2]);
});

t('유형 문자열 해석: 대소문자·공백 허용, 그 밖은 null', () => {
  assert.equal(parseMbtiType('intj'), 'INTJ');
  assert.equal(parseMbtiType(' Enfp '), 'ENFP');
  for (const bad of ['XXXX', 'NT', '', '<script>', null, undefined]) assert.equal(parseMbtiType(bad), null);
});

t('그룹 슬러그 왕복', () => {
  for (const g of MBTI_GROUP_ORDER) assert.equal(parseGroupSlug(groupSlug(g)), g);
  assert.equal(parseGroupSlug('xx'), null);
  assert.equal(parseGroupSlug(undefined), null);
});

t('그룹 → 형식 인덱스·?v 번호·버튼 문구', () => {
  assert.deepEqual(MBTI_GROUP_ORDER.map((g) => [g, MBTI_GROUP_INFO[g].formatIndex, viewParamOf(g)]), [
    ['NT', 0, 1], ['NF', 1, 2], ['ST', 3, 4], ['SF', 2, 3],
  ]);
  assert.deepEqual(FORMAT_CTA, ['레터로 읽기', '웹툰으로 보기', '팟캐스트로 듣기', '영상으로 보기']);
});

t('기사 링크에 ?v 붙이기(기존 쿼리 보존)', () => {
  assert.equal(issueHref('/markets/2026/10/04/a', 'NF'), '/markets/2026/10/04/a?v=2');
  assert.equal(issueHref('/x?ref=mbti', 'ST'), '/x?ref=mbti&v=4');
});

t('결과 경로', () => {
  assert.equal(resultPath('NT', 'INTJ'), '/mbti/nt?t=intj');
  assert.equal(resultPath('SF'), '/mbti/sf');
  assert.equal(resultPath('SF', null), '/mbti/sf');
});

t('?t 표시: 16유형이면서 그 그룹일 때만(위조 대비)', () => {
  assert.equal(displayTypeFor('NT', 'intj'), 'INTJ');
  assert.equal(displayTypeFor('NT', 'esfp'), null);
  assert.equal(displayTypeFor('NT', '<script>'), null);
  assert.equal(displayTypeFor('NT', null), null);
});

// 간단 성향 체크 — 6개 답의 64가지 조합을 실제 흐름(다음 질문 → 답)대로 돌린다.
const LETTER = { sn: ['S', 'N'], tf: ['T', 'F'] };
t('간단 성향 체크: 모든 조합에서 축별 다수결, 앞 두 답이 같으면 4문항', () => {
  const order = ['sn1', 'sn2', 'sn3', 'tf1', 'tf2', 'tf3'];
  for (let mask = 0; mask < 64; mask++) {
    const scripted = Object.fromEntries(order.map((id, i) => [id, (mask >> i) & 1 ? 'b' : 'a']));
    const answers = {};
    const asked = [];
    for (let guard = 0; guard < 10; guard++) {
      const q = nextQuickCheckQuestion(answers);
      if (!q) break;
      assert.equal(scoreQuickCheck(answers), null, '끝나기 전엔 결과가 없다');
      asked.push(q.id);
      answers[q.id] = scripted[q.id];
    }
    const axis = (k) => {
      const [a1, a2, a3] = [scripted[`${k}1`], scripted[`${k}2`], scripted[`${k}3`]];
      return LETTER[k][(a1 === a2 ? a1 : a3) === 'a' ? 0 : 1];
    };
    assert.equal(scoreQuickCheck(answers), axis('sn') + axis('tf'), `mask ${mask}`);
    const splits = (scripted.sn1 !== scripted.sn2 ? 1 : 0) + (scripted.tf1 !== scripted.tf2 ? 1 : 0);
    assert.equal(asked.length, 4 + splits, `mask ${mask} 질문 수`);
  }
});

t('간단 성향 체크: 보충 질문은 앞 두 답이 갈렸을 때만', () => {
  assert.equal(nextQuickCheckQuestion({ sn1: 'a', sn2: 'a' }).id, 'tf1');
  assert.equal(nextQuickCheckQuestion({ sn1: 'a', sn2: 'b' }).id, 'sn3');
  assert.equal(QUICK_CHECK.filter((q) => q.tiebreak).length, 2);
});

const post = (id, date, section = null) => ({ id, date, paper_section: section });

t('오늘의 이슈: 지면 순서대로 1건씩, 오늘이면 isToday', () => {
  const posts = [post('g1', '2026-10-05'), post('s', '2026-10-05', '시그널'), post('m', '2026-10-05', '증권'), post('f', '2026-10-05', '전체'), post('i', '2026-10-05', '산업')];
  const r = pickTodayIssues(posts, '2026-10-05');
  assert.deepEqual(r.issues.map((p) => p.id), ['f', 'm', 'i', 's']);
  assert.equal(r.latestDate, '2026-10-05');
  assert.equal(r.isToday, true);
  assert.equal(issuesDateLabel(r), '오늘 지면');
});

t('오늘의 이슈: 빈 지면은 같은 날 남은 글로 채우고 중복 없음', () => {
  const posts = [post('f', '2026-10-05', '전체'), post('f', '2026-10-05', '전체'), post('g1', '2026-10-05'), post('g2', '2026-10-05'), post('m', '2026-10-05', '증권')];
  assert.deepEqual(pickTodayIssues(posts, '2026-10-05').issues.map((p) => p.id), ['f', 'm', 'g1', 'g2']);
});

t('오늘의 이슈: 최신 날짜 글이 4건 미만이면 이전 날짜로 보충(아침 7시 전)', () => {
  const posts = [post('old1', '2026-10-03', '증권'), post('new', '2026-10-04', '전체'), post('old2', '2026-10-03'), post('old3', '2026-10-03')];
  const r = pickTodayIssues(posts, '2026-10-05');
  assert.deepEqual(r.issues.map((p) => p.id), ['new', 'old1', 'old2', 'old3']);
  assert.equal(r.latestDate, '2026-10-04');
  assert.equal(r.isToday, false);
  assert.equal(issuesDateLabel(r), '최신 지면 · 10월 4일');
});

t('오늘의 이슈: 같은 날짜 안에서는 API 순서 유지', () => {
  const posts = [post('b', '2026-10-05'), post('a', '2026-10-05'), post('c', '2026-10-05'), post('d', '2026-10-05')];
  assert.deepEqual(pickTodayIssues(posts, '2026-10-05').issues.map((p) => p.id), ['b', 'a', 'c', 'd']);
});

t('오늘의 이슈: 0건', () => {
  const r = pickTodayIssues([], '2026-10-05');
  assert.deepEqual(r, { issues: [], latestDate: null, isToday: false });
  assert.equal(issuesDateLabel(r), '');
});

t('지면 이름', () => {
  assert.equal(sectionLabel('전체'), '지면 1면');
  assert.equal(sectionLabel('시그널'), '시그널 1면');
  assert.equal(sectionLabel(null), '이슈');
  assert.equal(sectionLabel('기타'), '이슈');
});

t('저장값 해석과 바로가기 문구', () => {
  assert.deepEqual(parseSavedMbti('INTJ'), { type: 'INTJ', group: 'NT' });
  assert.deepEqual(parseSavedMbti('NT'), { type: null, group: 'NT' });
  assert.equal(parseSavedMbti('garbage'), null);
  assert.equal(parseSavedMbti(null), null);
  assert.equal(savedShortcutLabel({ type: 'INTJ', group: 'NT' }), '지난번 INTJ(NT형)로 보기');
  assert.equal(savedShortcutLabel({ type: null, group: 'NT' }), '지난번 NT형으로 보기');
});

console.log(`\n${n} tests passed`);
