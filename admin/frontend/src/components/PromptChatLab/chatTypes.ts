/** 챗랩 메시지 타입 — PromptChatLab.tsx 에서 분리(리팩토링 7단계, 내용 불변). */
import { WebtoonStoryboardCut } from "@/lib/types";

export type MsgRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MsgRole;
  text?: string;
  storyboard?: { coreQuestion: string; cuts: WebtoonStoryboardCut[]; testedVersion?: number | null };
  /** true면 처음 나타날 때 타이핑되듯 스트리밍 연출 — 상태 메시지("GPU를
   *  켜는 중입니다" 등)처럼 완성본이 한 번에 오는 텍스트에만 쓴다. 진짜
   *  스트리밍(기사 반응 문구)은 아래 liveText가 따로 담당하므로 여기선
   *  animate:false로 붙인다(이미 실시간으로 보여줬으니 다시 타이핑할
   *  필요 없음). 이미 렌더된 적 있는 메시지(초기 인사말 등)도 false. */
  animate?: boolean;
}
