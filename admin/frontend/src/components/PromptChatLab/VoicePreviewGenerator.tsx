"use client";

import { useEffect, useRef, useState } from "react";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import type { ChatThreadMessage, PromptHistoryEntry } from "@/lib/types";
import { adminApi } from "@/lib/adminClient";
import { CollapsibleSection } from "./CollapsibleSection";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";
import { ApplyReviewModal } from "./ApplyReviewModal";
import { StepTabs } from "./StepTabs";
import { VoiceProviderFields } from "./VoiceProviderFields";
import {
  ELEVENLABS_FALLBACK_VOICE_SETTINGS,
  ELEVENLABS_FALLBACK_RANGES,
  type ElevenLabsVoiceSettings,
} from "./ElevenLabsVoiceSettingsFields";
import { POLLY_VOICES, POLLY_VOICE_ENGINE_OPTIONS } from "./PollyVoiceSettingsFields";
import type { ParsedDoc as PodcastParsedDoc } from "./PodcastVoiceSettingsPanel";

/* 팟캐스트·영상 탭 공용 "성우 미리듣기" 패널 — 2026-09-22 팟캐스트용으로
   신설(원래 이름 PodcastAudioGenerator.tsx), 2026-09-24에 영상 탭도
   쓰도록 일반화하며 이름을 바꿨다(사용자 요청: "근데 영상에도 음성이
   들어가잖아요?? ... 팟캐스트 부분이랑 영상 탭에 대해서 구조가 좀
   통일될 건 통일 하면 좋지 않을까요").

   1차로는 채팅 메시지마다 "음성으로 듣기" 버튼을 달았는데, 사용자가
   다시 요청: "이전 대화 쓰레드... 사용자가 입력한 말풍선은 안보이더라고.
   그리고, 바로 음성 출력하지말구... 음성 부분도, 웹툰처럼... 컷별로..
   있는것처럼.. 음성도.. 여러개를 리스트 형태로 만들면 어떤가요? 스크립트를
   넣고 생성을 누르면 음성이 생성되도록요... 왼쪽은 텍스트만, 우측은
   음성을 생성하는거죠." — WebtoonCutGenerator.tsx(웹툰 컷 이미지 패널)와
   똑같은 골격: 슬롯 목록 + 슬롯마다 직접 텍스트를 채워 넣고 "생성"을
   누르면 그 슬롯만 합성된다(자동 생성 없음, 웹툰 컷 슬롯도 "사용자가
   직접 복붙" 원칙과 동일). 웹툰은 슬롯이 8개 고정(발행 포맷이 8컷
   고정이라서)이지만 대본엔 그런 고정 개수가 없어 "+추가"로 늘어나는
   목록으로 뒀다.

   소켓 연결은 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   만들어 내려준다 — WebtoonCutGenerator와 같은 이유(그 컴포넌트
   docstring 참고, useAdminChatSocket.ts도 마찬가지)로 이 컴포넌트가
   따로 소켓을 열면 같은 화면에 연결이 2개가 된다.

   slot_id 상관관계 — WebtoonCutGenerator가 "cut_image" 응답의 cut
   번호로 슬롯을 찾는 것과 같은 이유로, routes/chat_ws.py::
   _run_synthesize_audio_flow가 요청에 실어 보낸 slot_id를 그대로
   돌려준다(audio_ready/audio_error 둘 다) — 여러 슬롯을 동시에 생성
   중이어도 응답이 엇갈리지 않는다.

   제공자(provider, 2026-09-24 추가) — 사용자 요청: "일레븐랩스의 어떤
   모델들이 있을거고... api로... 그런것처럼 음성 부분도 모델 선택할 수
   있도록요." 기본은 "polly"(실제 발행과 똑같은 함수·설정을 그대로 씀,
   기존 동작 100% 유지). "elevenlabs"를 고르면 성우/모델 드롭다운이
   나타나고, 그 값은 이 슬롯 생성 요청에만 실려간다 — 저장되는 발행
   설정(PodcastVoiceSettingsPanel/VideoRenderSettingsPanel)과는 완전히
   분리된, 저장 안 되는 일회성 실험값이다(2026-08-27에 비용 때문에
   ElevenLabs→Polly로 전환했던 결정을 실제 발행 파이프라인에서는
   되돌리지 않는다 — CMS 미리듣기에서만 씀).

   카드별 독립 설정(2026-09-24, 사용자 요청: "음성별로 A/B/C 테스트까지
   해야하니... 일관되도록 하지말고 카드별로 모델을 설정 할 수있도록") —
   제공자/성우/모델을 패널 전체가 아니라 카드(슬롯) 각각이 따로 가진다.
   Polly는 "발행 설정 그대로" 하나뿐이라 카드별로 더 고를 게 없지만(그
   값 자체를 바꾸고 싶으면 오른쪽 "음성 설정" 패널에서 발행 설정을
   바꾸는 게 맞다 — 거긴 실제 프로덕션 진실이라 카드마다 쪼갤 이유가
   없음), ElevenLabs는 카드마다 다른 성우·모델을 골라 나란히 비교할 수
   있다. 새 카드는 직전 카드의 설정을 그대로 이어받는다(매번 처음부터
   다시 고르지 않게) — 그래도 각 카드는 독립적으로 바꿀 수 있다.

   요약 배지(2026-09-24) — "생성" 누른 시점의 설정을 그 카드에 고정해
   보여준다(사용자 요청: "카드별로 설정한 값을 볼 수 있으면 좋겠는데..
   클릭할 때마다.. 그러면 비교가 될 수 있지 않을려나"). 드롭다운을 나중에
   바꿔도 이미 만든 카드의 배지는 그대로라, 여러 카드를 비교할 때 "이
   소리가 뭘로 만든 건지" 안 헷갈린다.

   세부 설정(voiceSettings, 2026-09-24 추가) — 사용자 요청: "일래븐 랩스쪽은
   폴리처럼 파라미터들? 피치나 속도나 조정하도록 하는건 안되는건가요" →
   "어던 것들을 제어할 수 있는지 봐주실랴요? 포함 시켜야 합니다". 실제
   ElevenLabs API(GET /v1/voices/{id}/settings)를 직접 확인해 존재하는
   파라미터만 넣었다 — pitch는 그 API에 아예 없는 값이라(보내도 조용히
   무시됨) 뺐다. stability/similarity_boost/style/speed/use_speaker_boost
   5개가 실제로 검증되는 전부(elevenlabs_tts.py 모듈 docstring 참고). */

