"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { WebtoonGpuStatus, WebtoonStageHistoryItem } from "@/lib/types";

/* 단계별 생성(Stage-by-stage) — 2026-09-18 신설, 사용자 요청("단계별로
   컨트롤 하고 싶은 니즈가 있어서" → "그럼 그런 단계들도 프롬프트별로
   보이게 하면 안되나요?"). "Stable Diffusion 1.5 파이프라인"이 내부적으로
   거치는 5단계(번역→인물 A/B→배경→합성→화풍)를 화면에서 하나씩 실행하고,
   각 단계에 실제로 들어간 프롬프트를 보고 고쳐서 그 단계만 재생성할 수
   있게 한다.

   admin/backend/routes/webtoon_lab.py "단계별 생성" 섹션과 1:1 대응 — 새
   생성 로직은 없고 그 얇은 래퍼들을 순서대로 호출할 뿐이다. 각 단계
   호출은 (프롬프트·설정값과 함께) 서버에 기록되고, 히스토리 탭에서
   컷별로 다시 볼 수 있다(사용자 요청 — "생성된 이미지들을 볼 수
   있어야하고, 버전별로요... 설정한 값들도 투명하게 기록이 히스토리쪽에
   남는게 중요한것같고요").

   WebtoonImageLab.tsx와 같은 우측 슬라이드 패널 패턴을 그대로 쓴다 —
   다만 폭이 훨씬 넓다(5단계 카드를 한 화면에 늘어놓아야 해서). */

const _POLL_INTERVAL_MS = 4000;

interface Props {
  open: boolean;
  onClose: () => void;
}

type PanelTab = "run" | "history";

interface StageImage {
  url: string;
  key: string;
}

