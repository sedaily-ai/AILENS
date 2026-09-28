"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { CustomSelect } from "@/components/CustomSelect";
import { CollapsibleSection } from "./CollapsibleSection";
import { VoiceProviderFields } from "./VoiceProviderFields";
import {
  ELEVENLABS_FALLBACK_VOICE_SETTINGS,
  ELEVENLABS_FALLBACK_RANGES,
  type ElevenLabsVoiceSettings,
} from "./ElevenLabsVoiceSettingsFields";
import { POLLY_VOICE_ENGINE_OPTIONS, POLLY_RATES, POLLY_VOLUMES } from "./PollyVoiceSettingsFields";

/* 영상 렌더 설정 — 2026-09-23 신설. 사용자 요청: "팟캐스트 부분처럼 성우
   선택하고 값 설정하는 거 대본 프롬프트 아래에 동일하게 넣으면 되지
   않아요? 그리고 동영상 부분은 동영상 관련해서 설정 가능한 걸 넣어
   주세요" — PodcastVoiceSettingsPanel.tsx와 같은 패턴: 발행 문서를
   "## 헤딩"으로 저장, 저장 버튼 하나가 그대로 발행이라 다음 실제
   렌더부터 CMS 랩(render_from_script.py)과 프로덕션 발행 파이프라인
   (publish_utils.py::generate_video) 양쪽에 반영된다(admin/backend/
   routes/prompts.py::handle_update가 category/name 무엇이든 받는 범용
   라우트라 새 백엔드 라우트 불필요, category="video-settings"/
   name="published").

   성우/엔진 조합표는 PodcastVoiceSettingsPanel.tsx와 완전히 동일하다
   (같은 Polly 한국어 보이스 제약 — pipelines/common/video_settings.py
   참고).

   속도·음량(RATE/VOLUME, 2026-09-25 추가) — 사용자 요청: "팟캐스트
   부분처럼.. 동일하게 해야죠." 원래는 일부러 뺐었다(video/src/lib/tts.ts가
   SSML <prosody> 없이 평문만 보내서 반영이 안 됐음) — tts.ts에 실제로
   <prosody> 지원을 추가하면서 PodcastVoiceSettingsPanel.tsx와 똑같이
   PollyAdvancedFields 슬라이더로 넣는다(값 집합도 동일 — pipelines/
   common/video_settings.py::_VALID_RATES/_VALID_VOLUMES 참고).

   포맷(가로/세로)은 영상 전용 설정 — pipelines/video/scripts/render.ts가
   실제로 받는 --format vertical|horizontal 그대로. 제공자와 무관하게
   항상 보인다(Polly든 ElevenLabs든 포맷 선택은 그대로 유효).

   제공자(PROVIDER, 2026-09-24 추가) — PodcastVoiceSettingsPanel.tsx와
   똑같은 이유·구조(사용자 요청: "가장 우측 부분은... 프로덕션을 위해서
   발행하는 공간으로 정의할게요. 따라서... 폴리 뿐 아니고 일레븐 랩스도
   같이 적용할 수 있도록 해야합니다", "동일한 부분은 동일하게 로직이나
   코드 사용할 수 있도록"). 다만 실제 반영 경로가 다르다 — 팟캐스트는
   Python이 직접 Polly/ElevenLabs를 부르지만, 영상은 이 설정이
   pipelines/common/video_settings.py::get_render_env()를 거쳐 환경변수로
   pipelines/video/src/lib/tts.ts(Node)에 전달되고, 거기서 실제 합성이
   일어난다(render_from_script.py·publish_utils.py::generate_video 둘 다
   그 함수 하나를 공유 — "동일한 부분은 동일하게"). ElevenLabs 성우/모델
   목록은 CMS 실험 패널과 동일한 GET /admin/elevenlabs/options를 쓴다.

   세부 파라미터(STABILITY 등, 2026-09-24 추가) — 사용자 지적: "폴리는
   그대로 옵션이 구성되어있지만... 일레븐랩스는 그렇지 않네요... 동일한
   환경이 되도록 구축해주세요." PodcastVoiceSettingsPanel.tsx와 동일하게
   ElevenLabsAdvancedFields를 공유한다. Polly와 달리 ElevenLabs의 stability/
   similarity_boost/style/speed/use_speaker_boost는 SSML이 아니라
   voice_settings로 직접 API에 실리는 값이라 tts.ts의 SSML 미지원과 무관하게
   실제로 반영된다(get_render_env()가 env var로 넘기고 synthesizeSpeechElevenLabs()가
   그대로 body에 싣는다). */

