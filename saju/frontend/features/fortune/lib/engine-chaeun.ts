/**
 * 재운 심화 모듈 v1 — 재성 프로파일 · 4분면 진단 · 대운 재물 타임라인
 * engine.ts 의존 (CG_OH, JJG, sipsung, DaeunEntry, Pillar, SinGangYakResult)
 */
import {
  CG_OH,
  CHEONUL,
  MUNCHANG,
  YEOKMA,
  DOHWA,
  HWAGAE,
  GEOBSAL,
  JAESAL,
  JJG,
  sipsung,
  unsung,
  calcYeonun,
  calcWolun,
  detectHapChung,
  getGapja,
  type HapChungItem,
  type Pillar,
  type DaeunEntry,
  type SinGangYakResult,
} from './engine';

const OH_LIST = ['목', '화', '토', '금', '수'] as const;
const YANG_CG = new Set(['甲', '丙', '戊', '庚', '壬']);

// ── 돈이 들어오는 5가지 경로 (십성군 × 강도) ──
export type WealthPathKey = '재성' | '인성' | '식상' | '관성' | '비겁';

export interface WealthPath {
  key: WealthPathKey;
  oh: string;         // 해당 오행
  count: number;      // 천간 + 지지 본기 합
  rootStrength: number; // 지장간 가중합 (본기3·중기2·여기1)
  strength: number;   // 0~100 종합
  label: string;      // '직접 재물' 같은 평어
  desc: string;       // 한 줄 설명
}

export interface WealthPathsResult {
  paths: WealthPath[];  // 강도 내림차순 정렬
  dominant: WealthPath; // 가장 강한 경로
  fallback: boolean;    // 모든 경로가 극히 약한 경우 true
}

const PATH_META: Record<WealthPathKey, { label: string; desc: string }> = {
  '재성': { label: '직접 재물', desc: '내가 직접 돈·자산·고객을 다루는 경로 (사업·투자·영업)' },
  '인성': { label: '실력·전문성', desc: '학문·자격·지식이 그대로 수익 원천이 되는 경로 (학자·연구·컨설팅)' },
  '식상': { label: '창작·서비스', desc: '내 재능·표현·서비스를 가치로 환산하는 경로 (프리랜스·콘텐츠·강의)' },
  '관성': { label: '직책·명예', desc: '직장·조직·사회적 지위에서 안정 수익이 오는 경로 (회사원·공직·전문직)' },
  '비겁': { label: '동료·협업', desc: '친구·동료·협력자와의 관계에서 기회·수익이 만들어지는 경로 (네트워크·공동사업)' },
};

function countOhInChart(ps: Pillar[], targetOh: string, excludeDayGan: boolean): { count: number; root: number } {
  let count = 0;
  let root = 0;
  for (let i = 0; i < ps.length; i++) {
    if (excludeDayGan && i === 1) continue;
    const c = ps[i]?.c;
    if (c && CG_OH[c] === targetOh) count++;
  }
  for (const p of ps) {
    const j = p?.j;
    if (!j) continue;
    const arr = JJG[j] || [];
    const main = arr[arr.length - 1];
    if (main && CG_OH[main] === targetOh) count++;
  }
  for (const p of ps) {
    const j = p?.j;
    if (!j) continue;
    const arr = JJG[j] || [];
    const weights = arr.length === 1 ? [3] : arr.length === 2 ? [1, 3] : [1, 2, 3];
    arr.forEach((h, i) => {
      if (CG_OH[h] === targetOh) root += weights[i];
    });
  }
  return { count, root };
}

// ── 시기별 재운 (세운/월운/일진) ──
// 특정 시기의 간지(천간+지지)가 일간에게 어떤 재운 영향을 주는지 평가

const SS_TO_PATH: Record<string, WealthPathKey> = {
  '비견': '비겁', '겁재': '비겁',
  '식신': '식상', '상관': '식상',
  '편재': '재성', '정재': '재성',
  '편관': '관성', '정관': '관성',
  '편인': '인성', '정인': '인성',
};

const PATH_SHORT: Record<WealthPathKey, string> = {
  '재성': '재성',
  '인성': '인성',
  '식상': '식상',
  '관성': '관성',
  '비겁': '비겁',
};

export interface LottoBreakdown {
  label: string;       // '편재 투출' 같은 항목 이름
  points: number;      // 가감 점수
  note: string;        // 한 줄 설명
  met: boolean;        // 조건 충족 여부
}

export interface LottoRating {
  stars: number;   // 1~5
  score: number;   // 0~100
  label: string;   // '로또 한 장?' 같은 짧은 라벨
  note: string;    // 한 줄 설명
  breakdown: LottoBreakdown[];  // 점수 내역 (투명 공개)
  disclaimer: string; // 면책 문구
}

export interface PeriodOverallRating {
  stars: number;       // 1~5
  score: number;       // 0~100
  label: string;       // '최상', '상승', '보통', '주의', '소극' 등
  tone: 'good' | 'neutral' | 'caution';
  breakdown: Array<{ label: string; points: number; note: string }>;  // 점수 내역
}

export interface PeriodChaeunInfo {
  ganji: string;
  ganjiHanja: string;
  cgSS: string;
  jjSS: string;
  categories: WealthPathKey[];
  themeLine: string;
  note: string;
  lotto: LottoRating;
  overall: PeriodOverallRating;
}

/** 시기(세운/월운/일진)의 전반적 재운 평가 — 범주 조합 + 주 경로 반영 */
export function calcPeriodOverallRating(
  categories: WealthPathKey[],
  dominantPath?: WealthPathKey,
): PeriodOverallRating {
  const breakdown: Array<{ label: string; points: number; note: string }> = [];
  let score = 50;
  const has = (k: WealthPathKey) => categories.includes(k);

  breakdown.push({ label: '기본 점수', points: 0, note: '50점 출발' });

  if (has('재성')) {
    score += 20;
    breakdown.push({ label: '재성 진입', points: 20, note: '직접 수익 기운이 열려요' });
  }
  if (has('관성')) {
    score += 10;
    breakdown.push({ label: '관성 진입', points: 10, note: '조직·직장 축이 활성화돼요' });
  }
  if (has('식상')) {
    score += 10;
    breakdown.push({ label: '식상 진입', points: 10, note: '창작·표현 기운이 올라와요' });
  }
  if (has('인성')) {
    score += 8;
    breakdown.push({ label: '인성 진입', points: 8, note: '배움·전문성 축이 강해져요' });
  }
  if (has('비겁')) {
    if (has('재성')) {
      score += 5;
      breakdown.push({ label: '비겁+재성', points: 5, note: '경쟁·협업 속 수익 기회가 생겨요' });
    } else {
      score -= 10;
      breakdown.push({ label: '비겁 단독', points: -10, note: '재성 없이 비겁만 — 지출·분재 주의' });
    }
  }
  if (dominantPath && categories.includes(dominantPath)) {
    score += 15;
    breakdown.push({ label: `주 경로(${dominantPath}) 적중`, points: 15, note: '내 수익 구조와 결이 맞아 증폭돼요' });
  }
  if (categories.length === 0) {
    score = 50;
    breakdown.length = 0;
    breakdown.push({ label: '변수 없음', points: 0, note: '특별한 재운 이벤트가 없는 평온 구간' });
  }

  score = Math.max(0, Math.min(100, score));

  const stars = score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
  const TABLE: Record<number, { label: string; tone: 'good' | 'neutral' | 'caution' }> = {
    5: { label: '최상 · 강한 상승', tone: 'good' },
    4: { label: '상승 · 유리한 흐름', tone: 'good' },
    3: { label: '보통 · 안정', tone: 'neutral' },
    2: { label: '주의 · 정비', tone: 'caution' },
    1: { label: '소극 · 방어', tone: 'caution' },
  };

  return { stars, score, label: TABLE[stars].label, tone: TABLE[stars].tone, breakdown };
}

const LOTTO_DISCLAIMER = '전통 명리의 참고 지표를 단순 점수화한 재미용 수치예요. 실제 당첨 확률과는 무관합니다.';

/** 일진 간지 기반 100점 만점 로또/횡재 운 산정
 *  편재 투출(+30) / 천을귀인(+20) / 12운성 생·왕·관(+20, 사·묘·절 -10) / 일진 재성(+15) / 오행 균형(+15)
 */
function calcLottoRating(
  ilgan: string,
  cgSS: string,
  jjSS: string,
  pillars: Pillar[],
  dayJj: string,
): LottoRating {
  const breakdown: LottoBreakdown[] = [];
  let score = 0;

  // 1) 편재 투출 — 원국 천간(일간 제외)에 편재가 드러나 있는지
  const ilganYang = ['甲', '丙', '戊', '庚', '壬'].includes(ilgan);
  const ilganOh = CG_OH[ilgan];
  const OH_LIST_TMP = ['목', '화', '토', '금', '수'];
  const chaeOh = OH_LIST_TMP[(OH_LIST_TMP.indexOf(ilganOh) + 2) % 5];
  let pyeonJaeVisible = false;
  for (let i = 0; i < pillars.length; i++) {
    if (i === 1) continue;
    const c = pillars[i]?.c;
    if (!c || CG_OH[c] !== chaeOh) continue;
    const isYang = ['甲', '丙', '戊', '庚', '壬'].includes(c);
    if (isYang !== ilganYang) { pyeonJaeVisible = true; break; }
  }
  breakdown.push({
    label: '큰돈 신호',
    points: pyeonJaeVisible ? 30 : 0,
    note: pyeonJaeVisible
      ? '내 사주 겉면에 \'큰돈 기운(편재)\'이 드러나 있어 횡재 자극에 반응하는 체질이에요'
      : '내 사주 겉면에 큰돈 기운(편재) 표시가 없어요',
    met: pyeonJaeVisible,
  });
  if (pyeonJaeVisible) score += 30;

  // 2) 천을귀인 — 오늘 일진 지지가 내 일간의 천을귀인 지지인지
  const cheonulList = CHEONUL[ilgan] || [];
  const cheonulHit = !!dayJj && cheonulList.includes(dayJj);
  breakdown.push({
    label: '귀인 날',
    points: cheonulHit ? 20 : 0,
    note: cheonulHit
      ? '오늘은 내 사주에 \'귀인 오는 날(천을귀인)\'이에요 — 예상 밖 도움이 들어오기 쉬워요'
      : '오늘은 귀인 기운(천을귀인)이 걸리지 않은 평일이에요',
    met: cheonulHit,
  });
  if (cheonulHit) score += 20;

  // 3) 12운성 — 오늘 일진 지지의 12운성
  const us = ilgan && dayJj ? unsung(ilgan, dayJj) : '';
  const wangPos = ['장생', '관대', '건록', '제왕'].includes(us); // 생·왕·관
  const deathPos = ['사', '묘', '절'].includes(us);
  const usScore = wangPos ? 20 : deathPos ? -10 : 0;
  breakdown.push({
    label: `내 기운 ${us || '—'}`,
    points: usScore,
    note: wangPos
      ? `오늘 내 에너지가 '상승·절정 구간(${us})' — 추진력이 좋은 날이에요`
      : deathPos
        ? `오늘 내 에너지가 '쇠퇴·마감 구간(${us})' — 무리한 베팅은 금물이에요`
        : `오늘은 기운이 크게 튀지 않는 중립 구간(${us})이에요`,
    met: wangPos,
  });
  score += usScore;

  // 4) 일진 재성 — 오늘 일진의 천간/지지 본기에 재성(편재·정재) 유무
  const bothSS = [cgSS, jjSS];
  const dayHasJae = bothSS.includes('편재') || bothSS.includes('정재');
  breakdown.push({
    label: '오늘 재물',
    points: dayHasJae ? 15 : 0,
    note: dayHasJae
      ? '오늘 날짜 자체에 재물 기운(재성)이 실려 있어요'
      : '오늘 날짜엔 재물 기운(재성)이 실려 있지 않아요',
    met: dayHasJae,
  });
  if (dayHasJae) score += 15;

  // 5) 오행 균형도 — 원국 5오행 모두 1개 이상이면 균형
  const ohCounts: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) {
    if (p.c && CG_OH[p.c]) ohCounts[CG_OH[p.c]]++;
    if (p.j) {
      const arr = JJG[p.j] || [];
      const main = arr[arr.length - 1];
      if (main && CG_OH[main]) ohCounts[CG_OH[main]]++;
    }
  }
  const presentCount = Object.values(ohCounts).filter(c => c > 0).length;
  const balanceScore = presentCount === 5 ? 15 : presentCount === 4 ? 10 : presentCount === 3 ? 5 : 0;
  breakdown.push({
    label: '오행 균형',
    points: balanceScore,
    note: `목·화·토·금·수 중 ${presentCount}종을 갖춘 사주예요 · 5종 +15 / 4종 +10 / 3종 +5`,
    met: presentCount >= 4,
  });
  score += balanceScore;

  // 총점 0~100 clamp
  score = Math.max(0, Math.min(100, score));

  // 별점 매핑
  const stars =
    score >= 80 ? 5 :
    score >= 60 ? 4 :
    score >= 40 ? 3 :
    score >= 20 ? 2 : 1;

  const LABELS: Record<number, { label: string; note: string }> = {
    5: {
      label: '로또 한 장쯤?',
      note: '편재·귀인·운기가 동시에 열리는 드문 날이에요. 평소 안 사던 로또 한 장, 즉석 복권 하나쯤은 재미 삼아 시도해볼 만한 타이밍. 크게 기대하진 말고, 퇴근길에 판매점 앞을 그냥 지나치지만 않으면 돼요.',
    },
    4: {
      label: '평소보다 운 좋음',
      note: '재물 감도가 살짝 올라간 날이에요. 5천 원~1만 원 정도는 분위기 타볼 만하지만, 생활비까지 거는 건 금물. 당첨보다는 그 주의 가벼운 루틴 정도로 접근하세요.',
    },
    3: {
      label: '평범',
      note: '딱히 트이지도, 막히지도 않는 평범한 날이에요. 사도 손해 날 흐름은 아니고 대박 분위기도 아닌 딱 중립. 생각난 김에 사는 정도면 충분해요.',
    },
    2: {
      label: '횡재 기대 말기',
      note: '운성이 약하거나 귀인 기운이 비어 있는 날. 즉흥적으로 "한 번 사볼까" 하면 그냥 돈이 빠져나가는 쪽으로 기울기 쉬워요. 이번 주는 패스하고 카드값·고정비 점검이 훨씬 이득.',
    },
    1: {
      label: '통장에 고이 두기',
      note: '지표가 전반적으로 낮게 나오는 날. 이런 날 복권·도박·투기는 높은 확률로 손실로 끝나는 구조예요. 5천 원도 오늘은 통장에 고이 두시면 마음이 편해져요.',
    },
  };

  return {
    stars,
    score,
    label: LABELS[stars].label,
    note: LABELS[stars].note,
    breakdown,
    disclaimer: LOTTO_DISCLAIMER,
  };
}

