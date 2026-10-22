/** 영상 제작 패널 — VideoCardGenerator.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { useEffect, useRef, useState } from "react";
import { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import { adminApi } from "@/lib/adminClient";
import { CustomSelect } from "@/components/CustomSelect";
import { VoiceProviderFields } from "./VoiceProviderFields";
import { ELEVENLABS_FALLBACK_VOICE_SETTINGS, ELEVENLABS_FALLBACK_RANGES, type ElevenLabsVoiceSettings } from "./ElevenLabsVoiceSettingsFields";
import { POLLY_VOICES, POLLY_VOICE_ENGINE_OPTIONS } from "./PollyVoiceSettingsFields";
import { FORMATS } from "./VideoRenderSettingsPanel";
import { extractNarration, Provider, PollySettings, POLLY_DEFAULTS, RenderProgress, progressLabel, progressPercent, POLL_INTERVAL_MS, CardState, newCard } from "./videoCardModel";
import { VideoDownloadButton } from "./VideoDownloadButton";
import { GOOGLE_DEFAULT_VOICE, GOOGLE_VOICES, VIDEO_PROVIDERS } from "./googleVoices";

/* 2026-09-27 — 사용자 요청: "프로덕션 카드에도, 테스트 카드와 동일하게,
   산출물 생성 가능하도록.. 4개 유형 전부요" → 이어서 지적: "프로덕션
   결과물이라는 거를 만드는게 아니고요... 영상 설정 단계로 가면 영상
   생성 하도록 되잖아? ... 프로덕션 결과물 섹션을 만들라는게 아닙니다" —
   WebtoonProductionCutGrid/VoiceProductionPanel과 동일 원칙: 별도
   섹션이 아니라 프로덕션 카드 자신의 "영상 설정" 탭(PromptTextLab.tsx의
   StepTabs, VideoRenderSettingsPanel의 formatSection 자리) 안에 이
   패널을 직접 심는다. 테스트 카드(위 VideoCardGenerator)와 모양은
   같지만(성우 설정 탭+영상 설정 탭, "생성" 하나가 음성+렌더 동시 시작)
   카드가 언제나 단 하나뿐이라 배열 대신 단일 CardState를 쓰는 별도
   컴포넌트로 둔다 — CardState/newCard/POLL_INTERVAL_MS 등은 위
   VideoCardGenerator와 그대로 공유한다(같은 파일).

   대화 간 영속·localStorage 복원은 안 한다(VoiceProductionPanel과 동일
   스코프 축소 — VoicePreviewGenerator.tsx 그 컴포넌트 주석 참고: 저장
   메시지가 role/id를 안 갖고 있어 "이게 production 거였다"를 나중에
   구분 못 함, 그리고 production 생성은 "지금 비교해보는" 일회성 시도).
   렌더 중 대화를 전환하면(부모가 key={threadId}로 이 컴포넌트를
   마운트하므로) 언마운트되며 폴링도 같이 끊긴다 — ECS 작업 자체는
   백엔드에서 계속 돌지만 이 패널은 더 이상 상태를 안 받는다(테스트
   카드처럼 "다른 대화로 넘어가도 이어받기"까지는 이 패널 스코프 밖). */