export function WebtoonStageLab({ open, onClose }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<PanelTab>("run");

  const [cut, setCut] = useState<string>("");
  const [scene, setScene] = useState("");
  const [camera, setCamera] = useState("오버숄더");

  const [gpuState, setGpuState] = useState<WebtoonGpuStatus["state"] | "unknown">("unknown");
  const [gpuStarting, setGpuStarting] = useState(false);

  // 1단계 — 번역 결과 + 다음 단계들의 편집 가능한 프롬프트.
  const [translating, setTranslating] = useState(false);
  const [subjects, setSubjects] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [charPromptA, setCharPromptA] = useState("");
  const [charPromptB, setCharPromptB] = useState("");
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");

  // 각 단계 최신 결과 — 다음 단계 입력으로 자동 연결된다. 히스토리에서
  // 과거 항목을 클릭하면 여기가 그 항목으로 바뀐다("버전별로 골라 쓰기").
  const [charImageA, setCharImageA] = useState<StageImage | null>(null);
  const [charImageB, setCharImageB] = useState<StageImage | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<StageImage | null>(null);
  const [compositeImage, setCompositeImage] = useState<StageImage | null>(null);
  const [styleImage, setStyleImage] = useState<StageImage | null>(null);

  const [genCharA, setGenCharA] = useState(false);
  const [genCharB, setGenCharB] = useState(false);
  const [genBackground, setGenBackground] = useState(false);
  const [genComposite, setGenComposite] = useState(false);
  const [genStyle, setGenStyle] = useState(false);

  const [history, setHistory] = useState<WebtoonStageHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearPoll();
      return;
    }
    adminApi
      .getWebtoonGpuStatus()
      .then((r) => setGpuState(r.state))
      .catch(() => setGpuState("unknown"));
    return () => clearPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 바뀔 때만
  }, [open]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    const cutNum = cut.trim() ? Number(cut.trim()) : undefined;
    adminApi
      .getStageHistory(cutNum)
      .then((r) => setHistory(r.items))
      .catch((err) => setHistoryError(err instanceof AdminApiError ? err.message : "히스토리 조회 실패"))
      .finally(() => setHistoryLoading(false));
  }, [cut]);

  useEffect(() => {
    if (open && tab === "history") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 히스토리 탭을 열 때 fetch(정당한 케이스, WebtoonImageLab.tsx와 같은 패턴)
      loadHistory();
    }
  }, [open, tab, loadHistory]);

  const handleStartGpu = async () => {
    setGpuStarting(true);
    try {
      await adminApi.startWebtoonGpu();
      const poll = () => {
        adminApi
          .getWebtoonGpuStatus()
          .then((r) => {
            setGpuState(r.state);
            if (r.state === "running") {
              setGpuStarting(false);
            } else {
              pollTimerRef.current = setTimeout(poll, _POLL_INTERVAL_MS);
            }
          })
          .catch(() => setGpuStarting(false));
      };
      poll();
    } catch (err) {
      toast.show(`GPU 기동 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
      setGpuStarting(false);
    }
  };

  const cutNum = cut.trim() ? Number(cut.trim()) : undefined;

  const handleTranslate = async () => {
    if (!scene.trim() || !camera.trim()) {
      toast.show("장면(scene)과 카메라를 입력해주세요", "error");
      return;
    }
    setTranslating(true);
    try {
      const r = await adminApi.stageTranslate(scene.trim(), camera.trim(), cutNum);
      setSubjects(r.subjects);
      setBrief(r.brief);
      setCharPromptA(r.character_prompt_a);
      setCharPromptB(r.character_prompt_b);
      setBackgroundPrompt(r.background_prompt);
      setStylePrompt(r.style_prompt);
      toast.show(`번역 완료 — subjects: ${r.subjects}`, "success");
    } catch (err) {
      toast.show(`번역 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setTranslating(false);
    }
  };

  const pollJob = useCallback(
    (jobId: string, onDone: (url: string, key: string) => void, onError: (msg: string) => void) => {
      const tick = () => {
        adminApi
          .getWebtoonImageJob(jobId)
          .then((job) => {
            if (job.status === "done" && job.image_url && job.s3_key) {
              onDone(job.image_url, job.s3_key);
            } else if (job.status === "error") {
              onError(job.error || "알 수 없는 오류");
            } else {
              pollTimerRef.current = setTimeout(tick, _POLL_INTERVAL_MS);
            }
          })
          .catch(() => {
            pollTimerRef.current = setTimeout(tick, _POLL_INTERVAL_MS);
          });
      };
      tick();
    },
    []
  );

  const handleGenChar = async (character: "A" | "B") => {
    const prompt = character === "A" ? charPromptA : charPromptB;
    if (!prompt.trim()) {
      toast.show("먼저 1단계(번역)를 실행하거나 프롬프트를 직접 입력해주세요", "error");
      return;
    }
    if (gpuState !== "running") {
      toast.show("GPU가 꺼져 있습니다 — 먼저 GPU를 켜주세요", "error");
      return;
    }
    const setGen = character === "A" ? setGenCharA : setGenCharB;
    const setImg = character === "A" ? setCharImageA : setCharImageB;
    setGen(true);
    try {
      const r = await adminApi.stageCharacter(character, prompt.trim(), cutNum);
      pollJob(
        r.job_id,
        (url, key) => {
          setImg({ url, key });
          setGen(false);
          toast.show(`인물 ${character} 생성 완료`, "success");
        },
        (msg) => {
          setGen(false);
          toast.show(`인물 ${character} 생성 실패: ${msg}`, "error");
        }
      );
    } catch (err) {
      setGen(false);
      toast.show(`인물 ${character} 생성 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    }
  };

  const handleGenBackground = async () => {
    if (!backgroundPrompt.trim()) {
      toast.show("먼저 1단계(번역)를 실행하거나 프롬프트를 직접 입력해주세요", "error");
      return;
    }
    setGenBackground(true);
    try {
      const r = await adminApi.stageBackground(backgroundPrompt.trim(), cutNum);
      if (r.image_url && r.s3_key) setBackgroundImage({ url: r.image_url, key: r.s3_key });
      toast.show("배경 생성 완료", "success");
    } catch (err) {
      toast.show(`배경 생성 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setGenBackground(false);
    }
  };

  const handleComposite = async () => {
    if (!backgroundImage || !charImageA || !charImageB) {
      toast.show("배경·인물 A·인물 B를 먼저 생성해주세요", "error");
      return;
    }
    setGenComposite(true);
    try {
      const r = await adminApi.stageComposite(backgroundImage.key, charImageA.key, charImageB.key, cutNum);
      if (r.image_url && r.s3_key) setCompositeImage({ url: r.image_url, key: r.s3_key });
      toast.show("합성 완료", "success");
    } catch (err) {
      toast.show(`합성 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setGenComposite(false);
    }
  };

  const handleStyle = async () => {
    const initImage = compositeImage || backgroundImage;
    if (!initImage) {
      toast.show("먼저 합성(또는 배경) 이미지를 만들어주세요", "error");
      return;
    }
    setGenStyle(true);
    try {
      const r = await adminApi.stageStyle(initImage.key, stylePrompt.trim() || undefined, cutNum);
      if (r.image_url && r.s3_key) setStyleImage({ url: r.image_url, key: r.s3_key });
      toast.show("화풍 적용 완료", "success");
    } catch (err) {
      toast.show(`화풍 적용 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setGenStyle(false);
    }
  };

  const handleClose = () => {
    clearPoll();
    onClose();
  };

  if (!open && tab === "run" && !subjects) {
    // 아직 한 번도 안 열렸으면 렌더 자체를 생략 — WebtoonImageLab과 동일 최적화.
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="webtoon-stage-lab-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[1240px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 id="webtoon-stage-lab-title" className="text-sm font-semibold text-[var(--text-primary)]">
              단계별 생성 — SD1.5 파이프라인
            </h2>
            <span className="ui-badge">GPU {gpuState === "running" ? "켜짐" : gpuState === "unknown" ? "확인 중" : gpuState}</span>
            {gpuState !== "running" && (
              <button
                type="button"
                className="ui-btn ui-btn-ghost rounded-md px-2 py-1 text-[11px]"
                onClick={() => void handleStartGpu()}
                disabled={gpuStarting}
              >
                {gpuStarting ? "기동 중..." : "GPU 켜기"}
              </button>
            )}
            <div className="ml-2 flex gap-1 rounded-lg bg-[var(--surface-sunken)] p-0.5">
              {(["run", "history"] as PanelTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 text-[12px] font-semibold ${
                    tab === t ? "bg-[var(--surface-card)] shadow-sm" : "text-[var(--text-muted)]"
                  }`}
                >
                  {t === "run" ? "실행" : "히스토리"}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn-ghost rounded-md px-2 py-1 text-[12px]">
            닫기
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === "run" ? (
            <div className="space-y-4">
              <div className="ui-divider rounded-xl border p-3.5">
                <div className="grid grid-cols-[100px_1fr] gap-2 sm:grid-cols-[120px_1fr_1fr]">
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
                    컷 번호(선택)
                    <input
                      className="ui-input rounded-md px-2 py-1.5 text-[12px]"
                      value={cut}
                      onChange={(e) => setCut(e.target.value)}
                      placeholder="예: 7"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
                    카메라
                    <input
                      className="ui-input rounded-md px-2 py-1.5 text-[12px]"
                      value={camera}
                      onChange={(e) => setCamera(e.target.value)}
                    />
                  </label>
                </div>
                <label className="mt-2 flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
                  장면(scene) — 스토리보드의 한국어 장면 지문을 붙여넣으세요
                  <textarea
                    className="ui-input w-full resize-y rounded-md px-2 py-1.5 text-[12px]"
                    rows={3}
                    value={scene}
                    onChange={(e) => setScene(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary mt-2 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold"
                  onClick={() => void handleTranslate()}
                  disabled={translating}
                >
                  {translating ? "번역 중..." : "1단계 · 장면 번역"}
                </button>
                {subjects && (
                  <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                    subjects: <span className="font-semibold">{subjects}</span>
                    {brief && <> — brief: {brief}</>}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                <StageCard
                  title="2단계 · 인물 A"
                  prompt={charPromptA}
                  onPromptChange={setCharPromptA}
                  onGenerate={() => void handleGenChar("A")}
                  generating={genCharA}
                  image={charImageA}
                  disabled={gpuState !== "running"}
                  disabledHint={gpuState !== "running" ? "GPU를 먼저 켜주세요" : undefined}
                />
                <StageCard
                  title="2단계 · 인물 B"
                  prompt={charPromptB}
                  onPromptChange={setCharPromptB}
                  onGenerate={() => void handleGenChar("B")}
                  generating={genCharB}
                  image={charImageB}
                  disabled={gpuState !== "running"}
                  disabledHint={gpuState !== "running" ? "GPU를 먼저 켜주세요" : undefined}
                />
                <StageCard
                  title="3단계 · 배경(인물 없음)"
                  prompt={backgroundPrompt}
                  onPromptChange={setBackgroundPrompt}
                  onGenerate={() => void handleGenBackground()}
                  generating={genBackground}
                  image={backgroundImage}
                />
                <StageCard
                  title="4단계 · 합성"
                  prompt={null}
                  onGenerate={() => void handleComposite()}
                  generating={genComposite}
                  image={compositeImage}
                  disabled={!backgroundImage || !charImageA || !charImageB}
                  disabledHint={!backgroundImage || !charImageA || !charImageB ? "배경·인물 A·인물 B가 모두 있어야 합니다" : undefined}
                  note="배경 + 인물 A + 인물 B를 합성합니다(입력은 위 결과를 자동으로 씁니다)."
                />
                <StageCard
                  title="5단계 · 화풍 적용"
                  prompt={stylePrompt}
                  onPromptChange={setStylePrompt}
                  onGenerate={() => void handleStyle()}
                  generating={genStyle}
                  image={styleImage}
                  disabled={!compositeImage && !backgroundImage}
                  disabledHint={!compositeImage && !backgroundImage ? "먼저 합성(또는 배경) 이미지가 있어야 합니다" : undefined}
                  note={compositeImage ? "입력: 4단계 합성 결과" : backgroundImage ? "입력: 3단계 배경(합성 전)" : undefined}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  컷 번호로 필터
                  <input
                    className="ui-input w-20 rounded-md px-2 py-1 text-[12px]"
                    value={cut}
                    onChange={(e) => setCut(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost rounded-md px-2 py-1 text-[11px]"
                  onClick={loadHistory}
                >
                  새로고침
                </button>
              </div>
              {historyLoading && <p className="text-[12px] text-[var(--text-muted)]">불러오는 중...</p>}
              {historyError && <p className="text-[12px] text-[var(--danger)]">{historyError}</p>}
              {!historyLoading && history && history.length === 0 && (
                <p className="text-[12px] text-[var(--text-faint)]">아직 기록이 없습니다.</p>
              )}
              <div className="space-y-2">
                {history?.map((item) => (
                  <HistoryRow key={item.job_id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function StageCard({
  title,
  prompt,
  onPromptChange,
  onGenerate,
  generating,
  image,
  disabled,
  disabledHint,
  note,
}: {
  title: string;
  prompt: string | null;
  onPromptChange?: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  image: StageImage | null;
  disabled?: boolean;
  disabledHint?: string;
  note?: string;
}) {
  return (
    <div className="ui-divider flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{title}</p>
      {note && <p className="text-[10.5px] text-[var(--text-faint)]">{note}</p>}
      {prompt !== null && onPromptChange && (
        <textarea
          className="ui-input w-full resize-y rounded-md px-2 py-1.5 text-[11px] leading-relaxed"
          rows={5}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="1단계(번역)를 먼저 실행하면 자동으로 채워집니다 — 직접 입력해도 됩니다."
        />
      )}
      <div className="ui-divider flex aspect-[3/2] items-center justify-center overflow-hidden rounded-md border bg-[var(--surface-sunken)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- S3 URL, 단계별 실험 화면
          <img src={image.url} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] text-[var(--text-faint)]">비어 있음</span>
        )}
      </div>
      <button
        type="button"
        className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        onClick={onGenerate}
        disabled={generating || disabled}
        title={disabled ? disabledHint : undefined}
      >
        {generating ? "생성 중..." : "생성"}
      </button>
      {disabled && disabledHint && <p className="text-[10px] text-[var(--text-faint)]">{disabledHint}</p>}
    </div>
  );
}

function HistoryRow({ item }: { item: WebtoonStageHistoryItem }) {
  const stageLabel: Record<string, string> = {
    translate: "1단계 · 번역",
    character: `2단계 · 인물${item.character ? ` ${item.character}` : ""}`,
    background: "3단계 · 배경",
    composite: "4단계 · 합성",
    style: "5단계 · 화풍",
  };
  return (
    <div className="ui-divider flex items-start gap-3 rounded-lg border p-2.5">
      <div className="ui-divider h-16 w-16 flex-none overflow-hidden rounded-md border bg-[var(--surface-sunken)]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- S3 URL, 히스토리 썸네일
          <img src={item.image_url} alt={stageLabel[item.stage] ?? item.stage} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[var(--text-primary)]">{stageLabel[item.stage] ?? item.stage}</span>
          {item.cut !== null && <span className="ui-badge text-[10px]">컷 {item.cut}</span>}
          <span
            className={`text-[10px] font-medium ${
              item.status === "done" ? "text-[var(--ok)]" : item.status === "error" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
            }`}
          >
            {item.status}
          </span>
          <span className="text-[10px] text-[var(--text-faint)]">{item.created_at}</span>
        </div>
        {item.prompt && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[var(--text-muted)]" title={item.prompt}>
            {item.prompt}
          </p>
        )}
        {item.error && <p className="mt-1 text-[11px] text-[var(--danger)]">{item.error}</p>}
      </div>
    </div>
  );
}
