/**
 * 그날 지면 30건을 화면에 배치할 수 있는 형태로 가른다.
 *
 * ══ API 가 주는 순서에는 의미가 없다 ═══════════════════════════
 * 처음엔 "빅카인즈가 주는 순서가 그날 지면의 편집 서열"이라고 가정했다.
 * 틀렸다. news_id 를 까보면 `02100311.20160316203759254` 인데, 뒷부분은
 * **2016-03-16 20:37:59.254** — 2003년 지면을 2016년에 디지털화한 시각이다.
 * 발행 순서가 아니다. 게다가 오름차순도 내림차순도 아니고, 카테고리 전환이
 * 29번 중 25번이라 지면 섹션 순서도 아니다(2003-03-18 실측).
 *
 * 결정적 증거는 화면에 있었다 — 앞 5건만 잘라 보여주는데 **두 번째가
 * "金炳柱씨(대우증권 RB사업지원팀 과장) 빙부상"** 이었다. 실제 지면 순서라면
 * 부고가 2번째에 올 수 없다.
 *
 * 그래서 이 모듈은 순서를 신뢰하지 않는다.
 *
 * ══ 그럼 무엇을 근거로 고르나 ═════════════════════════════════
 * 쓸 수 있는 필드는 제목·본문 150자·바이라인·카테고리·링크뿐이다. 조회수도,
 * 지면 면수도, 발행 시각도 없다(이 API 는 어느 시대 기사든 시각이 자정 고정).
 *
 * 이 다섯 개로 **중요도**를 매기는 건 불가능하다. 시도해봤더니 컬럼
 * ([장선화기자의 생활인터넷])이 그날의 금융 사건(펀드환매 제한·거부 속출)
 * 위로 올라갔다. 그래서 중요도는 포기하고 두 가지만 판단한다.
 *
 *  (1) **지면 채움인가** — 부고·인사발령·거래소 공시는 기사가 아니다.
 *      패턴이 뚜렷해서 오탐 없이 걸러진다(실측 30건에서 오탐 0·미탐 0).
 *  (2) **분량이 있는가** — 제목이 길고, 본문이 잘릴 만큼 길고, 바이라인이
 *      있으면 신문이 지면을 더 준 기사다. 이건 "중요하다"가 아니라
 *      "실린 분량이 크다"는 관찰이다. 화면에서도 그렇게만 쓴다 —
 *      카드에는 카테고리만 붙이고 "머리기사" 같은 말을 쓰지 않는다.
 *
 * 그리고 **어느 것도 버리지 않는다.** 채움도 접힌 영역에서 전부 볼 수 있다.
 * 아카이브에서 기사가 사라지면 그게 더 큰 문제다.
 */

/** 이 모듈이 필요한 최소 형태. BigKindsArticle 을 import 하지 않아 순수하게 유지한다. */
export interface RankableArticle {
  title: string;
  content: string;
  byline?: string;
  category: string;
}

/* ══ (1) 지면 채움 판별 ═══════════════════════════════════════════ */

/** 경조사·인사발령. 사람 이름과 직함이 들어가지만 기사는 아니다. */
const CEREMONY = /빙부상|빙모상|장인상|장모상|모친상|부친상|시부상|시모상|처제상|별세|부고|영결|인사발령/;

/** 지면 고정 코너 중 목록형 — 제목이 종목명 나열이라 읽을 문장이 없다. */
const BULLETIN = /\[\s*거래소\s*(공시|메모)\s*\]|\[\s*(공시|증시메모|시황메모)\s*\]/;

/** 본문이 이 기호로 시작하면 인사·부고 나열이다(◇국무조정실 (이사관 승진)▲…). */
const LIST_GLYPH = /^[◇▲△▶■□●○]/;

/**
 * 제목이 기관·기업명 하나로 끝나는 공시 토막인지.
 * "쌍용양회" "동부제강" "국무조정실" "금융감독위원회" 처럼 공백도 문장부호도
 * 없는 짧은 고유명사. 실제 기사는 이 길이에도 조사나 쉼표가 붙는다
 * ("저승보다는 이승이", "동일, 부산 아파트단지 상가").
 */
