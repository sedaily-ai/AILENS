"use client";

import { useEffect, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { CustomSelect } from "@/components/CustomSelect";

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
   참고). 속도·음량은 일부러 안 넣었다 — video/src/lib/tts.ts는 podcast와
   달리 SSML <prosody>를 안 써서 지금 코드로는 반영이 안 된다(반영 안
   되는 설정을 보여주는 건 사용자를 속이는 것과 같다).

   포맷(가로/세로)은 영상 전용 설정 — pipelines/video/scripts/render.ts가
   실제로 받는 --format vertical|horizontal 그대로. */

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
const FORMATS = [
  { id: "horizontal", label: "가로 — 유튜브·웹 게시용(기본)" },
  { id: "vertical", label: "세로 — 쇼츠·릴스용" },
];
const DEFAULTS = { voice: "Seoyeon", engine: "generative", format: "horizontal" };

const HEADING_RE = /^##\s+(VOICE|ENGINE|FORMAT)\s*$/;

function parseDoc(content: string): { voice: string; engine: string; format: string } {
  const buckets: Record<string, string[]> = { VOICE: [], ENGINE: [], FORMAT: [] };
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
  const formatRaw = buckets.FORMAT.join("\n").trim();
  const voice = voiceRaw in VOICE_ENGINE_OPTIONS ? voiceRaw : DEFAULTS.voice;
  const validEngines = VOICE_ENGINE_OPTIONS[voice].map((e) => e.id);
  return {
    voice,
    engine: validEngines.includes(engineRaw) ? engineRaw : validEngines[0],
    format: FORMATS.some((f) => f.id === formatRaw) ? formatRaw : DEFAULTS.format,
  };
}

function buildDoc(voice: string, engine: string, format: string): string {
  return `## VOICE\n${voice}\n\n## ENGINE\n${engine}\n\n## FORMAT\n${format}`;
}

export function VideoRenderSettingsPanel() {
  const toast = useToast();
  const [voice, setVoiceState] = useState(DEFAULTS.voice);
  const [engine, setEngine] = useState(DEFAULTS.engine);
  const [format, setFormat] = useState(DEFAULTS.format);
  const [defaults, setDefaults] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // 성우를 바꾸면 그 성우가 지원 안 하는 엔진을 고르고 있을 수 있어 항상
  // 그 성우의 첫 번째(가장 권장) 엔진으로 같이 맞춘다(PodcastVoiceSettingsPanel과 동일).
  const setVoice = (next: string) => {
    setVoiceState(next);
    setEngine(VOICE_ENGINE_OPTIONS[next][0].id);
  };

  useEffect(() => {
    adminApi
      .getPrompt("video-settings", "published")
      .then((r) => {
        const parsed = parseDoc(r.active_content);
        setVoiceState(parsed.voice);
        setEngine(parsed.engine);
        setFormat(parsed.format);
        setDefaults(parsed);
      })
      .catch(() => {
        // 아직 한 번도 발행 안 된 상태(문서 없음) — 파이프라인 기본값과
        // 같은 값을 보여준다(video_settings.py의 _DEFAULT_*와 일치).
        setVoiceState(DEFAULTS.voice);
        setEngine(DEFAULTS.engine);
        setFormat(DEFAULTS.format);
        setDefaults(DEFAULTS);
      })
      .finally(() => setLoading(false));
  }, []);

  const changed = voice !== defaults.voice || engine !== defaults.engine || format !== defaults.format;

  const handlePublish = async () => {
    if (publishing || !changed) return;
    if (
      !window.confirm("이 설정을 발행하면 다음 실제 영상 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?")
    ) {
      return;
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt("video-settings", "published", buildDoc(voice, engine, format));
      toast.show(`발행했습니다 — v${r.new_version}부터 다음 생성에 적용됩니다`, "success");
      setDefaults({ voice, engine, format });
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
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-muted)]">포맷</p>
        <CustomSelect value={format} onChange={setFormat} options={FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
        속도·음량 조절은 아직 지원하지 않습니다(영상 음성 합성이 SSML을 쓰지 않아 실제로 반영되지 않습니다).
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