function buildPeriodNote(categories: WealthPathKey[]): string {
  if (categories.length === 0) {
    return '이번 시기는 특별한 재운 변수가 도드라지지 않는 안정 구간이에요. 큰 변화를 만들기보다 기존 리듬을 유지하며 내실을 다지는 쪽이 결과적으로 유리해요. 조용히 체력·자금·관계를 정비해두면 다음 기운이 올 때 먼저 움직일 수 있어요.';
  }
  const has = (k: WealthPathKey) => categories.includes(k);

  // 재성 + X 조합 (재성이 핵심 변수일 때)
  if (has('재성') && has('관성')) {
    return '재성과 관성이 함께 들어와 직장·지위 기반의 수익이 눈에 띄게 확장되기 좋은 흐름이에요. 승진·이직·큰 프로젝트 같은 공식적인 자리에서 금전 기회가 따라오니, 기회가 보이면 망설이지 말고 받아보세요. 다만 책임도 같이 커지므로 건강·일정 관리는 평소보다 촘촘하게 챙기는 게 좋아요.';
  }
  if (has('재성') && has('식상')) {
    return '식상과 재성이 동시에 와서 창작·서비스·콘텐츠가 실제 수익으로 연결되기 좋은 시기예요. 평소 아이디어로만 두었던 프로젝트를 실행에 옮기거나, 퍼스널 브랜드·부업을 본격화하기에 적합해요. 짧게라도 결과물을 시장에 내보내는 행동이 기대 이상의 반응으로 돌아올 수 있어요.';
  }
  if (has('재성') && has('비겁')) {
    return '재성과 비겁이 만나 경쟁·협업 속에서 수익 기회가 생기는 흐름이에요. 공동 사업·파트너십·네트워크 기반 프로젝트가 잘 풀리는 반면, 같은 분야 사람과 부딪힐 가능성도 높으니 역할·지분을 미리 명확히 정해두세요. 동업 전 계약서, 공동계좌 같은 장치를 미리 준비하면 마찰을 크게 줄일 수 있어요.';
  }
  if (has('재성') && has('인성')) {
    return '재성이 오면서 인성도 받쳐주어 실력 기반의 안정적 수익이 가능한 시기예요. 급하게 큰 돈을 쫓기보다 전문성·자격·콘텐츠로 채널을 만들어두면 재운이 길게 이어져요. 짧은 호흡의 투기보다 중장기 투자·교육·학습 투자가 훨씬 좋은 수익률로 돌아오는 구간이에요.';
  }
  if (has('재성')) {
    return '재성이 들어와 새로운 수익 채널을 시도하기 좋은 시기예요. 사업·투자·영업 같은 활동적 재물 쪽으로 시선이 열리며 평소와 다른 기회가 눈에 들어올 수 있어요. 다만 기복이 커질 수 있으니 한꺼번에 올인하기보다 여유 자금을 따로 유지하면서 단계적으로 확장하세요.';
  }

  // 관성 + X 조합
  if (has('관성') && has('인성')) {
    return '관성과 인성이 함께 와서 직장·전문성 트랙이 가장 돋보이는 시기예요. 조직 내에서 인정·승진·평가가 유리하게 흐르고, 자격·학위·지식이 실제 영향력으로 전환되기 좋아요. 이 시기의 공식적 자리·발표·정리 작업은 이후 경력에 오래 남는 자산이 될 수 있어요.';
  }
  if (has('관성') && has('식상')) {
    return '관성과 식상이 섞여 조직 안에서 창의적 역할을 할 기회가 커지는 흐름이에요. 공식 업무와 내 표현력·아이디어가 만나 프로젝트를 이끌거나 대외 활동을 하는 자리에 잘 맞아요. 다만 두 기운이 서로 충돌할 수 있어 업무 내외 구분을 명확히 두는 게 안정적이에요.';
  }
  if (has('관성') && has('비겁')) {
    return '관성과 비겁이 만나 조직·단체 내에서 경쟁과 협력이 모두 강해지는 시기예요. 동료와 함께 큰 그림을 그리기 좋지만 역할 배분이 모호하면 마찰이 커지니 리더/서포터 위치를 분명히 해두세요. 공식 자리에서 신뢰를 쌓으면 추후 확실한 지원군이 됩니다.';
  }
  if (has('관성')) {
    return '직장·책임·공식 활동에서 기회가 커지는 시기예요. 승진·이직·자격 취득·공적 자리 같은 조직 관련 사건이 빈번해질 수 있고, 성실히 대응하면 장기 수익 기반이 단단해져요. 단, 책임이 늘어 스트레스도 함께 올 수 있으니 휴식 루틴을 의식적으로 챙기세요.';
  }

  // 인성 + X 조합
  if (has('인성') && has('식상')) {
    return '학습·자격(인성)과 표현·창작(식상)이 동시에 활성화돼 전문성을 콘텐츠로 푸는 흐름이 아주 좋은 시기예요. 새로 배우는 동시에 결과물을 기록·공유하면 신뢰 자산이 빠르게 쌓여요. 강의·저술·뉴스레터 같은 지식 공유 채널을 시작하기에도 최적의 구간이에요.';
  }
  if (has('인성') && has('비겁')) {
    return '인성과 비겁이 만나 동료·멘토와 함께 배우고 성장하는 흐름이 강해지는 시기예요. 스터디·커뮤니티·스승과의 관계가 재운의 바탕이 되니 지식을 나누는 자리에 적극 참여해보세요. 직접 돈이 들어오는 느낌은 작을 수 있지만 길게 보면 다음 재성 시기에 큰 기반이 됩니다.';
  }
  if (has('인성')) {
    return '인성이 들어와 단기 수익보다 학습·자격·전문성 투자에 집중하면 장기적으로 수익 기반이 단단해지는 시기예요. 지금 공부해 두는 것, 쌓아 두는 자격증·경력이 다음 재성 구간에서 그대로 수익으로 환산될 가능성이 커요. 이때는 돈을 쫓는 것보다 돈을 받을 자격을 만드는 시기라고 생각해보세요.';
  }

  // 식상 + X 조합
  if (has('식상') && has('비겁')) {
    return '식상과 비겁이 만나 동료와 함께 창작·서비스를 전개하기 좋은 흐름이에요. 혼자보다 팀으로 움직일 때 더 큰 가치가 만들어지고, 공동 콘텐츠·합작 프로젝트가 의외의 반응을 얻을 수 있어요. 다만 수익 배분 원칙을 미리 세워두지 않으면 이후 관계가 어긋날 수 있으니 주의하세요.';
  }
  if (has('식상')) {
    return '식상이 들어와 창작·표현·서비스가 빛을 발하는 시기예요. 내 감각·재능을 외부에 내보내면 그대로 수익이나 기회로 연결되기 좋고, 퍼스널 브랜드·콘텐츠 채널을 키우기에도 최적이에요. 완성도에 너무 매이지 말고 꾸준히 결과물을 내놓는 흐름을 만드는 게 포인트예요.';
  }

  // 비겁 단독
  if (has('비겁')) {
    return '비겁이 들어와 협업·네트워크·공동 프로젝트가 유리한 시기예요. 같은 분야 사람들과 만나는 자리에 참여하면 새 기회·정보가 자연스럽게 들어와요. 다만 동료와 돈이 얽히거나 지출이 늘기 쉬운 흐름이라 소비·대출·보증 판단은 평소보다 한 번 더 신중하게 살펴보세요.';
  }

  return '—';
}

export function evaluatePeriodChaeun(
  ilgan: string,
  periodCg: string,
  periodJj: string,
  periodCk: string,
  periodJk: string,
  pillars: Pillar[],
  dominantPath?: WealthPathKey,
): PeriodChaeunInfo {
  const cgSS = periodCg && ilgan ? sipsung(ilgan, periodCg) : '';
  const jjArr = periodJj ? (JJG[periodJj] || []) : [];
  const jjMain = jjArr[jjArr.length - 1] || '';
  const jjSS = jjMain && ilgan ? sipsung(ilgan, jjMain) : '';

  const categories: WealthPathKey[] = [];
  if (cgSS && SS_TO_PATH[cgSS]) categories.push(SS_TO_PATH[cgSS]);
  if (jjSS && SS_TO_PATH[jjSS] && !categories.includes(SS_TO_PATH[jjSS])) {
    categories.push(SS_TO_PATH[jjSS]);
  }

  const themeLine = categories.map(c => PATH_SHORT[c]).join(' · ') || '—';
  const note = buildPeriodNote(categories);
  const lotto = calcLottoRating(ilgan, cgSS, jjSS, pillars, periodJj);
  const overall = calcPeriodOverallRating(categories, dominantPath);

  return {
    ganji: `${periodCk || ''}${periodJk || ''}`,
    ganjiHanja: `${periodCg || ''}${periodJj || ''}`,
    cgSS, jjSS, categories, themeLine, note, lotto, overall,
  };
}

export interface CurrentPeriodChaeun {
  yeonun: (PeriodChaeunInfo & { year: number }) | null;
  wolun: (PeriodChaeunInfo & { month: number }) | null;
  iljin: (PeriodChaeunInfo & { dateLabel: string }) | null;
  flowNarrative: string;  // 세 시기 흐름 연결 서사
  bridges: {
    yToM: string;  // 올해 → 이번 달 브릿지
    mToD: string;  // 이번 달 → 오늘 브릿지
  };
}

// ── 시기별 흐름 연결 서사 (세운 → 월운 → 일진) ──

type PhraseScope = 'year' | 'month' | 'day';

