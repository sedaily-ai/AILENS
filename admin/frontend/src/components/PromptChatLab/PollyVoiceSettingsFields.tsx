"use client";

/* Polly 속도·음량 게이지 — 2026-09-25 신설. 사용자 지적: "일래븐랩스랑
   폴리... 세부설정이나 워딩 통일해주세요.. 게이지 방식도... 지금 서로
   달라서... 일래븐랩스 구조랑 디자인으로 맞춰주시죠." 그전까지 속도/음량은
   CustomSelect 드롭다운(5개 고정값)이었는데, ElevenLabsAdvancedFields
   (ElevenLabsVoiceSettingsFields.tsx)는 같은 성격의 파라미터(속도 포함)를
   슬라이더+실시간 수치로 보여줘서 같은 화면 안에 제공자만 바꿔도 컨트롤
   방식이 통째로 달라 보였다. 값 자체(80~120%, ±6dB, 5단계)는 그대로 두고
   —AWS Polly SSML이 받는 값이 이 5개뿐이라 바뀔 이유가 없다— 입력
   컨트롤만 ElevenLabsAdvancedFields와 동일한 슬라이더 패턴(라벨+우측
   실시간 값, range input, 아래 힌트 한 줄)으로 맞춘다. 3곳(VoicePreviewGenerator
   실험 카드, PodcastVoiceSettingsPanel 발행 설정)이 이 컴포넌트 하나를
   공유 — VideoRenderSettingsPanel은 속도·음량 자체가 미지원이라 대상 아님. */

export const POLLY_RATES = ["80%", "90%", "100%", "110%", "120%"];
export const POLLY_VOLUMES = ["-6dB", "-3dB", "+0dB", "+3dB", "+6dB"];

/* 2026-09-25 — 성우·엔진 조합표도 4개 파일(VoicePreviewGenerator/
   VideoCardGenerator/PodcastVoiceSettingsPanel/VideoRenderSettingsPanel)에
   토씨 하나까지 똑같이 복붙돼 있었다 — 여기 하나로 모아 이중관리를
   없앤다. pipelines/common/podcast_voice.py의 _VOICE_ENGINE_OPTIONS와
   반드시 같은 값이어야 한다(프론트가 백엔드 상수를 직접 import할 방법이
   없어 이중관리, 값 바뀌면 그 파일도 같이 고칠 것). */
export const POLLY_VOICES = [
  { id: "Seoyeon", label: "서연" },
  { id: "Jihye", label: "지혜" },
] as const;
export const POLLY_VOICE_ENGINE_OPTIONS: Record<string, { id: string; label: string }[]> = {
  Seoyeon: [
    { id: "generative", label: "생성형 — 가장 자연스러움(기본)" },
    { id: "neural", label: "뉴럴" },
    { id: "standard", label: "스탠다드 — 가장 저렴, 기계적인 톤" },
  ],
  Jihye: [{ id: "neural", label: "뉴럴(지혜가 지원하는 유일한 엔진)" }],
};

function rateToNum(rate: string): number {
  const n = parseInt(rate, 10);
  return POLLY_RATES.includes(rate) ? n : 100;
}
function volumeToNum(volume: string): number {
  const n = parseInt(volume, 10);
  return POLLY_VOLUMES.includes(volume) ? n : 0;
}

export function PollyAdvancedFields({
  rate,
  volume,
  onRateChange,
  onVolumeChange,
}: {
  rate: string;
  volume: string;
  onRateChange: (rate: string) => void;
  onVolumeChange: (volume: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">속도</span>
          <span className="text-[10.5px] tabular-nums text-[var(--text-faint)]">{rate}</span>
        </div>
        <input
          type="range"
          min={80}
          max={120}
          step={10}
          value={rateToNum(rate)}
          onChange={(e) => onRateChange(`${e.target.value}%`)}
          className="w-full accent-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-faint)]">낮음=느리게 / 높음=빠르게</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">음량</span>
          <span className="text-[10.5px] tabular-nums text-[var(--text-faint)]">{volume}</span>
        </div>
        <input
          type="range"
          min={-6}
          max={6}
          step={3}
          value={volumeToNum(volume)}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onVolumeChange(`${n >= 0 ? "+" : ""}${n}dB`);
          }}
          className="w-full accent-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-faint)]">낮음=작게 / 높음=크게</span>
      </div>
    </div>
  );
}