type Provider = "polly" | "elevenlabs";

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
interface PollySettings {
  voice: string;
  engine: string;
  rate: string;
  volume: string;
}
const POLLY_DEFAULTS: PollySettings = { voice: "Seoyeon", engine: "generative", rate: "100%", volume: "+0dB" };

interface SlotState {
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

function newSlot(
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
function restoredSlot(a: NonNullable<ChatThreadMessage["audioPreview"]>): SlotState {
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

export function VoicePreviewGenerator({
  format,
  placeholder,
  stickyTop = 0,
  threadId = null,
  restoredCards,
  persistArtifact,
  wsOpen,
  send,
  subscribe,
  onApplyToProduction,
  productionDefaults,
  serverVersion,
  promptHistory,
  testVersion,
  onTestVersionChange,
  onServerVersionChange,
  onPromptHistoryRefresh,
  category,
  name,
}: {
  /** 실제 발행 파이프라인과 같은 함수를 고르는 기준(routes/chat_ws.py::
   *  _run_synthesize_audio_flow의 format 분기) — "podcast"면
   *  podcast_voice.synthesize(SSML 속도/음량 반영), "video"면
   *  video_settings.synthesize(SSML 없이 평문, 실제 tts.ts와 동일). */
  format: "podcast" | "video";
  placeholder?: string;
  /** 2026-09-27 — "테스트 추가" 띠 sticky 고정용, WebtoonCutGenerator.tsx
   *  주석 참고(프로덕션 카드 실측 높이). */
  stickyTop?: number;
  /** 2026-09-24 — 지금 열려있는 대화 스레드 id. 바뀌면(다른 대화를
   *  열거나 "새 대화") 카드 목록을 restoredCards로 다시 구성한다(사용자
   *  지적: "대화 하고 나갔다 오면... 음성... 사라지는데... 나머지들도
   *  다 남으면 좋지"). 안 주면(기본 null) 복원 로직이 그냥 안 켜진다. */
  threadId?: number | null;
  /** 이 대화에 저장된 카드들 — 부모(PromptTextLab)가 openThread에서
   *  모아 내려준다. */
  restoredCards?: NonNullable<ChatThreadMessage["audioPreview"]>[];
  /** 카드가 완료되면(audio_ready) 이 대화에 조용히 저장한다(채팅
   *  말풍선은 안 건드림) — useChatLabThread.ts::persistArtifact. 안 주면
   *  저장을 건너뛴다(기존 호출부 호환). 2번째 인자로 카드의
   *  ownerThreadId를 명시적으로 넘긴다 — 생성 도중 사용자가 다른
   *  대화로 넘어가도 원래 대화에 정확히 저장되게. */
  persistArtifact?: (payload: Record<string, unknown>, targetThreadId?: number | null) => void;
  /** 소켓 연결 자체는 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   *  만들어 내려준다 — WebtoonCutGenerator.tsx와 동일 패턴. */
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
   *  테스트 카드에서 적용할 수 있게": "테스트 N" 카드의 통합 "프로덕션에
   *  적용" 버튼이 부른다 — 이 슬롯의 성우/엔진/속도/음량 설정을 그 자리에서
   *  바로 발행까지 한다(PodcastVoiceSettingsPanel.tsx::applyAndPublish).
   *  format==="video"일 땐 부모가 이 prop 자체를 안 넘긴다 —
   *  VideoCardGenerator.tsx가 그 탭을 전담한다. */
  onApplyToProduction?: (data: PodcastParsedDoc) => Promise<void>;
  /** 2026-09-26(후속), 사용자 지적(WebtoonCutGenerator.tsx와 동일) — "테스트
   *  카드도 마찬가지": 지금 실제 발행된 음성 설정 — 카드의 프롬프트
   *  버전과 음성 설정이 둘 다 이미 이 값과 같으면 "프로덕션에 적용"이
   *  no-op이라 비활성화한다. 아직 안 불러왔으면(null) 판단을 보류한다. */
  productionDefaults: PodcastParsedDoc | null;
  /** 2026-09-26, 최종 형태 — 카드마다 독립된 프롬프트 편집 초안을 갖는다
   *  (PromptVersionReference.tsx 모듈 docstring 참고 — "설명/지침/파일
   *  구조 똑같이 표출하고 수정 가능하도록... 버전 저장할 수 있도록").
   *  카드는 이 값들로 초기 초안(현재 프로덕션 내용)을 채우고, 저장/적용
   *  결과를 부모 state에 반영한다. */
  serverVersion: number | null;
  promptHistory: PromptHistoryEntry[];
  /** 왼쪽 채팅이 지금 쓰는 테스트 버전 — 어느 카드가 "채팅에서 사용 중"인지
   *  표시하는 데 쓴다(2026-09-26 후속, 여러 카드 중 어느 게 활성인지 안
   *  보이는 문제 — PromptVersionReference.tsx 모듈 docstring 참고). */
  testVersion: number | null;
  onTestVersionChange: (version: number | null) => void;
  onServerVersionChange: (version: number) => void;
  onPromptHistoryRefresh: () => void;
  category: string;
  name: string;
}) {
  const [elevenVoices, setElevenVoices] = useState<{ id: string; label: string; gender: string; sample_url: string }[]>([]);
  const [elevenModels, setElevenModels] = useState<{ id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[]>([]);
  const [voiceSettingsDefaults, setVoiceSettingsDefaults] = useState<ElevenLabsVoiceSettings>(ELEVENLABS_FALLBACK_VOICE_SETTINGS);
  const [voiceSettingsRanges, setVoiceSettingsRanges] = useState(ELEVENLABS_FALLBACK_RANGES);
  const [elevenOptionsLoaded, setElevenOptionsLoaded] = useState(false);
  const [slots, setSlots] = useState<SlotState[]>(() => [
    newSlot({ provider: "polly", voiceId: "", modelId: "", voiceSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS, pollySettings: POLLY_DEFAULTS }),
  ]);
  // 2026-09-26, 사용자 지적(WebtoonCutGenerator.tsx와 동일 요청) — "테스트
  // 카드에 해당 테스트에서 어떤 버전을 활성화 했는지... 정보가 부족":
  // 각 카드의 PromptVersionReference가 로드해 둔 버전을 모아 "테스트 N"
  // 헤더에 펼치지 않고도 보이게 한다.
  const [activeInfos, setActiveInfos] = useState<Record<string, { version: number; label: string | null } | null>>({});
  // 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
  // 이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고... 테스트
  // 카드에서 적용할 수 있게": 카드마다 PromptVersionReference의 활성화
  // 능력(activateIfNeeded)을 ref로 붙잡아뒀다가, 카드 레벨의 "프로덕션에
  // 적용" 버튼이 프롬프트 버전+음성 설정을 한 번에 적용한다
  // (WebtoonCutGenerator.tsx와 동일 패턴).
  const promptRefs = useRef<Record<string, PromptVersionReferenceHandle | null>>({});
  // 2026-09-26 — window.confirm 대신 검토 모달(ApplyReviewModal.tsx 참고).
  const [reviewSlotId, setReviewSlotId] = useState<string | null>(null);
  // WS subscribe(아래, 마운트 시 1회 등록)는 클로저가 마운트 시점
  // threadId를 그대로 들고 있어 나중에 바뀐 값을 못 본다 — ref로
  // 최신값을 같이 들고 있는다(2026-09-24 후속, 아래 ownerThreadId 참고).
  const threadIdRef = useRef(threadId);
  useEffect(() => {
    threadIdRef.current = threadId;
  });

  // 2026-09-24 — 대화가 바뀌면 그 대화의 저장된 카드로 목록을 다시
  // 구성한다(없으면 빈 카드 1개로 초기화 — 마운트 시 기본값과 동일).
  // useEffect+setState 대신 렌더 중 비교(WebtoonCutGenerator.tsx의
  // threadId 리셋과 같은 패턴, admin/frontend/CLAUDE.md의 "set-state-in-effect
  // 예외" 대신 근본 수정 원칙) — prop이 바뀌면 그 자리에서 바로 맞춘다.
  //
  // 2026-09-24, 같은 날 후속 — 사용자 지적: "음성 생성중에... 새
  // 대화창을 열고... 다시 돌아오면... 작업이 중단되어있는데... 작업
  // 큐가 돌고 있어야 하는 것 아닌가요?" 처음엔 이 블록이 목록을
  // 통째로 교체해서, 생성 중(status==="pending")이던 카드까지 화면에서
  // 사라졌다 — 서버는 계속 합성 중인데 결과(audio_ready)가 도착해도
  // 받아줄 슬롯이 없어 조용히 버려졌다. 지금 생성 중인 카드는 어느
  // 대화 걸로 바뀌든 그대로 유지하고, 그 자리에 새 대화의 저장된
  // 카드를 이어붙인다 — 결과가 도착하면 아래 WS 핸들러가 ownerThreadId를
  // 보고 알아서 정리한다.
  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    setSlots((prev) => {
      const stillPending = prev.filter((s) => s.status === "pending");
      const restored = restoredCards && restoredCards.length > 0 ? restoredCards.map(restoredSlot) : [];
      if (stillPending.length > 0) return [...stillPending, ...restored];
      return restored.length > 0
        ? restored
        : [newSlot({ provider: "polly", voiceId: "", modelId: "", voiceSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS, pollySettings: POLLY_DEFAULTS })];
    });
  }

  const ensureElevenOptions = () => {
    if (elevenOptionsLoaded) return;
    setElevenOptionsLoaded(true);
    adminApi
      .getElevenLabsOptions()
      .then((r) => {
        setElevenVoices(r.voices);
        setElevenModels(r.models);
        // 2026-09-24 — 백엔드가 구버전이면(로컬 dev 서버 재기동 누락 등)
        // 이 필드가 없을 수 있다 — 폴백으로 방어(실제로 한 번 겪음).
        setVoiceSettingsDefaults(r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS);
        setVoiceSettingsRanges(r.voice_settings_ranges ?? ELEVENLABS_FALLBACK_RANGES);
        // 아직 아무 카드도 성우/모델을 못 고른 상태(초기 로드)였다면
        // 첫 옵션으로 채워준다 — 빈 채로 두면 "생성"이 빈 voice_id를 보낸다.
        setSlots((prev) =>
          prev.map((s) =>
            s.provider === "elevenlabs" && !s.voiceId
              ? { ...s, voiceId: r.voices[0]?.id ?? "", modelId: r.models[0]?.id ?? "", voiceSettings: r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS }
              : s
          )
        );
      })
      .catch((err) => console.error("ElevenLabs 옵션 조회 실패", err));
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "audio_ready") {
        const m = msg as unknown as { slot_id: string; audio_url: string };
        setSlots((prev) => {
          const target = prev.find((s) => s.id === m.slot_id);
          if (!target) return prev; // 이미 다른 이유로 목록에서 빠진 카드 — 무시
          const next: SlotState = { ...target, status: "done", audioUrl: m.audio_url, error: null };
          persistArtifact?.(
            {
              audioPreview: {
                provider: next.provider,
                voiceId: next.provider === "elevenlabs" ? next.voiceId : undefined,
                modelId: next.provider === "elevenlabs" ? next.modelId : undefined,
                voiceSettings: next.provider === "elevenlabs" ? next.voiceSettings : undefined,
                pollySettings: next.provider === "polly" ? next.pollySettings : undefined,
                audioUrl: m.audio_url,
                summary: next.summary ?? "",
                text: next.text,
              },
            },
            next.ownerThreadId
          );
          // 2026-09-24 — 생성 도중 사용자가 다른 대화로 넘어갔으면(지금
          // 보고 있는 대화 ≠ 이 카드가 속했던 대화) 위에서 이미 그
          // 대화에 정확히 저장했으니, 여기 화면(지금 보고 있는 다른
          // 대화)엔 이 카드를 남겨두지 않는다 — 다시 그 대화를 열면
          // restoredCards로 복원된다.
          return next.ownerThreadId === threadIdRef.current
            ? prev.map((s) => (s.id === m.slot_id ? next : s))
            : prev.filter((s) => s.id !== m.slot_id);
        });
      } else if (msg.type === "audio_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        setSlots((prev) => {
          const target = prev.find((s) => s.id === m.slot_id);
          if (!target) return prev;
          // 실패는 저장하지 않는다(기존 정책 그대로) — 다른 대화로
          // 넘어간 뒤 실패했으면 조용히 치운다, 지금 보는 대화 것이면
          // 에러를 그대로 보여준다.
          return target.ownerThreadId === threadIdRef.current
            ? prev.map((s) => (s.id === m.slot_id ? { ...s, status: "error", error: m.message } : s))
            : prev.filter((s) => s.id !== m.slot_id);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSlots는 함수형 갱신, threadIdRef는 ref라 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const updateSlot = (id: string, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const setSlotProvider = (id: string, provider: Provider) => {
    if (provider === "elevenlabs") ensureElevenOptions();
    updateSlot(id, {
      provider,
      voiceId: provider === "elevenlabs" ? elevenVoices[0]?.id ?? "" : "",
      modelId: provider === "elevenlabs" ? elevenModels[0]?.id ?? "" : "",
      voiceSettings: voiceSettingsDefaults,
      pollySettings: POLLY_DEFAULTS,
    });
  };

  const updateVoiceSetting = <K extends keyof ElevenLabsVoiceSettings>(id: string, key: K, value: ElevenLabsVoiceSettings[K]) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, voiceSettings: { ...s.voiceSettings, [key]: value } } : s))
    );
  };

