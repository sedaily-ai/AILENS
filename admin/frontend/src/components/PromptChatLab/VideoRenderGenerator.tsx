"use client";

import { useEffect, useRef, useState } from "react";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import { adminApi } from "@/lib/adminClient";

type RenderProgress =
  | { stage: "tts"; current: number; total: number }
  | { stage: "bundling" }
  | { stage: "rendering"; percent: number; renderedFrames: number; totalFrames: number; encodedFrames: number };

function progressLabel(p: RenderProgress | null | undefined): string {
  if (!p) return "렌더 준비 중...";
  if (p.stage === "tts") return p.total > 0 ? `음성 합성 중 (${p.current}/${p.total}컷)` : "음성 합성 중...";
  if (p.stage === "bundling") return "렌더 환경 준비 중...";
  return `렌더링 중 (${p.renderedFrames}/${p.totalFrames}프레임)`;
}

function progressPercent(p: RenderProgress | null | undefined): number {
  // TTS·번들링 단계는 정확한 퍼센트가 없어 러프한 자리만 준다 — 렌더링
  // 단계(전체 시간의 대부분)가 진짜 퍼센트를 갖는다.
  if (!p) return 2;
  if (p.stage === "tts") return 5;
  if (p.stage === "bundling") return 10;
  return 15 + Math.round(p.percent * 0.85); // 15%~100% 구간을 렌더링 퍼센트에 배분
}

/* 영상 탭 우측 렌더 패널 — 2026-09-23 신설, 사용자 요청: "동영상도 가능?"
   → "네.. 진행을 해야합니다". PodcastAudioGenerator.tsx와 같은 슬롯-리스트
   골격(왼쪽은 대본 텍스트만, 우측에서 슬롯마다 직접 채워 "생성")이지만,
   완료를 받는 방식이 다르다 — Polly 음성 합성은 몇 초면 끝나 같은 WS
   요청/응답 한 쌍으로 됐지만, Remotion 렌더(Node+헤드리스 크롬+ffmpeg)는
   수십 초~수 분 걸려서 admin Lambda 한 번의 invocation 안에서 못 기다린다.
   그래서 여기는 2단계다: WS로 ECS RunTask만 걸어 job_id를 받고("생성
   시작"), 그다음부터는 HTTP 폴링(routes/video_lab.py)으로 완료를 확인한다.

   소켓 연결은 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   만들어 내려준다 — PodcastAudioGenerator.tsx/WebtoonCutGenerator.tsx와
   동일 패턴(그 컴포넌트들 docstring 참고). */

const POLL_INTERVAL_MS = 5000;
// 2026-09-23 — 8분 → 15분으로 늘렸는데도 실사용에서 또 타임아웃에 걸렸다
// (사용자 리포트: "15분안에 끝나지 않았다고 하네요"). 각본마다(컷 수·
// diagram/chart 밀도) 렌더 시간 편차가 커서 고정 시간 제한 자체가 안
// 맞다 — 사용자 요청대로 아예 없앤다. 이제 진행률(퍼센트)이 실시간으로
// 보이니(progressPercent/progressLabel) "멈춘 것 같으면 직접 삭제"로
// 충분하다 — 조용히 도는 블랙박스가 아니라서 임의 타임아웃이 주는
// 안전판의 의미가 줄었다.

interface SlotState {
  id: string;
  text: string;
  status: "idle" | "starting" | "rendering" | "done" | "error";
  jobId: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
  error: string | null;
  progress: RenderProgress | null;
}

function newSlot(): SlotState {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    status: "idle",
    jobId: null,
    videoUrl: null,
    thumbUrl: null,
    error: null,
    progress: null,
  };
}

