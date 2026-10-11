/** 음성 슬롯 상태 타입·헬퍼 — VoicePreviewGenerator.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { ChatThreadMessage } from "@/lib/types";
import { ELEVENLABS_FALLBACK_VOICE_SETTINGS, type ElevenLabsVoiceSettings } from "./ElevenLabsVoiceSettingsFields";

export type Provider = "polly" | "elevenlabs";

// ElevenLabsVoiceSettings 타입·기본값·범위는 ElevenLabsVoiceSettingsFields.tsx가
// 정본이다(2026-09-24 이전엔 여기 따로 있었는데, PodcastVoiceSettingsPanel/
// VideoRenderSettingsPanel도 같은 걸 써야 해서 공용 파일로 뺐다 — 위
// import 참고).

// 2026-09-24, 사용자 요청 — "폴리를 클릭했을때 튜닝할 수 있는거는
// 합치면 좋겠네요"(ElevenLabs 카드처럼 Polly도 카드마다 독립적으로
// 값을 바꿔가며 비교하고 싶다는 뜻). PodcastVoiceSettingsPanel.tsx/
// 성우·엔진 조합표는 PollyVoiceSettingsFields.tsx(POLLY_VOICES/
// POLLY_VOICE_ENGINE_OPTIONS)에서 가져온다 — 2026-09-25까지 이 파일에도
// 하드코딩돼 있었는데 VoiceProviderFields.tsx 신설로 한 곳에 모았다.
export interface PollySettings {
  voice: string;
  engine: string;
  rate: string;
  volume: string;
}
export const POLLY_DEFAULTS: PollySettings = { voice: "Seoyeon", engine: "generative", rate: "100%", volume: "+0dB" };

export interface SlotState {
  id: string;
  text: string;
  status: "idle" | "pending" | "done" | "error";
  audioUrl: string | null;
  error: string | null;
  provider: Provider;
  voiceId: string;
  modelId: string;
  voiceSettings: ElevenLabsVoiceSettings;
  pollySettings: PollySettings;
  /** "생성" 클릭 시점에 고정한 표시용 요약 — 나중에 provider/voiceId/modelId를
   *  바꿔도 이 값은 안 바뀐다. */
  summary: string | null;
  /** 2026-09-24, 같은 날 후속 — 사용자 지적: "음성 생성중에... 새
   *  대화창을 열고... 다시 돌아오면... 작업이 중단되어있는데... 작업
   *  큐가 돌고 있어야 하는 것 아닌가요?" "생성" 클릭 시점의 threadId를
   *  고정해둔다 — 생성이 끝나기 전에 사용자가 다른 대화로 넘어가도, 이
   *  결과는 (지금 보고 있는 대화가 아니라) 이 카드가 원래 속했던
   *  대화에 저장돼야 한다. status==="pending"이 아니면 의미 없음. */
  ownerThreadId: number | null;
}

export function newSlot(
  defaults: Pick<SlotState, "provider" | "voiceId" | "modelId" | "voiceSettings" | "pollySettings">
): SlotState {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    status: "idle",
    audioUrl: null,
    error: null,
    summary: null,
    ownerThreadId: null,
    ...defaults,
  };
}

/** 대화에 저장된 audioPreview → 카드 하나(2026-09-24). */
export function restoredSlot(a: NonNullable<ChatThreadMessage["audioPreview"]>): SlotState {
  return {
    id: `restored-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: a.text,
    status: "done",
    audioUrl: a.audioUrl,
    error: null,
    provider: a.provider,
    voiceId: a.voiceId ?? "",
    modelId: a.modelId ?? "",
    voiceSettings: a.voiceSettings ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS,
    pollySettings: a.pollySettings
      ? { voice: a.pollySettings.voice, engine: a.pollySettings.engine, rate: a.pollySettings.rate ?? POLLY_DEFAULTS.rate, volume: a.pollySettings.volume ?? POLLY_DEFAULTS.volume }
      : POLLY_DEFAULTS,
    summary: a.summary,
    ownerThreadId: null,
  };
}

/* 2026-09-24, 사용자 요청 — "성우들 드롭다운열면... 간단한 인삿말로..
   미리듣기 할 수 있도록.. 재생버튼 놔주고.. 클릭하면 재생되도록": 성우
   드롭다운 전용 작은 컴포넌트 — CustomSelect(공용, 웹툰 모델 드롭다운 등
   다른 곳에서도 쓰는 범용 컴포넌트)를 그대로 재사용하지 않고 따로 뺐다.
   이유: 옵션 한 줄 안에 "선택" 버튼과 "미리듣기" 버튼 두 개의 클릭
   영역이 같이 있어야 하는데(버튼 안에 버튼은 안 됨 — 잘못된 HTML), 이건
   이 성우 미리듣기 전용 요구라 공용 컴포넌트 구조를 바꾸기보다 여기서
   작게 새로 만드는 쪽이 범위가 깔끔하다. 재생은 실시간 합성이 아니라
   elevenlabs_tts.py::VOICES의 sample_url(성우당 미리 만들어둔 짧은
   인삿말 mp3, S3 고정 URL)을 그대로 트는 것 — 드롭다운 열 때마다
   ElevenLabs를 호출하지 않는다(크레딧 낭비 방지). 2026-09-25 —
   VoiceSelectWithPreview.tsx로 옮겼다(VoiceProviderFields.tsx와의 순환
   참조 회피, 아래 import 참고). */
