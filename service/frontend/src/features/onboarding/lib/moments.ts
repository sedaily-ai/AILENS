// 온보딩 "하루의 틈" 장면 4개.
// 사람(페르소나)이 아니라 상황(틈)에 포맷을 연결한다. 같은 사람도 점심엔 읽고, 출근길엔 듣고, 자기 전엔 영상을 본다. 이름·나이를 붙이지 않는 것은 "나는 이 사람이 아닌데"라는 거리감을 피하기 위해서이다.
// 장면→포맷 매핑은 가설이며, 선택한 장면과 2주 뒤 실제 가장 많이 본 포맷의 일치율로 검증한다(docs/worklog/2026-10/2026-10-04-온보딩-하루의틈-재설계.md).
// formatIndex는 레터 0 · 웹툰 1 · 팟캐스트 2 · 영상 3(lensPerspectives와 같은 인덱스 기준)이다.

export type MomentId = 'lunch' | 'commute-home' | 'walk' | 'bed';

export interface Moment {
  id: MomentId;
  tag: string;
  /** 결과 제목 앞머리 — "퇴근길 그림 먼저파"의 "퇴근길". */
  short: string;
  /** 카드 한 줄 — 상황. */
  scene: string;
  formatIndex: number;
  /** 결과 화면 유형 이름 — 재미 담당. */
  typeName: string;
  /** 결과 화면 한 줄 설명. */
  typeLine: string;
}

export const MOMENTS: Moment[] = [
  {
    id: 'lunch',
    tag: '#점심 먹고 남은 10분',
    short: '점심',
    scene: '자리에 앉아 있고, 소리는 못 켜요',
    formatIndex: 0,
    typeName: '10분 결론파',
    typeLine: '짧게 앉아 있을 땐 결론부터 읽는 타입이에요.',
  },
  {
    id: 'commute-home',
    tag: '#퇴근길 지하철',
    short: '퇴근길',
    scene: '한 손으로 잡고, 서서 가요',
    formatIndex: 1,
    typeName: '한 손 스토리파',
    typeLine: '지친 퇴근길엔 이야기로 스르륵 보는 타입이에요.',
  },
  {
    id: 'walk',
    tag: '#출근길 걸으며',
    short: '출근길',
    scene: '눈은 길을 보고, 손은 가방에 있어요',
    formatIndex: 2,
    typeName: '귀로 챙기는 파',
    typeLine: '화면 볼 틈이 없을 땐 귀로 챙기는 타입이에요.',
  },
  {
    id: 'bed',
    tag: '#자기 전 침대',
    short: '자기 전',
    scene: '누워서 폰을 들고 있어요',
    formatIndex: 3,
    typeName: '누워서 훑는 파',
    typeLine: '쉬면서 볼 땐 자막과 그래픽으로 훑는 타입이에요.',
  },
];
// ── 질문 2: "그때 뉴스를 열면, 가장 먼저 눈이 가는 건?" (인지 유형) ──────────────────
// 눈이 먼저 가는 곳이 포맷을 정하고, 질문 1의 상황이 "그 상황에서 안 되는 포맷"을 걸러 낸다.
// 어떤 조합이 많은지 자체가 AI LENS의 인지 유형 데이터가 되므로 두 답을 모두 계측한다.
// prefs는 선호 순서(포맷 인덱스: 레터 0 · 웹툰 1 · 팟캐스트 2 · 영상 3).
export type GlanceId = 'text' | 'comic' | 'sound' | 'video';

export interface Glance {
  id: GlanceId;
  label: string;
  hint: string;
  /** 결과 이름 — "퇴근길 + 이것" 형태로 쓴다. */
  name: string;
  /** 결과 한 줄의 앞부분 — 뒤에 "○○로 보여드릴게요"가 붙는다. */
  hook: string;
  prefs: number[];
}