  const updatePollySetting = <K extends keyof PollySettings>(id: string, key: K, value: PollySettings[K]) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s.pollySettings, [key]: value };
        // 성우를 바꾸면 그 성우가 안 쓰는 엔진일 수 있다 — 첫 지원 엔진으로 자동 보정.
        if (key === "voice") next.engine = POLLY_VOICE_ENGINE_OPTIONS[next.voice][0].id;
        return { ...s, pollySettings: next };
      })
    );
  };

  const summarize = (s: SlotState): string => {
    if (s.provider === "polly") {
      const voiceLabel = POLLY_VOICES.find((v) => v.id === s.pollySettings.voice)?.label ?? s.pollySettings.voice;
      const engineLabel =
        POLLY_VOICE_ENGINE_OPTIONS[s.pollySettings.voice]?.find((e) => e.id === s.pollySettings.engine)?.label ??
        s.pollySettings.engine;
      const base = `Polly · ${voiceLabel} · ${engineLabel}`;
      return format === "podcast" ? `${base} · ${s.pollySettings.rate} · ${s.pollySettings.volume}` : base;
    }
    const voiceLabel = elevenVoices.find((v) => v.id === s.voiceId)?.label ?? s.voiceId;
    const modelLabel = elevenModels.find((m) => m.id === s.modelId)?.label ?? s.modelId;
    return `ElevenLabs · ${voiceLabel} · ${modelLabel}`;
  };

  const handleGenerate = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (!s || !s.text.trim() || !wsOpen || s.status === "pending") return;
    // send()가 소켓 상태 확인과 32KB 프레임 크기 가드를 둘 다 내부에서
    // 처리한다(useAdminChatSocket 참고) — 반환값을 확인 안 하면 슬롯이
    // "생성 중"에 영원히 멈춘다.
    const result = send(
      "synthesize_audio",
      s.provider === "elevenlabs"
        ? {
            text: s.text, slot_id: id, provider: s.provider, voice_id: s.voiceId, model_id: s.modelId,
            voice_settings: s.voiceSettings, format,
          }
        : { text: s.text, slot_id: id, provider: s.provider, polly_settings: s.pollySettings, format }
    );
    if (!result.sent) {
      const error = result.tooLarge
        ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      updateSlot(id, { status: "error", error });
      return;
    }
    updateSlot(id, { status: "pending", error: null, summary: summarize(s), ownerThreadId: threadId });
  };

  const addSlot = () =>
    setSlots((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        newSlot(
          last
            ? {
                provider: last.provider, voiceId: last.voiceId, modelId: last.modelId,
                voiceSettings: last.voiceSettings, pollySettings: last.pollySettings,
              }
            : { provider: "polly", voiceId: "", modelId: "", voiceSettings: voiceSettingsDefaults, pollySettings: POLLY_DEFAULTS }
        ),
      ];
    });
  const removeSlot = (id: string) =>
    setSlots((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));

  // 2026-09-26(후속) — WebtoonCutGenerator.tsx::handleApplyTestToProduction과
  // 동일 패턴: 프롬프트 버전 활성화 + 음성 설정 발행을 한 클릭으로 묶는다
  // (확인은 이제 ApplyReviewModal이 맡는다).
  const handleApplyTestToProduction = async (s: SlotState) => {
    if (!onApplyToProduction) return;
    await promptRefs.current[s.id]?.activateIfNeeded();
    await onApplyToProduction({
      provider: s.provider,
      voice: s.pollySettings.voice,
      engine: s.pollySettings.engine,
      rate: s.pollySettings.rate,
      volume: s.pollySettings.volume,
      elevenlabsVoice: s.voiceId,
      elevenlabsModel: s.modelId,
      elevenlabsSettings: s.voiceSettings,
    });
  };
  const reviewingSlot = slots.find((s) => s.id === reviewSlotId) ?? null;

  return (
    <>
      {/* 2026-09-26 — "테스트" 묶음 토글 자체를 없앴다(사용자 지적:
          "프로덕션 토글, 테스트 토글로 분류할 필요가 있을까요? ...
          카드들만 쭉 나오는거겠지?") — 카드 하나하나가 이미 자기
          제목("테스트 N")과 토글을 가지고 있어서, 그걸 또 감싸는
          바깥 묶음은 군더더기였다. "+ 추가"만 카드 목록 위에 남는다. */}
      {/* 2026-09-27(후속) — 사용자 지적: "펼치면 구분이 어려울 수 있어서..
          배경 색을 주면 구분이 좀 더 괜찮을지도", WebtoonCutGenerator.tsx와
          동일하게 선 대신 옅은 회색 배경 띠 + "테스트" 라벨로. */}
      <div
        className="sticky z-10 flex items-center justify-between border-b px-2.5 py-1.5"
        style={{ top: stickyTop, background: "var(--surface-sunken)", borderColor: "var(--border-hairline)" }}
      >
        <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">테스트</span>
        <button
          type="button"
          onClick={addSlot}
          className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          + 테스트 추가
        </button>
      </div>
      {/* 2026-09-27(후속) — 카드/그림자/간격 전부 제거, WebtoonCutGenerator.tsx 주석 참고. */}
      <div>
        {slots.map((s, i) => {
          // 2026-09-26(후속), 사용자 지적 — "테스트 카드도 마찬가지": 이
          // 슬롯이 지금 프로덕션과 완전히 같은 상태(같은 프롬프트 버전 +
          // 같은 음성 설정)면 "프로덕션에 적용"은 no-op이라 비활성화.
          const info = activeInfos[s.id];
          const unchanged =
            info != null &&
            serverVersion !== null &&
            info.version === serverVersion &&
            productionDefaults !== null &&
            JSON.stringify({
              provider: s.provider,
              voice: s.pollySettings.voice,
              engine: s.pollySettings.engine,
              rate: s.pollySettings.rate,
              volume: s.pollySettings.volume,
              elevenlabsVoice: s.voiceId,
              elevenlabsModel: s.modelId,
              elevenlabsSettings: s.voiceSettings,
            }) === JSON.stringify(productionDefaults);
          return (
          <div key={s.id} className="overflow-hidden border-b bg-[var(--surface-card)]" style={{ borderColor: "var(--border-hairline)" }}>
          <CollapsibleSection
            title={`테스트 ${i + 1}`}
            titleExtra={
              activeInfos[s.id] ? (
                <span
                  className="flex-none truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={
                    testVersion === activeInfos[s.id]!.version
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                  }
                  title={testVersion === activeInfos[s.id]!.version ? "채팅에서 사용 중인 버전" : "이 카드에 로드된 버전"}
                >
                  v{activeInfos[s.id]!.version}
                  {activeInfos[s.id]!.label ? ` · ${activeInfos[s.id]!.label}` : ""}
                </span>
              ) : undefined
            }
            badge={
              <div className="flex items-center gap-1.5">
                {onApplyToProduction && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setReviewSlotId(s.id);
                    }}
                    disabled={unchanged}
                    title={unchanged ? "이미 프로덕션과 같은 버전·설정입니다" : undefined}
                    className="ui-btn ui-btn-primary rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-50"
                  >
                    프로덕션에 적용
                  </button>
                )}
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      removeSlot(s.id);
                    }}
                    className="flex-none rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                    aria-label="삭제"
                    title="삭제"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            }
          >
            <StepTabs
              steps={[
                {
                  key: "prompt",
                  label: "생성 프롬프트",
                  content: (
                    <PromptVersionReference
                      ref={(el) => {
                        promptRefs.current[s.id] = el;
                      }}
                      category={category}
                      name={name}
                      serverVersion={serverVersion}
                      promptHistory={promptHistory}
                      testVersion={testVersion}
                      onTestVersionChange={onTestVersionChange}
                      onServerVersionChange={onServerVersionChange}
                      onPromptHistoryRefresh={onPromptHistoryRefresh}
                      onActiveInfoChange={(info) => setActiveInfos((prev) => ({ ...prev, [s.id]: info }))}
                      bare
                    />
                  ),
                },
                {
                  key: "voice",
                  label: "음성 설정",
                  content: (
                    <div className="flex flex-col gap-2 px-3.5 py-2">
                      <VoiceProviderFields
                        compact
                        provider={s.provider}
                        onProviderChange={(p) => setSlotProvider(s.id, p)}
                        pollyVoice={s.pollySettings.voice}
                        pollyEngine={s.pollySettings.engine}
                        onPollyVoiceChange={(v) => updatePollySetting(s.id, "voice", v)}
                        onPollyEngineChange={(v) => updatePollySetting(s.id, "engine", v)}
                        pollyAdvanced={
                          format === "podcast"
                            ? {
                                rate: s.pollySettings.rate,
                                volume: s.pollySettings.volume,
                                onRateChange: (v) => updatePollySetting(s.id, "rate", v),
                                onVolumeChange: (v) => updatePollySetting(s.id, "volume", v),
                              }
                            : undefined
                        }
                        elevenVoiceId={s.voiceId}
                        elevenModelId={s.modelId}
                        onElevenVoiceChange={(v) => updateSlot(s.id, { voiceId: v })}
                        onElevenModelChange={(v) => updateSlot(s.id, { modelId: v })}
                        elevenVoices={elevenVoices}
                        elevenModels={elevenModels}
                        elevenVoiceSettings={s.voiceSettings}
                        onElevenVoiceSettingChange={(k, v) => updateVoiceSetting(s.id, k, v)}
                        elevenRanges={voiceSettingsRanges}
                      />
                      <textarea
                        value={s.text}
                        onChange={(e) => updateSlot(s.id, { text: e.target.value })}
                        placeholder={placeholder ?? "왼쪽 대본을 복사해 붙여넣으세요"}
                        rows={4}
                        className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() => handleGenerate(s.id)}
                        disabled={!s.text.trim() || !wsOpen || s.status === "pending"}
                        className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                      >
                        {s.status === "pending" ? "생성 중..." : "생성"}
                      </button>
                      {s.summary && (s.status === "done" || s.status === "pending") && (
                        <p className="text-[10.5px] font-medium text-[var(--text-faint)]">{s.summary}</p>
                      )}
                      {s.status === "done" && s.audioUrl && (
                        <audio controls preload="none" src={s.audioUrl} className="h-9 w-full" />
                      )}
                      {s.status === "error" && s.error && <p className="text-[11px] text-[var(--danger)]">{s.error}</p>}
                    </div>
                  ),
                },
              ]}
            />
          </CollapsibleSection>
          </div>
          );
        })}
      </div>
      {reviewingSlot && (
        <ApplyReviewModal
          category={category}
          name={name}
          // 이 컴포넌트는 이 앱에서 format="podcast"로만 쓰인다(PromptTextLab.tsx
          // 참고) — CmsChannel에 "podcast"가 없어(LatestPublishedContentLink.tsx
          // 주석 참고) 가장 가까운 실제 발행물인 home_player/listen으로 대체.
          channel="home_player"
          urlPath="listen"
          onCancel={() => setReviewSlotId(null)}
          onConfirm={async () => {
            await handleApplyTestToProduction(reviewingSlot);
            setReviewSlotId(null);
          }}
          settingsSummary={
            <div className="ui-card space-y-1.5 rounded-lg p-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">프롬프트 버전</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {activeInfos[reviewingSlot.id]
                    ? `v${activeInfos[reviewingSlot.id]!.version}${
                        activeInfos[reviewingSlot.id]!.label ? ` · ${activeInfos[reviewingSlot.id]!.label}` : ""
                      }`
                    : "미확인"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">음성 설정</span>
                <span className="font-semibold text-[var(--text-primary)]">{summarize(reviewingSlot)}</span>
              </div>
            </div>
          }
          resultPreview={
            reviewingSlot.status === "done" && reviewingSlot.audioUrl ? (
              <audio controls preload="none" src={reviewingSlot.audioUrl} className="h-9 w-full" />
            ) : (
              <p className="text-[11px] text-[var(--text-faint)]">
                아직 생성된 미리듣기가 없습니다 — 결과 없이 적용하면 프롬프트 버전·음성 설정만 반영됩니다.
              </p>
            )
          }
        />
      )}
    </>
  );
}