/** 조합별 문구 풀 — 같은 조합이라도 시기(세운/월운/일진)별로 3~4개 변주를 준비해 반복을 최소화 */
const PHRASE_POOLS: Record<string, Record<PhraseScope, string[]>> = {
  'empty': {
    year: ['특별한 변수 없는 안정 흐름', '큰 기복 없이 흐르는 잔잔한 흐름', '뚜렷한 변화 없는 평온 구간'],
    month: ['별다른 기운 없이 차분히 지나가고', '큰 변수 없이 잔잔히 흐르고', '뚜렷한 이벤트 없이 지나가고'],
    day: ['평온한 날', '기운 변동이 크지 않은 날', '잔잔하게 흘러가는 날'],
  },
  '재성+관성': {
    year: ['직장 재물이 크게 확장되는 흐름', '조직 책임에 재물 기운이 얹힌 흐름', '공식 자리에서 수익이 동반 상승하는 흐름'],
    month: ['조직 책임에 재물 기운이 얹히고', '직장과 수익이 나란히 돌아가고', '공식 업무에 돈 기운이 따라붙고'],
    day: ['직장·수익이 동시에 돋보이는 날', '공식 자리에 재물 기운이 얹히는 날', '조직과 돈 기운이 같이 움직이는 날'],
  },
  '재성+식상': {
    year: ['창작·서비스가 수익으로 이어지는 흐름', '표현력이 곧 돈으로 연결되는 흐름', '만들어내는 가치가 수익이 되는 한 해'],
    month: ['창작과 재물 기운이 나란히 돌아가고', '아이디어가 수익으로 이어지는 흐름이 돌고', '표현·수익 기운이 함께 얹히고'],
    day: ['창작과 수익이 이어지는 날', '만들어낸 가치가 돈이 되는 날', '표현·수익 기운이 동시에 열리는 날'],
  },
  '재성+비겁': {
    year: ['경쟁·협업 속에 재물 기회가 열린 흐름', '동료와 얽혀 재물이 오가는 흐름', '공동 판에서 수익 기회가 열리는 한 해'],
    month: ['경쟁 구도에 재물 기운이 끼어들고', '동료 관계 속에 돈 기운이 섞이고', '협업 흐름에 재물 기운이 따라붙고'],
    day: ['동료와 함께 재물 기회가 생기는 날', '경쟁 속에 수익 기운이 섞이는 날', '공동 판에서 돈 기운이 도는 날'],
  },
  '재성+인성': {
    year: ['실력 기반 안정 수익이 쌓이는 흐름', '전문성이 수익 기반으로 전환되는 흐름', '지식·자격이 돈으로 환산되는 한 해'],
    month: ['배움 기운이 재물로 이어지는 흐름이 돌고', '전문성과 수익 기운이 나란히 얹히고', '지식이 수익으로 환산되는 흐름이 따라붙고'],
    day: ['전문성으로 수익이 나는 날', '지식이 돈으로 바뀌는 날', '배움과 재물이 같이 풀리는 날'],
  },
  '재성': {
    year: ['재성이 열려 수익 기회가 확장되는 흐름', '돈 기운이 직접 들어오는 흐름', '재물 채널이 활성화되는 한 해'],
    month: ['재물 기운이 뚜렷하게 얹히고', '수익 채널에 바람이 들어오고', '재성 기운이 직접 돌아가고'],
    day: ['재물 기운이 활성화되는 날', '돈 기운이 직접 들어오는 날', '수익 채널이 선명해지는 날'],
  },
  '관성+인성': {
    year: ['직장·전문성 트랙이 돋보이는 흐름', '조직 내 실력 인정이 커지는 흐름', '공식 자리와 전문성이 동반 성장하는 한 해'],
    month: ['조직 일에 배움 기운이 얹히고', '공식 자리에 전문성이 나란히 돌아가고', '직장·학습 기운이 함께 얹히고'],
    day: ['조직·전문성이 빛나는 날', '직장과 실력 기운이 함께 도는 날', '공식 자리에서 지식이 살아나는 날'],
  },
  '관성+식상': {
    year: ['조직 내 창의 역할이 커지는 흐름', '공식 자리에서 표현력이 살아나는 흐름', '직장 일과 창작이 맞물리는 한 해'],
    month: ['조직 일에 창작·표현 기운이 얹히고', '공식 업무에 아이디어 기운이 나란히 돌아가고', '직장 안에 표현 기운이 섞이고'],
    day: ['조직 안에서 아이디어가 풀리는 날', '공식 자리에 창작 기운이 얹히는 날', '직장 업무와 표현이 맞물리는 날'],
  },
  '관성+비겁': {
    year: ['조직·동료 관계가 도드라지는 흐름', '공식 자리와 경쟁 구도가 함께 돋는 흐름', '직장·협업 축이 겹치는 한 해'],
    month: ['조직 책임에 경쟁 기운이 겹치고', '공식 자리에 동료 관계가 얹히고', '직장·협업 기운이 함께 돌아가고'],
    day: ['협업과 책임이 같이 오는 날', '조직과 동료 기운이 함께 움직이는 날', '공식 자리에서 경쟁이 부각되는 날'],
  },
  '관성': {
    year: ['직장·책임이 커지는 구도', '공식 자리에서 기회가 넓어지는 흐름', '조직 책임이 도드라지는 한 해'],
    month: ['공식 책임 기운이 얹히고', '조직 일이 무게감 있게 돌아가고', '직장 기운이 선명해지고'],
    day: ['공적 활동이 돋보이는 날', '조직·책임 기운이 돌아오는 날', '공식 자리에서 주목받는 날'],
  },
  '인성+식상': {
    year: ['전문성을 콘텐츠로 푸는 흐름', '배움이 표현으로 이어지는 흐름', '지식 공유로 가치가 만들어지는 한 해'],
    month: ['배움과 창작 기운이 나란히 얹히고', '학습이 표현으로 전환되는 흐름이 돌고', '지식과 아이디어 기운이 겹치고'],
    day: ['배움과 창작이 같이 풀리는 날', '지식이 콘텐츠로 이어지는 날', '학습·표현 기운이 함께 도는 날'],
  },
  '인성+비겁': {
    year: ['동료와 함께 성장하는 흐름', '스승·스터디 인연이 깊어지는 흐름', '배움이 관계로 번지는 한 해'],
    month: ['배움과 네트워크 기운이 함께 얹히고', '학습·동료 관계가 나란히 돌아가고', '스터디 기운이 뚜렷하게 얹히고'],
    day: ['스터디·커뮤니티가 활발한 날', '동료와 함께 배우는 날', '학습·관계 기운이 함께 도는 날'],
  },
  '인성': {
    year: ['실력·학습 기반이 쌓이는 바탕', '전문성이 다져지는 조용한 한 해', '내공이 쌓이는 흐름'],
    month: ['배움·전문성 기운이 얹히고', '학습 기운이 중심을 잡고', '내공을 쌓는 기운이 돌고'],
    day: ['배움·정리에 유리한 날', '기록과 학습에 집중되는 날', '전문성을 다지는 날'],
  },
  '식상+비겁': {
    year: ['팀 창작·공동 프로젝트가 유리한 흐름', '함께 만드는 가치가 커지는 흐름', '동료와 창작이 맞물리는 한 해'],
    month: ['공동 창작 기운이 얹히고', '팀·표현 기운이 나란히 돌아가고', '동료와 창작 흐름이 함께 따라붙고'],
    day: ['함께 만드는 콘텐츠가 잘 풀리는 날', '팀 창작 기운이 도는 날', '동료와 표현이 맞물리는 날'],
  },
  '식상': {
    year: ['창작·표현이 풀리는 흐름', '아이디어가 움직이는 한 해', '표현의 속도가 붙는 흐름'],
    month: ['창작 기운이 얹히고', '표현 흐름이 열리고', '아이디어 기운이 돌아가고'],
    day: ['창작·표현이 열리는 날', '아이디어가 잘 풀리는 날', '표현의 문이 열리는 날'],
  },
  '비겁': {
    year: ['동료·경쟁이 도드라지는 흐름', '관계 속에서 움직이는 한 해', '네트워크가 부각되는 흐름'],
    month: ['경쟁 구도 기운이 얹히고', '동료·관계 기운이 돌아오고', '협업 바람이 불어오고'],
    day: ['협업·만남이 좋은 날', '동료와 연결되는 날', '네트워크 기운이 도는 날'],
  },
};

function phraseComboKey(categories: WealthPathKey[]): string {
  if (categories.length === 0) return 'empty';
  const has = (k: WealthPathKey) => categories.includes(k);
  if (has('재성') && has('관성')) return '재성+관성';
  if (has('재성') && has('식상')) return '재성+식상';
  if (has('재성') && has('비겁')) return '재성+비겁';
  if (has('재성') && has('인성')) return '재성+인성';
  if (has('재성')) return '재성';
  if (has('관성') && has('인성')) return '관성+인성';
  if (has('관성') && has('식상')) return '관성+식상';
  if (has('관성') && has('비겁')) return '관성+비겁';
  if (has('관성')) return '관성';
  if (has('인성') && has('식상')) return '인성+식상';
  if (has('인성') && has('비겁')) return '인성+비겁';
  if (has('인성')) return '인성';
  if (has('식상') && has('비겁')) return '식상+비겁';
  if (has('식상')) return '식상';
  if (has('비겁')) return '비겁';
  return 'empty';
}

function phraseForPeriod(categories: WealthPathKey[], scope: PhraseScope, seed: number): string {
  const key = phraseComboKey(categories);
  const pool = PHRASE_POOLS[key]?.[scope] || PHRASE_POOLS['empty'][scope];
  if (pool.length === 0) return '';
  return pool[Math.abs(seed) % pool.length];
}

/** 두 시기 간 범주 변화를 바탕으로 브릿지 문장 1개 생성 */
function buildBridge(
  fromCats: WealthPathKey[],
  toCats: WealthPathKey[],
  fromLabel: '올해' | '이번 달',
  toLabel: '이번 달' | '오늘',
  seed = 0,
): string {
  const fromSet = new Set(fromCats);
  const toSet = new Set(toCats);
  const added = toCats.filter(k => !fromSet.has(k));
  const kept = toCats.filter(k => fromSet.has(k));
  const dropped = fromCats.filter(k => !toSet.has(k));

  const pick = (pool: string[]) => pool[Math.abs(seed) % pool.length];
  const f = fromLabel, t = toLabel;
  const fromStr = fromCats.join('·');
  const toStr = toCats.join('·');
  const addedStr = added.join('·');
  const keptStr = kept.join('·');
  const droppedStr = dropped.join('·');

  if (fromCats.length === 0 && toCats.length === 0) {
    return pick([
      `${f}의 잔잔한 흐름이 ${t}에도 그대로 이어져요.`,
      `${f}의 평온한 기조가 ${t}에도 유지되는 구간이에요.`,
      `${f}의 고요한 흐름이 ${t}까지 자연스럽게 연결돼요.`,
    ]);
  }
  if (toCats.length === 0) {
    return pick([
      `${f} 흐름이 ${t}엔 잠시 숨을 고르는 구간이에요.`,
      `${f}의 리듬이 ${t}엔 한 템포 쉬어가요.`,
      `${f} 기운이 ${t}엔 잠시 가라앉는 흐름이에요.`,
    ]);
  }
  if (fromCats.length === 0) {
    return pick([
      `${f}의 평온 위에 ${t}은 ${toStr} 기운이 새로 얹혀요.`,
      `${f}의 잔잔함을 깨고 ${t}에 ${toStr} 흐름이 들어와요.`,
      `${f}엔 조용하던 기운이 ${t}에 ${toStr}(으)로 활성화돼요.`,
    ]);
  }

  // 완전히 같은 범주
  if (added.length === 0 && dropped.length === 0) {
    return pick([
      `${f}의 ${fromStr} 흐름이 ${t}에도 그대로 이어지며 톤이 더 선명해져요.`,
      `${f}의 ${fromStr} 기운이 ${t}까지 연장되며 농도가 짙어져요.`,
      `${f}의 ${fromStr} 기조가 ${t}에도 유지되며 초점이 또렷해져요.`,
    ]);
  }
  // 유지되며 추가
  if (added.length > 0 && kept.length > 0) {
    return pick([
      `${f}의 ${keptStr} 흐름 위에 ${t}엔 ${addedStr} 기운이 새로 얹혀요.`,
      `${f}의 ${keptStr} 기운이 이어지는 가운데 ${t}엔 ${addedStr}까지 합류해요.`,
      `${f}의 ${keptStr} 흐름에 ${t}엔 ${addedStr} 축이 더해져 한층 풍부해져요.`,
    ]);
  }
  // 교체
  if (added.length > 0 && dropped.length > 0 && kept.length === 0) {
    return pick([
      `${f}의 ${droppedStr} 기조가 ${t}엔 ${addedStr}(으)로 바통을 넘겨요.`,
      `${f}의 ${droppedStr} 흐름이 접히고 ${t}엔 ${addedStr} 기운이 자리를 잡아요.`,
      `${f}에서 ${droppedStr}이(가) 도드라졌다면 ${t}엔 ${addedStr} 축이 새롭게 돌아가요.`,
    ]);
  }
  // 축소
  if (added.length === 0 && dropped.length > 0) {
    return pick([
      `${f}의 ${fromStr} 흐름 중 ${t}엔 ${keptStr || '일부'}만 남아 초점이 좁혀져요.`,
      `${f}의 넓은 ${fromStr} 흐름이 ${t}엔 ${keptStr || '핵심'}(으)로 압축돼요.`,
      `${f}에 비해 ${t}은 ${keptStr || '핵심'} 축만 남아 단일 초점이 돼요.`,
    ]);
  }
  // 순수 추가
  if (added.length > 0 && dropped.length === 0) {
    return pick([
      `${f}의 ${fromStr} 흐름 위에 ${t}엔 ${addedStr} 기운이 추가로 얹혀요.`,
      `${f}의 ${fromStr} 기조에 ${t}엔 ${addedStr}까지 합세해 영역이 넓어져요.`,
      `${f}의 ${fromStr} 흐름이 ${t}엔 ${addedStr}까지 끌어안으며 확장돼요.`,
    ]);
  }
  return `${f}의 흐름이 ${t}로 자연스럽게 이어져요.`;
}