// 선택지는 4개, 순서는 형식 순서(읽기 → 웹툰 → 듣기 → 영상)를 따른다. 숫자·표에 먼저 눈이 가는 사람은 통계·차트 컷을 가장 많이 보여 주는 영상 설명에 녹였다.
export const GLANCES: Glance[] = [
  { id: 'text', label: '제목과 글', hint: '제목을 읽고 본문을 훑어요', name: '글 먼저파', hook: '글부터 읽는 분이시네요.', prefs: [0] },
  { id: 'comic', label: '그림과 사진', hint: '컷으로 된 그림과 사진부터 봐요', name: '그림 먼저파', hook: '그림과 사진에 먼저 눈이 가는 분이시네요.', prefs: [1] },
  { id: 'sound', label: '소리', hint: '듣는 게 편해서 음성부터 찾아요', name: '소리 먼저파', hook: '귀로 먼저 챙기는 분이시네요.', prefs: [2] },
  { id: 'video', label: '영상', hint: '움직이는 화면과 그래프에 눈이 가요', name: '영상 먼저파', hook: '움직이는 화면에 먼저 눈이 가는 분이시네요.', prefs: [3] },
];
/** 질문 1 상황에서 쓸 수 없는 포맷(안 되는 이유) — 점심: 소리 불가, 걷기: 눈을 못 씀. */
const BLOCKED: Record<MomentId, Record<number, string>> = {
  lunch: { 2: '조용한 자리에선 소리를 못 켜니' },
  'commute-home': {},
  walk: { 0: '걸을 땐 눈을 못 쓰니', 1: '걸을 땐 눈을 못 쓰니', 3: '걸을 땐 눈을 못 쓰니' },
  bed: {},
};

export interface Resolved {
  formatIndex: number;
  /** 눈이 먼저 가는 곳 그대로 쓸 수 없어 상황에 맞게 바꿨다면 그 이유(예: "걸을 땐 눈을 못 쓰니"). */
  reason: string | null;
}

export function resolveFormat(moment: Moment, glance: Glance): Resolved {
  const blocked = BLOCKED[moment.id];
  const ok = glance.prefs.find((f) => !(f in blocked));
  if (ok !== undefined) return { formatIndex: ok, reason: null };
  // 선호 포맷이 모두 막힌 상황 — 그 상황에서 되는 기본 포맷으로 대체하고 이유를 알린다.
  return { formatIndex: moment.formatIndex, reason: blocked[glance.prefs[0]] ?? null };
}

/** 결과 화면 제목 — "퇴근길엔 그림부터". 통계 카드의 막대 이름("그림부터")과 같은 말을 써서 한 번에 이어 읽히게 한다. */
const FIRST_LABEL: Record<GlanceId, string> = { text: '글부터', comic: '그림부터', sound: '소리부터', video: '영상부터' };
export function resultTitle(moment: Moment, glance: Glance): string {
  return `${moment.short}엔 ${FIRST_LABEL[glance.id]}`;
}


/** 1단계 카드에 간접적으로 녹이는 MBTI 예시 — "이 시간을 자주 떠올릴 성향" 정도의 가벼운 힌트(근거 데이터 없는 가설, 선택 항목 아님). */
export const MOMENT_MBTI: Record<MomentId, [string, string]> = {
  lunch: ['ISTJ', 'ENTJ'],
  'commute-home': ['INFP', 'ENFP'],
  walk: ['ESFJ', 'ENTP'],
  bed: ['INFJ', 'ISFP'],
};

/** 2단계 카드에 간접적으로 녹이는 MBTI 예시 — 눈이 먼저 가는 곳과 어울릴 법한 성향의 가벼운 힌트(근거 데이터 없는 가설, 선택 항목 아님). */
export const GLANCE_MBTI: Record<GlanceId, [string, string]> = {
  text: ['ISTJ', 'INTJ'],
  comic: ['INFP', 'ISFP'],
  sound: ['ENFJ', 'ESFJ'],
  video: ['ENTP', 'ESTP'],
};