// 2026-09-25 — export해서 VideoCardGenerator.tsx(중간 실험 카드)도 같이
// 쓴다("동영상 부분도.. 영상 탭에.. 추가되어야하는거 아닌가요? 음성
// 설정만 있어서.. 지금 중간 섹션엔" — 카드에서도 포맷을 바꿔가며
// 테스트 렌더를 걸 수 있어야 한다).
export const FORMATS = [
  { id: "horizontal", label: "가로 — 유튜브·웹 게시용(기본)" },
  { id: "vertical", label: "세로 — 쇼츠·릴스용" },
];
const DEFAULTS: ParsedDoc = {
  provider: "polly",
  voice: "Seoyeon",
  engine: "generative",
  format: "horizontal",
  rate: "100%",
  volume: "+0dB",
  elevenlabsVoice: "",
  elevenlabsModel: "",
  elevenlabsSettings: ELEVENLABS_FALLBACK_VOICE_SETTINGS,
};

const HEADING_RE =
  /^##\s+(PROVIDER|VOICE|ENGINE|FORMAT|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$/;

/** 2026-09-26 — export해서 VideoCardGenerator.tsx("테스트 N" 카드)가
 *  "프로덕션에 적용" 버튼으로 넘길 payload 타입으로도 쓴다(PodcastVoiceSettingsPanel.tsx
 *  ::ParsedDoc과 같은 이유). */
export interface ParsedDoc {
  provider: "polly" | "elevenlabs";
  voice: string;
  engine: string;
  format: string;
  rate: string;
  volume: string;
  elevenlabsVoice: string;
  elevenlabsModel: string;
  elevenlabsSettings: ElevenLabsVoiceSettings;
}

function parseDoc(content: string): ParsedDoc {
  const buckets: Record<string, string[]> = {
    PROVIDER: [], VOICE: [], ENGINE: [], FORMAT: [], RATE: [], VOLUME: [], ELEVENLABS_VOICE: [], ELEVENLABS_MODEL: [],
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
  const formatRaw = buckets.FORMAT.join("\n").trim();
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
    format: FORMATS.some((f) => f.id === formatRaw) ? formatRaw : DEFAULTS.format,
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
    `## FORMAT\n${d.format}\n\n## RATE\n${d.rate}\n\n## VOLUME\n${d.volume}\n\n` +
    `## ELEVENLABS_VOICE\n${d.elevenlabsVoice}\n\n## ELEVENLABS_MODEL\n${d.elevenlabsModel}\n\n` +
    `## ELEVENLABS_STABILITY\n${d.elevenlabsSettings.stability}\n\n` +
    `## ELEVENLABS_SIMILARITY_BOOST\n${d.elevenlabsSettings.similarity_boost}\n\n` +
    `## ELEVENLABS_STYLE\n${d.elevenlabsSettings.style}\n\n` +
    `## ELEVENLABS_SPEED\n${d.elevenlabsSettings.speed}\n\n` +
    `## ELEVENLABS_SPEAKER_BOOST\n${d.elevenlabsSettings.use_speaker_boost}`
  );
}

export interface VideoRenderSettingsPanelHandle {
  publish: () => Promise<void>;
  /** 2026-09-26 — "테스트 N" 카드의 "프로덕션에 적용" 버튼(VideoCardGenerator.tsx)
   *  이 부른다. PodcastVoiceSettingsPanel.tsx::applyFromTest와 동일 원칙 —
   *  값만 채우고 발행은 안 한다. */
  applyFromTest: (data: ParsedDoc) => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
   *  테스트 카드에서 적용할 수 있게": applyFromTest+handlePublish를 한
   *  번에 묶는다 — PodcastVoiceSettingsPanel.tsx::applyAndPublish와 동일
   *  패턴. */
  applyAndPublish: (data: ParsedDoc) => Promise<void>;
}

