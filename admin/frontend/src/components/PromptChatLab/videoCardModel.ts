/** 영상 카드 상태·저장·각본 파싱 헬퍼 — VideoCardGenerator.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { ChatThreadMessage } from "@/lib/types";
import { ELEVENLABS_FALLBACK_VOICE_SETTINGS, type ElevenLabsVoiceSettings } from "./ElevenLabsVoiceSettingsFields";
import { FORMATS } from "./VideoRenderSettingsPanel";

export const CARDS_STORAGE_PREFIX = "ailens-video-lab-cards";

export function cardsStorageKey(threadId: number | null): string {
  return `${CARDS_STORAGE_PREFIX}:${threadId ?? "draft"}`;
}

/** localStorage에서 이 대화(threadId)의 카드 목록을 복원한다. 형식이
 *  이상하면(옛 버전, 수동 조작 등) 조용히 폐기하고 null을 반환 —
 *  호출부가 서버 복원본/기본 카드로 폴백한다. job_id 없이 이어붙일 수
 *  없는 진행 중 상태(pending/starting)는 에러로 바꿔 사용자가 다시
 *  누르게 한다 — 조용히 사라지는 것보다 명확하다. */
export function loadStoredCards(threadId: number | null): CardState[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cardsStorageKey(threadId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return (parsed as CardState[]).map((c) => {
      let next = c;
      if (next.voiceStatus === "pending") {
        next = { ...next, voiceStatus: "error", voiceError: "새로고침으로 중단됐습니다 — 다시 생성해 주세요." };
      }
      if (next.renderStatus === "starting") {
        next = { ...next, renderStatus: "error", renderError: "새로고침으로 중단됐습니다 — 다시 생성해 주세요." };
      }
      return next;
    });
  } catch {
    return null;
  }
}

/** ```json 코드블록 → 없으면 '{' 로 시작하는 일반 ``` 코드블록 중 마지막
 *  것 → 둘 다 없으면 null(호출부가 이어서 자기 폴백 진행). pipelines/
 *  common/json_extract.py::extract_fenced_json_text와 의도적으로 같은
 *  순서 — 실제 영상 렌더(render_video, 백엔드 extract_json_object)가
 *  이미 이 순서로 JSON을 뽑아서 "이 응답 전체 복사"(검수용 각본 설명글
 *  + JSON 코드블록이 같이 붙은 텍스트)를 넣어도 정상 동작한다. */
export function extractFencedJsonText(text: string): string | null {
  const jsonFence = text.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonFence) return jsonFence[1];
  const blocks = [...text.matchAll(/```\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = blocks.filter((b) => b.trim().startsWith("{"));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export function parseCuts(jsonText: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const cuts = parsed && typeof parsed === "object" ? (parsed as { cuts?: unknown }).cuts : undefined;
    return Array.isArray(cuts) ? cuts : null;
  } catch {
    return null;
  }
}

/** 카드 입력창(JSON 각본, 각본+JSON이 섞인 전체 응답, 또는 순수 텍스트)
 *  → 성우 미리듣기에 쓸 내레이션 문자열. `{"cuts":[{"narration":"..."}]}`
 *  형태를 찾으면 각 컷의 narration을 공백으로 이어붙인다 — JSON을 찾는
 *  순서는 ```json 코드블록 → 원문 전체 → 첫 '{'~마지막 '}' 구간(백엔드
 *  extract_json_object와 동일 3단계).
 *
 *  2026-09-24, 같은 날 후속 — 사용자 리포트: "'이 응답 전체 복사'를
 *  넣고 생성을 눌렀더니 음성이 출력해준 전체(검수용 각본 설명글까지)를
 *  읽고 있다"는 버그. 원인: 이 함수가 원래 원문 전체를 곧바로
 *  JSON.parse만 시도했는데, "전체 복사" 결과물은 설명글+JSON 코드블록이
 *  같이 붙어있어 그 자체로는 유효한 JSON이 아니라서 파싱이 실패하고,
 *  그러면 원문 전체가 그대로 내레이션으로 나가버렸다(실제 영상 렌더는
 *  백엔드 extract_json_object가 코드블록을 먼저 찾아내서 원래 문제
 *  없었다 — 성우 미리듣기 쪽에만 그 로직이 빠져 있었음). 이제 백엔드와
 *  같은 순서로 JSON을 찾아서 이 문제가 없다. 셋 다 실패해야만(narration이
 *  하나도 없음) 원문 그대로를 내레이션으로 쓴다(순수 텍스트만 붙여넣어
 *  음성만 빠르게 테스트하는 경우를 위해 남겨둠). */
export function extractNarration(raw: string, opts: { stripScriptMarkup?: boolean } = {}): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const candidates: string[] = [];
  const fenced = extractFencedJsonText(trimmed);
  if (fenced !== null) candidates.push(fenced);
  candidates.push(trimmed);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    const cuts = parseCuts(candidate);
    if (!cuts) continue;
    const joined = cuts
      .map((cut) =>
        cut && typeof cut === "object" && typeof (cut as { narration?: unknown }).narration === "string"
          ? (cut as { narration: string }).narration
          : ""
      )
      .filter((s) => s.trim().length > 0)
      .join(" ");
    if (joined.trim()) return joined;
  }

  return opts.stripScriptMarkup ? stripScriptMarkup(trimmed) : trimmed;
}

