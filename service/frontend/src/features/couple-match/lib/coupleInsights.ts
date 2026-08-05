/**
 * 커플 궁합 상세 해설 · 관계 팁 사전
 * - 엔진(coupleEngine)의 계산 결과를 받아 읽히는 문장으로 풀어주는 순수 데이터/조합기
 * - UI 의존 없음, ko/en 페어로 제공
 */

import type { CoupleReasonCode } from './coupleEngine';

/** 점수 등급 */
export type CoupleScoreBand =
  | 'excellent' // 8.5+
  | 'good'      // 7.0+
  | 'neutral'   // 5.5+
  | 'caution'   // 4.0+
  | 'rough'     // 2.5+
  | 'tough';    // 0+

export function getScoreBand(score: number): CoupleScoreBand {
  if (score >= 8.5) return 'excellent';
  if (score >= 7) return 'good';
  if (score >= 5.5) return 'neutral';
  if (score >= 4) return 'caution';
  if (score >= 2.5) return 'rough';
  return 'tough';
}

/** 점수 등급별 오프닝 — headline 아래 첫 문장 */
const BAND_OPENING: Record<CoupleScoreBand, { ko: string; en: string }> = {
  excellent: {
    ko: '두 사람의 원국이 여러 축에서 동시에 맞아떨어지는, 보기 드문 궁합입니다.',
    en: 'A rare match — your two charts click across multiple axes at once.',
  },
  good: {
    ko: '자연스러운 끌림이 느껴지는 궁합으로, 관계를 풀어가는 데 큰 부담이 없는 조합이에요.',
    en: 'A comfortably attractive pairing — the relationship tends to unfold without major friction.',
  },
  neutral: {
    ko: '특별히 튀는 장점도 단점도 없는, 서로의 노력이 그대로 반영되는 평범하고 안정적인 궁합입니다.',
    en: 'No standout peaks or pits — a steady pairing where what you put in is what you get out.',
  },
  caution: {
    ko: '근본적으로 맞지 않는 건 아니지만, 결과 속에 짚어볼 만한 지점이 섞여 있어 서로의 결을 이해하려는 노력이 필요합니다.',
    en: 'Not fundamentally mismatched, but there are enough tension points that you’ll need to read each other’s rhythm carefully.',
  },
  rough: {
    ko: '마찰 요소가 조화 요소보다 눈에 띄는 조합으로, 관계를 유지하려면 상당한 대화와 맞춤이 필요한 조합이에요.',
    en: 'Friction outweighs harmony here — keeping this relationship steady will take real conversation and compromise.',
  },
  tough: {
    ko: '일간·일지 모두에서 충돌 신호가 강한 조합으로, 깊이 들어가기 전에 서로의 가치관과 생활 방식을 충분히 맞춰보는 시간이 필요합니다.',
    en: 'Clash signals run through both the day stems and branches — give the values and lifestyle alignment plenty of time before going deeper.',
  },
};

