"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useAdminChatSocket, type WsPushBase } from "@/lib/useAdminChatSocket";
import { useToast } from "@/components/Toast";

/* 영상 다시 만들기 — 발행된 lens 글 하나의 영상만 사람이 프롬프트로 다시 만들어 교체한다.
   백엔드: admin/backend/routes/video_remake.py (+ chat_ws.py의 remake_load·remake_script·
   render_video·remake_apply). 수작업 프롬프트는 별도 이름(video-remake/published)이라
   여기서 저장해도 자동 발행 영상 프롬프트(video/published)는 바뀌지 않는다.

   WebSocket은 이 창이 열려 있을 때만 연결한다(useAdminChatSocket — PromptLab 패널의 연결과
   별개). 프롬프트·원문은 프레임 한도(32KB) 때문에 소켓에 싣지 않고 서버가 읽는다 — 프롬프트는
   "저장"(HTTP)을 먼저 해야 각본 생성에 쓰이고, 원문은 화면에서 고쳤을 때만 보낸다. */

const REMAKE_CATEGORY = "video-remake";
const REMAKE_NAME = "published";
const POLL_MS = 5000;

type Loaded = {
  headline: string;
  source_url: string;
  article: string;
  article_note: string | null;
  photo_url: string | null;
  photo_credit: string | null;
  current_video_url: string | null;
  current_thumbnail_url: string | null;
  prompt: string;
  prompt_saved: boolean;
};

type RenderState =
  | { kind: "idle" }
  | { kind: "running"; jobId?: string; progress?: string }
  | { kind: "done"; jobId: string; videoUrl: string }
  | { kind: "error"; message: string };

