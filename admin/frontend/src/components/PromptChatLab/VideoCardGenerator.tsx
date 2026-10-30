"use client";

import { useEffect, useRef, useState } from "react";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import type { ChatThreadMessage, PromptHistoryEntry } from "@/lib/types";
import { adminApi } from "@/lib/adminClient";
import { CustomSelect } from "@/components/CustomSelect";
import { CollapsibleSection } from "./CollapsibleSection";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";
import { ApplyReviewModal } from "./ApplyReviewModal";
import { StepTabs } from "./StepTabs";
import { VoiceProviderFields } from "./VoiceProviderFields";
import { VideoDownloadButton } from "./VideoDownloadButton";
import {
  ELEVENLABS_FALLBACK_VOICE_SETTINGS,
  ELEVENLABS_FALLBACK_RANGES,
  type ElevenLabsVoiceSettings,
} from "./ElevenLabsVoiceSettingsFields";
import { LENS_POLLY_PROFILE, type PollyVoiceProfile } from "./PollyVoiceSettingsFields";
import { FORMATS, type ParsedDoc as VideoParsedDoc } from "./VideoRenderSettingsPanel";
import { GOOGLE_DEFAULT_VOICE, GOOGLE_VOICES, VIDEO_PROVIDERS } from "./googleVoices";
import { PRISM_GROUPS, PRISM_GROUP_VOICES } from "@/lib/prismBatch";

import { cardsStorageKey, loadStoredCards, extractNarration, Provider, PollySettings, POLLY_DEFAULTS, RenderProgress, progressLabel, progressPercent, POLL_INTERVAL_MS, CardState, newCard, restoredCard, cardToParsedDoc } from "./videoCardModel";
/* 영상 탭 중간 칼럼 "성우 미리듣기" + "영상 생성" 통합 카드 — 2026-09-24
   신설. 원래 VoicePreviewGenerator(format="video")와 VideoRenderGenerator가
   위/아래로 따로 떨어진 두 개의 독립 목록(각자 "+추가"로 따로 늘어남)
   이었는데, 사용자 지적: "음성이랑 영상 생성이 따로 떨어져있는데... 붙어
   있어야 하지 않을까요?? 카드처럼... 서로 합쳐지고... 음성쪽처럼...
   카드를 추가 하면서 만드는 방향이거든요" — 한 카드 안에 성우 미리듣기
   서브섹션과 영상 생성 서브섹션을 같이 두고, "+추가" 하나가 카드 하나
   (두 서브섹션 다)를 만든다. 삭제도 카드 단위로 같이 지워진다.

   입력창 통합(2026-09-24, 같은 날 후속) — 사용자가 실제로 기사 → 각본 →
   렌더용 JSON을 만들어보다 지적: "출력해준 걸 하나의 입력창에 붙여넣고
   생성하면 둘 다 생성되면 안되나?? ... 아웃풋 쪽은 음성·영상 따로 되는거
   먼저 출력되어서 보여지면 좋겠다." 렌더용 JSON(`cuts[].narration`)이
   이미 내레이션 전문을 담고 있으니, 입력창을 하나로 합치고
   extractNarration()이 JSON을 파싱해 각 컷의 narration을 이어붙여 성우
   미리듣기용 텍스트로 쓴다(JSON이 아니면 원문 그대로를 내레이션으로
   써서, 순수 텍스트만 붙여넣어 음성만 빠르게 테스트하는 것도 여전히
   된다). "생성" 버튼 하나가 두 WS 요청(synthesize_audio·render_video)을
   한 번에 보내고, 결과는 원래 그대로 각자 도착하는 대로 표시된다(음성이
   몇 초 안에 먼저 뜨고, 영상은 5~8분 뒤 나중에 뜨는 게 자연스러운 순서 —
   따로 맞출 필요 없이 원래도 이랬다).

   두 서브섹션은 여전히 서로 다른 WS 요청/응답 쌍을 쓴다(합쳐진 건
   입력·트리거뿐, 완료 경로는 원래 두 컴포넌트 그대로) — 성우 미리듣기는
   "synthesize_audio"(admin/backend/routes/chat_ws.py, 몇 초 내 완료),
   영상 생성은 "render_video"(ECS RunTask로 job_id만 받고 HTTP 폴링,
   routes/video_lab.py) — VoicePreviewGenerator.tsx/VideoRenderGenerator.tsx
   (구 파일, 이 컴포넌트로 대체되며 삭제됨) 각각의 docstring에 있던 설계
   근거를 그대로 가져왔다.

   2026-09-25 — "실제 프로덕션 영상 렌더는 이 카드의 성우 설정과
   무관하다"는 처음 설계와 달리, 같은 날 사용자 리포트("일레븐 랩스를
   선택하고 영상을 생성했는데... 영상에 담긴거는 polly 음성이 선택이
   되어서 나왔네요") 이후로는 카드에서 고른 provider/voice/engine/rate/
   volume/format이 실제 테스트 렌더에도 override로 실린다(chat_ws.py::
   _run_render_video_flow → video_settings.get_render_settings(override)).
   발행("영상 설정 발행")된 값 자체는 안 바뀐다 — 이 카드는 어디까지나
   "이번 한 번 테스트"용 override.

   Polly 성우/엔진 표는 PodcastVoiceSettingsPanel.tsx/VideoRenderSettingsPanel.tsx
   와 같은 근거로 하드코딩 중복(프론트가 백엔드 pipelines/common/
   video_settings.py::_VOICE_ENGINE_OPTIONS를 직접 import 못 함) — 값 바뀌면
   세 파일 다 고칠 것. 속도·음량(2026-09-25 추가) — tts.ts가 SSML
   <prosody> 지원을 갖추면서 실제로 반영되기 시작해 팟캐스트와 동일하게
   카드별로 조정 가능하다. 포맷(가로/세로, 2026-09-25 추가, 사용자 지적:
   "동영상 부분도.. 영상 탭에.. 추가되어야하는거 아닌가요? 음성 설정만
   있어서.. 지금 중간 섹션엔")도 FORMATS(VideoRenderSettingsPanel.tsx에서
   export)를 그대로 재사용한다.

   localStorage 복원(2026-09-24, 같은 날 후속) — 탭 전환·랩 닫기·페이지
   이동은 PromptLabProvider.tsx(신설)가 이 컴포넌트를 언마운트하지 않는
   방식으로 해결했지만, 완전 새로고침·브라우저 재시작은 그걸로도 못
   버틴다(리액트 상태는 그냥 메모리라 사라짐). 영상 렌더(ECS RunTask)는
   가장 느리고(5~8분) 잃으면 아까운 작업이라 여기만 별도로 보강한다 —
   `cards`를 바뀔 때마다 localStorage에 저장하고, 마운트 시 복원한 뒤
   `renderStatus`가 "rendering"이고 jobId가 있는 카드는 폴링을 재개한다
   (백엔드는 무변경 — GET /admin/video-lab/{job_id}가 이미 job_id만
   있으면 상태를 그대로 돌려준다). "pending"/"starting"처럼 job_id가
   아직 없어 다시 이어붙일 수 없는 상태는 복원 시 에러로 표시해 사용자가
   다시 누르게 한다 — 조용히 사라지는 것보다 명확하다.

   대화별 저장(2026-09-24, 같은 날 후속) — 사용자 지적: "대화 하고
   나갔다 오면... 영상... 사라지는데... 나머지들도 다 남으면 좋지."
   localStorage 키를 스레드별로 나눴다(전역 키 하나였던 걸 그대로 두면
   서로 다른 대화의 카드가 한 목록에 섞인다). 대화 전환 시 그 대화
   전용 localStorage를 먼저 찾고(진행 중 상태까지 포함해 가장 정확),
   없으면 서버에 저장된 완료된 결과(restoredCards, useChatLabThread.ts::
   persistArtifact가 렌더 종료 시점에 저장)로 채운다 — 이 둘이 최종
   소스: localStorage=같은 브라우저의 최신 상태(진행 중 포함), 서버=
   어디서든 이 대화를 다시 열면 보이는 완료된 결과. */

