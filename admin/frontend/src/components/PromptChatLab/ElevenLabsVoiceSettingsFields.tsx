"use client";

/* ElevenLabs 세부 파라미터(stability/similarity_boost/style/speed/
   use_speaker_boost) 슬라이더 — 2026-09-24 신설. 원래 VoicePreviewGenerator.tsx
   (음성 생성 카드)에만 있었는데, 사용자 지적: "우측 사이드바쪽... 프로덕션
   섹션은... 폴리는 그대로 옵션이 구성되어있지만... 일레븐랩스는 그렇지
   않네요... 동일한 환경이 되도록 구축해주세요" — Polly는 발행 설정
   패널(PodcastVoiceSettingsPanel/VideoRenderSettingsPanel)에 성우·엔진·
   속도·음량이 다 있는데 ElevenLabs는 성우·모델뿐이라 대칭이 안 맞았다.
   카드 3곳(음성 생성 카드, 팟캐스트 발행 설정, 영상 발행 설정)이 전부
   이 컴포넌트 하나를 공유하도록 뺐다 — "동일한 부분은 동일하게" 원칙
   (이번 세션에서 반복된 사용자 요청)과도 맞는다.

   모델별로 실제 반영되는 파라미터가 다르다(ElevenLabs 모델 API의
   can_use_style/can_use_speaker_boost 직접 확인, elevenlabs_tts.py 모듈
   주석 참고) — 그 값을 못 쓰는 모델을 고르면 해당 컨트롤을 아예 숨긴다
   (안 먹는 설정을 보여주는 건 사용자를 속이는 것과 같다는 이 세션의
   반복된 원칙). */

export interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

// GET /admin/elevenlabs/options 응답이 오기 전까지 쓰는 폴백 — 백엔드
// elevenlabs_tts.py::DEFAULT_VOICE_SETTINGS/VOICE_SETTINGS_RANGES와 값을
// 맞춰뒀다(ElevenLabs 자체 기본값, GET /v1/voices/{id}/settings로 확인).
export const ELEVENLABS_FALLBACK_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
};
export const ELEVENLABS_FALLBACK_RANGES: Record<"stability" | "similarity_boost" | "style" | "speed", [number, number]> = {
  stability: [0, 1],
  similarity_boost: [0, 1],
  style: [0, 1],
  speed: [0.7, 1.2],
};

export function ElevenLabsAdvancedFields({
  voiceSettings,
  onChange,
  ranges,
  model,
}: {
  voiceSettings: ElevenLabsVoiceSettings;
  onChange: <K extends keyof ElevenLabsVoiceSettings>(key: K, value: ElevenLabsVoiceSettings[K]) => void;
  ranges: typeof ELEVENLABS_FALLBACK_RANGES;
  model: { supports_style: boolean; supports_speaker_boost: boolean } | undefined;
}) {
  const fields = (
    [
      { key: "stability", label: "안정성", hint: "낮음=표현 풍부·불안정 / 높음=단조·일관" },
      { key: "similarity_boost", label: "원본 유사도", hint: "원본 성우 톤에 얼마나 충실할지" },
      ...(model?.supports_style
        ? [{ key: "style", label: "스타일 과장", hint: "감정 표현 과장 정도" } as const]
        : []),
    ] as const
  );

  return (
    <div className="flex flex-col gap-2.5">
      {fields.map(({ key, label, hint }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
            <span className="text-[10.5px] tabular-nums text-[var(--text-faint)]">{voiceSettings[key].toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={ranges[key][0]}
            max={ranges[key][1]}
            step={0.05}
            value={voiceSettings[key]}
            onChange={(e) => onChange(key, parseFloat(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <span className="text-[10px] text-[var(--text-faint)]">{hint}</span>
        </div>
      ))}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">속도</span>
          <span className="text-[10.5px] tabular-nums text-[var(--text-faint)]">{voiceSettings.speed.toFixed(2)}배</span>
        </div>
        <input
          type="range"
          min={ranges.speed[0]}
          max={ranges.speed[1]}
          step={0.05}
          value={voiceSettings.speed}
          onChange={(e) => onChange("speed", parseFloat(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      {model?.supports_speaker_boost && (
        <label className="flex items-center gap-1.5 pb-1">
          <input
            type="checkbox"
            checked={voiceSettings.use_speaker_boost}
            onChange={(e) => onChange("use_speaker_boost", e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          <span className="text-[11px] text-[var(--text-secondary)]">스피커 부스트(원본 성우 특징 강조)</span>
        </label>
      )}
    </div>
  );
}