export function VideoRenderGenerator({
  wsOpen,
  send,
  subscribe,
}: {
  /** 소켓 연결 자체는 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   *  만들어 내려준다 — PodcastAudioGenerator.tsx와 동일 패턴. */
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
}) {
  const [slots, setSlots] = useState<SlotState[]>(() => [newSlot()]);
  // 슬롯별 폴링 타이머 — 언마운트/재폴링 시 정리해야 한다(setInterval을
  // slot 배열 안에 못 담으니 ref map으로 따로 관리).
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      Object.values(timers).forEach(clearInterval);
    };
  }, []);

  const stopPolling = (slotId: string) => {
    const timer = pollTimers.current[slotId];
    if (timer) {
      clearInterval(timer);
      delete pollTimers.current[slotId];
    }
  };

  const startPolling = (slotId: string, jobId: string) => {
    stopPolling(slotId);
    pollTimers.current[slotId] = setInterval(async () => {
      try {
        const r = await adminApi.pollVideoLab(jobId);
        if (r.status === "done") {
          stopPolling(slotId);
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slotId
                ? { ...s, status: "done", videoUrl: r.video_url ?? null, thumbUrl: r.thumb_url ?? null, error: null }
                : s
            )
          );
        } else if (r.status === "error") {
          stopPolling(slotId);
          setSlots((prev) =>
            prev.map((s) => (s.id === slotId ? { ...s, status: "error", error: r.message ?? "렌더 실패" } : s))
          );
        } else if (r.progress) {
          // "pending" + 진행률 있음 — 상태(status)는 그대로 "rendering", 진행률만 갱신
          setSlots((prev) =>
            prev.map((s) => (s.id === slotId ? { ...s, progress: r.progress as RenderProgress } : s))
          );
        }
      } catch (err) {
        console.error("영상 렌더 상태 확인 실패", err);
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "render_started") {
        const m = msg as unknown as { slot_id: string; job_id: string };
        setSlots((prev) => prev.map((s) => (s.id === m.slot_id ? { ...s, status: "rendering", jobId: m.job_id } : s)));
        startPolling(m.slot_id, m.job_id);
      } else if (msg.type === "render_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        setSlots((prev) => prev.map((s) => (s.id === m.slot_id ? { ...s, status: "error", error: m.message } : s)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSlots/startPolling은 ref·함수형 갱신만 써서 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const updateText = (id: string, text: string) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  };

  const handleGenerate = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (!s || !s.text.trim() || !wsOpen || s.status === "starting" || s.status === "rendering") return;
    const result = send("render_video", { text: s.text, slot_id: id });
    if (!result.sent) {
      const error = result.tooLarge
        ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      setSlots((prev) => prev.map((x) => (x.id === id ? { ...x, status: "error", error } : x)));
      return;
    }
    setSlots((prev) => prev.map((x) => (x.id === id ? { ...x, status: "starting", error: null } : x)));
  };

  const addSlot = () => setSlots((prev) => [...prev, newSlot()]);
  const removeSlot = (id: string) => {
    stopPolling(id);
    setSlots((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ui-divider flex items-center justify-between border-b px-3.5 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">영상 생성</p>
        <button
          type="button"
          onClick={addSlot}
          className="ui-btn ui-btn-ghost rounded-lg px-2.5 py-1 text-[11px] font-semibold"
        >
          + 추가
        </button>
      </div>
      <p className="px-3.5 pt-2.5 text-[10.5px] leading-relaxed text-[var(--text-faint)]">
        Remotion 실제 렌더라 보통 5~8분, 각본에 따라 더 걸릴 수 있습니다 — 시간 제한 없이 끝까지 기다립니다. 진행률이 한참 안 움직이면 오른쪽 위 × 로 지우고 다시 시도해 주세요. 각본 자체에 문제가 있으면(JSON 형식 오류·수치 누락 등) 곧바로 실패로 표시됩니다.
      </p>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {slots.map((s, i) => (
          <div key={s.id} className="ui-card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">영상 {i + 1}</span>
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(s.id)}
                  className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                  aria-label="삭제"
                  title="삭제"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <textarea
              value={s.text}
              onChange={(e) => updateText(s.id, e.target.value)}
              placeholder="왼쪽 각본(JSON)을 복사해 붙여넣으세요"
              rows={4}
              className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
            />
            <button
              type="button"
              onClick={() => handleGenerate(s.id)}
              disabled={!s.text.trim() || !wsOpen || s.status === "starting" || s.status === "rendering"}
              className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            >
              {s.status === "starting" ? "렌더 시작 중..." : s.status === "rendering" ? "렌더 중..." : "생성"}
            </button>
            {s.status === "rendering" && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                    style={{ width: `${progressPercent(s.progress)}%` }}
                  />
                </div>
                <p className="text-[10.5px] text-[var(--text-faint)]">{progressLabel(s.progress)}</p>
              </div>
            )}
            {s.status === "done" && s.videoUrl && (
              <video controls preload="none" poster={s.thumbUrl ?? undefined} src={s.videoUrl} className="w-full rounded-lg" />
            )}
            {s.status === "error" && s.error && <p className="text-[11px] text-[var(--danger)]">{s.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
