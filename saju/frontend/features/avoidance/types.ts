export type AvoidReasonCode =
  | 'chung'        // 지지 충 (衝)
  | 'hyung'        // 지지 형 (刑)
  | 'pa'           // 지지 파 (破)
  | 'hae'          // 지지 해 (害)
  | 'stemGeuk'     // 천간 상극
  | 'ohGeuk'       // 오행 상극 (나를 극하는 오행)
  | 'ohOverGeuk';  // 오행 과극 (내가 약한데 극받는 조합)

export interface AvoidanceResult {
  /** 1줄 요약 */
  summary: string;
  /** 핵심 태그 (3~5개) */
  tags: string[];
  /** 피해야 할 일간 오행 (primary, secondary) */
  avoidStemOh: string[];
  /** 피해야 할 일간 천간 */
  avoidStem: string;
  /** 주의할 띠 */
  avoidZodiacs: string[];
  /** 주의할 생년 */
  avoidYears: { year: number; zodiac: string }[];
  /** 위험도 점수 (0~10, 높을수록 위험) */
  dangerScore: number;
  /** 점수 근거 칩 */
  scoreReasons: {
    code: AvoidReasonCode;
    label: string;
    points: number;
  }[];

  // === 서술형 해석 필드 ===
  /** ② 이 사람 첫인상 — 처음에 끌릴 수 있는 포인트 */
  firstImpression: string;
  /** ③ 왜 부딪히게 될까 — 상극 메커니즘 해석 */
  conflictMechanism: string;
  /** ④ 어떤 상황에서 트러블이 생길까 — 구체적 갈등 시나리오 */
  conflictScenario: string;
  /** ⑤ 이 관계에서 내가 받는 영향 — 에너지 소모 패턴 */
  energyDrain: string;
  /** ⑥ 이런 신호가 보이면 거리두기 — 레드플래그 */
  redFlags: string[];
  /** ⑦ 만약 이미 가까운 사이라면 — 대처법 */
  copingAdvice: string;

  /** 내부 디버그 */
  reasoning: {
    myOh: string;
    avoidOh: string;
    branchChung: string[];
    branchHyung: string[];
    branchPa: string[];
  };
}