/* 2026-09-25 — 발행 버튼을 부모(PromptTextLab.tsx)로 옮겼다. 사용자
   지적: "발행 부분 버튼이... 특정 토글안에 있거나 그러면 안될 것
   같고... 레터는 발행 버튼이 없는것도 있는데? ... 4개 탭에 대해서
   발행 버튼이 지금 어디있는지 체크를... 아래에 두도록" — 접이식
   섹션(CollapsibleSection) 안에 있으면 접었을 때 버튼이 사라지는
   문제 + 4개 탭마다 위치가 제각각이던 문제를 한 번에 고친다.
   WebtoonImageSettingsPanel.tsx와 동일한 forwardRef 패턴.

   2026-09-25(후속) — 사용자 지적: "영상 탭 부분은... 음성이랑 동영상
   쪼개야 하는거 아닌가요? ... 토글이 3개가 되어야하는거 아닌가요?
   생성 프롬프트 / 음성 설정 — 성우·속도·음량 이거랑... + 영상 부분도."
   처음엔 한 CollapsibleSection 안에 "음성"/"동영상" 시각적 소제목만
   나눴는데, 실제로는 팟캐스트처럼 완전히 독립된 토글 2개를 원한
   것이었다. 다만 이 문서(video-settings/published)는 여전히 하나라
   발행 버튼·버전·dirty 상태는 계속 하나로 유지해야 해서(따로 쪼개면
   팟캐스트처럼 별도 문서로 나뉘는 셈이라 과한 분리), 컴포넌트 자체가
   내부에서 CollapsibleSection 2개를 그려서 반환하고(state는 여전히
   이 컴포넌트 하나가 소유), 부모가 만든 SettingsPublishBar는
   `publishBar` prop으로 받아 두 번째(영상) 섹션 마지막에 얹는다 —
   "토글 안에.. 발행이랑 버전 부분을 넣어야 한다"는 기존 결정을 그대로
   따르되, 버튼을 그릴 위치만 부모가 계속 정한다(companionDirty/
   publishing/companionServerVersion을 부모가 소유하는 기존 구조 유지).

   2026-09-25(세 번째 후속) — 처음엔 속도·음량이 실제로 반영 안 돼서
   제목을 "음성 설정 — 성우·엔진"으로(사용자가 부른 "성우·속도·음량"을
   그대로 안 씀), 슬라이더 대신 미지원 안내문만 보여줬다. tts.ts에
   <prosody> 지원을 실제로 추가한 뒤로는 팟캐스트와 똑같이 반영되므로
   제목도 사용자가 원래 부른 그대로 "음성 설정 — 성우·속도·음량"으로
   되돌렸다. */
