/** 음성 제작 패널 — VoicePreviewGenerator.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { useEffect, useState } from "react";
import { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import { adminApi } from "@/lib/adminClient";
import { VoiceProviderFields } from "./VoiceProviderFields";
import { ELEVENLABS_FALLBACK_VOICE_SETTINGS, ELEVENLABS_FALLBACK_RANGES, type ElevenLabsVoiceSettings } from "./ElevenLabsVoiceSettingsFields";
import { POLLY_VOICES, POLLY_VOICE_ENGINE_OPTIONS } from "./PollyVoiceSettingsFields";
import { Provider, PollySettings, POLLY_DEFAULTS, SlotState, newSlot } from "./voiceSlotModel";

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