/** PRISM 카드(2026-10-21) — JSON 대신 왼쪽 채팅의 영어 대본 응답을 그대로 붙여넣는다. 성우 미리듣기가
 *  "# SG7 … — EL Script" 같은 머리글·업로드 안내(Block D)·[pause] 같은 꺾쇠 표시까지 읽지 않도록,
 *  대본 코드블록이 있으면 그 안만 쓰고 머리글 줄과 꺾쇠 표시를 지운다(장면 변환 프롬프트가 렌더 때
 *  하는 정리와 같은 방향). */
export function stripScriptMarkup(text: string): string {
  const block = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).find((b) => !b.trim().startsWith("{"));
  return (block ?? text)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/\[[^\]\n]{1,30}\]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type Provider = "polly" | "elevenlabs";

// 성우·엔진 조합표는 PollyVoiceSettingsFields.tsx에서 가져온다(위 import 참고).
// rate/volume(2026-09-25 추가) — 사용자 요청: "팟캐스트 부분처럼.. 동일하게
// 해야죠." tts.ts가 SSML <prosody> 지원을 갖추면서 영상도 실제로 반영되기
// 시작해 팟캐스트와 동일하게 카드별 성우 미리듣기에서도 조정 가능하게 한다.
export interface PollySettings {
  voice: string;
  engine: string;
  rate: string;
  volume: string;
}
export const POLLY_DEFAULTS: PollySettings = { voice: "Seoyeon", engine: "generative", rate: "100%", volume: "+0dB" };

export type RenderProgress =
  | { stage: "scene" }
  | { stage: "tts"; current: number; total: number }
  | { stage: "bundling" }
  | { stage: "rendering"; percent: number; renderedFrames: number; totalFrames: number; encodedFrames: number };

export function progressLabel(p: RenderProgress | null | undefined): string {
  if (!p) return "렌더 준비 중...";
  if (p.stage === "scene") return "대본을 장면으로 나누는 중... (1~2분)";
  if (p.stage === "tts") return p.total > 0 ? `음성 합성 중 (${p.current}/${p.total}컷)` : "음성 합성 중...";
  if (p.stage === "bundling") return "렌더 환경 준비 중...";
  return `렌더링 중 (${p.renderedFrames}/${p.totalFrames}프레임)`;
}

export function progressPercent(p: RenderProgress | null | undefined): number {
  if (!p) return 2;
  if (p.stage === "scene") return 3;
  if (p.stage === "tts") return 5;
  if (p.stage === "bundling") return 10;
  return 15 + Math.round(p.percent * 0.85);
}