/** 세운·월운·일진 세 시기를 하나의 서사로 엮는다 */
function buildFlowNarrative(
  y: PeriodChaeunInfo | null,
  m: PeriodChaeunInfo | null,
  d: PeriodChaeunInfo | null,
  seeds: { year: number; month: number; day: number },
): string {
  const parts: string[] = [];
  if (y) parts.push(`올해 ${phraseForPeriod(y.categories, 'year', seeds.year)}`);
  if (m) parts.push(`이번 달은 ${phraseForPeriod(m.categories, 'month', seeds.month)}`);
  if (d) parts.push(`오늘은 ${phraseForPeriod(d.categories, 'day', seeds.day)}이에요`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return `${parts[0]}이에요.`;
  // 자연 접속어: "X에서, Y, Z"
  return `${parts[0]}에서, ${parts.slice(1).join(', ')}.`;
}

/** 오늘 기준 올해 세운 · 이번 달 월운 · 오늘 일진의 재운 영향 평가 */
export function computeCurrentPeriodChaeun(ilgan: string, pillars: Pillar[] = []): CurrentPeriodChaeun {
  if (!ilgan) return { yeonun: null, wolun: null, iljin: null, flowNarrative: '', bridges: { yToM: '', mToD: '' } };
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  // 주 경로 (overall rating 에 보너스용)
  const wealthPaths = calculateWealthPaths(pillars);
  const dominantPath = wealthPaths && !wealthPaths.fallback ? wealthPaths.dominant.key : undefined;

  // 세운
  const yeonuns = calcYeonun();
  const yr = yeonuns.find(v => v.year === y);
  const yeonun = yr
    ? { ...evaluatePeriodChaeun(ilgan, yr.c, yr.j, yr.ck, yr.jk, pillars, dominantPath), year: yr.year }
    : null;

  // 월운
  const woluns = calcWolun();
  const mo = woluns.find(v => v.month === m);
  const wolun = mo
    ? { ...evaluatePeriodChaeun(ilgan, mo.c, mo.j, mo.ck, mo.jk, pillars, dominantPath), month: mo.month }
    : null;

  // 일진
  let iljin: CurrentPeriodChaeun['iljin'] = null;
  try {
    const g = getGapja(y, m, d);
    const dateLabel = `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
    iljin = {
      ...evaluatePeriodChaeun(ilgan, g.dayPillarHanja[0], g.dayPillarHanja[1], g.dayPillar[0], g.dayPillar[1], pillars, dominantPath),
      dateLabel,
    };
  } catch {}

  const flowNarrative = buildFlowNarrative(yeonun, wolun, iljin, {
    year: y,
    month: y * 12 + m,
    day: y * 10000 + m * 100 + d,
  });
  const yToM = yeonun && wolun ? buildBridge(yeonun.categories, wolun.categories, '올해', '이번 달', y * 12 + m) : '';
  const mToD = wolun && iljin ? buildBridge(wolun.categories, iljin.categories, '이번 달', '오늘', y * 10000 + m * 100 + d) : '';

  return { yeonun, wolun, iljin, flowNarrative, bridges: { yToM, mToD } };
}

export interface MonthWealthPoint {
  month: number;
  score: number;
  tone: 'good' | 'neutral' | 'caution';
  categories?: WealthPathKey[];
  themeLine?: string;
}

/** 올해 12개월 월운 재운 점수 시계열 — 스파크라인/차트용 */
export function buildMonthWealthSeries(ilgan: string, pillars: Pillar[] = []): MonthWealthPoint[] {
  if (!ilgan) return [];
  const wealthPaths = calculateWealthPaths(pillars);
  const dominantPath = wealthPaths && !wealthPaths.fallback ? wealthPaths.dominant.key : undefined;
  const woluns = calcWolun();
  return woluns
    .map((w) => {
      const info = evaluatePeriodChaeun(ilgan, w.c, w.j, w.ck, w.jk, pillars, dominantPath);
      return {
        month: w.month,
        score: info.overall.score,
        tone: info.overall.tone,
        categories: info.categories,
        themeLine: info.themeLine,
      };
    })
    .sort((a, b) => a.month - b.month);
}

/** 커리어 관점 시기 해석 — 조직·역량·학습 언어 (buildPeriodNote의 커리어 버전) */
export function buildCareerPeriodNote(categories: WealthPathKey[]): string {
  if (categories.length === 0) {
    return '이번 시기는 특별한 커리어 변수가 도드라지지 않는 안정 구간이에요. 큰 도전보다 기존 직무·역량을 유지하며 내실을 다지는 쪽이 결과적으로 유리해요. 조용히 실무 리듬·인맥·학습 루틴을 정비해두면 다음 기운이 올 때 먼저 움직일 수 있어요.';
  }
  const has = (k: WealthPathKey) => categories.includes(k);

  if (has('재성') && has('관성')) {
    return '관성과 재성이 함께 들어와 조직 내 영향력이 실질적 성과(승진·연봉·지분)로 연결되기 좋은 흐름이에요. 승진·이직·큰 프로젝트 같은 공식 자리에서 커리어 도약 기회가 따라오니, 기회가 보이면 망설이지 말고 잡으세요. 다만 책임이 커지므로 건강·일정 관리는 평소보다 촘촘하게 챙기는 게 좋아요.';
  }
  if (has('재성') && has('식상')) {
    return '식상(전문성)과 재성(보상)이 동시에 와서 내 역량이 실질적 성과로 연결되기 좋은 시기예요. 평소 아이디어로만 두었던 프로젝트를 실행에 옮기거나, 퍼스널 브랜드·사이드 프로젝트를 본격화하기에 적합해요. 작게라도 결과물을 공개하는 행동이 기대 이상의 평판으로 돌아올 수 있어요.';
  }
  if (has('재성') && has('비겁')) {
    return '재성과 비겁이 만나 경쟁·협업 속에서 커리어가 확장되는 흐름이에요. 공동 프로젝트·파트너십·네트워크 기반 일이 잘 풀리는 반면, 같은 분야 사람과 부딪힐 가능성도 높으니 역할과 기여도를 미리 명확히 정해두세요. 협업 전 R&R 문서·기여도 합의가 마찰을 크게 줄여줍니다.';
  }
  if (has('재성') && has('인성')) {
    return '재성이 오면서 인성도 받쳐주어 실력 기반의 지속가능한 커리어가 가능한 시기예요. 급하게 자리·연봉을 쫓기보다 전문성·자격·포트폴리오로 채널을 만들어두면 커리어가 길게 이어져요. 단기 이직보다 중장기 실력 쌓기가 훨씬 좋은 결과로 돌아오는 구간이에요.';
  }
  if (has('재성')) {
    return '재성이 들어와 새로운 프로젝트·직무 확장 기회가 눈에 들어오는 시기예요. 신사업·영업·사이드잡 같은 활동적 확장 쪽으로 시야가 열리며 평소와 다른 기회가 나타날 수 있어요. 다만 변동성이 커질 수 있으니 한꺼번에 전환하기보다 본업을 유지하며 단계적으로 넓혀가세요.';
  }

  if (has('관성') && has('인성')) {
    return '관성과 인성이 함께 와서 직장·전문성 트랙이 가장 돋보이는 시기예요. 조직 내에서 인정·승진·평가가 유리하게 흐르고, 자격·학위·지식이 실제 영향력으로 전환되기 좋아요. 이 시기의 공식적 자리·발표·정리 작업은 이후 커리어에 오래 남는 자산이 됩니다.';
  }
  if (has('관성') && has('식상')) {
    return '관성과 식상이 섞여 조직 안에서 창의적 역할을 할 기회가 커지는 흐름이에요. 공식 업무와 내 표현력·아이디어가 만나 프로젝트를 이끌거나 대외 활동을 하는 자리에 잘 맞아요. 다만 두 기운이 서로 충돌할 수 있어 업무 내/외 경계를 분명히 두는 게 안정적이에요.';
  }
  if (has('관성') && has('비겁')) {
    return '관성과 비겁이 만나 조직·단체 내에서 경쟁과 협력이 모두 강해지는 시기예요. 동료와 함께 큰 그림을 그리기 좋지만 역할 배분이 모호하면 마찰이 커지니 리더/서포터 위치를 분명히 해두세요. 공식 자리에서 신뢰를 쌓으면 추후 확실한 지원군이 됩니다.';
  }
  if (has('관성')) {
    return '직장·책임·공식 활동에서 기회가 커지는 시기예요. 승진·이직·자격 취득·공적 자리 같은 조직 관련 사건이 빈번해질 수 있고, 성실히 대응하면 장기 커리어 기반이 단단해져요. 책임이 늘어 스트레스도 함께 올 수 있으니 휴식 루틴을 의식적으로 챙기세요.';
  }

  if (has('인성') && has('식상')) {
    return '학습·자격(인성)과 표현·창작(식상)이 동시에 활성화돼 전문성을 콘텐츠로 푸는 흐름이 아주 좋은 시기예요. 새로 배우는 동시에 결과물을 기록·공유하면 전문가로서의 신뢰 자산이 빠르게 쌓여요. 강의·저술·뉴스레터 같은 지식 공유 채널을 시작하기에도 최적의 구간이에요.';
  }
  if (has('인성') && has('비겁')) {
    return '인성과 비겁이 만나 동료·멘토와 함께 배우고 성장하는 흐름이 강해지는 시기예요. 스터디·커뮤니티·스승과의 관계가 커리어 기반이 되니 지식을 나누는 자리에 적극 참여해보세요. 당장 성과로는 작아 보여도 길게 보면 다음 확장 시기에 든든한 토대가 됩니다.';
  }
  if (has('인성')) {
    return '인성이 들어와 단기 성과보다 학습·자격·전문성 투자에 집중하면 장기적으로 커리어 기반이 단단해지는 시기예요. 지금 공부해 두는 것, 쌓아 두는 자격증·경력이 다음 확장 구간에서 그대로 기회로 환산될 가능성이 커요. 자리를 쫓기보다 "받을 자격"을 만드는 시기로 써보세요.';
  }

  if (has('식상') && has('비겁')) {
    return '식상과 비겁이 만나 동료와 함께 창작·서비스를 전개하기 좋은 흐름이에요. 혼자보다 팀으로 움직일 때 더 큰 가치가 만들어지고, 공동 프로젝트·합작 콘텐츠가 의외의 반응을 얻을 수 있어요. 다만 역할 배분 원칙을 미리 세워두지 않으면 이후 관계가 어긋날 수 있으니 주의하세요.';
  }
  if (has('식상')) {
    return '식상이 들어와 창작·표현·전문 역량이 빛을 발하는 시기예요. 새로운 프로젝트·직무 확장 기회가 눈에 들어오고, 내 아웃풋을 외부에 꾸준히 내보내면 평가와 기회로 연결되기 좋아요. 완성도에 너무 매이지 말고 꾸준히 결과물을 내놓는 흐름을 만드는 게 포인트예요.';
  }

  if (has('비겁')) {
    return '비겁이 들어와 협업·네트워크·공동 프로젝트가 유리한 시기예요. 같은 분야 사람들과 만나는 자리에 참여하면 새 기회·정보가 자연스럽게 들어와요. 다만 동료와 역할·기여도가 엮이는 흐름이라 책임 범위와 수고 인정을 평소보다 한 번 더 명확히 하는 게 좋아요.';
  }

  return '—';
}

/** 커리어 관점의 시기 테마 한 줄 — PATH_SHORT 대신 커리어 친화 라벨 */
const CAREER_PATH_LABEL: Record<WealthPathKey, string> = {
  '재성': '성과·보상',
  '관성': '조직·직책',
  '식상': '전문성·아웃풋',
  '인성': '학습·자격',
  '비겁': '협업·경쟁',
};

export function buildCareerThemeLine(categories: WealthPathKey[]): string {
  if (categories.length === 0) return '—';
  return categories.map((c) => CAREER_PATH_LABEL[c]).join(' · ');
}

/** 커리어 운 평가 — 관성 > 식상 > 인성 순 가중치 (재운과 다른 축) */
export function calcCareerOverallRating(
  categories: WealthPathKey[],
  dominantPath?: WealthPathKey,
): PeriodOverallRating {
  const breakdown: Array<{ label: string; points: number; note: string }> = [];
  let score = 50;
  const has = (k: WealthPathKey) => categories.includes(k);

  breakdown.push({ label: '기본 점수', points: 0, note: '50점 출발' });

  if (has('관성')) {
    score += 20;
    breakdown.push({ label: '관성 진입', points: 20, note: '조직·직장·승진 축이 열려요' });
  }
  if (has('식상')) {
    score += 15;
    breakdown.push({ label: '식상 진입', points: 15, note: '전문성·아웃풋이 빛나요' });
  }
  if (has('인성')) {
    score += 10;
    breakdown.push({ label: '인성 진입', points: 10, note: '학습·자격·멘토 축이 강해져요' });
  }
  if (has('재성')) {
    score += 5;
    breakdown.push({ label: '재성 진입', points: 5, note: '부가 수익원·사이드잡 기운이 생겨요' });
  }
  if (has('비겁')) {
    if (has('관성')) {
      score += 5;
      breakdown.push({ label: '비겁+관성', points: 5, note: '협업·리더십 기회가 열려요' });
    } else {
      score -= 5;
      breakdown.push({ label: '비겁 단독', points: -5, note: '관성 없이 비겁만 — 경쟁 부담 주의' });
    }
  }
  if (dominantPath && categories.includes(dominantPath)) {
    score += 15;
    breakdown.push({ label: `주 경로(${dominantPath}) 적중`, points: 15, note: '내 커리어 구조와 결이 맞아 증폭돼요' });
  }
  if (categories.length === 0) {
    score = 50;
    breakdown.length = 0;
    breakdown.push({ label: '변수 없음', points: 0, note: '특별한 커리어 이벤트가 없는 평온 구간' });
  }

  score = Math.max(0, Math.min(100, score));

  const stars = score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
  const TABLE: Record<number, { label: string; tone: 'good' | 'neutral' | 'caution' }> = {
    5: { label: '최상 · 강한 확장', tone: 'good' },
    4: { label: '상승 · 유리한 흐름', tone: 'good' },
    3: { label: '보통 · 안정', tone: 'neutral' },
    2: { label: '주의 · 정비', tone: 'caution' },
    1: { label: '소극 · 방어', tone: 'caution' },
  };

  return { stars, score, label: TABLE[stars].label, tone: TABLE[stars].tone, breakdown };
}

export interface CareerPeriodsOverall {
  yeonun: PeriodOverallRating | null;
  wolun: PeriodOverallRating | null;
  iljin: PeriodOverallRating | null;
}

/** 기존 periodChaeun의 categories를 재사용해 커리어 rating만 다시 계산 */
export function deriveCareerOverall(
  periodChaeun: CurrentPeriodChaeun | null,
  pillars: Pillar[] = [],
): CareerPeriodsOverall {
  if (!periodChaeun) return { yeonun: null, wolun: null, iljin: null };
  const wealthPaths = calculateWealthPaths(pillars);
  const dominantPath = wealthPaths && !wealthPaths.fallback ? wealthPaths.dominant.key : undefined;
  return {
    yeonun: periodChaeun.yeonun ? calcCareerOverallRating(periodChaeun.yeonun.categories, dominantPath) : null,
    wolun: periodChaeun.wolun ? calcCareerOverallRating(periodChaeun.wolun.categories, dominantPath) : null,
    iljin: periodChaeun.iljin ? calcCareerOverallRating(periodChaeun.iljin.categories, dominantPath) : null,
  };
}

/** 올해 12개월 월운 커리어 점수 시계열 */
export function buildMonthCareerSeries(ilgan: string, pillars: Pillar[] = []): MonthWealthPoint[] {
  if (!ilgan) return [];
  const wealthPaths = calculateWealthPaths(pillars);
  const dominantPath = wealthPaths && !wealthPaths.fallback ? wealthPaths.dominant.key : undefined;
  const woluns = calcWolun();
  return woluns
    .map((w) => {
      const info = evaluatePeriodChaeun(ilgan, w.c, w.j, w.ck, w.jk, pillars, dominantPath);
      const career = calcCareerOverallRating(info.categories, dominantPath);
      return {
        month: w.month,
        score: career.score,
        tone: career.tone,
        categories: info.categories,
        themeLine: buildCareerThemeLine(info.categories),
      };
    })
    .sort((a, b) => a.month - b.month);
}

export function calculateWealthPaths(ps: Pillar[]): WealthPathsResult | null {
  const ilgan = ps[1]?.c;
  const ilganOh = CG_OH[ilgan || ''];
  if (!ilgan || !ilganOh) return null;
  const idx = OH_LIST.indexOf(ilganOh as (typeof OH_LIST)[number]);

  const pathOh: Record<WealthPathKey, string> = {
    '비겁': ilganOh,
    '식상': OH_LIST[(idx + 1) % 5],
    '재성': OH_LIST[(idx + 2) % 5],
    '관성': OH_LIST[(idx + 3) % 5],
    '인성': OH_LIST[(idx + 4) % 5],
  };

  const paths: WealthPath[] = (Object.keys(pathOh) as WealthPathKey[]).map(key => {
    const oh = pathOh[key];
    const { count, root } = countOhInChart(ps, oh, key === '비겁');
    const strength = Math.max(0, Math.min(100, count * 10 + root * 5));
    return {
      key, oh, count, rootStrength: root, strength,
      label: PATH_META[key].label,
      desc: PATH_META[key].desc,
    };
  });

  const sorted = [...paths].sort((a, b) => b.strength - a.strength);
  const dominant = sorted[0];
  const fallback = dominant.strength < 20;

  return { paths: sorted, dominant, fallback };
}

// ── 재성 프로파일 ──
export interface ChaeseongProfile {
  pyeonJae: number;
  jeongJae: number;
  totalCount: number;
  strength: number;        // 0~100
  hasRoot: boolean;
  rootStrength: number;
  dominantType: '편재' | '정재' | '균형' | '없음';
  chaeOh: string;
}

export function calculateChaeseongProfile(ps: Pillar[]): ChaeseongProfile {
  const ilgan = ps[1]?.c;
  const ilganOh = CG_OH[ilgan || ''];
  if (!ilgan || !ilganOh) {
    return { pyeonJae: 0, jeongJae: 0, totalCount: 0, strength: 0, hasRoot: false, rootStrength: 0, dominantType: '없음', chaeOh: '' };
  }
  const idx = OH_LIST.indexOf(ilganOh as (typeof OH_LIST)[number]);
  const chaeOh = OH_LIST[(idx + 2) % 5];
  const ilganYang = YANG_CG.has(ilgan);

  let pyeonJae = 0;
  let jeongJae = 0;

  // 천간 (일간 제외)
  for (let i = 0; i < ps.length; i++) {
    if (i === 1) continue;
    const c = ps[i]?.c;
    if (!c || CG_OH[c] !== chaeOh) continue;
    if (YANG_CG.has(c) === ilganYang) pyeonJae += 1;
    else jeongJae += 1;
  }

  // 지지 본기
  for (const p of ps) {
    const j = p?.j;
    if (!j) continue;
    const arr = JJG[j] || [];
    const main = arr[arr.length - 1];
    if (!main || CG_OH[main] !== chaeOh) continue;
    if (YANG_CG.has(main) === ilganYang) pyeonJae += 1;
    else jeongJae += 1;
  }

  // 지장간 뿌리
  let rootStrength = 0;
  let hasRoot = false;
  for (const p of ps) {
    const j = p?.j;
    if (!j) continue;
    const arr = JJG[j] || [];
    const weights = arr.length === 1 ? [3] : arr.length === 2 ? [1, 3] : [1, 2, 3];
    arr.forEach((h, i) => {
      if (CG_OH[h] === chaeOh) {
        rootStrength += weights[i];
        hasRoot = true;
      }
    });
  }

  const totalCount = pyeonJae + jeongJae;
  const strength = Math.max(0, Math.min(100, totalCount * 10 + rootStrength * 5));

  let dominantType: ChaeseongProfile['dominantType'];
  if (totalCount === 0) dominantType = '없음';
  else if (pyeonJae > jeongJae * 1.5) dominantType = '편재';
  else if (jeongJae > pyeonJae * 1.5) dominantType = '정재';
  else dominantType = '균형';

  return { pyeonJae, jeongJae, totalCount, strength, hasRoot, rootStrength, dominantType, chaeOh };
}

// ── 6타입 진단 (신강/중화/신약 × 재강/재약) ──
export type ChaeunType = '관리형' | '확장형' | '균형형' | '기회형' | '재다신약' | '우회축적';
export interface ChaeunDiagnosis {
  type: ChaeunType;
  headline: string;
  strengths: string[];
  cautions: string[];
  attitude: string[];
  investmentStyle: string[];
  avoid: string[];
  // 줄글 요약 (UI 표시용)
  attitudeProse: string;
  investmentProse: string;
  accumulationProse: string;
}

const CHAEUN_DIAGNOSES: Record<ChaeunType, Omit<ChaeunDiagnosis, 'type'>> = {
  '관리형': {
    headline: '자수성가형 · 꾸준히 쌓아가는 축적의 구조예요',
    strengths: [
      '재물을 스스로 다룰 힘이 있어 체계적인 자산 관리에 강점이 있어요',
      '장기 저축·부동산·우량주 같은 안정 자산과 잘 맞는 편이에요',
      '본업과 부수입을 함께 챙기는 체력이 받쳐주는 체질이에요',
    ],
    cautions: [
      '과도한 확장은 오히려 피로가 쌓이기 쉬운 구조예요',
      '공격적인 단기 투자는 들이는 노력에 비해 효율이 낮은 편이에요',
      '세금·상속처럼 보이지 않는 유출 구멍이 생기기 쉬운 특성이 있어요',
    ],
    attitude: [
      '당장의 큰 수익보다 복리로 천천히 불어나는 흐름을 신뢰해보세요',
      '수입·지출·투자 규칙을 문서로 정리해 루틴으로 만들어보세요',
      '기회가 와도 한 번 더 점검하고 움직이는 속도가 오히려 효율적이에요',
      '충동 소비보다 연간 예산·목표 중심의 재정 계획을 세워보세요',
    ],
    investmentStyle: [
      '저축·우량 배당주·장기 ETF 같은 안정 자산을 코어(70%) 이상으로 가져가세요',
      '부동산·REITs 같은 실물 자산과도 궁합이 잘 맞는 편이에요',
      '단기 매매보다 분기·연 단위 리밸런싱으로 손실을 방어하세요',
      '보험·연금 같은 장기 리스크 헷지 상품을 일찍부터 설계해두세요',
    ],
    avoid: [
      '레버리지(신용·미수)를 과하게 쓰는 단기 투자',
      '관리 가능한 범위를 넘는 다중 사업·중개 활동',
      '세금·상속 계획을 미루고 덩치만 키우는 자산 증식',
    ],
    attitudeProse: '당신은 한 방의 대박보다 복리로 천천히 불어나는 흐름에서 가장 큰 힘을 발휘하는 체질이에요. 수입과 지출, 투자 규칙을 문서로 정리해 루틴화하면 몸이 자연스럽게 따라가고, 기회가 와도 한 번 더 점검한 뒤 움직이는 속도가 오히려 효율적이에요. 충동적인 소비를 줄이고 연간 예산과 목표를 중심으로 재정 계획을 세워두면, 시간이 지날수록 차곡차곡 쌓이는 결과를 체감하게 될 거예요.',
    investmentProse: '포트폴리오의 코어(70% 이상)는 저축·우량 배당주·장기 ETF 같은 안정 자산으로 채우는 게 체질에 맞아요. 부동산이나 REITs 같은 실물 자산과도 궁합이 좋고, 단기 매매 대신 분기·연 단위 리밸런싱으로 손실을 방어하는 전략이 잘 먹히는 편이에요. 보험·연금처럼 장기 리스크를 헷지하는 상품은 일찍 설계해둘수록 나중에 큰 안전판이 됩니다.',
    accumulationProse: '재물을 스스로 다룰 힘이 충분해서 체계적인 자산 관리에 타고난 강점이 있어요. 장기 저축이나 우량주 같은 안정 자산과 잘 맞고, 본업과 부수입을 동시에 챙길 체력도 받쳐주는 구조예요. 다만 과도한 확장은 피로로 이어지기 쉽고, 공격적인 단타 투자는 들이는 노력 대비 효율이 낮은 편이에요. 세금이나 상속처럼 보이지 않는 유출 구멍도 체질적으로 생기기 쉬우니, 꾸준한 점검이 축적의 핵심이 됩니다.',
  },
  '확장형': {
    headline: '기회를 만들어가는 구조예요 · 재성이 용신/희신 역할',
    strengths: [
      '재물에 대한 갈증이 실행력으로 이어져, 기회를 포착하면 누구보다 빠르게 뛰어드는 체질이에요',
      '사업·영업·프리랜스처럼 소득 원천을 여러 갈래로 벌려가는 방식이 잘 맞아요',
      '재성 세운이 들어올 때마다 평소와 다른 도약의 계단을 하나씩 밟아요',
    ],
    cautions: [
      '한 건 성사 직후 긴장이 풀려, 다음 기회까지의 공백을 견디기 어려운 편이에요',
      '준비 단계의 지루함을 잘 못 견뎌, 기반 설계보다 실행부터 달려드는 습관이 있어요',
      '사람·네트워크가 곧 자본이라 인연 하나가 틀어지면 수입 루트가 한 번에 흔들려요',
    ],
    attitude: [
      '재성 세운이 돌아올 때까지 기다리지 말고, 지금부터 매일 작은 프로젝트를 돌려 실행 근육을 유지해보세요',
      '관계·신용을 자산이라 생각하고 인연을 꾸준히 정성껏 챙겨보세요',
      '성공한 선배·친구의 루틴을 벤치마킹해 내 방식으로 소화해보세요',
      '실패도 데이터로 남기는 습관을 만들어두세요',
    ],
    investmentStyle: [
      '성장주·테마주·사업 재투자처럼 업사이드가 큰 자산으로 공격해보세요',
      '부업·사이드 프로젝트·신규 수익 채널을 여러 개 병행해보세요',
      '현금 흐름(cash flow)이 나오는 자산(임대·배당·구독)으로 베이스를 먼저 깔아두세요',
      '재성 세운이 드는 해에는 과감한 실행을 허용할 여유 자금을 따로 확보해두세요',
    ],
    avoid: [
      '준비 없이 큰 돈을 운용하는 일시적 대박 시도',
      '고정 지출을 늘리는 장기 약정·고정비 계약',
      '혼자 감당 어려운 고위험 단기 투자 (레버리지·선물·옵션 등)',
    ],
    attitudeProse: '당신에게 가장 잘 맞는 리듬은, 재성 세운이 돌아오길 기다리지 않고 지금부터 작은 프로젝트를 매일 하나씩 돌려 실행 근육을 살려두는 거예요. 관계와 신용은 눈에 보이지 않는 자산이니 인연을 꾸준히 정성껏 챙기고, 주변에서 잘 되는 사람의 루틴을 관찰해 내 방식으로 소화해보세요. 실패하더라도 기록으로 남겨두면 다음번엔 같은 실수를 피할 수 있는 나만의 데이터베이스가 됩니다.',
    investmentProse: '업사이드가 큰 자산에 공격적으로 베팅하는 게 체질에 맞아요. 성장주나 테마주, 혹은 사업 재투자처럼 확장성이 보이는 곳에 자금을 넣되, 부업이나 사이드 프로젝트로 수익 채널을 여러 갈래로 열어두는 게 핵심이에요. 다만 베이스는 임대·배당·구독처럼 현금 흐름이 나오는 자산으로 깔아두고, 재성 세운이 드는 해에 과감하게 움직일 수 있도록 여유 자금을 미리 확보해두세요.',
    accumulationProse: '기회를 포착하면 누구보다 빠르게 뛰어드는 실행력이 가장 큰 무기예요. 사업이든 영업이든 프리랜스든, 소득 원천을 여러 갈래로 벌려가는 방식이 체질에 잘 맞고, 재성 세운이 들어올 때마다 평소와 다른 도약의 계단을 밟게 돼요. 반면 한 건 성사 후 긴장이 풀려 공백을 견디기 어렵고, 준비 단계의 지루함을 잘 못 견뎌 기반 설계 없이 실행부터 달려드는 습관이 있어요. 사람과 네트워크가 곧 자본인 구조라 인연 관리에 빈틈이 생기면 수입 루트가 한 번에 흔들릴 수 있으니 주의가 필요합니다.',
  },
  '균형형': {
    headline: '중화된 바탕에 재성이 넉넉한 구조예요 · 공수 양면에 자유로움',
    strengths: [
      '일간의 세력이 치우치지 않아, 상황에 따라 유연하게 대응할 수 있는 체질이에요',
      '재성이 받쳐줘서 공격(확장)과 수비(관리)를 자유롭게 오갈 수 있는 구조예요',
      '단기 변동에도 크게 흔들리지 않는 안정감이 있는 편이에요',
    ],
    cautions: [
      '특화된 포인트가 약해 임팩트가 작게 느껴질 수 있는 구조예요',
      '균형을 맞추려다 판단이 늦어지는 때가 있는 편이에요',
      '리스크를 너무 피하면 성장 기회를 놓치기 쉬운 흐름이에요',
    ],
    attitude: [
      '전반적인 균형을 지키되, 분기마다 공격 포인트 하나씩 정해보세요',
      '여러 선택지 앞에서 고민하기보다 정해진 원칙대로 빠르게 결정해보세요',
      '보수·공격 비율을 매년 점검하며 조금씩 조정해보세요',
      '감이 오는 순간은 기록해뒀다가 조건이 맞을 때 실행해보세요',
    ],
    investmentStyle: [
      '안정(코어) 60% + 공격(위성) 40% 하이브리드로 기본 세팅하세요',
      '분기별·반기별 리밸런싱을 엄격하게 지키세요',
      '국내·해외, 주식·채권, 성장·가치 같은 대립 축을 의식적으로 섞어보세요',
      '재성 세운에는 공격 비중을 10~15%P 올려 유연하게 조정해보세요',
    ],
    avoid: [
      '균형이라는 이름으로 결정을 무한정 미루는 습관',
      '모든 자산에 조금씩만 넣어 어느 쪽도 수익이 안 되는 상태',
      '리밸런싱 원칙 없이 감정에 따라 비중을 조정하는 일',
    ],
    attitudeProse: '당신은 공격과 수비를 유연하게 전환할 수 있는 체질이에요. 다만 그 유연함이 우유부단으로 빠지지 않으려면, 분기마다 공격 포인트를 딱 하나 정해두고 나머지는 자동 조종 모드로 두는 게 좋아요. 여러 선택지 앞에서 고민이 길어질 땐 미리 세워둔 원칙에 따라 빠르게 결정하고, 보수와 공격 비율은 매년 한 번씩 점검하며 조금씩 조정하세요. 감이 오는 순간을 기록해뒀다가, 조건이 맞을 때 꺼내 실행하는 습관이 가장 큰 차이를 만들어줍니다.',
    investmentProse: '코어 자산 60%는 안정적으로, 나머지 40%는 공격적으로 배치하는 하이브리드 전략이 체질에 잘 맞아요. 분기별이든 반기별이든 리밸런싱 주기를 정해 엄격하게 지키고, 국내와 해외, 주식과 채권, 성장과 가치 같은 대립 축을 의식적으로 섞어두면 한쪽이 무너져도 전체가 흔들리지 않아요. 재성 세운이 드는 해에는 공격 비중을 10~15%P 정도 올려서 흐름을 타보세요.',
    accumulationProse: '일간의 세력이 치우치지 않아 상황에 따라 유연하게 대응할 수 있는 게 타고난 강점이에요. 재성이 받쳐주는 구조라 확장과 관리 양쪽을 자유롭게 오갈 수 있고, 단기 변동에도 크게 흔들리지 않는 안정감이 바탕에 깔려 있어요. 반면 뚜렷한 특화 포인트가 약해 임팩트가 작게 느껴질 수 있고, 균형을 맞추려다 결정이 늦어지거나 리스크를 지나치게 회피해 성장 기회를 놓치기 쉬운 흐름이니, 때로는 의식적으로 한쪽에 무게를 실어보는 것도 필요합니다.',
  },
  '기회형': {
    headline: '중화된 구조지만 재성이 약한 편 · 외부 기회를 잡아내는 게 재운의 핵심이에요',
    strengths: [
      '감정 기복이 적어 과열장·공포장에서도 침착하게 판단할 수 있는 체질이에요',
      '사람·정보를 한 줄기로 엮어내는 직조 감각이 수익 설계에서 가장 큰 무기예요',
      '실수가 적어 시간이 지날수록 신뢰·평판이 복리로 불어나는 흐름이에요',
    ],
    cautions: [
      '먼저 움직이지 않으면 기회가 내 앞을 그대로 스쳐 지나가는 체질이에요',
      "신중함이 지나쳐 '조금만 더 지켜보자'다가 타이밍 밖으로 밀려나는 순간이 반복돼요",
      '고정 수입 루트가 약해, 수입이 파도처럼 들쭉날쭉한 구간을 스스로 설계·관리해야 해요',
    ],
    attitude: [
      "평소엔 고요히 관찰하다가, '이건 내 판이다' 싶은 순간 한 번에 결단하는 리듬이 가장 잘 맞아요",
      '정보 수집을 일상 루틴으로 만들어보세요',
      '자격·네트워크·평판을 꾸준히 쌓아 기회가 왔을 때 받을 준비를 해보세요',
      '혼자 판단하기 어려운 건 신뢰할 수 있는 사람에게 의견을 구해보세요',
    ],
    investmentStyle: [
      '여유 자금의 60~70%는 예금·단기 채권 같은 방어 자산으로 두세요',
      '정보 기반 스윙 트레이딩·테마주 소액 투자 정도로 공격 비중을 조절하세요',
      '자기계발·자격증·인맥 투자처럼 무형 자산에도 꾸준히 분산해두세요',
      '수익 극대화보다 손실 최소화를 우선 원칙으로 잡으세요',
    ],
    avoid: [
      '기회가 와도 주저하다가 타이밍을 놓치는 패턴',
      '한 번도 안 해본 고위험 투자에 여유 자금 전부를 거는 행동',
      '외부 정보 없이 혼자 판단만 붙들고 있는 고립형 의사결정',
    ],
    attitudeProse: '당신에게 맞는 리듬은 평소에는 고요히 관찰하다가, "이건 내 판이다" 싶은 순간에 한 번에 결단하는 방식이에요. 그 순간을 놓치지 않으려면 정보 수집을 일상 루틴처럼 챙겨두고, 자격이나 네트워크, 평판 같은 무형 자산을 미리 쌓아두는 게 핵심이에요. 혼자 판단이 어려울 땐 신뢰할 수 있는 사람에게 의견을 구하는 습관이 결정적인 타이밍에서 큰 차이를 만들어줍니다.',
    investmentProse: '자금의 60~70%는 예금이나 단기 채권 같은 방어 자산에 묶어두고, 나머지로 정보 기반 스윙 트레이딩이나 테마주 소액 투자 정도로 공격하는 게 체질에 맞아요. 자기계발이나 자격증, 인맥 투자처럼 무형 자산에도 꾸준히 분산해두면 기회가 왔을 때 빠르게 전환할 수 있어요. 전체 원칙은 수익 극대화보다 손실 최소화를 우선에 두는 겁니다.',
    accumulationProse: '감정 기복이 적어서 시장이 과열되든 공포에 빠지든 침착하게 판단할 수 있는 게 가장 큰 강점이에요. 사람과 정보를 한 줄기로 엮어내는 감각이 수익 설계의 무기가 되고, 실수가 적은 덕분에 시간이 지날수록 신뢰와 평판이 복리로 쌓여요. 다만 먼저 움직이지 않으면 기회가 그대로 스쳐 지나가는 구조이고, 신중함이 지나쳐 타이밍을 놓치는 패턴이 반복될 수 있어요. 고정 수입 루트가 약한 편이라, 수입의 파도를 스스로 설계하고 관리하는 의식적인 노력이 축적의 열쇠입니다.',
  },
  '재다신약': {
    headline: '돈은 많이 보이지만, 혼자 감당하기는 버거운 구조예요',
    strengths: [
      '큰 돈이 오가는 환경에 자연스럽게 노출되는 편이에요',
      '재무·금융 흐름을 읽어내는 감각이 발달해 있는 체질이에요',
      '중개·유통처럼 돈을 거쳐가게 하는 일에서 강점이 드러나요',
    ],
    cautions: [
      "돈이 보이는 만큼 다 쥐려 하면 오히려 손가락 사이로 새어나가는 '큰돈 앞의 허약 체질'이에요",
      '타인 자본·보증 거래에 휘말리면 내 돈보다 남 돈 때문에 흔들리기 쉬워요',
      '체력이 떨어지는 순간 재운도 함께 빠져나가 — 건강 관리가 곧 재산 방어선이에요',
    ],
    attitude: [
      '욕심을 조금 줄이고, 혼자 짊어지기보다 위임하고 나눠 담아보세요',
      '숫자 작업은 위임하되 의사결정 권한은 본인이 쥐어두세요',
      '수면·식사·운동 같은 체력 기반을 돈만큼 챙겨보세요',
      '사적 인간관계와 금전 관계를 분리하는 원칙을 미리 세워두세요',
    ],
    investmentStyle: [
      '분산 ETF·글로벌 인덱스 중심으로, 개별 종목 비중은 20% 이하로 낮추세요',
      '투자 결정은 전문가(재무설계사·세무사)의 2차 리뷰를 거치는 프로세스를 만드세요',
      '비상금을 평소보다 넉넉히(6개월치 이상) 유지하세요',
      '건강·교육 같은 자기 보호성 지출은 아끼지 말고 챙기세요',
    ],
    avoid: [
      '지인·가족 대상 금전 대출이나 연대 보증',
      '큰 돈이 보인다고 무리하게 가져오려는 확장 시도',
      '혼자 판단해 큰 계약을 즉흥적으로 체결하는 행동',
    ],
    attitudeProse: '당신에게는 욕심을 한 발짝 줄이고, 혼자 짊어지기보다 위임하며 나눠 담는 방식이 훨씬 효과적이에요. 숫자 작업이나 실무는 믿을 수 있는 사람에게 맡기되 최종 의사결정 권한만큼은 본인이 쥐고 있어야 방향을 잃지 않아요. 수면과 식사, 운동 같은 체력 기반을 돈만큼 중요하게 챙기고, 사적 인간관계와 금전 관계를 분리하는 원칙을 미리 세워두면 불필요한 엮임에서 자유로워질 수 있습니다.',
    investmentProse: '분산 ETF나 글로벌 인덱스 중심으로 포트폴리오를 짜고, 개별 종목 비중은 20% 이하로 낮추는 게 안전해요. 투자 결정을 내리기 전에 재무설계사나 세무사 같은 전문가의 2차 리뷰를 거치는 프로세스를 습관화하면 즉흥적인 판단 실수를 막을 수 있어요. 비상금은 6개월치 이상 넉넉하게 유지하고, 건강이나 교육 같은 자기 보호성 지출은 아끼지 말고 챙기세요.',
    accumulationProse: '큰 돈이 오가는 환경에 자연스럽게 노출되고 재무 흐름을 읽어내는 감각도 발달해 있어서, 중개나 유통처럼 돈을 거쳐가게 하는 일에서 두각을 나타내는 체질이에요. 하지만 보이는 돈을 전부 쥐려 하면 오히려 새어나가기 쉽고, 타인 자본이나 보증 거래에 휘말리면 남의 돈 때문에 내 재정이 흔들리는 구조예요. 체력이 떨어지는 순간 재운도 함께 빠져나가기 때문에, 건강 관리가 곧 자산의 방어선이라는 점을 항상 기억해두세요.',
  },
  '우회축적': {
    headline: '재물보다 지식·전문직으로 우회하며 쌓아가는 구조예요',
    strengths: [
      '인성·식상이 강해 전문성·자격·브랜드가 그대로 소득으로 이어지는 체질이에요',
      '학업·연구·창작 같은 무형 자산이 곧 재물의 뿌리가 되는 구조예요',
      '큰 기복 없이 안정적으로 소득이 쌓이는 흐름이에요',
    ],
    cautions: [
      '직접적인 재성이 약해 큰 재물 기회는 상대적으로 적은 편이에요',
      '지식을 돈으로 바꾸는 채널을 의식적으로 설계하지 않으면 정체되기 쉬워요',
      '단기 투자 성공에 집착하면 오히려 실패 확률이 높아지는 흐름이에요',
    ],
    attitude: [
      '실력을 쌓고, 그 실력을 바탕으로 보수를 받는 구조를 천천히 설계해보세요',
      '자격·학위·저술 같은 무형 자산을 오래 가는 복리로 여겨보세요',
      '내 전문성을 알릴 채널(블로그·뉴스레터·SNS)을 하나씩 키워보세요',
      '수익화 스트레스가 올 땐 한 걸음 물러나 본업부터 탄탄히 다져보세요',
    ],
    investmentStyle: [
      '자기계발·교육·도서·세미나 투자를 먼저 충분히 배분하세요',
      '여유 자금은 보수적인 저축·우량 ETF 같은 저관리 자산으로 두세요',
      '부업·사이드 수익은 본업 전문성의 연장선에서 설계하세요',
      '단기 매매보다 10년 이상 바라보는 장기 분산 투자를 택하세요',
    ],
    avoid: [
      '전문성과 무관한 테마주·단기 트레이딩에 여유 자금 집중 투입',
      '수익화 조급함에 검증 안 된 사업·코인·파생 상품 진입',
      '내 전문 영역을 버리고 유행 따라 경력 방향을 급하게 바꾸는 선택',
    ],
    attitudeProse: '당신에게 가장 자연스러운 방식은 실력을 먼저 쌓고, 그 실력을 바탕으로 보수를 받는 구조를 천천히 설계해 나가는 거예요. 자격이나 학위, 저술 같은 무형 자산은 시간이 지날수록 복리로 불어나는 자산이니 꾸준히 투자하고, 블로그나 뉴스레터, SNS 같은 채널로 전문성을 알려두면 기회가 자연스럽게 찾아와요. 수익화에 대한 스트레스가 밀려올 땐 한 걸음 물러나 본업부터 탄탄히 다지는 게 결국 가장 빠른 길입니다.',
    investmentProse: '자기계발, 교육, 도서, 세미나처럼 자신에게 투자하는 비용을 먼저 충분히 배분하는 게 이 체질의 핵심 전략이에요. 여유 자금은 보수적인 저축이나 우량 ETF 같은 저관리 자산에 두고, 부업이나 사이드 수익도 본업 전문성의 연장선에서 설계해야 효율이 나와요. 단기 매매 유혹이 와도 10년 이상 바라보는 장기 분산 투자를 택하는 편이 체질에 훨씬 잘 맞습니다.',
    accumulationProse: '인성과 식상이 강한 덕분에 전문성이나 자격, 브랜드가 그대로 소득으로 이어지는 체질이에요. 학업이나 연구, 창작 같은 무형 자산이 재물의 뿌리가 되고 큰 기복 없이 안정적으로 쌓여가는 흐름이 깔려 있어요. 다만 직접적인 재성이 약해 한 방에 큰 돈이 들어오는 기회는 상대적으로 적고, 지식을 돈으로 바꾸는 채널을 의식적으로 만들어두지 않으면 정체되기 쉬워요. 단기 투자 성공에 집착하면 오히려 실패 확률만 높아지니, 우회하며 쌓아가는 자신만의 리듬을 믿어보세요.',
  },
};

// ── 원국 신살 감지 ──
type NatalSinsal = '천을귀인' | '문창귀인' | '역마살' | '도화살' | '화개살' | '겁살' | '재살';

function detectNatalSinsal(pillars: Pillar[]): NatalSinsal[] {
  const ilgan = pillars[1]?.c;
  const ilji = pillars[1]?.j;
  if (!ilgan) return [];
  const jis = pillars.map(p => p?.j).filter(Boolean) as string[];
  const hits: NatalSinsal[] = [];
  const cheonuls = CHEONUL[ilgan] || [];
  if (jis.some(j => cheonuls.includes(j))) hits.push('천을귀인');
  if (MUNCHANG[ilgan] && jis.includes(MUNCHANG[ilgan])) hits.push('문창귀인');
  if (ilji) {
    if (YEOKMA[ilji] && jis.includes(YEOKMA[ilji])) hits.push('역마살');
    if (DOHWA[ilji] && jis.includes(DOHWA[ilji])) hits.push('도화살');
    if (HWAGAE[ilji] && jis.includes(HWAGAE[ilji])) hits.push('화개살');
    if (GEOBSAL[ilji] && jis.includes(GEOBSAL[ilji])) hits.push('겁살');
    if (JAESAL[ilji] && jis.includes(JAESAL[ilji])) hits.push('재살');
  }
  return hits;
}

// ── 신살·합충별 개인화 꼬리 문장 매핑 ──
interface PersonalTail {
  strengths?: string;
  cautions?: string;
  attitude?: string;
  investmentStyle?: string;
  avoid?: string;
}

const SINSAL_TAILS: Record<NatalSinsal, PersonalTail> = {
  '천을귀인': {
    strengths: '원국 천을귀인 — 어려울 때 귀인의 도움을 받기 쉬운 체질이에요',
    attitude: '큰 결정 앞에선 선배·멘토·전문가의 의견을 꼭 들어보세요',
  },
  '문창귀인': {
    strengths: '원국 문창귀인 — 학문·자격·시험 쪽 성과가 특히 돋보여요',
    investmentStyle: '자기계발·교육 투자 수익률이 남들보다 높게 돌아오는 편이에요',
  },
  '역마살': {
    attitude: '원국 역마 — 이동·여행·해외 경험이 재운을 넓혀줘요',
    cautions: '이동·출장·교통 관련 지출이 새나가기 쉬운 구조예요',
  },
  '도화살': {
    strengths: '원국 도화 — 사람을 끌어당기는 매력으로 기회를 만드는 체질이에요',
    cautions: '인간관계 기반 지출이 커질 수 있어 경계 설정이 중요해요',
  },
  '화개살': {
    strengths: '원국 화개 — 한 분야를 깊이 파고드는 집중력이 재산이에요',
    attitude: '혼자 몰입하는 시간을 존중해주는 환경을 미리 설계해두세요',
  },
  '겁살': {
    cautions: '원국 겁살 — 예상치 못한 지출·손실 위험이 평소보다 높은 구조예요',
    avoid: '보증·대출처럼 타인 돈과 얽히는 일',
  },
  '재살': {
    cautions: '원국 재살 — 건강·안전사고가 곧 재물 손실로 이어지기 쉬워요',
    attitude: '건강검진·보험은 남들보다 일찍 챙겨두시면 장기 이득이에요',
  },
};

function buildHapChungTail(hapChung: HapChungItem[]): PersonalTail {
  const hasChung = hapChung.some(h => h.type === '지지충');
  const hasSamhap = hapChung.some(h => h.type === '지지삼합');
  const hasYukhap = hapChung.some(h => h.type === '지지육합');
  const hasChGanhap = hapChung.some(h => h.type === '천간합');

  const tail: PersonalTail = {};
  if (hasChung) {
    tail.cautions = '원국 지지충 — 변동·이동이 많은 구조라 루틴을 스스로 만들어야 재운이 쌓여요';
  }
  if (hasSamhap) {
    tail.strengths = '원국 삼합 — 특정 오행 흐름이 강해 그 오행 업종·관계에서 기회가 커요';
  }
  if (hasYukhap) {
    tail.strengths = tail.strengths
      ? tail.strengths
      : '원국 육합 — 친화·연결 감각이 발달해 파트너십·협업에서 기회가 열리기 쉬워요';
  }
  if (hasChGanhap) {
    tail.attitude = '원국 천간합 — 사람·조직과의 계약·약속이 비교적 매끄럽게 풀리는 편이에요';
  }
  return tail;
}

function appendTails(
  base: string[],
  tails: (string | undefined)[],
): string[] {
  const extras = tails.filter((t): t is string => !!t);
  if (extras.length === 0) return base;
  return [...base, ...extras];
}

export function diagnoseChaeun(
  sgy: SinGangYakResult,
  chaeseong: ChaeseongProfile,
  pillars?: Pillar[],
): ChaeunDiagnosis {
  // 신강약을 3단계로 분리
  const bodyLevel: 'strong' | 'medium' | 'weak' =
    sgy.level === '극신강' || sgy.level === '신강' ? 'strong'
    : sgy.level === '중화' ? 'medium'
    : 'weak';
  const chaeStrong = chaeseong.strength >= 40;

  let type: ChaeunType;
  if (bodyLevel === 'strong' && chaeStrong) type = '관리형';
  else if (bodyLevel === 'strong' && !chaeStrong) type = '확장형';
  else if (bodyLevel === 'medium' && chaeStrong) type = '균형형';
  else if (bodyLevel === 'medium' && !chaeStrong) type = '기회형';
  else if (bodyLevel === 'weak' && chaeStrong) type = '재다신약';
  else type = '우회축적';

  const base = CHAEUN_DIAGNOSES[type];

  // pillars 없으면 기본 진단만 반환 (하위 호환)
  if (!pillars || pillars.length === 0) {
    return { type, ...base };
  }

  // 원국 신살·합충 감지 → 섹션별 꼬리 문장 수집
  const sinsalList = detectNatalSinsal(pillars);
  const hapChung = detectHapChung(pillars);
  const hapChungTail = buildHapChungTail(hapChung);

  const strengthsTails = [
    ...sinsalList.map(s => SINSAL_TAILS[s].strengths),
    hapChungTail.strengths,
  ];
  const cautionsTails = [
    ...sinsalList.map(s => SINSAL_TAILS[s].cautions),
    hapChungTail.cautions,
  ];
  const attitudeTails = [
    ...sinsalList.map(s => SINSAL_TAILS[s].attitude),
    hapChungTail.attitude,
  ];
  const investTails = [
    ...sinsalList.map(s => SINSAL_TAILS[s].investmentStyle),
    hapChungTail.investmentStyle,
  ];
  const avoidTails = [
    ...sinsalList.map(s => SINSAL_TAILS[s].avoid),
    hapChungTail.avoid,
  ];

  return {
    type,
    headline: base.headline,
    strengths: appendTails(base.strengths, strengthsTails),
    cautions: appendTails(base.cautions, cautionsTails),
    attitude: appendTails(base.attitude, attitudeTails),
    investmentStyle: appendTails(base.investmentStyle, investTails),
    avoid: appendTails(base.avoid, avoidTails),
    attitudeProse: base.attitudeProse,
    investmentProse: base.investmentProse,
    accumulationProse: base.accumulationProse,
  };
}

// ── 대운 재물 타임라인 ──
export type ChaeunTimelineRating = 'strong' | 'mixed' | 'caution';
export interface ChaeunDaeunSegment {
  age: number;
  ganji: string;
  ganjiHanja: string;
  theme: string;
  rating: ChaeunTimelineRating;
  note: string;
  poolKey: string;
  actions: string[];
}

// 대운 테마별 권장 행동 풀 — 현재 대운 상세 카드에서 노출
const DAEUN_ACTION_POOLS: Record<string, string[]> = {
  '직장 재물': [
    '공식 자리·승진·이직 기회가 오면 주저 말고 받아보세요.',
    '성과-보상 연결 구조(성과금·인센티브) 를 명확히 챙기세요.',
    '책임 과부하 방지용 휴식·건강 루틴을 미리 설계하세요.',
  ],
  '재물 확장 편재': [
    '새로운 수익 채널·사이드 프로젝트 런칭에 가장 좋은 타이밍이에요.',
    '큰 단위 거래·협상 자리에 적극 참여해 보세요.',
    '기복이 크니 비상금 30%는 늘 분리해두세요.',
  ],
  '재물 확장 정재': [
    '고정 수입 확대(월급 협상·정기 계약)에 좋은 시점이에요.',
    '장기 저축·연금·부동산 같은 안정 자산 비중을 늘려보세요.',
    '무리한 투기·단기 트레이딩은 체질과 맞지 않는 구간이에요.',
  ],
  '재물 유출 주의 초입': [
    '초입 5년 — 신규 차입·보증·동업 시작은 일단 보류하세요.',
    '기존 채무·고정 지출 구조를 정리하는 게 우선이에요.',
    '건강·안전 관리가 곧 재물 방어선이에요.',
  ],
  '재물 유출 주의': [
    '신규 차입·보증·동업 시작은 이 구간엔 보류가 안전해요.',
    '여유 현금 비중을 평소보다 높게 유지하세요.',
    '타인 돈과 얽힌 거래는 문서·계약을 두 배로 꼼꼼히.',
  ],
  '경쟁·분재': [
    '공동 프로젝트는 역할·지분을 계약서로 먼저 명확히 하세요.',
    '네트워크·커뮤니티 참여로 기회를 발굴하세요.',
    '나만의 차별점을 계속 갈고 닦아 경쟁 우위를 만드세요.',
  ],
  '직장·책임 편관': [
    '도전적 직책·고난도 프로젝트를 의식적으로 수용하세요.',
    '멘토·상급자와의 정기 소통으로 압박을 분산하세요.',
    '스트레스 관리가 곧 장기 성과 관리예요.',
  ],
  '직장·책임 정관': [
    '조직 내 신뢰 자본(정직·꾸준함) 축적에 집중하세요.',
    '자격·경력 증명 문서를 최신 상태로 정리·갱신하세요.',
    '공식 라인 업그레이드 타이밍에 주저 말고 지원하세요.',
  ],
  '전문성 기반 정인': [
    '자격증·학위·전문 교육 투자가 가장 높은 수익률로 돌아와요.',
    '기록·아카이브·연구를 꾸준히 축적하세요.',
    '지식 공유 채널(강의·블로그·뉴스레터)을 시작하기 좋은 구간.',
  ],
  '전문성 기반 편인': [
    '독립 연구·1:1 컨설팅 영역을 개척해 보세요.',
    '남다른 관점·비주류 전문성을 있는 그대로 살리세요.',
    '배운 건 곧바로 실전에 적용하는 사이클을 유지하세요.',
  ],
  '재물 생산 식신': [
    '꾸준한 창작·콘텐츠 제작 루틴을 구조화하세요.',
    '구독형·정기형 서비스 모델로 수익을 안정화하세요.',
    '완성도보다 공개 속도를 우선하세요.',
  ],
  '재물 생산 상관': [
    '퍼스널 브랜딩·SNS·콘텐츠로 영향력을 적극 확대하세요.',
    '기존 룰을 깨는 아이디어를 상품·서비스로 전환하세요.',
    '과한 자기 주장으로 조직과 마찰이 생기지 않게 조절하세요.',
  ],
  '안정 유지': [
    '큰 변화보다 내실·기초 체력을 다지세요.',
    '다음 재성 시기를 대비해 자격·관계를 축적하세요.',
    '여유 자금·체력을 저축하며 숨을 고르는 구간으로 삼으세요.',
  ],
};

// ── 5경로 × 시기별 교차 요약 ──
export interface PathPeriodSynergy {
  yeonun?: string;  // 올해 세운과 주 경로 교차 해석
  wolun?: string;   // 이번 달 월운과 주 경로 교차 해석
  iljin?: string;   // 오늘 일진과 주 경로 교차 해석
  overall: string;  // 세 시기 종합 교차 한 줄
}

/** 내 주 경로 + 시기별 범주의 교차 관계를 짧은 한 줄로 요약 */
export function buildPathPeriodSynergy(
  dominantPath: WealthPathKey,
  yeonunCats: WealthPathKey[] | undefined,
  wolunCats: WealthPathKey[] | undefined,
  iljinCats: WealthPathKey[] | undefined,
  seed = 0,
): PathPeriodSynergy {
  // 주 경로와 특정 시기의 관계를 분류
  const classify = (periodCats: WealthPathKey[]): 'match' | 'synergy' | 'tension' | 'neutral' => {
    if (periodCats.length === 0) return 'neutral';
    if (periodCats.includes(dominantPath)) return 'match';       // 같은 축 — 가장 강한 활성
    // 주 경로와 상생 관계인지 (재성↔식상·인성·비겁·관성 쌍)
    const SYNERGY_MAP: Record<WealthPathKey, WealthPathKey[]> = {
      '재성': ['식상', '관성'],     // 식상→재성(生), 재성→관성(生)
      '인성': ['비겁', '관성'],     // 관성→인성→비겁
      '식상': ['비겁', '재성'],     // 비겁→식상→재성
      '관성': ['재성', '인성'],     // 재성→관성→인성
      '비겁': ['인성', '식상'],     // 인성→비겁→식상
    };
    if (periodCats.some(c => SYNERGY_MAP[dominantPath]?.includes(c))) return 'synergy';
    return 'tension';
  };

  const buildLine = (
    cls: 'match' | 'synergy' | 'tension' | 'neutral',
    periodLabel: string,
    periodCats: WealthPathKey[],
    dom: WealthPathKey,
  ): string => {
    const periodStr = periodCats.join('·') || '—';
    if (cls === 'match') {
      return `${periodLabel}에도 ${dom}이(가) 함께 와서 내 주 경로가 가장 뚜렷하게 활성화되는 구간이에요.`;
    }
    if (cls === 'synergy') {
      return `${periodLabel}의 ${periodStr} 흐름이 내 주 경로(${dom})와 상생 관계라 간접적으로 수익 라인에 힘을 실어줘요.`;
    }
    if (cls === 'tension') {
      return `${periodLabel}은 ${periodStr} 축이 돌아 내 주 경로(${dom})와는 결이 달라요 — 이 시기는 주 채널보다 보조 활동에 힘을 분산하는 게 유리해요.`;
    }
    return `${periodLabel}은 특별한 변수 없는 평온 구간이에요.`;
  };

  const yeonunLine = yeonunCats ? buildLine(classify(yeonunCats), '올해', yeonunCats, dominantPath) : undefined;
  const wolunLine = wolunCats ? buildLine(classify(wolunCats), '이번 달', wolunCats, dominantPath) : undefined;
  const iljinLine = iljinCats ? buildLine(classify(iljinCats), '오늘', iljinCats, dominantPath) : undefined;

  // 종합 한 줄: 세 시기 중 match 가 몇 개인지로 강도 판정
  const classifications = [yeonunCats && classify(yeonunCats), wolunCats && classify(wolunCats), iljinCats && classify(iljinCats)].filter(Boolean);
  const matchCount = classifications.filter(c => c === 'match').length;
  const synergyCount = classifications.filter(c => c === 'synergy').length;
  const tensionCount = classifications.filter(c => c === 'tension').length;
  const pickOverall = (pool: string[]) => pool[Math.abs(seed) % pool.length];
  let overall: string;
  if (matchCount >= 2) {
    overall = pickOverall([
      `세 시기 대부분이 내 주 경로(${dominantPath})에 겹쳐 수익 감도가 가장 높은 구간이에요. 주 채널에 집중하면 기대 이상의 반응을 얻어요.`,
      `주 경로(${dominantPath})가 여러 시기에 동시에 켜져 있어, 지금이 내 수익 구조에 가장 우호적인 구간이에요. 망설이지 말고 주 채널을 밀어붙이세요.`,
      `내 주 수익 축(${dominantPath})이 세 시기 중 다수 시기에 직접 들어와 있어요 — 평소보다 과감한 실행이 훨씬 좋은 결과로 돌아옵니다.`,
    ]);
  } else if (matchCount === 1 && synergyCount >= 1) {
    overall = pickOverall([
      `주 경로(${dominantPath})가 한 시기에 직접 켜지고 다른 한 시기는 상생으로 받쳐줘요 — 이 흐름을 타고 주 채널을 본격 확장할 타이밍.`,
      `${dominantPath} 축이 한 번 직접 들어오고 다른 시기가 상생으로 밀어주는 구도라, 메인 채널을 본격적으로 키우기에 좋은 구간이에요.`,
      `주 경로(${dominantPath})가 한 시기에서 직접 활성화되고 나머지가 우호적으로 받쳐줘요 — 흐름을 타면 단기 성과가 뚜렷하게 나옵니다.`,
    ]);
  } else if (synergyCount + matchCount >= 2) {
    overall = pickOverall([
      `주 경로(${dominantPath})를 직접 자극하진 않지만 주변 축들이 우호적으로 도와주는 구간이에요 — 내실을 탄탄히 다지기 좋아요.`,
      `${dominantPath}이(가) 전면에 나서진 않아도 상생 흐름이 배경에서 받쳐주는 시기라, 기반 다지기·역량 확장에 유리해요.`,
      `주 채널(${dominantPath})은 잠시 쉬어가지만 주변 축이 도와주는 구도 — 내공 쌓기·관계 다지기에 집중하면 다음 구간에 힘이 돼요.`,
    ]);
  } else if (tensionCount >= 2) {
    overall = pickOverall([
      `내 주 경로(${dominantPath})와 결이 다른 시기가 겹쳐요 — 주 채널을 억지로 밀기보다 보조 활동(학습·네트워크·정리)에 힘을 분산하시는 게 결과적으로 이득이에요.`,
      `주 경로(${dominantPath})가 이 구간엔 직접 등장하지 않으니, 메인 채널을 밀기보다 간접 활동(배움·관계·준비)에 무게를 두시는 편이 효율적이에요.`,
      `${dominantPath} 축과는 결이 다른 기운들이 도는 시기예요 — 이럴 땐 정면 승부 대신 체력·지식·인연 같은 자산을 축적해 두시는 게 나은 선택입니다.`,
    ]);
  } else {
    overall = pickOverall([
      `주 경로(${dominantPath})와 시기별 흐름이 섞여 있는 중립 구간이에요. 상황에 따라 공격·수비를 유연하게 전환하세요.`,
      `${dominantPath}이(가) 부분적으로만 활성화되는 구간이에요 — 욕심내기보다 상황을 보면서 공격/수비를 번갈아 쓰세요.`,
      `주 경로(${dominantPath})가 완전히 켜진 것도, 꺼진 것도 아닌 중간 구도 — 기회 하나에 올인하지 말고 여러 옵션을 열어두시는 게 좋아요.`,
    ]);
  }

  return { yeonun: yeonunLine, wolun: wolunLine, iljin: iljinLine, overall };
}

// 대운 테마별 노트 풀 — 같은 테마라도 여러 변주로 다양하게
const DAEUN_NOTE_POOLS: Record<string, string[]> = {
  '직장 재물': [
    '직장·지위 기반 수익 확장.',
    '책임이 커지며 보상도 따라옴.',
    '승진·리더십이 곧 재물로.',
    '직책·실력 동반 상승.',
  ],
  '재물 확장 편재': [
    '사업·투자·유동 자금 활발.',
    '새로운 수익 채널 시도 적기.',
    '기회 폭주 — 선택과 집중.',
    '큰 돈 출입, 관리가 관건.',
  ],
  '재물 확장 정재': [
    '성실한 노력이 안정 수익으로.',
    '축적·저축·부동산에 유리.',
    '복리로 쌓기 최적.',
    '지루해도 체질에 가장 맞는 구간.',
  ],
  '재물 유출 주의 초입': [
    '겁재 초입 — 충동 지출·보증 주의.',
    '심리 흔들림 큼 — 보수적 운영.',
    '초기 5년 고비, 재검토 습관을.',
  ],
  '재물 유출 주의': [
    '지출·경쟁 증가. 보수적 관리.',
    '타인 돈과 얽히면 손실 위험.',
    '동업·보증은 신중히, 단독 판단.',
    '가계부 점검이 특히 중요.',
  ],
  '경쟁·분재': [
    '동료·경쟁자와 얽힘 — 독자 판단.',
    '차별화가 재운을 가름.',
    '협력과 갈등 교차, 관계 설계.',
    '내 몫을 지키는 의식적 노력.',
  ],
  '직장·책임 편관': [
    '도전·책임 증가, 스트레스와 성장 공존.',
    '압박 속 역량 급성장.',
    '고강도 업무·위기 대응 시기.',
  ],
  '직장·책임 정관': [
    '안정 직위·공식 인정 확대.',
    '조직 내 질서·명예 동반 상승.',
    '공적 자리·평판 자산 축적.',
  ],
  '전문성 기반 정인': [
    '학습·자격이 재물의 뿌리로.',
    '멘토·상급자 지원 강화.',
    '학위·자격증 성과로 이어짐.',
  ],
  '전문성 기반 편인': [
    '독창적 시각·틈새 전문성 부각.',
    '비주류 지식이 수익으로.',
    '직관·영감 기반 개척 유리.',
  ],
  '재물 생산 식신': [
    '여유·취미가 수익으로 연결.',
    '음식·콘텐츠·서비스에 유리.',
    '즐기는 일이 돈 되는 시기.',
  ],
  '재물 생산 상관': [
    '재능·창의력 폭발.',
    '표현력·브랜드가 수익으로.',
    '콘텐츠·강연·프리랜스 성장.',
  ],
  '안정 유지': [
    '큰 변수 없는 안정 구간.',
    '내실 다지기 좋은 조용한 시기.',
    '기반이 단단해지는 구간.',
  ],
};

// 결정론적 variant 선택 (간지+나이 해시)
function pickNoteVariant(pool: string[], age: number, ganjiHanja: string): string {
  if (!pool || pool.length === 0) return '';
  let seed = age;
  for (let i = 0; i < ganjiHanja.length; i++) seed = seed * 31 + ganjiHanja.charCodeAt(i);
  return pool[Math.abs(seed) % pool.length];
}

/** 대운 오행이 일간과 어떤 상극/설기 관계인지 → 경고 문장 반환 */
function buildDaeunElementalRisk(ilgan: string, cgHanja: string, jjHanja: string): string {
  const ilganOh = CG_OH[ilgan];
  const cgOh = CG_OH[cgHanja];
  const jjOh = CG_OH[jjHanja] ? CG_OH[jjHanja] : (JJG[jjHanja] ? CG_OH[JJG[jjHanja][JJG[jjHanja].length - 1]] : '');
  if (!ilganOh) return '';

  const idx = OH_LIST.indexOf(ilganOh as (typeof OH_LIST)[number]);
  const ctrlEl = OH_LIST[(idx + 3) % 5];   // 일간을 극하는 오행 (관성)
  const leakEl = OH_LIST[(idx + 1) % 5];   // 일간을 설기하는 오행 (식상)

  const cgCtrl = cgOh === ctrlEl;
  const jjCtrl = jjOh === ctrlEl;
  const cgLeak = cgOh === leakEl;
  const jjLeak = jjOh === leakEl;

  if (cgCtrl && jjCtrl) {
    return ` 단, 일간(${ilganOh}) 상극 — 체력·자신감과 함께 창작·표현(식상) 활동이 같이 위축돼 관련 수익 경로가 약해지기 쉬운 구간이에요.`;
  }
  if (jjCtrl) {
    return ` 단, 지지가 일간(${ilganOh}) 극 — 표현력·실행력이 떨어지며 창작·서비스 쪽 수익이 제한될 수 있으니 기초 루틴을 챙기세요.`;
  }
  if (cgCtrl) {
    return ` 단, 천간이 일간(${ilganOh}) 극 — 외부 압박·책임이 커져 주도적 사업·영업보다 조직·수동 수익이 더 유리한 구간.`;
  }
  if (cgLeak && jjLeak) {
    return ` 단, 일간(${ilganOh}) 설기 심함 — 창작·서비스로 바쁘게 움직이지만 에너지 소모가 커 수익 지속성에 번아웃 주의.`;
  }
  return '';
}

export function evaluateDaeunChaeun(daeuns: DaeunEntry[], ilgan: string): ChaeunDaeunSegment[] {
  if (!ilgan) return [];
  return daeuns.map((d, i) => {
    const cgSS = sipsung(ilgan, d.c);
    const jjArr = JJG[d.j] || [];
    const jjMain = jjArr[jjArr.length - 1] || '';
    const jjSS = jjMain ? sipsung(ilgan, jjMain) : '';
    const bothSS = [cgSS, jjSS];

    let theme = '안정 유지';
    let rating: ChaeunTimelineRating = 'mixed';
    let poolKey = '안정 유지';

    const hasPyeonJae = bothSS.includes('편재');
    const hasJeongJae = bothSS.includes('정재');
    const hasChaeseong = hasPyeonJae || hasJeongJae;
    const hasGeobjae = bothSS.includes('겁재');
    const hasBigyeon = bothSS.includes('비견');
    const hasPyeonGwan = bothSS.includes('편관');
    const hasJeongGwan = bothSS.includes('정관');
    const hasGwansung = hasPyeonGwan || hasJeongGwan;
    const hasPyeonIn = bothSS.includes('편인');
    const hasJeongIn = bothSS.includes('정인');
    const hasInsung = hasPyeonIn || hasJeongIn;
    const hasSikshin = bothSS.includes('식신');
    const hasSanggwan = bothSS.includes('상관');
    const hasSiksang = hasSikshin || hasSanggwan;

    if (hasChaeseong && hasGwansung) {
      theme = '직장 재물';
      rating = 'strong';
      poolKey = '직장 재물';
    } else if (hasPyeonJae) {
      theme = '재물 확장';
      rating = 'strong';
      poolKey = '재물 확장 편재';
    } else if (hasJeongJae) {
      theme = '재물 확장';
      rating = 'strong';
      poolKey = '재물 확장 정재';
    } else if (hasGeobjae) {
      theme = '재물 유출 주의';
      rating = 'caution';
      poolKey = i === 0 ? '재물 유출 주의 초입' : '재물 유출 주의';
    } else if (hasBigyeon) {
      theme = '경쟁·분재';
      rating = 'mixed';
      poolKey = '경쟁·분재';
    } else if (hasPyeonGwan) {
      theme = '직장·책임';
      rating = 'mixed';
      poolKey = '직장·책임 편관';
    } else if (hasJeongGwan) {
      theme = '직장·책임';
      rating = 'mixed';
      poolKey = '직장·책임 정관';
    } else if (hasJeongIn) {
      theme = '전문성 기반';
      rating = 'mixed';
      poolKey = '전문성 기반 정인';
    } else if (hasPyeonIn) {
      theme = '전문성 기반';
      rating = 'mixed';
      poolKey = '전문성 기반 편인';
    } else if (hasSikshin) {
      theme = '재물 생산';
      rating = 'strong';
      poolKey = '재물 생산 식신';
    } else if (hasSanggwan) {
      theme = '재물 생산';
      rating = 'strong';
      poolKey = '재물 생산 상관';
    }

    const ganjiHanja = `${d.c}${d.j}`;
    const baseNote = pickNoteVariant(DAEUN_NOTE_POOLS[poolKey] || [], d.age, ganjiHanja);
    const riskNote = buildDaeunElementalRisk(ilgan, d.c, d.j);
    const note = baseNote + riskNote;
    // 일간이 강하게 극받는 구간은 rating 을 caution 으로 격상
    let finalRating = rating;
    if (riskNote.includes('상극') || riskNote.includes('극받음')) {
      if (finalRating === 'mixed') finalRating = 'caution';
    }

    return {
      age: d.age,
      ganji: `${d.ck}${d.jk}`,
      ganjiHanja,
      theme,
      rating: finalRating,
      note,
      poolKey,
      actions: DAEUN_ACTION_POOLS[poolKey] || DAEUN_ACTION_POOLS['안정 유지'],
    };
  });
}
