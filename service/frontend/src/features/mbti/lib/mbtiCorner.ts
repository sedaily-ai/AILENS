// MBTI 코너("MBTI로 보는 오늘의 뉴스") 순수 로직 — 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
//
// ⚠️ scripts/test-mbti.mjs가 `node --experimental-strip-types`로 이 파일을 직접 불러온다. 런타임 import를
// 두지 않는다(@/ 별칭은 노드가 못 푼다). `import type`은 실행 전에 지워지므로 괜찮다.
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISTP', 'ESTJ', 'ESTP',
  'ISFJ', 'ISFP', 'ESFJ', 'ESFP',
] as const;
export type MbtiType = (typeof MBTI_TYPES)[number];

/** 고르기 격자·다른 유형 링크의 그룹 순서. MBTI_TYPES도 이 순서로 4개씩 묶여 있다. */
export const MBTI_GROUP_ORDER: readonly MbtiGroupId[] = ['NT', 'NF', 'ST', 'SF'];

export function parseMbtiType(raw: string | null | undefined): MbtiType | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  return (MBTI_TYPES as readonly string[]).includes(up) ? (up as MbtiType) : null;
}

/** 가운데 두 글자(인식 S/N + 판단 T/F)가 인지유형 그룹이다. INTJ → NT. */
export function groupOfType(type: MbtiType): MbtiGroupId {
  return (type[1] + type[2]) as MbtiGroupId;
}

export function typesOfGroup(group: MbtiGroupId): MbtiType[] {
  return MBTI_TYPES.filter((t) => groupOfType(t) === group);
}

export function parseGroupSlug(raw: string | null | undefined): MbtiGroupId | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  return (MBTI_GROUP_ORDER as readonly string[]).includes(up) ? (up as MbtiGroupId) : null;
}

export function groupSlug(group: MbtiGroupId): string {
  return group.toLowerCase();
}

export interface MbtiGroupInfo {
  group: MbtiGroupId;
  /** 결과 카드 제목 */
  title: string;
  /** 결과 카드 한 줄 설명 */
  summary: string;
  /** lensPerspectives 인덱스 — 레터 0 → 웹툰 1 → 팟캐스트 2 → 영상 3(인덱스 기준, 라벨 문자열 매칭 금지) */
  formatIndex: number;
}

export const MBTI_GROUP_INFO: Record<MbtiGroupId, MbtiGroupInfo> = {
  NT: { group: 'NT', title: '구조부터 보는 분석가형', summary: '왜 이렇게 됐고 다음엔 뭐가 올지, 흐름을 짚어 봐요', formatIndex: 0 },
  NF: { group: 'NF', title: '의미를 찾는 이야기형', summary: '이 뉴스가 사람들에게 어떤 의미인지 이야기로 만나요', formatIndex: 1 },
  SF: { group: 'SF', title: '사람에 공감하는 대화형', summary: '누가 어떻게 겪고 있는지, 대화로 들어요', formatIndex: 2 },
  ST: { group: 'ST', title: '사실로 보는 실용형', summary: '무엇이 얼마나 바뀌었는지, 핵심만 빠르게 봐요', formatIndex: 3 },
};

/** 이슈 카드 버튼 문구. 조사(로/으로)와 동사가 형식마다 달라 통째로 둔다. 인덱스 = formatIndex. */
export const FORMAT_CTA: readonly string[] = ['레터로 읽기', '웹툰으로 보기', '팟캐스트로 듣기', '영상으로 보기'];

/** 기사 상세 딥링크 번호. `?v=N`은 1부터 센다(shared/constants/lensPerspectives.ts의 parseLensView). */
export function viewParamOf(group: MbtiGroupId): number {
  return MBTI_GROUP_INFO[group].formatIndex + 1;
}

export function issueHref(path: string, group: MbtiGroupId): string {
  return `${path}${path.includes('?') ? '&' : '?'}v=${viewParamOf(group)}`;
}

export function resultPath(group: MbtiGroupId, type?: MbtiType | null): string {
  const base = `/mbti/${groupSlug(group)}`;
  return type ? `${base}?t=${type.toLowerCase()}` : base;
}