export const POLL_INTERVAL_MS = 5000;

export interface CardState {
  id: string;
  /** 입력창 하나 — JSON 각본이면 영상 렌더에 그대로 쓰고, 성우 미리듣기는
   *  extractNarration()으로 뽑아낸 텍스트를 쓴다. */
  input: string;
  // 성우 미리듣기
  voiceStatus: "idle" | "pending" | "done" | "error";
  audioUrl: string | null;
  voiceError: string | null;
  provider: Provider;
  voiceId: string;
  modelId: string;
  voiceSettings: ElevenLabsVoiceSettings;
  pollySettings: PollySettings;
  voiceSummary: string | null;
  // 영상 생성 — format(2026-09-25 추가, 사용자 지적: "동영상 부분도..
  // 영상 탭에.. 추가되어야하는거 아닌가요? 음성 설정만 있어서.. 지금
  // 중간 섹션엔") — 오른쪽 "설정" 칼럼의 발행 포맷과 별개로, 카드마다
  // 테스트 렌더용 포맷을 바꿔볼 수 있게 한다(provider/voice와 같은
  // "카드 한정 override" 성격 — handleGenerate가 render_video에 실어
  // 보내면 chat_ws.py가 video_settings.get_render_settings()의 override로
  // 얹는다, 발행 설정 자체는 안 바뀐다).
  format: string;
  renderStatus: "idle" | "starting" | "rendering" | "done" | "error";
  jobId: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
  renderError: string | null;
  progress: RenderProgress | null;
  /** 2026-09-24, 같은 날 후속 — 사용자 지적: "음성 생성중에... 새
   *  대화창을 열고... 다시 돌아오면... 작업이 중단되어있는데... 작업
   *  큐가 돌고 있어야 하는 것 아닌가요?" "생성" 클릭 시점의 threadId를
   *  고정해둔다 — 진행 중(voiceStatus==="pending" 또는 renderStatus가
   *  starting/rendering)에 사용자가 다른 대화로 넘어가도, 결과는 이
   *  카드가 원래 속했던 대화에 저장돼야 한다. */
  ownerThreadId: number | null;
}

export function newCard(
  voiceDefaults: Pick<CardState, "provider" | "voiceId" | "modelId" | "voiceSettings" | "pollySettings" | "format">
): CardState {
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    input: "",
    voiceStatus: "idle",
    audioUrl: null,
    voiceError: null,
    voiceSummary: null,
    ...voiceDefaults,
    renderStatus: "idle",
    jobId: null,
    videoUrl: null,
    thumbUrl: null,
    renderError: null,
    progress: null,
    ownerThreadId: null,
  };
}

/** 대화에 저장된 videoPreview(완료된 결과만) → 카드 하나(2026-09-24).
 *  localStorage에 이 대화 기록이 없을 때만 쓰는 폴백이라 진행 중
 *  상태는 없다 — renderStatus는 항상 done/error. */
export function restoredCard(v: NonNullable<ChatThreadMessage["videoPreview"]>): CardState {
  return {
    id: `restored-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    input: v.input,
    voiceStatus: v.audioUrl ? "done" : "idle",
    audioUrl: v.audioUrl ?? null,
    voiceError: null,
    provider: v.provider,
    voiceId: v.voiceId ?? "",
    modelId: v.modelId ?? "",
    voiceSettings: v.voiceSettings ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS,
    pollySettings: v.pollySettings ? { ...POLLY_DEFAULTS, ...v.pollySettings } : POLLY_DEFAULTS,
    format: v.format ?? FORMATS[0].id,
    voiceSummary: v.voiceSummary ?? null,
    renderStatus: v.renderStatus,
    jobId: v.jobId ?? null,
    videoUrl: v.videoUrl ?? null,
    thumbUrl: v.thumbUrl ?? null,
    renderError: v.renderError ?? null,
    progress: null,
    ownerThreadId: null,
  };
}