/** 근거 코드 → 본문에서 보여줄 자세한 설명 */
export const REASON_DETAIL: Record<CoupleReasonCode, { ko: string; en: string }> = {
  stemHap: {
    ko: '두 일간이 천간합(甲己·乙庚·丙辛·丁壬·戊癸)을 이룹니다. 명리에서 가장 강한 끌림으로 해석하며, 처음 본 순간부터 편안함·설렘이 동시에 느껴지는 관계로 나타나요.',
    en: 'Your day stems form a stem-harmony pair (Gap-Gi, Eul-Gyeong, Byeong-Sin, Jeong-Im, Mu-Gye). Classical saju reads this as the strongest natural attraction — comfort and sparks felt from the first meeting.',
  },
  stemSaeng: {
    ko: '한쪽의 오행이 상대의 오행을 낳는 상생(生) 흐름. 한 사람이 다른 사람을 자연스럽게 키워주고, 그 에너지가 다시 돌아오는 선순환 구조예요.',
    en: 'One day stem nourishes the other’s element (sheng cycle). The relationship flows naturally — one partner supports, the energy cycles back.',
  },
  stemGeuk: {
    ko: '일간이 서로를 극(剋)하는 관계. 충돌처럼 보이지만 서로를 자극하고 흔들어 성장시키는 조합으로, 무관심보다는 긴장감이 관계의 연료가 되는 타입입니다.',
    en: 'Day stems control each other (ke cycle). Looks like clash, but it also stimulates and sharpens both sides — tension fuels this relationship more than comfort does.',
  },
  stemSame: {
    ko: '같은 오행의 일간. 가치관과 취향이 닿는 느낌은 있지만, 자극이 적고 둘 다 비슷한 방향으로 흘러 의외로 권태감이 빨리 올 수 있어요.',
    en: 'Same element day stems. Shared values and taste are easy, but the lack of novelty can bring on quiet boredom faster than expected.',
  },
  branchSamhap: {
    ko: '일지가 삼합(三合) 그룹 — 셋이 하나의 국(局)을 이루는 강한 조화. 함께 있을 때 주변까지 자연스럽게 어우러지고, 공동 프로젝트·모임에서 특히 빛나는 합입니다.',
    en: 'Your earthly branches belong to the same triple-harmony group — a strong three-way bond. You naturally fit in together, and especially shine in shared projects or social settings.',
  },
  branchYukhap: {
    ko: '일지 육합(六合) — 짝을 이루는 부드러운 조화. 둘만의 리듬, 일상 루틴이 서로에게 자연스럽게 녹아드는 조합으로 특히 동거·결혼 생활에 유리해요.',
    en: 'Earthly branches form a six-harmony pair — a soft, complementary bond. Daily rhythms and routines blend together naturally, which is especially good for living together.',
  },
  branchChung: {
    ko: '일지 충(沖). 같은 축의 반대편에 서 있는 관계로, 생활 리듬·가치관·가족 관계에서 미묘한 어긋남이 자주 발생합니다. 대화로 맞출 수 있지만 방치하면 누적돼요.',
    en: 'Day branches clash (chung). You sit at opposite ends of the same axis — daily rhythms, values, and family matters tend to misalign. Fixable by conversation, but it piles up if ignored.',
  },
  branchSame: {
    ko: '일지가 같습니다. 생활 패턴과 습관이 닮아 편하지만, 새로움이 적어 자칫 남매 같은 관계로 고착될 수 있어요.',
    en: 'Same day branch. Life patterns and habits mirror each other — comfortable, but lacks novelty and can drift toward sibling-like familiarity.',
  },
  elementFill: {
    ko: '내가 부족한 오행을 상대가 넉넉히 갖고 있거나, 그 반대 — 원국의 결핍을 서로가 채워주는 구조입니다. 시간이 지날수록 "이 사람 옆이 제일 편하다"는 감각이 강해지는 조합.',
    en: 'The element you lack, your partner carries in abundance (or vice versa). Over time this creates a growing sense of "I feel most myself next to this person."',
  },
  spouseMatch: {
    ko: '한쪽의 배우자성(남자는 재성, 여자는 관성)이 상대 일간과 일치합니다. 전통 명리에서 가장 이상적인 배우자 패턴으로, 역할이 자연스럽게 잡히는 유형.',
    en: 'One chart’s Spouse Star (Wealth for men, Authority for women) matches the other’s day stem — classical saju’s ideal pairing pattern, with roles that settle naturally.',
  },
  ageGap: {
    ko: '연령차가 10년 이상. 세대 코드·문화 레퍼런스 차이로 작은 대화도 설명이 필요해질 수 있어, 서로의 맥락을 공유하는 시간이 일반 커플보다 더 요구돼요.',
    en: 'Age gap of 10+ years. Generational and cultural references differ enough that even casual talk needs more context-sharing than usual.',
  },
};

