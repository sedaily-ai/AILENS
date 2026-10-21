"use client";

import type { ReactNode } from "react";
import { CustomSelect } from "@/components/CustomSelect";
import { CollapsibleSection } from "./CollapsibleSection";
import { VoiceSelectWithPreview } from "./VoiceSelectWithPreview";
import {
  ElevenLabsAdvancedFields,
  ELEVENLABS_FALLBACK_RANGES,
  type ElevenLabsVoiceSettings,
} from "./ElevenLabsVoiceSettingsFields";
import { PollyAdvancedFields, LENS_POLLY_PROFILE, type PollyVoiceProfile } from "./PollyVoiceSettingsFields";
import { GOOGLE_VOICES } from "./googleVoices";

export type VoiceProvider = "polly" | "elevenlabs" | "google";
const PROVIDER_LABEL: Record<VoiceProvider, string> = { polly: "Polly", elevenlabs: "ElevenLabs", google: "Google" };

/* 제공자(Polly/ElevenLabs) 선택 + 성우/엔진(모델) + 세부 설정 — 4곳
   (VoicePreviewGenerator 실험 카드, VideoCardGenerator 실험 카드,
   PodcastVoiceSettingsPanel 발행 설정, VideoRenderSettingsPanel 발행 설정)
   에 토씨 하나까지 똑같은 JSX가 복붙돼 있던 걸 2026-09-25 여기로 뺐다.
   사용자 지적 3단계로 이어진 결과:
   1) "일래븐랩스랑 폴리... 세부설정이나 워딩 통일해주세요.. 게이지
      방식도... 일래븐랩스 구조랑 디자인으로 맞춰주시죠" → Polly 속도·음량을
      드롭다운에서 슬라이더로(PollyAdvancedFields), Polly 성우·엔진을
      "세부 설정" 토글 밖(ElevenLabs 성우·모델과 같은 자리)으로.
   2) "폴리쪽 성우도... 드롭다운만들어야하고요.. 중간 섹션이나.. 우측
      섹션이나.. 해당되는것 탭들 전부" → Polly 성우 버튼 목록을
      CustomSelect 드롭다운으로.
   3) "음성 세부설정도.. 동일하게 맞춤? 중간이랑. 우측쓰면 되는거
      아니낙요?" → 위 두 수정을 4곳에 각각 복붙해 맞추다 보니 "세부
      설정" 타이틀에 붙는 설명 문구(예: "— 안정성·속도 등")가 파일마다
      미묘하게 갈라졌던 걸 보고, 애초에 컴포넌트 하나를 공유하면 이런
      드리프트 자체가 안 생긴다는 지적 — 그래서 JSX 자체를 이 파일
      하나로 합쳤다(값을 저장하는 방식은 여전히 다르다: 이 컴포넌트는
      state를 안 들고 controlled value+onChange만 받는다 — 실험 카드는
      "저장 안 되는 카드 한정 값", 발행 설정 패널은 서버에 저장되는 값,
      둘의 생명주기가 다르다는 원칙은 그대로 유지).

   `compact`가 두 컨텍스트의 유일한 시각적 차이를 결정한다 — 실험 카드는
   여러 슬롯이 세로로 쌓이는 좁은 카드라 라벨을 작게(10.5px, span,
   flex-col gap-1), 발행 설정 패널은 사이드바의 주 컨텐츠라 라벨을 조금
   크게(11px, p, mb-1.5) 쓴다. 이 밀도 차이는 의도된 것 — 통일해야 할
   대상은 "워딩"과 "컨트롤 종류"였지, 카드/패널 밀도까지 맞추라는 지적은
   아니었다. */

// P — 호출부가 쓰는 제공자 타입. 팟캐스트는 "polly" | "elevenlabs" 그대로, 영상·PRISM은 Google까지.
export interface VoiceProviderFieldsProps<P extends VoiceProvider = VoiceProvider> {
  compact?: boolean;
  provider: P;
  onProviderChange: (provider: P) => void;
  /** 보여 줄 제공자 버튼(2026-10-22). 기본은 팟캐스트처럼 Polly/ElevenLabs, 영상·PRISM 탭은 VIDEO_PROVIDERS(Polly/Google). */
  providers?: readonly P[];
  /** Google 성우 — provider가 "google"일 때만 쓰인다. */
  googleVoice?: string;
  onGoogleVoiceChange?: (voice: string) => void;

  pollyVoice: string;
  pollyEngine: string;
  onPollyVoiceChange: (voice: string) => void;
  onPollyEngineChange: (engine: string) => void;
  /** 속도·음량 — 영상 탭처럼 SSML 미지원이면 통째로 생략(그 경우 "세부
   *  설정" 토글 자체가 안 그려진다). */
  pollyAdvanced?: {
    rate: string;
    volume: string;
    onRateChange: (rate: string) => void;
    onVolumeChange: (volume: string) => void;
  };
  /** Polly 엔진 아래에 붙는 안내 문구(예: 영상 탭의 속도·음량 미지원 고지). */
  pollyNote?: ReactNode;
  /** Polly 성우 목록 — 기본은 LENS(한국어). PRISM 탭은 PRISM_POLLY_PROFILE(영어). */
  pollyProfile?: PollyVoiceProfile;