export const VideoRenderSettingsPanel = forwardRef<VideoRenderSettingsPanelHandle, {
  onDirtyChange?: (dirty: boolean) => void;
  /** 2026-09-25 — 이 문서(video-settings/published)의 버전도 부모가
   *  같이 보여준다(PodcastVoiceSettingsPanel.tsx와 동일 패턴). */
  onServerVersionChange?: (version: number | null) => void;
  /** 2026-09-26, 사용자 지적(PodcastVoiceSettingsPanel.tsx와 동일) — "테스트
   *  카드도 마찬가지": 방금 fetch한 defaults를 그대로 올려보낸다. */
  onDefaultsChange?: (defaults: ParsedDoc) => void;
  /** 2026-09-26, 사용자 요청 — "각 카드안에.. 토글들로 위치했는데.. 탭구조로
   *  바꾸는거 어떤가요? ... 동영상은 여기에 동영상 부분 하나 더 붙는거구요":
   *  프로덕션 카드도 테스트 카드와 같은 3단계 탭(생성 프롬프트 → 음성 설정
   *  → 영상 설정)으로 맞추려면, 이 컴포넌트가 그리는 "음성"/"영상" 두
   *  섹션이 서로 다른 탭에 따로 들어가야 한다 — 하지만 상태는 이 컴포넌트
   *  인스턴스 하나에만 있어야 한다(같은 문서를 다루므로 두 인스턴스로
   *  쪼개면 서로 어긋난다). render-prop으로 두 섹션의 JSX만 넘기고, 실제
   *  마운트는 이 컴포넌트가 계속 한 번만 한다 — 안 넘기면(기존 호출부)
   *  예전처럼 자체 CollapsibleSection 2개로 그린다. */
  children?: (sections: { voiceSection: ReactNode; formatSection: ReactNode }) => ReactNode;
}>(function VideoRenderSettingsPanel({ onDirtyChange, onServerVersionChange, onDefaultsChange, children }, ref) {
  const toast = useToast();
  const [provider, setProvider] = useState<"polly" | "elevenlabs">(DEFAULTS.provider);
  const [voice, setVoiceState] = useState(DEFAULTS.voice);
  const [engine, setEngine] = useState(DEFAULTS.engine);
  const [format, setFormat] = useState(DEFAULTS.format);
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

  // 성우를 바꾸면 그 성우가 지원 안 하는 엔진을 고르고 있을 수 있어 항상
  // 그 성우의 첫 번째(가장 권장) 엔진으로 같이 맞춘다(PodcastVoiceSettingsPanel과 동일).
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
      .getPrompt("video-settings", "published")
      .then((r) => {
        const parsed = parseDoc(r.active_content);
        setProvider(parsed.provider);
        setVoiceState(parsed.voice);
        setEngine(parsed.engine);
        setFormat(parsed.format);
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
        // 같은 값을 보여준다(video_settings.py의 _DEFAULT_*와 일치).
        setProvider(DEFAULTS.provider);
        setVoiceState(DEFAULTS.voice);
        setEngine(DEFAULTS.engine);
        setFormat(DEFAULTS.format);
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
  // 패턴(PodcastVoiceSettingsPanel.tsx와 동일 근거).
  useEffect(() => {
    if (provider !== "elevenlabs" || elevenlabsVoice || elevenVoices.length === 0) return;
     
    setElevenlabsVoice(elevenVoices[0].id);
    setElevenlabsModel(elevenModels[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elevenlabsVoice가 채워지면 이 effect가 다시 안 돌아도 되므로 의도적으로 뺌
  }, [provider, elevenVoices]);

  const current: ParsedDoc = { provider, voice, engine, format, rate, volume, elevenlabsVoice, elevenlabsModel, elevenlabsSettings };
  const changed = JSON.stringify(current) !== JSON.stringify(defaults);

  // 2026-09-26(후속) — overrideData가 있으면 changed 체크·확인창 둘 다
  // 건너뛴다(PodcastVoiceSettingsPanel.tsx::handlePublish와 동일 원칙).
  const handlePublish = async (overrideData?: ParsedDoc) => {
    const dataToUse = overrideData ?? current;
    if (publishing) return;
    if (overrideData === undefined) {
      if (!changed) return;
      const confirmMsg =
        provider === "elevenlabs"
          ? "이 설정을 발행하면 다음 실제 영상 생성부터 ElevenLabs로 합성됩니다 — Polly보다 비용이 훨씬 높습니다(2026-08-27에 비용 때문에 Polly로 전환했던 이력 있음). 계속 발행할까요?"
          : "이 설정을 발행하면 다음 실제 영상 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?";
      if (!window.confirm(confirmMsg)) return;
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt("video-settings", "published", buildDoc(dataToUse));
      toast.show(`발행했습니다 — v${r.new_version}부터 다음 생성에 적용됩니다`, "success");
      setProvider(dataToUse.provider);
      setVoiceState(dataToUse.voice);
      setEngine(dataToUse.engine);
      setFormat(dataToUse.format);
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
      setFormat(data.format);
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

  const voiceSection = (
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
    </div>
  );

  const formatSection = (
    <div className="px-3.5 py-3">
      <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">포맷</p>
      <CustomSelect value={format} onChange={setFormat} options={FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
    </div>
  );

  if (children) {
    return <>{children({ voiceSection, formatSection })}</>;
  }

  return (
    <>
      <CollapsibleSection title="음성 설정 — 성우·속도·음량" indent>{voiceSection}</CollapsibleSection>
      <CollapsibleSection title="영상 설정 — 포맷" indent>{formatSection}</CollapsibleSection>
    </>
  );
});