/** `?t`는 16유형이면서 그 그룹에 속할 때만 표시한다(공유 링크 위조·불일치 대비). */
export function displayTypeFor(group: MbtiGroupId, raw: string | null | undefined): MbtiType | null {
  const type = parseMbtiType(raw);
  return type && groupOfType(type) === group ? type : null;
}

// ── 간단 성향 체크 ─────────────────────────────────────────────
// 축마다 기본 2문항. 두 답이 같으면 그 답, 갈리면 보충 질문 1개를 더 물어 2:1 다수결로 정한다.
// 그래서 모든 답이 결과에 반영되고, 일관되게 답한 사람은 4문항에서 끝난다(최대 6문항).
export type QuickCheckAxis = 'SN' | 'TF';
export type QuickCheckId = 'sn1' | 'sn2' | 'sn3' | 'tf1' | 'tf2' | 'tf3';
export type QuickCheckChoice = 'a' | 'b';
export type QuickCheckAnswers = Partial<Record<QuickCheckId, QuickCheckChoice>>;

export interface QuickCheckQuestion {
  id: QuickCheckId;
  axis: QuickCheckAxis;
  /** 그 축의 앞 두 답이 갈릴 때만 묻는 보충 질문 */
  tiebreak: boolean;
  prompt: string;
  /** 축의 앞 글자(S·T) 쪽 선택지 */
  a: string;
  /** 축의 뒤 글자(N·F) 쪽 선택지 */
  b: string;
}

export const QUICK_CHECK: readonly QuickCheckQuestion[] = [
  { id: 'sn1', axis: 'SN', tiebreak: false, prompt: '뉴스에서 먼저 눈이 가는 건?', a: '정확한 숫자와 사실', b: '이 일이 어디로 이어질지' },
  { id: 'sn2', axis: 'SN', tiebreak: false, prompt: '친구에게 뉴스를 전할 때 나는?', a: '무슨 일이 있었는지 그대로', b: '이게 왜 중요한지부터' },
  { id: 'sn3', axis: 'SN', tiebreak: true, prompt: '새 정책 뉴스를 보면 먼저 찾는 건?', a: '언제부터, 누가, 얼마나 받는지', b: '이 정책이 앞으로 무엇을 바꿀지' },
  { id: 'tf1', axis: 'TF', tiebreak: false, prompt: '같은 뉴스라도 더 궁금한 건?', a: '원인과 결과, 누가 이득인지', b: '이 일로 누가 어떤 영향을 받는지' },
  { id: 'tf2', axis: 'TF', tiebreak: false, prompt: '좋은 해설이란?', a: '논리가 딱 맞아떨어지는 해설', b: '사람 사는 이야기가 느껴지는 해설' },
  { id: 'tf3', axis: 'TF', tiebreak: true, prompt: '의견이 갈리는 뉴스를 볼 때 나는?', a: '어느 쪽 근거가 더 탄탄한지 따져 봐요', b: '양쪽 사람들의 사정이 먼저 궁금해요' },
];

function axisQuestions(axis: QuickCheckAxis): QuickCheckQuestion[] {
  return QUICK_CHECK.filter((q) => q.axis === axis);
}

/** 축의 결과 글자. 앞 두 답이 같으면 그 답, 갈리면 보충 질문 답. 아직 모자라면 null. */
function axisLetter(axis: QuickCheckAxis, answers: QuickCheckAnswers): string | null {
  const [q1, q2, q3] = axisQuestions(axis);
  const c1 = answers[q1.id];
  const c2 = answers[q2.id];
  if (!c1 || !c2) return null;
  const pick = c1 === c2 ? c1 : answers[q3.id];
  if (!pick) return null;
  return pick === 'a' ? axis[0] : axis[1];
}

/** 다음에 물을 질문. 끝났으면 null. S/N 축을 끝낸 뒤 T/F 축으로 간다. */
export function nextQuickCheckQuestion(answers: QuickCheckAnswers): QuickCheckQuestion | null {
  for (const axis of ['SN', 'TF'] as const) {
    const [q1, q2, q3] = axisQuestions(axis);
    if (!answers[q1.id]) return q1;
    if (!answers[q2.id]) return q2;
    if (answers[q1.id] !== answers[q2.id] && !answers[q3.id]) return q3;
  }
  return null;
}

