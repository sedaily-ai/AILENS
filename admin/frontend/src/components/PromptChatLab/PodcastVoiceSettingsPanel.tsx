"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { VoiceProviderFields } from "./VoiceProviderFields";
import {
  ELEVENLABS_FALLBACK_VOICE_SETTINGS,
  ELEVENLABS_FALLBACK_RANGES,
  type ElevenLabsVoiceSettings,
} from "./ElevenLabsVoiceSettingsFields";
import { POLLY_RATES, POLLY_VOLUMES, POLLY_VOICE_ENGINE_OPTIONS } from "./PollyVoiceSettingsFields";

/* 팟캐스트 음성 설정 — 2026-09-22 신설. 사용자 요청: "팟캐스트도... 성우를
   선택하거나... 값을 조정하거나 할 수 있지 않을까요? 웹툰이랑 동일한
   구조로 짜주시죠" — WebtoonImageSettingsPanel.tsx와 같은 패턴: 발행
   문서를 "## 헤딩"으로 저장하고, 저장 버튼 하나가 그대로 발행이라
   다음 실제 생성부터 프로덕션에 반영된다(admin/backend/routes/prompts.py::
   handle_update가 category/name이 무엇이든 받는 범용 라우트라 새 백엔드
   라우트 없이 재사용, category="podcast-voice"/name="published").

   엔진은 성우에 딸린 고정값이 아니다(같은 날 정정 — 사용자가 "다른 값들은
   정말 없었냐"고 재확인 요청해 `aws polly describe-voices --language-code
   ko-KR`로 직접 조회: 지혜는 neural만 지원하지만 서연은 generative·neural·
   standard 셋 다 지원한다). VOICE_ENGINE_OPTIONS가 그 실제 조합표 —
   pipelines/common/podcast_voice.py의 _VOICE_ENGINE_OPTIONS와 반드시 같은
   값이어야 한다(프론트가 백엔드 상수를 직접 import할 방법이 없어 이중관리,
   값 바뀌면 두 파일 다 고칠 것). pitch를 안 넣은 이유도 그 파일 참고
   (generative·neural 둘 다 SSML로 pitch 조절 미지원, AWS 문서 확인).

   제공자(PROVIDER, 2026-09-24 추가) — 사용자 요청: "가장 우측 부분은...
   프로덕션을 위해서 발행하는 공간으로 정의할게요. 따라서, 음성 부분도...
   폴리 뿐 아니고 일레븐 랩스도 같이 적용할 수 있도록 해야합니다." 여기서
   ElevenLabs를 고르고 발행하면 **실제 매일 자동 발행되는 팟캐스트가
   ElevenLabs로 합성된다**(pipelines/podcast/pipeline.py →
   podcast_voice.synthesize() → provider가 elevenlabs면 elevenlabs_tts.py로
   위임). 2026-08-27에 비용 때문에(ElevenLabs 월 $95.81 vs Polly generative
   월 $17, 약 82% 절감) ElevenLabs→Polly로 전환했던 결정을 관리자가 여기서
   명시적으로 다시 뒤집는 것이라, 발행 확인 문구에 그 사실을 명시한다.
   ElevenLabs 성우/모델 목록은 CMS 실험 패널(VoicePreviewGenerator.tsx)과
   동일한 elevenlabs_tts.py::VOICES/MODELS를 GET /admin/elevenlabs/options로
   공유한다 — VoiceSelectWithPreview(성우 미리듣기 버튼 포함)도 그대로
   재사용.

   세부 파라미터(STABILITY 등, 2026-09-24 추가) — 사용자 지적: "폴리는
   그대로 옵션이 구성되어있지만... 일레븐랩스는 그렇지 않네요... 동일한
   환경이 되도록 구축해주세요." Polly가 성우·엔진·속도·음량을 다 고를 수
   있는데 ElevenLabs는 성우·모델뿐이라 대칭이 안 맞았던 걸 맞춘다 —
   ElevenLabsAdvancedFields(ElevenLabsVoiceSettingsFields.tsx)를 "음성 생성"
   카드와 그대로 공유. */