export function VideoRemakePanel({ postId, onClose, onApplied }: { postId: string; onClose: () => void; onApplied: () => void }) {
  const toast = useToast();
  const { wsOpen, send, subscribe } = useAdminChatSocket();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [article, setArticle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [script, setScript] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [render, setRender] = useState<RenderState>({ kind: "idle" });
  const [applying, setApplying] = useState(false);
  const loadRequested = useRef(false);
  const scriptBuf = useRef("");

  const onMessage = useCallback(
    (msg: WsPushBase) => {
      switch (msg.type) {
        case "remake_loaded": {
          const l = msg as unknown as Loaded;
          setLoaded(l);
          setArticle(l.article);
          setPrompt(l.prompt);
          setPromptDirty(!l.prompt_saved);
          break;
        }
        case "text_chunk":
          scriptBuf.current += String(msg.text ?? "");
          setScript(scriptBuf.current);
          break;
        case "text_done":
          setScriptBusy(false);
          break;
        case "render_started":
          if (msg.slot_id === "remake") setRender({ kind: "running", jobId: String(msg.job_id) });
          break;
        case "render_error":
          if (msg.slot_id === "remake") setRender({ kind: "error", message: String(msg.message ?? "렌더 실패") });
          break;
        case "remake_applied":
          setApplying(false);
          toast.show("영상을 교체했습니다. 사이트에 곧 반영됩니다.", "success");
          onApplied();
          break;
        case "remake_error":
        case "error":
          setScriptBusy(false);
          setApplying(false);
          toast.show(String(msg.message ?? "오류가 발생했습니다"), "error");
          break;
      }
    },
    [toast, onApplied]
  );

  useEffect(() => subscribe(onMessage), [subscribe, onMessage]);

  // 연결되면 한 번만 글·원문·프롬프트를 불러온다.
  useEffect(() => {
    if (!wsOpen || loadRequested.current) return;
    loadRequested.current = true;
    send("remake_load", { post_id: postId });
  }, [wsOpen, send, postId]);

  // 렌더 결과 폴링(영상 탭과 같은 GET /admin/video-lab/{job_id}).
  const jobId = render.kind === "running" ? render.jobId : undefined;
  useEffect(() => {
    if (!jobId) return;
    const timer = setInterval(async () => {
      try {
        const r = await adminApi.pollVideoLab(jobId);
        if (r.status === "done" && r.video_url) setRender({ kind: "done", jobId, videoUrl: r.video_url });
        else if (r.status === "error") setRender({ kind: "error", message: r.message ?? "렌더 실패" });
        else if (r.progress) {
          const p = r.progress;
          const text = p.stage === "tts" ? `음성 합성 ${p.current}/${p.total}` : p.stage === "bundling" ? "준비 중" : `렌더 ${p.percent}%`;
          setRender({ kind: "running", jobId, progress: text });
        }
      } catch {
        // 일시 오류는 다음 폴링에서 다시 본다
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId]);

  const savePrompt = async () => {
    setSavingPrompt(true);
    try {
      await adminApi.updatePrompt(REMAKE_CATEGORY, REMAKE_NAME, prompt);
      setPromptDirty(false);
      toast.show("수작업 프롬프트를 저장했습니다 (자동 발행 프롬프트는 그대로입니다)", "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setSavingPrompt(false);
    }
  };

  const generateScript = () => {
    if (promptDirty) {
      toast.show("프롬프트를 먼저 저장해 주세요", "error");
      return;
    }
    const edited = loaded && article.trim() !== loaded.article.trim();
    scriptBuf.current = "";
    setScript("");
    setScriptBusy(true);
    const r = send("remake_script", { post_id: postId, ...(edited ? { article } : {}) });
    if (!r.sent) {
      setScriptBusy(false);
      toast.show(r.tooLarge ? "원문이 너무 깁니다 — 줄여서 다시 시도해 주세요" : "연결이 끊겼습니다. 잠시 후 다시 시도해 주세요", "error");
    }
  };

  const startRender = () => {
    if (!script.trim()) return;
    setRender({ kind: "running" });
    const r = send("render_video", {
      text: script,
      slot_id: "remake",
      photo_url: loaded?.photo_url ?? undefined,
      photo_credit: loaded?.photo_credit ?? undefined,
    });
    if (!r.sent) setRender({ kind: "error", message: r.tooLarge ? "각본이 너무 깁니다" : "연결이 끊겼습니다" });
  };

  const apply = () => {
    if (render.kind !== "done") return;
    if (!window.confirm("이 글의 영상을 새 영상으로 바꿀까요? 사이트에 바로 반영됩니다.")) return;
    setApplying(true);
    const r = send("remake_apply", { post_id: postId, job_id: render.jobId, text: script });
    if (!r.sent) {
      setApplying(false);
      toast.show("연결이 끊겼습니다. 잠시 후 다시 시도해 주세요", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="영상 다시 만들기">
      <div className="ui-card-strong w-full max-w-5xl rounded-2xl p-6 space-y-6 my-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">영상 다시 만들기</h2>
            <p className="mt-1 text-sm text-gray-600">{loaded?.headline || "불러오는 중…"}</p>
            <p className="mt-1 text-xs text-gray-500">이 글의 영상만 바뀝니다. 자동 발행 영상과 다른 포맷(레터·웹툰·팟캐스트)은 그대로입니다.</p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">
            닫기
          </button>
        </div>

        {!loaded ? (
          <div className="ui-spinner w-5 h-5" />
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">① 원문</h3>
              {loaded.article_note && <p className="text-xs text-amber-700">{loaded.article_note}</p>}
              <textarea value={article} onChange={(e) => setArticle(e.target.value)} rows={6} className="ui-input w-full rounded-lg p-3 text-sm" />
              {loaded.photo_url && <p className="text-xs text-gray-500">원문 사진: 사진 컷이 있으면 이 사진을 씁니다 ({loaded.photo_credit || "출처 없음"})</p>}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">② 수작업 프롬프트 {promptDirty && <span className="text-xs font-normal text-amber-700">· 저장 안 됨</span>}</h3>
                <button type="button" disabled={savingPrompt || !promptDirty} onClick={savePrompt} className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold">
                  프롬프트 저장
                </button>
              </div>
              <p className="text-xs text-gray-500">
                내용·디자인·길이를 여기서 바꿉니다. 맨 아래 &quot;디자인 지정&quot; 안내대로 쓰면 종이 질감 등 디자인을 고를 수 있습니다. 자동 발행 프롬프트와 따로 저장됩니다.
              </p>
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPromptDirty(true);
                }}
                rows={12}
                className="ui-input w-full rounded-lg p-3 font-mono text-xs"
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">③ 각본</h3>
                <button type="button" disabled={scriptBusy || !wsOpen} onClick={generateScript} className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold">
                  {scriptBusy ? "생성 중…" : "각본 생성"}
                </button>
              </div>
              <p className="text-xs text-gray-500">생성된 각본을 직접 고쳐도 됩니다. 렌더는 각본 안의 렌더용 JSON을 씁니다.</p>
              <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={12} className="ui-input w-full rounded-lg p-3 font-mono text-xs" />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">④ 렌더·미리보기</h3>
                <button
                  type="button"
                  disabled={!script.trim() || scriptBusy || render.kind === "running" || !wsOpen}
                  onClick={startRender}
                  className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold"
                >
                  {render.kind === "running" ? `렌더 중… ${render.progress ?? ""}` : "렌더"}
                </button>
              </div>
              {render.kind === "error" && <p className="text-sm text-red-600 whitespace-pre-wrap">{render.message}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-gray-500">지금 영상</p>
                  {loaded.current_video_url ? (
                    <video controls src={loaded.current_video_url} poster={loaded.current_thumbnail_url ?? undefined} className="w-full rounded-lg bg-black" />
                  ) : (
                    <p className="text-sm text-gray-400">없음</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs text-gray-500">새 영상</p>
                  {render.kind === "done" ? <video controls src={render.videoUrl} className="w-full rounded-lg bg-black" /> : <p className="text-sm text-gray-400">렌더하면 여기에 나옵니다 (보통 5~8분)</p>}
                </div>
              </div>
            </section>

            <section className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
              <span className="text-xs text-gray-500">⑤ 영상·썸네일·대본만 바뀝니다</span>
              <button type="button" disabled={render.kind !== "done" || applying} onClick={apply} className="ui-btn ui-btn-ok-soft rounded-lg px-4 py-2 text-sm font-semibold">
                {applying ? "교체 중…" : "이 영상으로 교체"}
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