/* 2026-09-27 — 사용자 요청: "프로덕션 카드에도, 테스트 카드와 동일하게,
   산출물 생성 가능하도록.. 4개 유형 전부요" → 이어서 지적: "프로덕션
   결과물이라는 거를 만드는게 아니고요... 이미지 설정 단계로 가면 이미지
   생성 하도록 되잖아? ... 프로덕션 결과물 섹션을 만들라는게 아닙니다" —
   WebtoonProductionCutGrid(WebtoonCutGenerator.tsx)와 동일 원칙: 별도
   섹션이 아니라 프로덕션 카드 자신의 "음성 설정" 탭(PromptTextLab.tsx의
   StepTabs) 안에 이 패널을 직접 심는다. 테스트 카드(위 VoicePreviewGenerator)
   와 모양은 같지만(제공자/성우 선택+텍스트+생성+결과) 카드가 언제나 단
   하나뿐이라 배열 대신 단일 슬롯 state를 쓰는 별도 컴포넌트로 둔다.

   대화 간 영속은 하지 않는다 — audioPreview 저장 메시지가 role/id를
   안 갖고 있어(웹툰의 imagePreview와 달리 test_id/slot_id를 그대로
   복원용으로 못 씀) "이게 production 카드 거였다"를 나중에 구분할 방법이
   없다. production 생성은 "지금 비교해보는" 일회성 시도라 대화 간
   영속까지는 필요 없다고 판단 — 대화를 새로 열면 빈 채로 다시 시작한다
   (부모가 key={threadId}로 이 컴포넌트를 마운트하면 자동으로 이렇게
   된다). */