export function VideoCardGenerator({
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
  pollyProfile = LENS_POLLY_PROFILE,
  audioFormat = "video",
  sceneHistory = [],
  sceneServerVersion = null,
}: {
  /** 2026-09-27 — "테스트 추가" 띠 sticky 고정용, WebtoonCutGenerator.tsx
   *  주석 참고(프로덕션 카드 실측 높이). */
  stickyTop?: number;
  /** 2026-09-24 — 지금 열려있는 대화 스레드 id. 바뀌면 이 대화 전용
   *  localStorage(또는 없으면 서버에 저장된 완료 결과)로 카드 목록을
   *  다시 구성한다. 안 주면(기본 null) 항상 "draft" 스코프 하나만 쓴다
   *  (기존 동작과 동일). */
  threadId?: number | null;
  /** 이 대화에 서버로 저장된 완료 카드들(useChatLabThread.ts::
   *  persistArtifact) — 부모(PromptTextLab)가 openThread에서 모아 내려준다.
   *  localStorage에 이 대화 기록이 이미 있으면 그쪽을 우선(진행 중 상태
   *  포함이라 더 정확) 쓰고, 없을 때만 이걸로 폴백한다. */
  restoredCards?: NonNullable<ChatThreadMessage["videoPreview"]>[];
  /** 영상 렌더가 끝나면(done/error) 이 대화에 조용히 저장한다(채팅
   *  말풍선은 안 건드림). 안 주면 저장을 건너뛴다. 2번째 인자로 카드의
   *  ownerThreadId를 명시적으로 넘긴다 — 생성 도중 사용자가 다른
   *  대화로 넘어가도 원래 대화에 정확히 저장되게. */
  persistArtifact?: (payload: Record<string, unknown>, targetThreadId?: number | null) => void;
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
   *  테스트 카드에서 적용할 수 있게": "테스트 N" 카드의 통합 "프로덕션에
   *  적용" 버튼이 부른다 — 성우/엔진/속도/음량/포맷을 그 자리에서 바로
   *  발행까지 한다(VideoRenderSettingsPanel.tsx::applyAndPublish). */
  onApplyToProduction?: (data: VideoParsedDoc) => Promise<void>;
  /** 2026-09-26(후속), 사용자 지적(WebtoonCutGenerator.tsx/VoicePreviewGenerator.tsx
   *  와 동일) — "테스트 카드도 마찬가지": 지금 실제 발행된 음성·영상
   *  설정 — 카드의 프롬프트 버전과 설정이 둘 다 이미 이 값과 같으면
   *  "프로덕션에 적용"이 no-op이라 비활성화한다. */
  productionDefaults: VideoParsedDoc | null;
  /** 2026-09-26, 최종 형태 — VoicePreviewGenerator.tsx와 동일 원칙(카드마다
   *  독립된 프롬프트 편집 초안, PromptVersionReference.tsx 참고). */
  serverVersion: number | null;
  promptHistory: PromptHistoryEntry[];
  testVersion: number | null;
  onTestVersionChange: (version: number | null) => void;
  onServerVersionChange: (version: number) => void;
  onPromptHistoryRefresh: () => void;
  category: string;
  name: string;
  /** 2026-10-21 — 카드에서 고를 Polly 성우 목록. 영상 탭은 LENS(기본), PRISM 탭은 PRISM_POLLY_PROFILE(영어). */
  pollyProfile?: PollyVoiceProfile;
  /** 성우 미리듣기(synthesize_audio)의 format — "prism"이면 서버가 PRISM 성우 목록·설정으로 합성한다. */
  audioFormat?: "video" | "prism";
  /** PRISM 시험 카드(2026-10-30) — 장면 변환 프롬프트("prism-scene") 버전 목록·운영 중 버전. 카드마다 시험할 버전을 고른다. */
  sceneHistory?: PromptHistoryEntry[];
  sceneServerVersion?: number | null;
}) {
  // PRISM 시험 카드(2026-10-30) — 사용자 지적: "테스트 탭에 잘 쓰지도 않는 대본 작성 프롬프트 수정 칸이 있고",
  // "프로덕션 탭이랑 테스트 탭이 뭐가 뭔지 헷갈린다". PRISM은 카드에 이미 쓴 대본을 넣으므로 대본 작성 프롬프트 칸을
  // 빼고, 실제로 쓰이는 장면 변환 프롬프트 버전을 고르게 한다. 운영 반영 버튼은 두지 않는다(실제 제작 설정 카드의
  // [운영에 적용] 하나). 성우는 실제 제작에선 그룹별 고정이라 여기서는 들어 보는 용도다.
  const isPrismCards = audioFormat === "prism";
  // 새 카드의 Polly 기본값 — 탭의 기본 성우와 그 성우의 첫(권장) 엔진.
  const pollyDefaults: PollySettings = {
    ...POLLY_DEFAULTS,
    voice: pollyProfile.defaultVoice,
    engine: pollyProfile.engines[pollyProfile.defaultVoice][0].id,
  };
  const [elevenVoices, setElevenVoices] = useState<{ id: string; label: string; gender: string; sample_url: string }[]>([]);
  const [elevenModels, setElevenModels] = useState<{ id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[]>([]);
  const [voiceSettingsDefaults, setVoiceSettingsDefaults] = useState<ElevenLabsVoiceSettings>(ELEVENLABS_FALLBACK_VOICE_SETTINGS);
  const [voiceSettingsRanges, setVoiceSettingsRanges] = useState(ELEVENLABS_FALLBACK_RANGES);
  const [elevenOptionsLoaded, setElevenOptionsLoaded] = useState(false);
  const [cards, setCards] = useState<CardState[]>(
    () =>
      loadStoredCards(threadId) ?? [
        newCard({ provider: "polly", voiceId: "", modelId: "", voiceSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS, pollySettings: pollyDefaults, format: FORMATS[0].id }),
      ]
  );
  // 2026-09-26, 사용자 지적(WebtoonCutGenerator.tsx/VoicePreviewGenerator.tsx와
  // 동일 요청) — "테스트 카드에 해당 테스트에서 어떤 버전을 활성화 했는지...
  // 정보가 부족": 각 카드의 PromptVersionReference가 로드해 둔 버전을 모아
  // "테스트 N" 헤더에 펼치지 않고도 보이게 한다.
  const [activeInfos, setActiveInfos] = useState<Record<string, { version: number; label: string | null } | null>>({});
  // 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
  // 이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고... 테스트
  // 카드에서 적용할 수 있게": 카드마다 PromptVersionReference의 활성화
  // 능력(activateIfNeeded)을 ref로 붙잡아뒀다가, 카드 레벨의 "프로덕션에
  // 적용" 버튼이 프롬프트 버전+음성/영상 설정을 한 번에 적용한다.
  const promptRefs = useRef<Record<string, PromptVersionReferenceHandle | null>>({});
  // 2026-09-26 — window.confirm 대신 검토 모달(ApplyReviewModal.tsx 참고).
  const [reviewCardId, setReviewCardId] = useState<string | null>(null);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  // WS subscribe(아래, 마운트 시 1회 등록)는 클로저가 마운트 시점
  // threadId를 그대로 들고 있어 나중에 바뀐 값을 못 본다 — ref로
  // 최신값을 같이 들고 있는다(2026-09-24 후속, ownerThreadId 참고).
  const threadIdRef = useRef(threadId);
  useEffect(() => {
    threadIdRef.current = threadId;
  });

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // 2026-09-24 후속 — 진행 중이던 다른 대화의 카드가(아래 리셋 블록이
      // 대화 전환에도 안 지우고 들고 있음) cards에 섞여 있을 수 있다.
      // 그걸 그대로 저장하면 지금 threadId의 localStorage에 다른
      // 대화 카드가 새 버전 취급으로 섞여 들어간다 — 이 대화 소유
      // (ownerThreadId===threadId, 또는 아직 한 번도 생성 안 한 기본
      // 카드=null)만 걸러서 저장한다.
      const own = cards.filter((c) => c.ownerThreadId === threadId || c.ownerThreadId === null);
      window.localStorage.setItem(cardsStorageKey(threadId), JSON.stringify(own));
    } catch {
      // 저장 실패(용량 초과 등)는 무시 — 새로고침 복원이 안 될 뿐, 지금 세션 동작엔 영향 없음
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadId는 일부러 deps에서 뺐다: threadId만 바뀌고 cards가 아직 안 바뀐 렌더에서 이 effect가 같이 돌면, 대화 전환 직후 아직 안 바뀐(이전 대화) cards를 새 threadId 키에 잠깐 덮어쓰는 경합이 생긴다 — cards 변경에만 반응하면 reset effect가 setCards를 끝낸 다음 렌더에서만 저장되므로 항상 그 시점의 threadId와 짝이 맞는다.
  }, [cards]);

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
        setCards((prev) =>
          prev.map((c) =>
            c.provider === "elevenlabs" && !c.voiceId
              ? { ...c, voiceId: r.voices[0]?.id ?? "", modelId: r.models[0]?.id ?? "", voiceSettings: r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS }
              : c
          )
        );
      })
      .catch((err) => console.error("ElevenLabs 옵션 조회 실패", err));
  };

  const stopPolling = (cardId: string) => {
    const timer = pollTimers.current[cardId];
    if (timer) {
      clearInterval(timer);
      delete pollTimers.current[cardId];
    }
  };

  /** 카드가 최종 상태(done/error)에 닿으면 이 대화에 조용히 저장한다
   *  (채팅 말풍선은 안 건드림) — 2026-09-24, 위 모듈 docstring "대화별
   *  저장" 참고. c는 저장 시점의 최신 카드 상태(호출부가 조합해 넘김).
   *  c.ownerThreadId로 저장 — "생성" 클릭 시점에 속했던 대화에 정확히
   *  저장되게(같은 날 후속, 아래 "작업 큐" 관련 주석 참고). 저장 후,
   *  지금 보고 있는 대화가 그 소유 대화가 아니면 화면에서도 치운다
   *  (이미 정확한 대화에 저장됐으니, 다시 그 대화를 열면 복원됨). */
  const persistVideoCard = (c: CardState) => {
    persistArtifact?.(
      {
        videoPreview: {
          input: c.input,
          provider: c.provider,
          voiceId: c.provider === "elevenlabs" ? c.voiceId : undefined,
          modelId: c.provider === "elevenlabs" ? c.modelId : undefined,
          voiceSettings: c.provider === "elevenlabs" ? c.voiceSettings : undefined,
          pollySettings: c.provider === "polly" ? c.pollySettings : undefined,
          format: c.format,
          voiceSummary: c.voiceSummary,
          audioUrl: c.audioUrl,
          jobId: c.jobId,
          videoUrl: c.videoUrl,
          thumbUrl: c.thumbUrl,
          renderStatus: c.renderStatus === "error" ? "error" : "done",
          renderError: c.renderError,
        },
      },
      c.ownerThreadId
    );
  };

  /** settle된(done/error) 카드를 반영한다 — 지금 보고 있는 대화가 그
   *  카드의 ownerThreadId와 같으면 그대로 갱신, 다르면(생성 도중 다른
   *  대화로 넘어감) 목록에서 치운다(이미 위에서 그 대화에 저장됨). */
  const reconcileAfterSettle = (prev: CardState[], id: string, next: CardState): CardState[] =>
    next.ownerThreadId === threadIdRef.current
      ? prev.map((c) => (c.id === id ? next : c))
      : prev.filter((c) => c.id !== id);

  const startPolling = (cardId: string, jobId: string) => {
    stopPolling(cardId);
    pollTimers.current[cardId] = setInterval(async () => {
      try {
        const r = await adminApi.pollVideoLab(jobId);
        if (r.status === "done") {
          stopPolling(cardId);
          setCards((prev) => {
            const target = prev.find((c) => c.id === cardId);
            if (!target) return prev;
            const next: CardState = { ...target, renderStatus: "done", videoUrl: r.video_url ?? null, thumbUrl: r.thumb_url ?? null, renderError: null };
            persistVideoCard(next);
            return reconcileAfterSettle(prev, cardId, next);
          });
        } else if (r.status === "error") {
          stopPolling(cardId);
          setCards((prev) => {
            const target = prev.find((c) => c.id === cardId);
            if (!target) return prev;
            const next: CardState = { ...target, renderStatus: "error", renderError: r.message ?? "렌더 실패" };
            persistVideoCard(next);
            return reconcileAfterSettle(prev, cardId, next);
          });
        } else if (r.progress) {
          setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, progress: r.progress as RenderProgress } : c)));
        }
      } catch (err) {
        console.error("영상 렌더 상태 확인 실패", err);
      }
    }, POLL_INTERVAL_MS);
  };

  // 2026-09-24 — 대화가 바뀌면(threadId 변경) 이 대화 전용 localStorage를
  // 먼저 찾고, 없으면 서버에 저장된 완료 결과(restoredCards)로 채운다.
  // useEffect+setState 대신 렌더 중 비교(WebtoonCutGenerator.tsx/
  // VoicePreviewGenerator.tsx와 같은 패턴, 근본 수정 원칙 — admin/frontend/
  // CLAUDE.md) — 순수 상태 동기화라 렌더 중에 해도 안전하다.
  //
  // 2026-09-24, 같은 날 후속 — 사용자 지적: "음성 생성중에... 새
  // 대화창을 열고... 다시 돌아오면... 작업이 중단되어있는데... 다른
  // 탭으로 이동하더라도 작업 큐가 돌고 있어야 하는 것 아닌가요?" 처음엔
  // 이 블록이 목록을 통째로 교체해서, 성우 미리듣기가 진행 중
  // (voiceStatus==="pending")이거나 영상이 렌더 중(starting/rendering)
  // 이던 카드까지 화면에서 사라졌다 — 그 상태로 결과(WS push/폴링)가
  // 와도 받아줄 카드가 없어 조용히 버려지거나(폴링은 아예 멈춰버림),
  // 도착해도 반영이 안 됐다. 지금 진행 중인 카드는 어느 대화 걸로
  // 바뀌든 그대로 두고, 그 자리에 새 대화의 저장된 카드를 이어붙인다.
  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    setCards((prev) => {
      const stillActive = prev.filter(
        (c) => c.voiceStatus === "pending" || c.renderStatus === "starting" || c.renderStatus === "rendering"
      );
      const local = loadStoredCards(threadId);
      const restored = local ?? (restoredCards && restoredCards.length > 0 ? restoredCards.map(restoredCard) : []);
      if (stillActive.length > 0) return [...stillActive, ...restored];
      return restored.length > 0
        ? restored
        : [newCard({ provider: "polly", voiceId: "", modelId: "", voiceSettings: voiceSettingsDefaults, pollySettings: pollyDefaults, format: FORMATS[0].id })];
    });
  }

  // 위 블록이 진행 중인 카드는 그대로 두고 대화 전환마다 cards를 이미
  // 맞춰놨다 — 여기서는 폴링(타이머, 진짜 부수효과)만 관리한다. 이미
  // 돌고 있는 타이머는 그대로 두고(진행 중인 렌더를 끊을 이유가 없다),
  // 새로 복원된 카드 중 아직 타이머가 없는 "rendering" 카드만 새로
  // 시작한다. 마운트 시(threadId 초기값)도 이 effect가 돈다.
  useEffect(() => {
    for (const c of cards) {
      if (c.renderStatus === "rendering" && c.jobId && !pollTimers.current[c.id]) {
        startPolling(c.id, c.jobId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadId 바뀔 때만 새로 복원된 카드의 폴링을 재개한다 — cards는 위 render-time 블록이 threadId와 같은 타이밍에 이미 맞춰놨고, progress 갱신 등 사소한 cards 변경마다 다시 돌 필요는 없다
  }, [threadId]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "audio_ready") {
        const m = msg as unknown as { slot_id: string; audio_url: string };
        setCards((prev) => prev.map((c) => (c.id === m.slot_id ? { ...c, voiceStatus: "done", audioUrl: m.audio_url, voiceError: null } : c)));
      } else if (msg.type === "audio_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        setCards((prev) => prev.map((c) => (c.id === m.slot_id ? { ...c, voiceStatus: "error", voiceError: m.message } : c)));
      } else if (msg.type === "render_stage") {
        // PRISM 대본 → 장면 변환 중(chat_ws.py::_prism_script_to_render_json). 끝나면 render_started가 온다.
        const m = msg as unknown as { slot_id: string; stage: "scene" };
        setCards((prev) => prev.map((c) => (c.id === m.slot_id ? { ...c, progress: { stage: m.stage } } : c)));
      } else if (msg.type === "render_started") {
        const m = msg as unknown as { slot_id: string; job_id: string };
        setCards((prev) => prev.map((c) => (c.id === m.slot_id ? { ...c, renderStatus: "rendering", jobId: m.job_id } : c)));
        startPolling(m.slot_id, m.job_id);
      } else if (msg.type === "render_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        setCards((prev) => {
          const target = prev.find((c) => c.id === m.slot_id);
          if (!target) return prev;
          const next: CardState = { ...target, renderStatus: "error", renderError: m.message };
          persistVideoCard(next);
          return reconcileAfterSettle(prev, m.slot_id, next);
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setCards/startPolling/persistVideoCard/reconcileAfterSettle 전부 ref·함수형 갱신·threadIdRef 기반이라 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const updateCard = (id: string, patch: Partial<CardState>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  // voiceId는 ElevenLabs 성우 id 또는 Google 성우 이름(2026-10-22, provider로 구분)이다.
  const setCardProvider = (id: string, provider: Provider) => {
    if (provider === "elevenlabs") ensureElevenOptions();
    updateCard(id, {
      provider,
      voiceId: provider === "elevenlabs" ? elevenVoices[0]?.id ?? "" : provider === "google" ? GOOGLE_DEFAULT_VOICE : "",
      modelId: provider === "elevenlabs" ? elevenModels[0]?.id ?? "" : "",
      voiceSettings: voiceSettingsDefaults,
      pollySettings: pollyDefaults,
    });
  };

  const updateVoiceSetting = <K extends keyof ElevenLabsVoiceSettings>(id: string, key: K, value: ElevenLabsVoiceSettings[K]) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, voiceSettings: { ...c.voiceSettings, [key]: value } } : c)));
  };

  const updatePollySetting = <K extends keyof PollySettings>(id: string, key: K, value: PollySettings[K]) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c.pollySettings, [key]: value };
        if (key === "voice") next.engine = (pollyProfile.engines[next.voice] ?? pollyProfile.engines[pollyProfile.defaultVoice])[0].id;
        return { ...c, pollySettings: next };
      })
    );
  };

  const summarizeVoice = (c: CardState): string => {
    if (c.provider === "polly") {
      const voiceLabel = pollyProfile.voices.find((v) => v.id === c.pollySettings.voice)?.label ?? c.pollySettings.voice;
      const engineLabel =
        pollyProfile.engines[c.pollySettings.voice]?.find((e) => e.id === c.pollySettings.engine)?.label ?? c.pollySettings.engine;
      return `Polly · ${voiceLabel} · ${engineLabel}`;
    }
    if (c.provider === "google") {
      return `Google · ${GOOGLE_VOICES.find((v) => v.id === c.voiceId)?.label ?? c.voiceId}`;
    }
    const voiceLabel = elevenVoices.find((v) => v.id === c.voiceId)?.label ?? c.voiceId;
    const modelLabel = elevenModels.find((m) => m.id === c.modelId)?.label ?? c.modelId;
    return `ElevenLabs · ${voiceLabel} · ${modelLabel}`;
  };

  /** "생성" 버튼 하나가 성우 미리듣기(synthesize_audio)와 영상 렌더
   *  (render_video)를 같이 시작한다 — 결과는 원래처럼 각자 도착하는 대로
   *  표시된다(음성이 보통 먼저, 영상은 5~8분 뒤 나중에). */
  const handleGenerate = (id: string) => {
    const c = cards.find((x) => x.id === id);
    if (!c || !c.input.trim() || !wsOpen) return;
    if (c.voiceStatus === "pending" || c.renderStatus === "starting" || c.renderStatus === "rendering") return;

    const patch: Partial<CardState> = { ownerThreadId: threadId };
    const isPrism = audioFormat === "prism";
    const narration = extractNarration(c.input, { stripScriptMarkup: isPrism });
    if (narration) {
      const voiceResult = send(
        "synthesize_audio",
        c.provider === "elevenlabs"
          ? { text: narration, slot_id: id, provider: c.provider, voice_id: c.voiceId, model_id: c.modelId, voice_settings: c.voiceSettings, format: audioFormat }
          : c.provider === "google"
            ? { text: narration, slot_id: id, provider: c.provider, voice_id: c.voiceId, format: audioFormat }
            : { text: narration, slot_id: id, provider: c.provider, polly_settings: c.pollySettings, format: audioFormat }
      );
      if (voiceResult.sent) {
        patch.voiceStatus = "pending";
        patch.voiceError = null;
        patch.voiceSummary = summarizeVoice(c);
      } else {
        patch.voiceStatus = "error";
        patch.voiceError = voiceResult.tooLarge
          ? `요청이 너무 커서(${voiceResult.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
          : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      }
    }

    // 2026-09-25, 사용자 리포트("일레븐 랩스를 선택하고 영상을 생성했는데
    // ... 영상에 담긴거는 polly 음성이 선택이 되어서 나왔네요") — 지금까지
    // render_video는 provider를 안 보내서 실제 렌더가 항상 CMS 발행
    // 설정(대개 Polly)을 썼다. synthesize_audio와 같은 provider/voice
    // 정보를 같이 보내 카드 선택대로 실제 영상도 렌더되게 한다. format도
    // 같은 이유로 같이 보낸다(2026-09-25 후속, 사용자 지적: "동영상
    // 부분도.. 영상 탭에.. 추가되어야하는거 아닌가요?").
    // script_format(2026-10-21) — PRISM은 영어 대본을 그대로 보내고, 서버가 장면 변환 프롬프트로 JSON을 만든다.
    const scriptFormat = isPrism ? { script_format: "prism", scene_version: c.sceneVersion ?? undefined } : {};
    const renderResult = send(
      "render_video",
      c.provider === "elevenlabs"
        ? { text: c.input, slot_id: id, provider: c.provider, voice_id: c.voiceId, model_id: c.modelId, voice_settings: c.voiceSettings, format: c.format, ...scriptFormat }
        : c.provider === "google"
          ? { text: c.input, slot_id: id, provider: c.provider, voice_id: c.voiceId, format: c.format, ...scriptFormat }
          : { text: c.input, slot_id: id, provider: c.provider, polly_settings: c.pollySettings, format: c.format, ...scriptFormat }
    );
    if (renderResult.sent) {
      patch.renderStatus = "starting";
      patch.renderError = null;
      patch.progress = null;
    } else {
      patch.renderStatus = "error";
      patch.renderError = renderResult.tooLarge
        ? `요청이 너무 커서(${renderResult.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
    }

    updateCard(id, patch);
  };

  const addCard = () =>
    setCards((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        newCard(
          last
            ? { provider: last.provider, voiceId: last.voiceId, modelId: last.modelId, voiceSettings: last.voiceSettings, pollySettings: last.pollySettings, format: last.format }
            : { provider: "polly", voiceId: "", modelId: "", voiceSettings: voiceSettingsDefaults, pollySettings: pollyDefaults, format: FORMATS[0].id }
        ),
      ];
    });
  const removeCard = (id: string) => {
    stopPolling(id);
    setCards((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  };

  // 2026-09-26(후속) — WebtoonCutGenerator.tsx::handleApplyTestToProduction과
  // 동일 패턴: 프롬프트 버전 활성화 + 음성/영상 설정 발행을 한 클릭으로
  // 묶는다(확인은 이제 ApplyReviewModal이 맡는다).
  const handleApplyTestToProduction = async (c: CardState) => {
    if (!onApplyToProduction) return;
    await promptRefs.current[c.id]?.activateIfNeeded();
    await onApplyToProduction(cardToParsedDoc(c));
  };
  const reviewingCard = cards.find((c) => c.id === reviewCardId) ?? null;

  return (
    <>
      {/* 2026-09-26 — "테스트" 묶음 토글 자체를 없앴다(VoicePreviewGenerator.tsx
          와 동일 이유·동일 결정, 그 파일 주석 참고).
          2026-09-27 — 사용자 지적: "'렌더링은 보통 2~3분...' 이 문구가
          방해되어서 삭제": 안내문 삭제.
          2026-09-27(후속) — 사용자 지적: "펼치면 구분이 어려울 수 있어서..
          배경 색을 주면 구분이 좀 더 괜찮을지도": 경계 표시를 진한 선
          하나에서, 옅은 회색 배경 띠 + "테스트" 라벨로 바꿨다(다른 두
          생성기와 동일, WebtoonCutGenerator.tsx 주석 참고) — 내용이 길어
          펼쳐져도 "여기부터 테스트 섹션"이라는 게 스크롤 중에도 눈에
          띈다. */}
      <div
        className="sticky z-10 flex items-center justify-between border-b px-2.5 py-1.5"
        style={{ top: stickyTop, background: "var(--surface-sunken)", borderColor: "var(--border-hairline)" }}
      >
        <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">{isPrismCards ? "시험 영상 — 운영에 영향 없음" : "테스트"}</span>
        <button
          type="button"
          onClick={addCard}
          className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          {isPrismCards ? "+ 시험 추가" : "+ 테스트 추가"}
        </button>
      </div>
      {/* 2026-09-27(후속) — 카드/그림자/간격 전부 제거, WebtoonCutGenerator.tsx 주석 참고. */}
      <div>
        {cards.map((c, i) => {
          // 2026-09-26(후속), 사용자 지적 — "테스트 카드도 마찬가지": 이
          // 카드가 지금 프로덕션과 완전히 같은 상태(같은 프롬프트 버전 +
          // 같은 음성·영상 설정)면 "프로덕션에 적용"은 no-op이라 비활성화.
          const info = activeInfos[c.id];
          const unchanged =
            info != null &&
            serverVersion !== null &&
            info.version === serverVersion &&
            productionDefaults !== null &&
            JSON.stringify(cardToParsedDoc(c)) === JSON.stringify(productionDefaults);
          return (
          <div key={c.id} className="overflow-hidden border-b bg-[var(--surface-card)]" style={{ borderColor: "var(--border-hairline)" }}>
          <CollapsibleSection
            title={isPrismCards ? `시험 영상 ${i + 1}` : `테스트 ${i + 1}`}
            titleExtra={
              isPrismCards ? (
                <span className="flex-none truncate rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}>
                  장면 {c.sceneVersion != null ? `v${c.sceneVersion}` : sceneServerVersion !== null ? `v${sceneServerVersion} (운영 중)` : "운영 중"}
                </span>
              ) : activeInfos[c.id] ? (
                <span
                  className="flex-none truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={
                    testVersion === activeInfos[c.id]!.version
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                  }
                  title={testVersion === activeInfos[c.id]!.version ? "채팅에서 사용 중인 버전" : "이 카드에 로드된 버전"}
                >
                  v{activeInfos[c.id]!.version}
                  {activeInfos[c.id]!.label ? ` · ${activeInfos[c.id]!.label}` : ""}
                </span>
              ) : undefined
            }
            badge={
              <div className="flex items-center gap-1.5">
                {(c.renderStatus === "starting" || c.renderStatus === "rendering") && (
                  <span className="flex-none text-[10.5px] text-[var(--text-faint)]">{progressLabel(c.progress)}</span>
                )}
                {onApplyToProduction && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setReviewCardId(c.id);
                    }}
                    disabled={unchanged}
                    title={unchanged ? "이미 프로덕션과 같은 버전·설정입니다" : undefined}
                    className="ui-btn ui-btn-primary rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-50"
                  >
                    프로덕션에 적용
                  </button>
                )}
                {cards.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      removeCard(c.id);
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
                ...(isPrismCards
                  ? [
                      {
                        key: "scene",
                        label: "장면 변환 버전",
                        content: (
                          <div className="flex flex-col gap-1.5 px-3.5 py-2">
                            <CustomSelect
                              value={c.sceneVersion != null ? String(c.sceneVersion) : ""}
                              onChange={(v) => updateCard(c.id, { sceneVersion: v ? Number(v) : null })}
                              options={[
                                { value: "", label: sceneServerVersion !== null ? `운영 중인 버전 (v${sceneServerVersion})` : "운영 중인 버전" },
                                ...sceneHistory.map((h) => ({
                                  value: String(h.version),
                                  label: `v${h.version}${h.label ? ` · ${h.label}` : ""}${h.version === sceneServerVersion ? " · 운영 중" : " · 저장만 됨"}`,
                                })),
                              ]}
                              scrollable
                            />
                            <p className="text-[10.5px] leading-relaxed text-[var(--text-faint)]">
                              대본을 장면으로 나눌 때 이 버전을 씁니다. 운영에 적용하지 않은 버전도 여기서 먼저 시험할 수 있어요.
                            </p>
                          </div>
                        ),
                      },
                    ]
                  : [
                {
                  key: "prompt",
                  label: "생성 프롬프트",
                  content: (
                    <PromptVersionReference
                      ref={(el) => {
                        promptRefs.current[c.id] = el;
                      }}
                      category={category}
                      name={name}
                      serverVersion={serverVersion}
                      promptHistory={promptHistory}
                      testVersion={testVersion}
                      onTestVersionChange={onTestVersionChange}
                      onServerVersionChange={onServerVersionChange}
                      onPromptHistoryRefresh={onPromptHistoryRefresh}
                      onActiveInfoChange={(info) => setActiveInfos((prev) => ({ ...prev, [c.id]: info }))}
                      bare
                    />
                  ),
                },
                    ]),
                {
                  key: "voice",
                  label: isPrismCards ? "성우 미리듣기" : "음성 설정",
                  content: (
                    <div className="flex flex-col gap-2 px-3.5 py-2">
                      {isPrismCards && (
                        <div className="rounded-lg px-2.5 py-2 text-[10.5px] leading-relaxed" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
                          <p className="mb-1 font-semibold">실제 PRISM 제작 영상은 그룹별 고정 성우로 만들어집니다</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {PRISM_GROUPS.filter((g) => PRISM_GROUP_VOICES[g.code]).map((g) => (
                              <span key={g.code}>
                                {g.code} {g.name} · <b>{PRISM_GROUP_VOICES[g.code]}</b>
                              </span>
                            ))}
                          </div>
                          <p className="mt-1">여기서 고른 성우는 이 시험 영상에만 쓰입니다.</p>
                        </div>
                      )}
                      <VoiceProviderFields
                        compact
                        provider={c.provider}
                        onProviderChange={(p) => setCardProvider(c.id, p)}
                        providers={VIDEO_PROVIDERS}
                        googleVoice={c.voiceId}
                        onGoogleVoiceChange={(v) => updateCard(c.id, { voiceId: v })}
                        pollyProfile={pollyProfile}
                        pollyVoice={c.pollySettings.voice}
                        pollyEngine={c.pollySettings.engine}
                        onPollyVoiceChange={(v) => updatePollySetting(c.id, "voice", v)}
                        onPollyEngineChange={(v) => updatePollySetting(c.id, "engine", v)}
                        pollyAdvanced={{
                          rate: c.pollySettings.rate,
                          volume: c.pollySettings.volume,
                          onRateChange: (v) => updatePollySetting(c.id, "rate", v),
                          onVolumeChange: (v) => updatePollySetting(c.id, "volume", v),
                        }}
                        elevenVoiceId={c.voiceId}
                        elevenModelId={c.modelId}
                        onElevenVoiceChange={(v) => updateCard(c.id, { voiceId: v })}
                        onElevenModelChange={(v) => updateCard(c.id, { modelId: v })}
                        elevenVoices={elevenVoices}
                        elevenModels={elevenModels}
                        elevenVoiceSettings={c.voiceSettings}
                        onElevenVoiceSettingChange={(k, v) => updateVoiceSetting(c.id, k, v)}
                        elevenRanges={voiceSettingsRanges}
                      />
                    </div>
                  ),
                },
                {
                  key: "video",
                  label: isPrismCards ? "대본·영상" : "영상 설정",
                  content: (
                    <div className="flex flex-col gap-2.5 px-3.5 py-2">
                      {/* PRISM은 가로 고정이라 포맷을 고르지 않는다. */}
                      {!isPrismCards && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10.5px] font-medium text-[var(--text-faint)]">포맷</span>
                        <CustomSelect
                          value={c.format}
                          onChange={(v) => updateCard(c.id, { format: v })}
                          options={FORMATS.map((f) => ({ value: f.id, label: f.label }))}
                        />
                      </div>
                      )}
                      <textarea
                        value={c.input}
                        onChange={(e) => updateCard(c.id, { input: e.target.value })}
                        placeholder={
                          audioFormat === "prism"
                            ? "왼쪽에서 만든 영어 대본(응답 전체 복사 그대로)을 붙여넣으세요 — 서버가 장면으로 나눠 영상을 만듭니다"
                            : "왼쪽에서 만든 각본(렌더용 JSON)을 붙여넣으세요 — 순수 텍스트만 넣으면 성우 미리듣기만 됩니다"
                        }
                        rows={6}
                        className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
                      />
                      <button
                        type="button"
                        onClick={() => handleGenerate(c.id)}
                        disabled={!c.input.trim() || !wsOpen || c.voiceStatus === "pending" || c.renderStatus === "starting" || c.renderStatus === "rendering"}
                        className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                      >
                        {c.renderStatus === "starting"
                          ? "렌더 시작 중..."
                          : c.renderStatus === "rendering"
                            ? "렌더링 중..."
                            : c.voiceStatus === "pending"
                              ? "음성 생성 중..."
                              : isPrismCards
                                ? "시험 영상 만들기"
                                : "생성"}
                      </button>

                      {/* 성우 미리듣기 결과 — 보통 영상보다 훨씬 먼저 도착한다. */}
                      {c.voiceStatus !== "idle" && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">성우 미리듣기</p>
                          {c.voiceSummary && <p className="text-[10.5px] font-medium text-[var(--text-faint)]">{c.voiceSummary}</p>}
                          {c.voiceStatus === "pending" && <p className="text-[10.5px] text-[var(--text-faint)]">음성 생성 중...</p>}
                          {c.voiceStatus === "done" && c.audioUrl && <audio controls preload="none" src={c.audioUrl} className="h-9 w-full" />}
                          {c.voiceStatus === "error" && c.voiceError && <p className="text-[11px] text-[var(--danger)]">{c.voiceError}</p>}
                        </div>
                      )}

                      {/* 영상 결과 — 렌더링은 보통 2~3분(Remotion Lambda, 2026-09-24
                          측정치). 진행이 멈추면 카드 삭제 후 다시 시도. */}
                      {c.renderStatus !== "idle" && (
                        <div className="border-t ui-divider flex flex-col gap-1.5 pt-2.5">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">영상</p>
                          {(c.renderStatus === "starting" || c.renderStatus === "rendering") && (
                            <div className="space-y-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                                <div
                                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                                  style={{ width: `${progressPercent(c.progress)}%` }}
                                />
                              </div>
                              <p className="text-[10.5px] text-[var(--text-faint)]">{progressLabel(c.progress)}</p>
                            </div>
                          )}
                          {c.renderStatus === "done" && c.videoUrl && (
                            <video controls preload="none" poster={c.thumbUrl ?? undefined} src={c.videoUrl} className="w-full rounded-lg" />
                          )}
                          {c.renderStatus === "done" && c.videoUrl && c.jobId && (
                            <VideoDownloadButton jobId={c.jobId} filePrefix={audioFormat === "prism" ? "ai_prism_EN" : "ailens_video"} />
                          )}
                          {c.renderStatus === "error" && c.renderError && <p className="text-[11px] text-[var(--danger)]">{c.renderError}</p>}
                        </div>
                      )}
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
      {reviewingCard && (
        <ApplyReviewModal
          category={category}
          name={name}
          channel="video"
          urlPath="video"
          onCancel={() => setReviewCardId(null)}
          onConfirm={async () => {
            await handleApplyTestToProduction(reviewingCard);
            setReviewCardId(null);
          }}
          settingsSummary={
            <div className="ui-card space-y-1.5 rounded-lg p-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">프롬프트 버전</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {activeInfos[reviewingCard.id]
                    ? `v${activeInfos[reviewingCard.id]!.version}${
                        activeInfos[reviewingCard.id]!.label ? ` · ${activeInfos[reviewingCard.id]!.label}` : ""
                      }`
                    : "미확인"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">음성 설정</span>
                <span className="font-semibold text-[var(--text-primary)]">{summarizeVoice(reviewingCard)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">포맷</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {FORMATS.find((f) => f.id === reviewingCard.format)?.label ?? reviewingCard.format}
                </span>
              </div>
            </div>
          }
          resultPreview={
            reviewingCard.renderStatus === "done" && reviewingCard.videoUrl ? (
              <video
                controls
                preload="none"
                poster={reviewingCard.thumbUrl ?? undefined}
                src={reviewingCard.videoUrl}
                className="w-full rounded-lg"
              />
            ) : reviewingCard.voiceStatus === "done" && reviewingCard.audioUrl ? (
              <div className="space-y-1">
                <p className="text-[11px] text-[var(--text-faint)]">영상은 아직 렌더 전입니다 — 성우 미리듣기만 확인할 수 있습니다.</p>
                <audio controls preload="none" src={reviewingCard.audioUrl} className="h-9 w-full" />
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-faint)]">
                아직 생성된 결과가 없습니다 — 결과 없이 적용하면 프롬프트 버전·음성·영상 설정만 반영됩니다.
              </p>
            )
          }
        />
      )}
    </>
  );
}