const DEFAULTS: ParsedDoc = {
  provider: "polly",
  voice: "Seoyeon",
  engine: "generative",
  rate: "100%",
  volume: "+0dB",
  elevenlabsVoice: "",
  elevenlabsModel: "",
  elevenlabsSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS,
};

const HEADING_RE =
  /^##\s+(PROVIDER|VOICE|ENGINE|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$/;

/** 2026-09-26 — export해서 VoicePreviewGenerator.tsx("테스트 N" 카드)가
 *  "프로덕션에 적용" 버튼으로 넘길 payload 타입으로도 쓴다 — 테스트
 *  슬롯의 provider/voice/engine/rate/volume/elevenlabs* 필드가 이 문서
 *  구조와 정확히 같아서(같은 값을 다루므로), 새 타입을 안 만들고 이걸
 *  그대로 재사용한다. */
export interface ParsedDoc {
  provider: "polly" | "elevenlabs";
  voice: string;
  engine: string;
  rate: string;
  volume: string;
  elevenlabsVoice: string;
  elevenlabsModel: string;
  elevenlabsSettings: ElevenLabsVoiceSettings;
}

function parseDoc(content: string): ParsedDoc {
  const buckets: Record<string, string[]> = {
    PROVIDER: [], VOICE: [], ENGINE: [], RATE: [], VOLUME: [], ELEVENLABS_VOICE: [], ELEVENLABS_MODEL: [],
    ELEVENLABS_STABILITY: [], ELEVENLABS_SIMILARITY_BOOST: [], ELEVENLABS_STYLE: [], ELEVENLABS_SPEED: [], ELEVENLABS_SPEAKER_BOOST: [],
  };
  let current: string | null = null;
  for (const line of content.split("\n")) {
    const m = HEADING_RE.exec(line.trim());
    if (m) {
      current = m[1];
      continue;
    }
    if (current) buckets[current].push(line);
  }
  const providerRaw = buckets.PROVIDER.join("\n").trim();
  const voiceRaw = buckets.VOICE.join("\n").trim();
  const engineRaw = buckets.ENGINE.join("\n").trim();
  const rate = buckets.RATE.join("\n").trim();
  const volume = buckets.VOLUME.join("\n").trim();
  const voice = voiceRaw in POLLY_VOICE_ENGINE_OPTIONS ? voiceRaw : DEFAULTS.voice;
  const validEngines = POLLY_VOICE_ENGINE_OPTIONS[voice].map((e) => e.id);
  const numOr = (raw: string, fallback: number) => {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    provider: providerRaw === "elevenlabs" ? "elevenlabs" : DEFAULTS.provider,
    voice,
    engine: validEngines.includes(engineRaw) ? engineRaw : validEngines[0],
    rate: POLLY_RATES.includes(rate) ? rate : DEFAULTS.rate,
    volume: POLLY_VOLUMES.includes(volume) ? volume : DEFAULTS.volume,
    elevenlabsVoice: buckets.ELEVENLABS_VOICE.join("\n").trim(),
    elevenlabsModel: buckets.ELEVENLABS_MODEL.join("\n").trim(),
    elevenlabsSettings: {
      stability: numOr(buckets.ELEVENLABS_STABILITY.join("\n").trim(), ELEVENLABS_FALLBACK_VOICE_SETTINGS.stability),
      similarity_boost: numOr(buckets.ELEVENLABS_SIMILARITY_BOOST.join("\n").trim(), ELEVENLABS_FALLBACK_VOICE_SETTINGS.similarity_boost),
      style: numOr(buckets.ELEVENLABS_STYLE.join("\n").trim(), ELEVENLABS_FALLBACK_VOICE_SETTINGS.style),
      speed: numOr(buckets.ELEVENLABS_SPEED.join("\n").trim(), ELEVENLABS_FALLBACK_VOICE_SETTINGS.speed),
      use_speaker_boost: buckets.ELEVENLABS_SPEAKER_BOOST.join("\n").trim() === "false" ? false : ELEVENLABS_FALLBACK_VOICE_SETTINGS.use_speaker_boost,
    },
  };
}