export function scoreQuickCheck(answers: QuickCheckAnswers): MbtiGroupId | null {
  const sn = axisLetter('SN', answers);
  const tf = axisLetter('TF', answers);
  return sn && tf ? ((sn + tf) as MbtiGroupId) : null;
}

// ── 오늘의 이슈 ──────────────────────────────────────────────
/** pickTodayIssues가 읽는 필드만. CmsLens(shared/lib/api/cmsPostsApi)가 구조적으로 맞는다. */
export interface IssueSource {
  id: string;
  /** 'YYYY-MM-DD' 발행일(KST) */
  date: string;
  paper_section?: string | null;
}

/** 홈 LensPreviewSection의 SECTIONS와 같은 지면 값·순서. */
const PAPER_SECTIONS: readonly string[] = ['전체', '증권', '산업', '시그널'];
const PAPER_SECTION_LABELS: Record<string, string> = { 전체: '지면 1면', 증권: '증권 1면', 산업: '산업 1면', 시그널: '시그널 1면' };

export function sectionLabel(section: string | null | undefined): string {
  return (section && PAPER_SECTION_LABELS[section]) || '이슈';
}

export interface TodayIssuesPick<T> {
  issues: T[];
  latestDate: string | null;
  isToday: boolean;
}

/**
 * 오늘의 이슈 고르기(설계 2-④).
 * 1) 최신 발행일 글이 후보. 4건 미만이면 이전 날짜 글을 최신순으로 이어 붙인다(아침 7시 전 등).
 * 2) 지면 순서 [전체·증권·산업·시그널]마다 1건씩.
 * 3) 빈 자리는 남은 후보를 최신순으로 채운다.
 * 같은 날짜 안에서는 API 순서를 유지하고, 같은 글은 두 번 고르지 않는다.
 */
export function pickTodayIssues<T extends IssueSource>(posts: readonly T[], todayKst: string, count = 4): TodayIssuesPick<T> {
  const sorted = posts
    .map((post, i) => ({ post, i }))
    .sort((x, y) => (x.post.date === y.post.date ? x.i - y.i : x.post.date < y.post.date ? 1 : -1))
    .map((x) => x.post);
  if (sorted.length === 0) return { issues: [], latestDate: null, isToday: false };

  const latestDate = sorted[0].date;
  const latest = sorted.filter((p) => p.date === latestDate);
  const candidates = latest.length >= count ? latest : sorted;

  const picked: T[] = [];
  const used = new Set<string>();
  for (const section of PAPER_SECTIONS) {
    const hit = candidates.find((p) => p.paper_section === section && !used.has(p.id));
    if (hit) {
      picked.push(hit);
      used.add(hit.id);
    }
  }
  for (const p of candidates) {
    if (picked.length >= count) break;
    if (!used.has(p.id)) {
      picked.push(p);
      used.add(p.id);
    }
  }
  return { issues: picked.slice(0, count), latestDate, isToday: latestDate === todayKst };
}

export function issuesDateLabel(pick: { latestDate: string | null; isToday: boolean }): string {
  if (!pick.latestDate) return '';
  if (pick.isToday) return '오늘 지면';
  const [, m, d] = pick.latestDate.split('-');
  return `최신 지면 · ${Number(m)}월 ${Number(d)}일`;
}

// ── 저장값 ──────────────────────────────────────────────────
export interface SavedMbti {
  type: MbtiType | null;
  group: MbtiGroupId;
}

/** 저장값("INTJ" 또는 체크로 찾은 "NT")을 해석한다. 알 수 없는 값은 null. */
export function parseSavedMbti(raw: string | null | undefined): SavedMbti | null {
  const type = parseMbtiType(raw);
  if (type) return { type, group: groupOfType(type) };
  const group = parseGroupSlug(raw);
  return group ? { type: null, group } : null;
}

export function savedShortcutLabel(saved: SavedMbti): string {
  return saved.type ? `지난번 ${saved.type}(${saved.group}형)로 보기` : `지난번 ${saved.group}형으로 보기`;
}
