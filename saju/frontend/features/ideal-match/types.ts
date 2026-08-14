export type ReasonCode =
  | 'lacking'      // 부족 오행 보완
  | 'excess'       // 과잉 오행 통제
  | 'stemHap'      // 천간합
  | 'spouseGwan'   // 배우자궁(관성) 여성 기준
  | 'spouseJae'    // 배우자궁(재성) 남성 기준
  | 'samhap'       // 지지 삼합
  | 'yukhap';      // 지지 육합

export interface IdealMatchStrength {
  title: string;
  desc: string;
}

export interface IdealMatchCaution {
  title: string;
  desc: string;
}

export interface IdealMatch {
  /** 1줄 요약 */
  summary: string;
  /** 핵심 태그 (3~5개) */
  tags: string[];
  /** 추천 일간 오행 (primary, secondary) */
  idealStemOh: string[];
  /** 추천 일지(띠) */
  idealZodiacs: string[];
  /** 주의할 띠 */
  avoidZodiacs: string[];
  /** 추천 생년 (띠 라벨과 함께) */
  idealYears: { year: number; zodiac: string }[];
  /** 추천 생월 (양력 1~12) */
  idealMonths: number[];
  /** 외모·분위기 묘사 */
  appearance: string[];
  /** 성향 묘사 */
  personality: string[];
  /** ② 이 사람 첫인상 — 외모/분위기 감각적 서술 */
  firstImpression: string;
  /** ③ 이 사람 속마음 — 성향의 반전 포인트 중심 서술 */
  innerSelf: string;
  /** ④ 왜 나랑 잘 맞을까 ①: 성격 궁합 — 오행 상생 근거 */
  chemistryStory: string;
  /** ⑤ 왜 나랑 잘 맞을까 ②: 연애할 때 케미 — 밀당/표현방식 궁합 */
  datingChemistry: string;
  /** ⑥ 어디서 만나게 될까 — 미니 시나리오형 */
  meetingScenario: string;
  /** ⑦ 어떻게 가까워질까 — 썸 타는 과정 상상 */
  approachStory: string;
  /** ⑧ 이런 순간에 설렐 거예요 — 구체적 케미 포인트 2개 */
  sparkMoments: string[];
  /** 기존 호환용 (deprecated) */
  personaDesc: string;
  /** 잘 맞는 점 */
  strengths: IdealMatchStrength[];
  /** 주의할 점 (서술형 통일) */
  cautions: IdealMatchCaution[];
  /** 궁합 점수 (0~10, 소수점 1자리) */
  score: number;
  /** 점수 근거 — Hero에 노출할 근거 칩 */
  scoreReasons: {
    /** 근거 코드 — 툴팁 키 (lacking | excess | stemHap | spouseGwan | spouseJae | samhap | yukhap) */
    code: ReasonCode;
    /** 노출용 짧은 라벨 (예: "목 오행 보완") */
    label: string;
    /** 기여 포인트 */
    points: number;
  }[];
  /** 내부 디버그 — 어떤 로직이 기여했는지 */
  reasoning: {
    lackingOh: string[];
    excessOh: string[];
    stemHap?: string;
    branchHap: string[];
    branchChung: string[];
  };
}
