/**
 * 그날 지면 30건을 화면에 배치할 수 있는 형태로 분류한다.
 *
 * API가 내려주는 기사 순서는 지면 편집 서열이 아니다(news_id의 시각은 디지털화 시점이며,
 * 카테고리 전환도 불규칙하다). 따라서 순서를 신뢰하지 않고 두 가지만 판단한다.
 *  (1) 지면 채움 여부 — 부고·인사발령·거래소 공시는 기사로 취급하지 않는다.
 *  (2) 실린 분량 — 제목 길이·본문 길이·바이라인 유무로 측정한다. 중요도가 아니라 분량에 대한 관찰이다.
 *
 * 사용 가능한 필드는 제목·본문 150자·바이라인·카테고리·링크뿐이므로 중요도 판단은 하지 않는다.
 * 어떤 기사도 제외하지 않으며, 채움 기사도 접힌 영역에서 전부 확인할 수 있다.
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
 * 제목이 기관·기업명 하나로 끝나는 공시 토막인지 판별한다.
 * 공백·문장부호가 없는 짧은 고유명사가 대상이며, 실제 기사는 이 길이에도 조사나 쉼표가 붙는다.
 */
function isBareOrgName(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && t.length <= 8 && !/[\s,·ㆍ、"“”'‘’%…\-—[\]()]/.test(t);
}

/** 읽을 기사가 아니라 지면 채움(부고·인사·공시 토막)인가. */
function isFiller(a: RankableArticle): boolean {
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
 * 지면 비중이 큰 분야에 가중치를 부여한다. 매체 성격(경제지)에 따른 값이며 개별 기사의 중요도 판단이 아니다.
 * 제목 길이만 쓰면 고정 코너가 짧은 제목의 경제 기사보다 앞서므로, 가중치를 제목 길이보다 크게 둔다.
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

/** "실린 분량" 점수. 중요도 점수가 아니므로 관련도 모델로 오해되지 않도록 이름을 구분한다. */
function bulkScore(a: RankableArticle): number {
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
const UNCATEGORIZED = '그 외';

/** 표시명 — API 는 IT_과학 처럼 밑줄로 준다. */
function categoryLabel(raw: string): string {
  const c = (raw ?? '').trim();
  return c ? c.replaceAll('_', '·') : UNCATEGORIZED;
}

/* ══ 화면 배치 ════════════════════════════════════════════════════ */

/**
 * 분야 표시 순서. 건수 순이 아닌 고정 순서이다.
 * 날마다 섹션 순서가 바뀌면 재방문 시 화면 구조를 다시 학습해야 하므로 순서를 고정한다.
 * 경제 → 정치·국제 → 사회·지역 → IT·문화·스포츠 순이며, 분류 없는 묶음은 마지막에 둔다.
 * 해당 기사가 없는 분야는 섹션 자체를 생성하지 않는다.
 */
const BEAT_ORDER = ['경제', '정치', '국제', '사회', '지역', 'IT·과학', '문화', '스포츠'];

interface DaySection<T> {
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
 * 기사 크기로 서열을 매기지 않는다. 분량 점수 상위 기사를 강조하면 중요한 사건(짧은 제목)이
 * 기획기사에 밀리는 사례가 있었고, 크게 표시하는 것 자체가 "가장 중요하다"는 주장이 되기 때문이다.
 * 신문 지면의 섹션 구조와 일치하고 순서 근거(BEAT_ORDER)를 설명할 수 있는 분야별 묶음을 사용한다.
 * 분야 안에서는 분량 순으로 정렬하며, 각 분야 첫 기사에만 본문 미리보기를 붙인다.
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

  // BEAT_ORDER에 없는 분야는 누락 없이 BEAT_ORDER 뒤, "그 외" 앞에 이름순으로 배치한다.
  const known = BEAT_ORDER.filter((b) => bucket.has(b));
  const extra = [...bucket.keys()]
    .filter((b) => b !== UNCATEGORIZED && !BEAT_ORDER.includes(b))
    .sort((x, y) => x.localeCompare(y, 'ko'));
  const order = [...known, ...extra, ...(bucket.has(UNCATEGORIZED) ? [UNCATEGORIZED] : [])];

  const sections = order.map((label) => ({
    label,
    items: bucket
      .get(label)!
      // 점수가 같으면 원래 위치 순으로 안정 정렬해 렌더마다 순서가 바뀌지 않게 한다.
      .sort((x, y) => (y.s - x.s) || (x.i - y.i))
      .map((e) => e.a),
  }));

  return { sections, filler, total: main.length + filler.length };
}