/** 근거 코드 → 실천 팁 (어떻게 장점을 키우고 단점을 줄일지) */
const REASON_TIP: Partial<Record<CoupleReasonCode, { ko: string; en: string }>> = {
  stemHap: {
    ko: '감정적 연결은 저절로 생기지만, 그 편안함 때문에 현실적인 역할 분담이 흐려지기 쉬워요. 돈·집안일·시간 같은 현실 주제를 주기적으로 꺼내놓고 정리하세요.',
    en: 'The emotional pull is automatic, but it can blur practical divisions. Set a regular cadence for money, chores, and time talks so real-life decisions don’t get postponed.',
  },
  stemSaeng: {
    ko: '한쪽이 계속 주고 다른 쪽이 받기만 하는 흐름이 되기 쉽습니다. 역할이 고정되기 전에 "이번엔 내가 해볼게" 하고 주기적으로 자리를 바꿔보세요.',
    en: 'One side tends to give, the other to receive. Swap roles on purpose every so often so the flow doesn’t freeze into a caretaker/taken-care-of pattern.',
  },
  stemGeuk: {
    ko: '부딪힐 때는 24시간 룰을 써보세요. 즉석에서 해결하려 하지 말고, 하루 뒤 차분할 때 다시 꺼내면 관계가 깨지지 않고 성장으로 이어져요.',
    en: 'Use a 24-hour rule during clashes. Don’t try to resolve on the spot — revisit the topic a day later when both are calm, and the friction becomes growth.',
  },
  stemSame: {
    ko: '둘 다 같은 방향으로 흐르니 의식적으로 자극을 만드는 게 중요해요. 함께 새로운 취미·여행지·경험을 주기적으로 넣어 관계의 신선함을 유지하세요.',
    en: 'You flow in the same direction, so novelty needs to be deliberate. Schedule new experiences — trips, hobbies, people — to keep the spark from flattening.',
  },
  branchSamhap: {
    ko: '둘이 있을 때보다 여러 사람이 함께 있을 때 더 좋은 합이 나옵니다. 둘만의 시간과 함께 공유할 수 있는 모임을 의식적으로 균형 있게 가지세요.',
    en: 'Your bond actually shines brighter in groups. Balance solo time with shared social settings — both feed this pairing.',
  },
  branchYukhap: {
    ko: '같이 사는 일상에서 특히 빛나는 합입니다. 주말 루틴, 수면 패턴 같은 "같이 하는 시간"을 적극적으로 만들면 관계가 더 단단해져요.',
    en: 'This bond thrives in shared daily life. Build explicit shared rituals — weekend routines, sleep rhythms — and the relationship deepens.',
  },
  branchChung: {
    ko: '생활 리듬이 어긋나는 합이라 기상·식사·수면 같은 기본 루틴부터 서로 맞추는 합의가 중요해요. "어느 한 쪽에 맞추기"보다는 둘만의 제3의 기준을 만드세요.',
    en: 'Daily rhythms easily misalign. Negotiate the basics — wake time, meals, sleep — and build a shared third standard rather than one side adapting to the other.',
  },
  branchSame: {
    ko: '너무 익숙해져 "남매처럼" 되지 않도록, 새로운 환경에 함께 자주 노출되어야 합니다. 여행·워크숍·외부 활동을 주기적으로 넣어주세요.',
    en: 'Avoid drifting into sibling-like familiarity — expose yourselves to new environments together often (trips, workshops, outside activities).',
  },
  elementFill: {
    ko: '서로의 부족을 채워주는 조합이니, 그 고마움을 말로 표현하는 게 연료가 됩니다. "덕분에 이게 됐어" 같은 작은 인정이 관계를 길게 만들어요.',
    en: 'You fill each other’s gaps — make it explicit. Small acknowledgments ("because of you, this worked") are the fuel that keeps this type of bond long-lasting.',
  },
  spouseMatch: {
    ko: '역할이 자연스럽게 잡히는 합이라 "한쪽은 주도, 한쪽은 지지"로 고착될 수 있습니다. 결정권을 주기적으로 맞바꾸는 규칙을 만들어두세요.',
    en: 'Roles settle fast in this pairing — risk is one side always leading, the other always supporting. Set a rule to swap decision-maker roles periodically.',
  },
  ageGap: {
    ko: '세대 코드 차이를 농담으로 넘기지 말고, 각자의 시대 레퍼런스를 공유하는 시간을 일부러 만들어보세요. 음악·영화·뉴스 같은 작은 것부터요.',
    en: 'Don’t laugh off the generational gap — schedule deliberate reference-sharing time (music, films, news) so the cultural context doesn’t widen.',
  },
};

/** 정적 공통 팁 (점수 밴드별) */
const BAND_TIPS: Record<CoupleScoreBand, { ko: string; en: string }[]> = {
  excellent: [
    {
      ko: '궁합이 좋을수록 "당연한 관계"로 여겨져 소홀해지기 쉬워요. 정기적인 관계 점검 시간을 정해두세요.',
      en: 'The stronger the match, the easier it is to take the relationship for granted. Schedule regular check-ins.',
    },
  ],
  good: [
    {
      ko: '큰 갈등이 적다고 안주하지 말고, 관계에 새로운 경험을 꾸준히 추가해 흐름을 유지하세요.',
      en: 'Low conflict doesn’t mean cruise control — keep adding new experiences so the flow doesn’t go flat.',
    },
  ],
  neutral: [
    {
      ko: '평범한 조합일수록 노력의 총량이 결과를 결정합니다. 작은 실천(문자·기념일·역할 분담)이 큰 차이를 만들어요.',
      en: 'A neutral match is decided by effort. Small practices — texts, anniversaries, clear roles — matter more than you’d think.',
    },
  ],
  caution: [
    {
      ko: '긴장 요소가 섞인 조합이니, 관계가 흔들릴 때 "서로 맞지 않아서"로 결론 내지 말고 구체적인 축(일정·돈·가족)별로 나눠 대화해보세요.',
      en: 'With mixed signals, avoid the "we’re just not a match" reflex when tension hits — split the issue into concrete axes (schedule, money, family) and discuss each.',
    },
    {
      ko: '관계의 장점 쪽(합·생·보완)을 의식적으로 기록하고 자주 꺼내보세요. 마찰 요소에만 주의가 쏠리기 쉬운 조합이에요.',
      en: 'Keep a running note of the positive signals (harmony, nourishment, fill) and revisit them — friction tends to hog attention in this band.',
    },
  ],
  rough: [
    {
      ko: '관계를 이어가려면 "서로를 바꾸려 하지 않는 선"을 먼저 정해두는 것이 필수입니다. 건드리면 싸움이 되는 영역을 합의로 비워두세요.',
      en: 'To make this work, agree on "zones we won’t try to change in each other" up front — leave those spaces by mutual agreement.',
    },
    {
      ko: '기본적인 생활 규칙(돈·가족·기념일)을 문서화해두면 반복되는 다툼이 눈에 띄게 줄어듭니다.',
      en: 'Writing down the basic life rules (money, family, anniversaries) dramatically reduces recurring fights in this band.',
    },
  ],
  tough: [
    {
      ko: '강한 마찰 신호가 있을 때일수록 감정보다 구조(역할·시간·공간)를 맞추는 게 먼저예요. 어느 시점까지 어떤 상태가 되면 다음 단계로 간다는 합의를 해두세요.',
      en: 'When clash signals run high, structure (roles, time, space) comes before feelings. Agree on milestones: "if X is in place by Y, we move forward."',
    },
    {
      ko: '전통 명리에서도 극·충이 많은 궁합은 빠른 동거·결혼보다 긴 연애 기간을 권합니다. 서로 흔들어 보는 시간을 충분히 가지세요.',
      en: 'Even classical saju recommends long dating periods (not rushed cohabitation or marriage) for heavily clashing matches — give the stress test enough time.',
    },
  ],
};