  elevenVoiceId: string;
  elevenModelId: string;
  onElevenVoiceChange: (voiceId: string) => void;
  onElevenModelChange: (modelId: string) => void;
  elevenVoices: { id: string; label: string; sample_url: string }[];
  elevenModels: { id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[];
  elevenVoiceSettings: ElevenLabsVoiceSettings;
  onElevenVoiceSettingChange: <K extends keyof ElevenLabsVoiceSettings>(key: K, value: ElevenLabsVoiceSettings[K]) => void;
  elevenRanges: typeof ELEVENLABS_FALLBACK_RANGES;
}

const DEFAULT_PROVIDERS = ["polly", "elevenlabs"] as const;

export function VoiceProviderFields<P extends VoiceProvider = VoiceProvider>({
  compact = false,
  provider,
  onProviderChange,
  providers = DEFAULT_PROVIDERS as unknown as readonly P[],
  googleVoice = "",
  onGoogleVoiceChange,
  pollyVoice,
  pollyEngine,
  onPollyVoiceChange,
  onPollyEngineChange,
  pollyAdvanced,
  pollyNote,
  pollyProfile = LENS_POLLY_PROFILE,
  elevenVoiceId,
  elevenModelId,
  onElevenVoiceChange,
  onElevenModelChange,
  elevenVoices,
  elevenModels,
  elevenVoiceSettings,
  onElevenVoiceSettingChange,
  elevenRanges,
}: VoiceProviderFieldsProps<P>) {
  const labelClass = compact
    ? "text-[10.5px] font-medium text-[var(--text-faint)]"
    : "mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]";
  const Label = compact ? "span" : "p";
  const fieldWrapClass = compact ? "flex flex-col gap-1" : "";

  const advancedContent = (
    <>
      {provider === "elevenlabs" && (
        <ElevenLabsAdvancedFields
          voiceSettings={elevenVoiceSettings}
          onChange={onElevenVoiceSettingChange}
          ranges={elevenRanges}
          model={elevenModels.find((m) => m.id === elevenModelId)}
        />
      )}
      {provider === "polly" && pollyAdvanced && (
        <PollyAdvancedFields
          rate={pollyAdvanced.rate}
          volume={pollyAdvanced.volume}
          onRateChange={pollyAdvanced.onRateChange}
          onVolumeChange={pollyAdvanced.onVolumeChange}
        />
      )}
    </>
  );
  const showAdvanced = provider === "elevenlabs" || (provider === "polly" && !!pollyAdvanced);

  return (
    <>
      <div className={fieldWrapClass}>
        <Label className={labelClass}>제공자</Label>
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-hairline)" }}>
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onProviderChange(p)}
              className={`flex-1 font-medium transition-colors ${compact ? "px-2 py-1.5 text-[11.5px]" : "px-2.5 py-1.5 text-[12px]"}`}
              style={
                provider === p
                  ? { background: "var(--accent-soft)", color: "var(--accent)" }
                  : { color: "var(--text-muted)" }
              }
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {provider === "polly" ? (
        <>
          <div className={fieldWrapClass}>
            <Label className={labelClass}>성우</Label>
            <CustomSelect value={pollyVoice} onChange={onPollyVoiceChange} options={pollyProfile.voices.map((v) => ({ value: v.id, label: v.label }))} />
          </div>
          <div className={fieldWrapClass}>
            <Label className={labelClass}>엔진</Label>
            <CustomSelect
              value={pollyEngine}
              onChange={onPollyEngineChange}
              options={(pollyProfile.engines[pollyVoice] ?? pollyProfile.engines[pollyProfile.defaultVoice]).map((e) => ({ value: e.id, label: e.label }))}
            />
          </div>
          {pollyNote}
        </>
      ) : provider === "google" ? (
        <div className={fieldWrapClass}>
          <Label className={labelClass}>성우</Label>
          <CustomSelect
            value={googleVoice}
            onChange={(v) => onGoogleVoiceChange?.(v)}
            options={GOOGLE_VOICES.map((v) => ({ value: v.id, label: v.label }))}
          />
          <span className="mt-1 block text-[10px] text-[var(--text-faint)]">같은 성우가 대본 언어(영어·한국어)대로 읽습니다.</span>
        </div>
      ) : (
        <>
          <div className={fieldWrapClass}>
            <Label className={labelClass}>성우</Label>
            <VoiceSelectWithPreview value={elevenVoiceId} onChange={onElevenVoiceChange} voices={elevenVoices} />
          </div>
          <div className={fieldWrapClass}>
            <Label className={labelClass}>모델</Label>
            <CustomSelect
              value={elevenModelId}
              onChange={onElevenModelChange}
              options={elevenModels.map((m) => ({ value: m.id, label: m.label }))}
              placeholder="모델 불러오는 중..."
            />
          </div>
        </>
      )}

      {showAdvanced &&
        (compact ? (
          <div className="rounded-lg" style={{ background: "var(--surface-sunken)" }}>
            <CollapsibleSection title="세부 설정">
              <div className="px-3.5 pt-1 pb-1">{advancedContent}</div>
            </CollapsibleSection>
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">세부 설정</p>
            {advancedContent}
          </div>
        ))}
    </>
  );
}