export function VoiceProductionPanel({
  format,
  placeholder,
  wsOpen,
  send,
  subscribe,
}: {
  format: "podcast" | "video";
  placeholder?: string;
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
}) {
  const [elevenVoices, setElevenVoices] = useState<{ id: string; label: string; gender: string; sample_url: string }[]>([]);
  const [elevenModels, setElevenModels] = useState<{ id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[]>([]);
  const [voiceSettingsDefaults, setVoiceSettingsDefaults] = useState<ElevenLabsVoiceSettings>(ELEVENLABS_FALLBACK_VOICE_SETTINGS);
  const [voiceSettingsRanges, setVoiceSettingsRanges] = useState(ELEVENLABS_FALLBACK_RANGES);
  const [elevenOptionsLoaded, setElevenOptionsLoaded] = useState(false);
  const [slot, setSlot] = useState<SlotState>(() =>
    newSlot({ provider: "polly", voiceId: "", modelId: "", voiceSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS, pollySettings: POLLY_DEFAULTS })
  );

  const ensureElevenOptions = () => {
    if (elevenOptionsLoaded) return;
    setElevenOptionsLoaded(true);
    adminApi
      .getElevenLabsOptions()
      .then((r) => {
        setElevenVoices(r.voices);
        setElevenModels(r.models);
        setVoiceSettingsDefaults(r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS);
        setVoiceSettingsRanges(r.voice_settings_ranges ?? ELEVENLABS_FALLBACK_RANGES);
        setSlot((prev) =>
          prev.provider === "elevenlabs" && !prev.voiceId
            ? { ...prev, voiceId: r.voices[0]?.id ?? "", modelId: r.models[0]?.id ?? "", voiceSettings: r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS }
            : prev
        );
      })
      .catch((err) => console.error("ElevenLabs 옵션 조회 실패", err));
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "audio_ready") {
        const m = msg as unknown as { slot_id: string; audio_url: string };
        if (m.slot_id !== "production") return;
        setSlot((prev) => ({ ...prev, status: "done", audioUrl: m.audio_url, error: null }));
      } else if (msg.type === "audio_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        if (m.slot_id !== "production") return;
        setSlot((prev) => ({ ...prev, status: "error", error: m.message }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSlot은 함수형 갱신, subscribe 자체는 마운트 시 한 번만
  }, []);

  const setProvider = (provider: Provider) => {
    if (provider === "elevenlabs") ensureElevenOptions();
    setSlot((prev) => ({
      ...prev,
      provider,
      voiceId: provider === "elevenlabs" ? elevenVoices[0]?.id ?? "" : "",
      modelId: provider === "elevenlabs" ? elevenModels[0]?.id ?? "" : "",
      voiceSettings: voiceSettingsDefaults,
      pollySettings: POLLY_DEFAULTS,
    }));
  };
  const updateVoiceSetting = <K extends keyof ElevenLabsVoiceSettings>(key: K, value: ElevenLabsVoiceSettings[K]) =>
    setSlot((prev) => ({ ...prev, voiceSettings: { ...prev.voiceSettings, [key]: value } }));
  const updatePollySetting = <K extends keyof PollySettings>(key: K, value: PollySettings[K]) =>
    setSlot((prev) => {
      const next = { ...prev.pollySettings, [key]: value };
      if (key === "voice") next.engine = POLLY_VOICE_ENGINE_OPTIONS[next.voice][0].id;
      return { ...prev, pollySettings: next };
    });

  const summarize = (s: SlotState): string => {
    if (s.provider === "polly") {
      const voiceLabel = POLLY_VOICES.find((v) => v.id === s.pollySettings.voice)?.label ?? s.pollySettings.voice;
      const engineLabel =
        POLLY_VOICE_ENGINE_OPTIONS[s.pollySettings.voice]?.find((e) => e.id === s.pollySettings.engine)?.label ??
        s.pollySettings.engine;
      const base = `Polly · ${voiceLabel} · ${engineLabel}`;
      return format === "podcast" ? `${base} · ${s.pollySettings.rate} · ${s.pollySettings.volume}` : base;
    }
    const voiceLabel = elevenVoices.find((v) => v.id === s.voiceId)?.label ?? s.voiceId;
    const modelLabel = elevenModels.find((m) => m.id === s.modelId)?.label ?? s.modelId;
    return `ElevenLabs · ${voiceLabel} · ${modelLabel}`;
  };

  const handleGenerate = () => {
    if (!slot.text.trim() || !wsOpen || slot.status === "pending") return;
    const result = send(
      "synthesize_audio",
      slot.provider === "elevenlabs"
        ? { text: slot.text, slot_id: "production", provider: slot.provider, voice_id: slot.voiceId, model_id: slot.modelId, voice_settings: slot.voiceSettings, format }
        : { text: slot.text, slot_id: "production", provider: slot.provider, polly_settings: slot.pollySettings, format }
    );
    if (!result.sent) {
      const error = result.tooLarge
        ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      setSlot((prev) => ({ ...prev, status: "error", error }));
      return;
    }
    setSlot((prev) => ({ ...prev, status: "pending", error: null, summary: summarize(prev) }));
  };

  return (
    <div className="flex flex-col gap-2 px-3.5 py-2">
      <VoiceProviderFields
        compact
        provider={slot.provider}
        onProviderChange={setProvider}
        pollyVoice={slot.pollySettings.voice}
        pollyEngine={slot.pollySettings.engine}
        onPollyVoiceChange={(v) => updatePollySetting("voice", v)}
        onPollyEngineChange={(v) => updatePollySetting("engine", v)}
        pollyAdvanced={
          format === "podcast"
            ? {
                rate: slot.pollySettings.rate,
                volume: slot.pollySettings.volume,
                onRateChange: (v) => updatePollySetting("rate", v),
                onVolumeChange: (v) => updatePollySetting("volume", v),
              }
            : undefined
        }
        elevenVoiceId={slot.voiceId}
        elevenModelId={slot.modelId}
        onElevenVoiceChange={(v) => setSlot((prev) => ({ ...prev, voiceId: v }))}
        onElevenModelChange={(v) => setSlot((prev) => ({ ...prev, modelId: v }))}
        elevenVoices={elevenVoices}
        elevenModels={elevenModels}
        elevenVoiceSettings={slot.voiceSettings}
        onElevenVoiceSettingChange={updateVoiceSetting}
        elevenRanges={voiceSettingsRanges}
      />
      <textarea
        value={slot.text}
        onChange={(e) => setSlot((prev) => ({ ...prev, text: e.target.value }))}
        placeholder={placeholder ?? "왼쪽 대본을 복사해 붙여넣으세요"}
        rows={4}
        className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!slot.text.trim() || !wsOpen || slot.status === "pending"}
        className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
      >
        {slot.status === "pending" ? "생성 중..." : "생성"}
      </button>
      {slot.summary && (slot.status === "done" || slot.status === "pending") && (
        <p className="text-[10.5px] font-medium text-[var(--text-faint)]">{slot.summary}</p>
      )}
      {slot.status === "done" && slot.audioUrl && (
        <audio controls preload="none" src={slot.audioUrl} className="h-9 w-full" />
      )}
      {slot.status === "error" && slot.error && <p className="text-[11px] text-[var(--danger)]">{slot.error}</p>}
    </div>
  );
}