export interface CoupleInsights {
  /** 점수 밴드 */
  band: CoupleScoreBand;
  /** 2~3문장 요약 서술 — Hero 아래 상세 해설 */
  narrative: { ko: string; en: string };
  /** 근거별 긴 설명 — 본문 "근거 자세히 보기" 섹션 */
  reasonDetails: { code: CoupleReasonCode; ko: string; en: string }[];
  /** 관계 팁 — 조합 특성 기반 실천 항목 */
  tips: { ko: string; en: string }[];
}

/**
 * 근거 코드 배열 + 점수를 받아 상세 해설을 조립.
 *  - narrative: [오프닝] + [가장 큰 플러스 포인트 한 문장] + [가장 큰 마이너스 포인트 한 문장]
 *  - tips: 밴드 기본 팁 + 근거별 맞춤 팁 (최대 5개)
 */
export function buildCoupleInsights(
  score: number,
  reasons: { code: CoupleReasonCode; label: string; points: number }[],
): CoupleInsights {
  const band = getScoreBand(score);

  // 중복 제거한 근거 코드 (배우자성은 두 번 나올 수 있어 첫 번째만 유지)
  const seen = new Set<CoupleReasonCode>();
  const uniqueReasons = reasons.filter((r) => {
    if (seen.has(r.code)) return false;
    seen.add(r.code);
    return true;
  });

  // 가장 큰 플러스/마이너스 근거 한 개씩
  const positive = [...uniqueReasons]
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points)[0];
  const negative = [...uniqueReasons]
    .filter((r) => r.points < 0)
    .sort((a, b) => a.points - b.points)[0];

  const opening = BAND_OPENING[band];
  const posSentence = positive
    ? {
        ko: ` 특히 눈에 띄는 건 "${positive.label}"로, ${REASON_DETAIL[positive.code].ko.replace(/\.$/, '')}`,
        en: ` The standout signal here is "${positive.label}" — ${REASON_DETAIL[positive.code].en.replace(/\.$/, '')}`,
      }
    : null;
  const negSentence = negative
    ? {
        ko: ` 반면 "${negative.label}"는 관계에서 조심해야 할 축이에요.`,
        en: ` On the other hand, "${negative.label}" is the axis to handle with care.`,
      }
    : null;

  const narrative = {
    ko: [opening.ko, posSentence?.ko, negSentence?.ko].filter(Boolean).join(''),
    en: [opening.en, posSentence?.en, negSentence?.en].filter(Boolean).join(''),
  };

  const reasonDetails = uniqueReasons.map((r) => ({
    code: r.code,
    ko: REASON_DETAIL[r.code].ko,
    en: REASON_DETAIL[r.code].en,
  }));

  // 팁: 근거별 팁 + 밴드 기본 팁을 섞되 최대 5개, 근거 기반 팁을 우선
  const tipList: { ko: string; en: string }[] = [];
  for (const r of uniqueReasons) {
    const tip = REASON_TIP[r.code];
    if (tip && !tipList.some((t) => t.ko === tip.ko)) tipList.push(tip);
  }
  for (const t of BAND_TIPS[band]) {
    if (!tipList.some((x) => x.ko === t.ko)) tipList.push(t);
    if (tipList.length >= 5) break;
  }

  return { band, narrative, reasonDetails, tips: tipList.slice(0, 5) };
}
