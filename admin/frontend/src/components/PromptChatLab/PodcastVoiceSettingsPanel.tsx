"use client";

import { useEffect, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { CustomSelect } from "@/components/CustomSelect";

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
   (generative·neural 둘 다 SSML로 pitch 조절 미지원, AWS 문서 확인). */

const VOICE_ENGINE_OPTIONS: Record<string, { id: string; label: string }[]> = {
  Seoyeon: [
    { id: "generative", label: "생성형 — 가장 자연스러움(기본)" },
    { id: "neural", label: "뉴럴" },
    { id: "standard", label: "스탠다드 — 가장 저렴, 기계적인 톤" },
  ],
  Jihye: [{ id: "neural", label: "뉴럴(지혜가 지원하는 유일한 엔진)" }],
};
const VOICES = [
  { id: "Seoyeon", label: "서연" },
  { id: "Jihye", label: "지혜" },
] as const;
const RATES = ["80%", "90%", "100%", "110%", "120%"];
const VOLUMES = ["-6dB", "-3dB", "+0dB", "+3dB", "+6dB"];
const DEFAULTS = { voice: "Seoyeon", engine: "generative", rate: "100%", volume: "+0dB" };

const HEADING_RE = /^##\s+(VOICE|ENGINE|RATE|VOLUME)\s*$/;

function parseDoc(content: string): { voice: string; engine: string; rate: string; volume: string } {
  const buckets: Record<string, string[]> = { VOICE: [], ENGINE: [], RATE: [], VOLUME: [] };
  let current: string | null = null;
  for (const line of content.split("\n")) {
    const m = HEADING_RE.exec(line.trim());
    if (m) {
      current = m[1];
      continue;
    }
    if (current) buckets[current].push(line);
  }
  const voiceRaw = buckets.VOICE.join("\n").trim();
  const engineRaw = buckets.ENGINE.join("\n").trim();
  const rate = buckets.RATE.join("\n").trim();
  const volume = buckets.VOLUME.join("\n").trim();
  const voice = voiceRaw in VOICE_ENGINE_OPTIONS ? voiceRaw : DEFAULTS.voice;
  const validEngines = VOICE_ENGINE_OPTIONS[voice].map((e) => e.id);
  return {
    voice,
    engine: validEngines.includes(engineRaw) ? engineRaw : validEngines[0],
    rate: RATES.includes(rate) ? rate : DEFAULTS.rate,
    volume: VOLUMES.includes(volume) ? volume : DEFAULTS.volume,
  };
}

function buildDoc(voice: string, engine: string, rate: string, volume: string): string {
  return `## VOICE\n${voice}\n\n## ENGINE\n${engine}\n\n## RATE\n${rate}\n\n## VOLUME\n${volume}`;
}

export function PodcastVoiceSettingsPanel() {
  const toast = useToast();
  const [voice, setVoiceState] = useState(DEFAULTS.voice);
  const [engine, setEngine] = useState(DEFAULTS.engine);
  const [rate, setRate] = useState(DEFAULTS.rate);
  const [volume, setVolume] = useState(DEFAULTS.volume);
  const [defaults, setDefaults] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // 성우를 바꾸면 그 성우가 지원 안 하는 엔진을 고르고 있을 수 있어(예:
  // 서연/standard였다가 지혜로 바꿈 — 지혜는 standard 미지원) 항상 그
  // 성우의 첫 번째(가장 권장) 엔진으로 같이 맞춘다.
  const setVoice = (next: string) => {
    setVoiceState(next);
    setEngine(VOICE_ENGINE_OPTIONS[next][0].id);
  };

  useEffect(() => {
    adminApi
      .getPrompt("podcast-voice", "published")
      .then((r) => {
        const parsed = parseDoc(r.active_content);
        setVoiceState(parsed.voice);
        setEngine(parsed.engine);
        setRate(parsed.rate);
        setVolume(parsed.volume);
        setDefaults(parsed);
      })
      .catch(() => {
        // 아직 한 번도 발행 안 된 상태(문서 없음) — 파이프라인 기본값과
        // 같은 값을 보여준다(podcast_voice.py의 _DEFAULT_*와 일치).
        setVoiceState(DEFAULTS.voice);
        setEngine(DEFAULTS.engine);
        setRate(DEFAULTS.rate);
        setVolume(DEFAULTS.volume);
        setDefaults(DEFAULTS);
      })
      .finally(() => setLoading(false));
  }, []);

  const changed =
    voice !== defaults.voice || engine !== defaults.engine || rate !== defaults.rate || volume !== defaults.volume;

  const handlePublish = async () => {
    if (publishing || !changed) return;
    if (
      !window.confirm("이 설정을 발행하면 다음 실제 팟캐스트 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?")
    ) {
      return;
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt("podcast-voice", "published", buildDoc(voice, engine, rate, volume));
      toast.show(`발행했습니다 — v${r.new_version}부터 다음 생성에 적용됩니다`, "success");
      setDefaults({ voice, engine, rate, volume });
    } catch (err) {
      toast.show(`발행 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <p className="px-3.5 py-3 text-[11px] text-[var(--text-faint)]">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">성우</p>
        <div className="space-y-1.5">
          {VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVoice(v.id)}
              className="block w-full rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-[var(--surface-sunken)]"
              style={
                voice === v.id
                  ? { background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)", fontWeight: 600 }
                  : { color: "var(--text-secondary)" }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">엔진</p>
        <CustomSelect
          value={engine}
          onChange={setEngine}
          options={VOICE_ENGINE_OPTIONS[voice].map((e) => ({ value: e.id, label: e.label }))}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">속도</p>
        <CustomSelect value={rate} onChange={setRate} options={RATES.map((r) => ({ value: r, label: r }))} />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">음량</p>
        <CustomSelect value={volume} onChange={setVolume} options={VOLUMES.map((v) => ({ value: v, label: v }))} />
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
        속도·음량은 SSML로 조절되지만, 음높이(pitch)는 Polly 생성형·뉴럴 엔진이 지원하지 않습니다.
      </p>

      <button
        type="button"
        onClick={handlePublish}
        disabled={publishing || !changed}
        className="ui-btn ui-btn-primary w-full rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {publishing ? "발행 중..." : "발행"}
      </button>
      {!changed && <p className="text-center text-[10.5px] text-[var(--text-faint)]">현재 발행된 값과 같습니다</p>}
    </div>
  );
}