function buildDoc(d: ParsedDoc): string {
  return (
    `## PROVIDER\n${d.provider}\n\n## VOICE\n${d.voice}\n\n## ENGINE\n${d.engine}\n\n` +
    `## RATE\n${d.rate}\n\n## VOLUME\n${d.volume}\n\n` +
    `## ELEVENLABS_VOICE\n${d.elevenlabsVoice}\n\n## ELEVENLABS_MODEL\n${d.elevenlabsModel}\n\n` +
    `## ELEVENLABS_STABILITY\n${d.elevenlabsSettings.stability}\n\n` +
    `## ELEVENLABS_SIMILARITY_BOOST\n${d.elevenlabsSettings.similarity_boost}\n\n` +
    `## ELEVENLABS_STYLE\n${d.elevenlabsSettings.style}\n\n` +
    `## ELEVENLABS_SPEED\n${d.elevenlabsSettings.speed}\n\n` +
    `## ELEVENLABS_SPEAKER_BOOST\n${d.elevenlabsSettings.use_speaker_boost}`
  );
}

export interface PodcastVoiceSettingsPanelHandle {
  publish: () => Promise<void>;
  /** 2026-09-26 — "테스트 N" 카드의 "프로덕션에 적용" 버튼(VoicePreviewGenerator.tsx)
   *  이 부른다. 값만 채워 넣고 dirty 표시만 할 뿐 발행은 안 한다 — 발행은
   *  여전히 사용자가 "프롬프트" 발행 바처럼 직접 확인 후 눌러야 한다(CMS
   *  값은 항상 명시적으로 확정, 이 세션의 반복된 원칙). */
  applyFromTest: (data: ParsedDoc) => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
   *  테스트 카드에서 적용할 수 있게": applyFromTest(값만 채움)와
   *  handlePublish(발행)를 한 번에 묶는다 — WebtoonImageSettingsPanel.tsx::
   *  applyAndPublish와 동일 패턴. 테스트 카드가 이미 확인창을 띄우므로
   *  여기선 더 묻지 않는다. */
  applyAndPublish: (data: ParsedDoc) => Promise<void>;
}

/* 2026-09-25 — 발행 버튼을 부모(PromptTextLab.tsx)로 옮겼다(VideoRenderSettingsPanel.tsx
   와 동일 이유·동일 패턴 — 그 파일 주석 참고). */