function isBareOrgName(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && t.length <= 8 && !/[\s,·ㆍ、"“”'‘’%…\-—[\]()]/.test(t);
}

/** 읽을 기사가 아니라 지면 채움(부고·인사·공시 토막)인가. */
export function isFiller(a: RankableArticle): boolean {
  const title = a.title ?? '';
  const content = a.content ?? '';
  return (
    CEREMONY.test(title) ||
    CEREMONY.test(content.slice(0, 60)) ||
    BULLETIN.test(title) ||
    LIST_GLYPH.test(content.trim()) ||
    isBareOrgName(title)
  );
}

/* ══ (2) 실린 분량 ════════════════════════════════════════════════ */

/**
 * 지면 비중이 큰 분야에 가중치를 준다. 서울경제의 본령이 경제라서 경제가
 * 가장 높다 — 이건 매체 성격이라는 사실 기반이고, 개별 기사의 중요도 판단이
 * 아니다.
 *
 * 가중치를 제목 길이보다 크게 잡은 이유: 길이만 쓰면 고정 코너
 * ([장선화기자의 생활인터넷] 32자)가 짧은 제목의 경제 기사
 * (펀드환매 제한ㆍ거부 속출 13자) 를 앞질렀다.
 */
const BEAT_WEIGHT: Record<string, number> = {
  경제: 24,
  국제: 20,
  정치: 18,
  IT_과학: 8,
  문화: 8,
  지역: 6,
};

/** 백엔드가 본문 미리보기를 150자로 다듬어 내려준다 — 그 상한에 닿았는지. */
const CONTENT_FULL = 140;

/**
 * "실린 분량" 점수. 중요도 점수가 아니다 — 이름을 그렇게 두면 나중에 읽는
 * 사람이 관련도 모델로 오해한다.
 */
export function bulkScore(a: RankableArticle): number {
  const title = (a.title ?? '').trim();
  const content = (a.content ?? '').trim();
  let s = Math.min(title.length, 48);
  if (content.length >= CONTENT_FULL) s += 12;
  else if (content.length >= 60) s += 4;
  if ((a.byline ?? '').trim()) s += 6;
  s += BEAT_WEIGHT[(a.category ?? '').trim()] ?? 0;
  return s;
}

/* ══ 카테고리 ════════════════════════════════════════════════════ */

/** 카테고리가 빈 문자열인 기사가 실제로 있다(2003-03-18 에 5건). */
export const UNCATEGORIZED = '그 외';

/** 표시명 — API 는 IT_과학 처럼 밑줄로 준다. */
export function categoryLabel(raw: string): string {
  const c = (raw ?? '').trim();
  return c ? c.replaceAll('_', '·') : UNCATEGORIZED;
}

/* ══ 화면 배치 ════════════════════════════════════════════════════ */

/**
 * 분야 표시 순서. **건수 순이 아니라 고정 순서**다.
 *
 * 건수 순으로 하면 날마다 섹션 순서가 바뀐다. 이 서비스는 재방문이 습관에서
 * 나오고 습관은 "매번 같은 자리에 같은 것"에서 나온다 — 어제 본 화면과 오늘
 * 본 화면의 구조가 다르면 매번 다시 학습해야 한다.
 *
 * 순서 근거: 서울경제는 경제지라 경제가 먼저다. 그 다음은 경제에 직접
 * 영향을 주는 순서(정치·국제), 그 다음 생활 반경(사회·지역), 그 다음
 * IT·문화·스포츠. 분류가 없는 묶음은 이름이 이름이 아니라서 마지막.
 *
 * 없는 분야는 섹션 자체가 안 나온다 — 2018-04-27 은 정치 23건에 경제가
 * 0건이라(판문점 선언일) 정치가 첫 섹션이 된다.
 *
 * 실측한 분야 어휘(10개 날짜, 300건): 경제·정치·사회·문화·지역·IT_과학·
 * 국제·스포츠 + 빈 값.
 */
const BEAT_ORDER = ['경제', '정치', '국제', '사회', '지역', 'IT·과학', '문화', '스포츠'];

export interface DaySection<T> {
  /** 분야 표시명. */
  label: string;
  /** 이 분야 기사. 지면을 많이 차지한 순. */
  items: T[];
}

export interface DayLayout<T> {
  /** 분야별 묶음. BEAT_ORDER 를 따른다. */
  sections: DaySection<T>[];
  /** 부고·인사·공시. 접어둔다. */
  filler: T[];
  /** 채움까지 포함한 전체 건수. */
  total: number;
}

/**
 * 그날 지면을 분야별로 묶는다.
 *
 * ── 왜 크기로 서열을 매기지 않나 ────────────────────────────────
 * 처음엔 분량 점수 상위 2건을 큰 카드로 올렸다. 2003-03-18 은 결과가 맞았지만
 * (이라크전 개전 직전 · 한은 외환개입) 다른 날짜에서 무너졌다.
 *
 *   2008-09-16 (리먼 파산 다음 날)
 *     카드1  [도로위의 낭만, CUV] 집중분석, "평범한 SUV는 비켜라"
 *     카드2  [미국發 금융쓰나미] "국내경제 충격 외환위기 이상일 것"
 *
 * 제목이 길다는 이유로 자동차 기획기사가 글로벌 금융위기를 앞질렀다. 큰 사건은
 * 오히려 제목이 짧다. 2015-09-10 은 두 장 다 [서울경제TV] 고정 코너였다.
 * 게다가 분야 가중치 탓에 1998·2003·2008·2015 네 날짜 전부 카드가 `경제,
 * 경제`로 나와 그날의 폭이 보이지 않았다.
 *
 * 근본 문제는 **크게 만드는 것 자체가 "이게 제일 중요하다"는 주장**이라는
 * 점이다. 쓸 수 있는 필드 다섯 개로는 뒷받침할 수 없는 주장이었다.
 *
 * ── 그래서 분야별 묶음 ─────────────────────────────────────────
 * 신문 지면 자체가 섹션으로 조직돼 있으니 현실의 모델과 일치하고, 순서에
 * 설명 가능한 근거가 있고(BEAT_ORDER), 무엇이 더 중요하다고 말하지 않는다.
 * "그날 경제는 이랬고 정치는 이랬다"가 이 서비스가 답해야 할 질문이기도 하다.
 *
 * 분야 안에서는 분량 순으로 둔다. 이건 "이 분야에서 지면을 많이 차지한 순"
 * 이라는 사실 진술이고, 화면에서도 각 분야 첫 기사에만 본문 미리보기를 붙여
 * 그만큼만 표현한다.
 */
export function buildDayLayout<T extends RankableArticle>(articles: T[]): DayLayout<T> {
  const main: T[] = [];
  const filler: T[] = [];
  for (const a of articles ?? []) {
    if (!a?.title?.trim()) continue;
    (isFiller(a) ? filler : main).push(a);
  }

  const bucket = new Map<string, { a: T; i: number; s: number }[]>();
  main.forEach((a, i) => {
    const label = categoryLabel(a.category);
    if (!bucket.has(label)) bucket.set(label, []);
    bucket.get(label)!.push({ a, i, s: bulkScore(a) });
  });

  // BEAT_ORDER 에 없는 분야가 새로 생겨도 빠뜨리지 않는다 — 순서 뒤,
  // "그 외" 앞에 이름순으로 붙인다.
  const known = BEAT_ORDER.filter((b) => bucket.has(b));
  const extra = [...bucket.keys()]
    .filter((b) => b !== UNCATEGORIZED && !BEAT_ORDER.includes(b))
    .sort((x, y) => x.localeCompare(y, 'ko'));
  const order = [...known, ...extra, ...(bucket.has(UNCATEGORIZED) ? [UNCATEGORIZED] : [])];

  const sections = order.map((label) => ({
    label,
    items: bucket
      .get(label)!
      // 점수가 같으면 원래 위치로 안정 정렬 — 렌더마다 순서가 흔들리면 안 된다.
      .sort((x, y) => (y.s - x.s) || (x.i - y.i))
      .map((e) => e.a),
  }));

  return { sections, filler, total: main.length + filler.length };
}