export function VideoProductionPanel({
  wsOpen,
  send,
  subscribe,
}: {
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
}) {
  const [elevenVoices, setElevenVoices] = useState<{ id: string; label: string; gender: string; sample_url: string }[]>([]);
  const [elevenModels, setElevenModels] = useState<{ id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[]>([]);
  const [voiceSettingsDefaults, setVoiceSettingsDefaults] = useState<ElevenLabsVoiceSettings>(ELEVENLABS_FALLBACK_VOICE_SETTINGS);
  const [voiceSettingsRanges, setVoiceSettingsRanges] = useState(ELEVENLABS_FALLBACK_RANGES);
  const [elevenOptionsLoaded, setElevenOptionsLoaded] = useState(false);
  const [card, setCard] = useState<CardState>(() =>
    newCard({ provider: "polly", voiceId: "", modelId: "", voiceSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS, pollySettings: POLLY_DEFAULTS, format: FORMATS[0].id })
  );
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

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
        setCard((prev) =>
          prev.provider === "elevenlabs" && !prev.voiceId
            ? { ...prev, voiceId: r.voices[0]?.id ?? "", modelId: r.models[0]?.id ?? "", voiceSettings: r.voice_settings_defaults ?? ELEVENLABS_FALLBACK_VOICE_SETTINGS }
            : prev
        );
      })
      .catch((err) => console.error("ElevenLabs 옵션 조회 실패", err));
  };

  const startPolling = (jobId: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const r = await adminApi.pollVideoLab(jobId);
        if (r.status === "done") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setCard((prev) => ({ ...prev, renderStatus: "done", videoUrl: r.video_url ?? null, thumbUrl: r.thumb_url ?? null, renderError: null }));
        } else if (r.status === "error") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setCard((prev) => ({ ...prev, renderStatus: "error", renderError: r.message ?? "렌더 실패" }));
        } else if (r.progress) {
          setCard((prev) => ({ ...prev, progress: r.progress as RenderProgress }));
        }
      } catch (err) {
        console.error("영상 렌더 상태 확인 실패", err);
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "audio_ready") {
        const m = msg as unknown as { slot_id: string; audio_url: string };
        if (m.slot_id !== "production") return;
        setCard((prev) => ({ ...prev, voiceStatus: "done", audioUrl: m.audio_url, voiceError: null }));
      } else if (msg.type === "audio_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        if (m.slot_id !== "production") return;
        setCard((prev) => ({ ...prev, voiceStatus: "error", voiceError: m.message }));
      } else if (msg.type === "render_started") {
        const m = msg as unknown as { slot_id: string; job_id: string };
        if (m.slot_id !== "production") return;
        setCard((prev) => ({ ...prev, renderStatus: "rendering", jobId: m.job_id }));
        startPolling(m.job_id);
      } else if (msg.type === "render_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        if (m.slot_id !== "production") return;
        setCard((prev) => ({ ...prev, renderStatus: "error", renderError: m.message }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setCard는 함수형 갱신만 쓰므로 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const setProvider = (provider: Provider) => {
    if (provider === "elevenlabs") ensureElevenOptions();
    setCard((prev) => ({
      ...prev,
      provider,
      // voiceId는 ElevenLabs 성우 id 또는 Google 성우 이름(provider로 구분)이다.
      voiceId: provider === "elevenlabs" ? elevenVoices[0]?.id ?? "" : provider === "google" ? GOOGLE_DEFAULT_VOICE : "",
      modelId: provider === "elevenlabs" ? elevenModels[0]?.id ?? "" : "",
      voiceSettings: voiceSettingsDefaults,
      pollySettings: POLLY_DEFAULTS,
    }));
  };
  const updateVoiceSetting = <K extends keyof ElevenLabsVoiceSettings>(key: K, value: ElevenLabsVoiceSettings[K]) =>
    setCard((prev) => ({ ...prev, voiceSettings: { ...prev.voiceSettings, [key]: value } }));
  const updatePollySetting = <K extends keyof PollySettings>(key: K, value: PollySettings[K]) =>
    setCard((prev) => {
      const next = { ...prev.pollySettings, [key]: value };
      if (key === "voice") next.engine = POLLY_VOICE_ENGINE_OPTIONS[next.voice][0].id;
      return { ...prev, pollySettings: next };
    });

  const summarizeVoice = (c: CardState): string => {
    if (c.provider === "polly") {
      const voiceLabel = POLLY_VOICES.find((v) => v.id === c.pollySettings.voice)?.label ?? c.pollySettings.voice;
      const engineLabel =
        POLLY_VOICE_ENGINE_OPTIONS[c.pollySettings.voice]?.find((e) => e.id === c.pollySettings.engine)?.label ?? c.pollySettings.engine;
      return `Polly · ${voiceLabel} · ${engineLabel}`;
    }
    if (c.provider === "google") {
      return `Google · ${GOOGLE_VOICES.find((v) => v.id === c.voiceId)?.label ?? c.voiceId}`;
    }
    const voiceLabel = elevenVoices.find((v) => v.id === c.voiceId)?.label ?? c.voiceId;
    const modelLabel = elevenModels.find((m) => m.id === c.modelId)?.label ?? c.modelId;
    return `ElevenLabs · ${voiceLabel} · ${modelLabel}`;
  };

  const handleGenerate = () => {
    if (!card.input.trim() || !wsOpen) return;
    if (card.voiceStatus === "pending" || card.renderStatus === "starting" || card.renderStatus === "rendering") return;

    const patch: Partial<CardState> = {};
    const narration = extractNarration(card.input);
    if (narration) {
      const voiceResult = send(
        "synthesize_audio",
        card.provider === "elevenlabs"
          ? { text: narration, slot_id: "production", provider: card.provider, voice_id: card.voiceId, model_id: card.modelId, voice_settings: card.voiceSettings, format: "video" }
          : card.provider === "google"
            ? { text: narration, slot_id: "production", provider: card.provider, voice_id: card.voiceId, format: "video" }
            : { text: narration, slot_id: "production", provider: card.provider, polly_settings: card.pollySettings, format: "video" }
      );
      if (voiceResult.sent) {
        patch.voiceStatus = "pending";
        patch.voiceError = null;
        patch.voiceSummary = summarizeVoice(card);
      } else {
        patch.voiceStatus = "error";
        patch.voiceError = voiceResult.tooLarge
          ? `요청이 너무 커서(${voiceResult.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
          : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      }
    }

    const renderResult = send(
      "render_video",
      card.provider === "elevenlabs"
        ? { text: card.input, slot_id: "production", provider: card.provider, voice_id: card.voiceId, model_id: card.modelId, voice_settings: card.voiceSettings, format: card.format }
        : card.provider === "google"
          ? { text: card.input, slot_id: "production", provider: card.provider, voice_id: card.voiceId, format: card.format }
          : { text: card.input, slot_id: "production", provider: card.provider, polly_settings: card.pollySettings, format: card.format }
    );
    if (renderResult.sent) {
      patch.renderStatus = "starting";
      patch.renderError = null;
    } else {
      patch.renderStatus = "error";
      patch.renderError = renderResult.tooLarge
        ? `요청이 너무 커서(${renderResult.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
    }

    setCard((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-2">
      <VoiceProviderFields
        compact
        provider={card.provider}
        onProviderChange={setProvider}
        providers={VIDEO_PROVIDERS}
        googleVoice={card.voiceId}
        onGoogleVoiceChange={(v) => setCard((prev) => ({ ...prev, voiceId: v }))}
        pollyVoice={card.pollySettings.voice}
        pollyEngine={card.pollySettings.engine}
        onPollyVoiceChange={(v) => updatePollySetting("voice", v)}
        onPollyEngineChange={(v) => updatePollySetting("engine", v)}
        pollyAdvanced={{
          rate: card.pollySettings.rate,
          volume: card.pollySettings.volume,
          onRateChange: (v) => updatePollySetting("rate", v),
          onVolumeChange: (v) => updatePollySetting("volume", v),
        }}
        elevenVoiceId={card.voiceId}
        elevenModelId={card.modelId}
        onElevenVoiceChange={(v) => setCard((prev) => ({ ...prev, voiceId: v }))}
        onElevenModelChange={(v) => setCard((prev) => ({ ...prev, modelId: v }))}
        elevenVoices={elevenVoices}
        elevenModels={elevenModels}
        elevenVoiceSettings={card.voiceSettings}
        onElevenVoiceSettingChange={(k, v) => updateVoiceSetting(k, v)}
        elevenRanges={voiceSettingsRanges}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[10.5px] font-medium text-[var(--text-faint)]">포맷</span>
        <CustomSelect
          value={card.format}
          onChange={(v) => setCard((prev) => ({ ...prev, format: v }))}
          options={FORMATS.map((f) => ({ value: f.id, label: f.label }))}
        />
      </div>
      <textarea
        value={card.input}
        onChange={(e) => setCard((prev) => ({ ...prev, input: e.target.value }))}
        placeholder="왼쪽에서 만든 각본(렌더용 JSON)을 붙여넣으세요 — 순수 텍스트만 넣으면 성우 미리듣기만 됩니다"
        rows={6}
        className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!card.input.trim() || !wsOpen || card.voiceStatus === "pending" || card.renderStatus === "starting" || card.renderStatus === "rendering"}
        className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
      >
        {card.renderStatus === "starting"
          ? "렌더 시작 중..."
          : card.renderStatus === "rendering"
            ? "렌더링 중..."
            : card.voiceStatus === "pending"
              ? "음성 생성 중..."
              : "생성"}
      </button>

      {card.voiceStatus !== "idle" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">성우 미리듣기</p>
          {card.voiceSummary && <p className="text-[10.5px] font-medium text-[var(--text-faint)]">{card.voiceSummary}</p>}
          {card.voiceStatus === "pending" && <p className="text-[10.5px] text-[var(--text-faint)]">음성 생성 중...</p>}
          {card.voiceStatus === "done" && card.audioUrl && <audio controls preload="none" src={card.audioUrl} className="h-9 w-full" />}
          {card.voiceStatus === "error" && card.voiceError && <p className="text-[11px] text-[var(--danger)]">{card.voiceError}</p>}
        </div>
      )}

      {card.renderStatus !== "idle" && (
        <div className="border-t ui-divider flex flex-col gap-1.5 pt-2.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">영상</p>
          {(card.renderStatus === "starting" || card.renderStatus === "rendering") && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPercent(card.progress)}%` }}
                />
              </div>
              <p className="text-[10.5px] text-[var(--text-faint)]">{progressLabel(card.progress)}</p>
            </div>
          )}
          {card.renderStatus === "done" && card.videoUrl && (
            <video controls preload="none" poster={card.thumbUrl ?? undefined} src={card.videoUrl} className="w-full rounded-lg" />
          )}
          {card.renderStatus === "done" && card.videoUrl && card.jobId && <VideoDownloadButton jobId={card.jobId} filePrefix="ailens_video" />}
          {card.renderStatus === "error" && card.renderError && <p className="text-[11px] text-[var(--danger)]">{card.renderError}</p>}
        </div>
      )}
    </div>
  );
}