export const PodcastVoiceSettingsPanel = forwardRef<PodcastVoiceSettingsPanelHandle, {
  onDirtyChange?: (dirty: boolean) => void;
  /** 2026-09-25 — 사용자 지적("대본 버전만 있는 것은 아니잖아요?? 프로덕션
   *  버전... 이런식이 맞지 않나") — 이 문서(podcast-voice/published)의
   *  버전도 부모가 VersionSwitcher.tsx에 "음성 설정 vN"으로 같이 보여준다.
   *  WebtoonImageSettingsPanel.tsx와 같은 패턴. */
  onServerVersionChange?: (version: number | null) => void;
  /** 2026-09-26, 사용자 지적 — "처음 들어갈때... 프로덕션에 적용 카드가
   *  활성화되어있는데... 테스트 카드도 마찬가지": 테스트 카드가 지금
   *  실제 발행된 음성 설정이 뭔지 알아야 "이 카드는 이미 프로덕션과
   *  같다"를 판단할 수 있다 — 방금 fetch한 defaults를 그대로 올려보낸다. */
  onDefaultsChange?: (defaults: ParsedDoc) => void;
}>(function PodcastVoiceSettingsPanel({ onDirtyChange, onServerVersionChange, onDefaultsChange }, ref) {
  const toast = useToast();
  const [provider, setProvider] = useState<"polly" | "elevenlabs">(DEFAULTS.provider as "polly" | "elevenlabs");
  const [voice, setVoiceState] = useState(DEFAULTS.voice);
  const [engine, setEngine] = useState(DEFAULTS.engine);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [volume, setVolume] = useState(DEFAULTS.volume);
  const [elevenlabsVoice, setElevenlabsVoice] = useState(DEFAULTS.elevenlabsVoice);
  const [elevenlabsModel, setElevenlabsModel] = useState(DEFAULTS.elevenlabsModel);
  const [elevenlabsSettings, setElevenlabsSettings] = useState<ElevenLabsVoiceSettings>(DEFAULTS.elevenlabsSettings);
  const [defaults, setDefaults] = useState<ParsedDoc>(DEFAULTS);
  const [elevenVoices, setElevenVoices] = useState<{ id: string; label: string; gender: string; sample_url: string }[]>([]);
  const [elevenModels, setElevenModels] = useState<{ id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[]>([]);
  const [voiceSettingsRanges, setVoiceSettingsRanges] = useState(ELEVENLABS_FALLBACK_RANGES);
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const updateElevenlabsSetting = <K extends keyof ElevenLabsVoiceSettings>(key: K, value: ElevenLabsVoiceSettings[K]) => {
    setElevenlabsSettings((prev) => ({ ...prev, [key]: value }));
  };

  // 성우를 바꾸면 그 성우가 지원 안 하는 엔진을 고르고 있을 수 있어(예:
  // 서연/standard였다가 지혜로 바꿈 — 지혜는 standard 미지원) 항상 그
  // 성우의 첫 번째(가장 권장) 엔진으로 같이 맞춘다.
  const setVoice = (next: string) => {
    setVoiceState(next);
    setEngine(POLLY_VOICE_ENGINE_OPTIONS[next][0].id);
  };

  useEffect(() => {
    adminApi
      .getElevenLabsOptions()
      .then((r) => {
        setElevenVoices(r.voices);
        setElevenModels(r.models);
        setVoiceSettingsRanges(r.voice_settings_ranges ?? ELEVENLABS_FALLBACK_RANGES);
      })
      .catch((err) => console.error("ElevenLabs 옵션 조회 실패", err));
    adminApi
      .getPrompt("podcast-voice", "published")
      .then((r) => {
        const parsed = parseDoc(r.active_content);
        setProvider(parsed.provider);
        setVoiceState(parsed.voice);
        setEngine(parsed.engine);
        setRate(parsed.rate);
        setVolume(parsed.volume);
        setElevenlabsVoice(parsed.elevenlabsVoice);
        setElevenlabsModel(parsed.elevenlabsModel);
        setElevenlabsSettings(parsed.elevenlabsSettings);
        setDefaults(parsed);
        setServerVersion(r.active_version);
      })
      .catch(() => {
        // 아직 한 번도 발행 안 된 상태(문서 없음) — 파이프라인 기본값과
        // 같은 값을 보여준다(podcast_voice.py의 _DEFAULT_*와 일치).
        setProvider(DEFAULTS.provider);
        setVoiceState(DEFAULTS.voice);
        setEngine(DEFAULTS.engine);
        setRate(DEFAULTS.rate);
        setVolume(DEFAULTS.volume);
        setElevenlabsVoice(DEFAULTS.elevenlabsVoice);
        setElevenlabsModel(DEFAULTS.elevenlabsModel);
        setElevenlabsSettings(DEFAULTS.elevenlabsSettings);
        setDefaults(DEFAULTS);
        setServerVersion(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ElevenLabs를 처음 고르는데 아직 아무 성우도 안 정해져 있으면(발행
  // 문서에 없던 경우) 옵션 로드 후 첫 값으로 채운다. 외부 데이터(API
  // 응답) 도착에 대한 파생 상태 채움이라 set-state-in-effect 예외
  // 패턴(admin/frontend/CLAUDE.md drivers/page.tsx 등과 동일 근거).
  useEffect(() => {
    if (provider !== "elevenlabs" || elevenlabsVoice || elevenVoices.length === 0) return;
     
    setElevenlabsVoice(elevenVoices[0].id);
    setElevenlabsModel(elevenModels[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elevenlabsVoice가 채워지면 이 effect가 다시 안 돌아도 되므로 의도적으로 뺌
  }, [provider, elevenVoices]);

  const current: ParsedDoc = { provider, voice, engine, rate, volume, elevenlabsVoice, elevenlabsModel, elevenlabsSettings };
  const changed = JSON.stringify(current) !== JSON.stringify(defaults);

  // 2026-09-26(후속) — overrideData가 있으면 changed 체크·확인창 둘 다
  // 건너뛴다(테스트 카드가 이미 확인받고 직접 값을 넘기는 경로) —
  // WebtoonImageSettingsPanel.tsx::handlePublish와 동일 원칙.
  const handlePublish = async (overrideData?: ParsedDoc) => {
    const dataToUse = overrideData ?? current;
    if (publishing) return;
    if (overrideData === undefined) {
      if (!changed) return;
      const confirmMsg =
        provider === "elevenlabs"
          ? "이 설정을 발행하면 다음 실제 팟캐스트 생성부터 ElevenLabs로 합성됩니다 — Polly보다 비용이 훨씬 높습니다(2026-08-27에 비용 때문에 Polly로 전환했던 이력 있음). 계속 발행할까요?"
          : "이 설정을 발행하면 다음 실제 팟캐스트 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?";
      if (!window.confirm(confirmMsg)) return;
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt("podcast-voice", "published", buildDoc(dataToUse));
      toast.show(`발행했습니다 — v${r.new_version}부터 다음 생성에 적용됩니다`, "success");
      setProvider(dataToUse.provider);
      setVoiceState(dataToUse.voice);
      setEngine(dataToUse.engine);
      setRate(dataToUse.rate);
      setVolume(dataToUse.volume);
      setElevenlabsVoice(dataToUse.elevenlabsVoice);
      setElevenlabsModel(dataToUse.elevenlabsModel);
      setElevenlabsSettings(dataToUse.elevenlabsSettings);
      setDefaults(dataToUse);
      setServerVersion(r.new_version);
    } catch (err) {
      toast.show(`발행 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setPublishing(false);
    }
  };

  useImperativeHandle(ref, () => ({
    publish: () => handlePublish(),
    applyAndPublish: (data) => handlePublish(data),
    applyFromTest: (data) => {
      setProvider(data.provider);
      setVoiceState(data.voice);
      setEngine(data.engine);
      setRate(data.rate);
      setVolume(data.volume);
      setElevenlabsVoice(data.elevenlabsVoice);
      setElevenlabsModel(data.elevenlabsModel);
      setElevenlabsSettings(data.elevenlabsSettings);
      toast.show("테스트 설정을 적용했습니다 — 확인 후 발행해 주세요", "success");
    },
  }));

  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);

  useEffect(() => {
    onServerVersionChange?.(serverVersion);
  }, [serverVersion, onServerVersionChange]);

  useEffect(() => {
    onDefaultsChange?.(defaults);
  }, [defaults, onDefaultsChange]);

  if (loading) {
    return <p className="px-3.5 py-3 text-[11px] text-[var(--text-faint)]">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <VoiceProviderFields
        provider={provider}
        onProviderChange={setProvider}
        pollyVoice={voice}
        pollyEngine={engine}
        onPollyVoiceChange={setVoice}
        onPollyEngineChange={setEngine}
        pollyAdvanced={{ rate, volume, onRateChange: setRate, onVolumeChange: setVolume }}
        elevenVoiceId={elevenlabsVoice}
        elevenModelId={elevenlabsModel}
        onElevenVoiceChange={setElevenlabsVoice}
        onElevenModelChange={setElevenlabsModel}
        elevenVoices={elevenVoices}
        elevenModels={elevenModels}
        elevenVoiceSettings={elevenlabsSettings}
        onElevenVoiceSettingChange={updateElevenlabsSetting}
        elevenRanges={voiceSettingsRanges}
      />
      {provider === "polly" && (
        <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
          속도·음량은 SSML로 조절되지만, 음높이(pitch)는 Polly 생성형·뉴럴 엔진이 지원하지 않습니다.
        </p>
      )}

      {publishing && <p className="text-[10.5px] text-[var(--text-faint)]">발행 중...</p>}
    </div>
  );
});
