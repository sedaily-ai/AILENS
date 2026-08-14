import type { Pillar, DaeunEntry } from '@saju/features/fortune/lib/engine';
import type { EraFact } from './eraFacts';

export type ChatRole = 'bot' | 'user';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** react-markdown 으로 렌더할지 여부 */
  markdown?: boolean;
  /** 설정되면 텍스트 대신 시대 팩트 카드를 렌더 */
  era?: ConcernId;
  /** era 카드에 실을 시대 팩트 (서울경제 실데이터 or placeholder) */
  eraFacts?: EraFact[];
}

/** ko/en 쌍 — 컴포넌트에서 t(ko,en) 로 해소 */
export interface LangText { ko: string; en: string }

/**
 * 전체 흐름:
 * greeting → 입력(date~region) → predict(초기 맞히기) → [고민 매듭 루프]
 * 매듭 루프: concern(열기) → narrow(좁히기) → hit(맞히기) → (얹기·매듭짓기 자동) → link(잇기)
 */
export type Step =
  | 'greeting'
  | 'date' | 'time' | 'gender' | 'region'
  | 'predict'   // 입력 직후 초기 맞히기 (신뢰)
  | 'concern'   // 매듭 1단계: 고민 열기
  | 'narrow'    // 매듭 2단계: 좁히기
  | 'hit'       // 매듭 3단계: 맞히기 (매듭당 1번)
  | 'link';     // 매듭 6단계: 잇기 (다음 고민 / 종료)

export type ConcernId = 'career' | 'money' | 'relationship' | 'overwhelmed';

export interface DraftInput {
  y?: number;
  m?: number;
  d?: number;
  hour?: number;
  min?: number;
  noTime?: boolean;
  gender?: '남' | '여';
  region?: string;
}

/** 명식에서 추린 해석용 컨텍스트 (1회 계산 후 보관) */
export interface SajuContext {
  ilgan: string;            // 일간 라벨 "병(丙)"
  ilganOh: string;          // 일간 오행
  ilji: string;             // 일지 라벨 "자(子)"
  level: string;            // 신강약 (극신강~극신약)
  score: number;            // 0~100
  counts: Record<string, number>; // 오행 개수 {목,화,토,금,수}
  lacking: string[];        // 결여 오행
  excess: string[];         // 과다 오행
  gyeokguk: string;         // 격국 이름 (없으면 '')
  yongsin: string;          // 용신 오행 (없으면 '')
  yongsinRole: string;      // 용신의 십성 역할 (재성/관성/인성…)
  yongsinDesc: string;      // 용신 한 줄 설명
  keywords: string[];       // 총운 키워드
  currentDaeunOh: string;   // 현재 대운 지지 오행
  currentDaeunAge: number;
  nextDaeunOh: string;      // 다음 대운 지지 오행 (없으면 '')
  nextDaeunAge: number;     // 0 이면 없음
}

/** 진행 중인 고민 매듭 상태 */
export interface KnotState {
  concern: ConcernId;
  narrowStep: number;       // 현재 좁히기 단계 index
  narrowAnswers: string[];  // 좁히기 선택값 누적
}

export interface ChatState {
  step: Step;
  draft: DraftInput;
  pillars: Pillar[] | null;
  ilgan: string;
  daeuns: DaeunEntry[];
  saju: SajuContext | null;
  knot: KnotState | null;        // 현재 매듭 (없으면 null)
  raisedConcerns: ConcernId[];   // 누적·연결용
}

export interface QuickReply {
  value: string;
  label: string;
}
