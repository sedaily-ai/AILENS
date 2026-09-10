"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { WebtoonStoryboardCut, WebtoonStoryboardResult } from "@/lib/types";

/* 웹툰 스토리보드 테스트 — "기사 원문 → 8컷 스토리보드 → 컷별 이미지"를
   한 화면에서 이어서 해볼 수 있는 실험 패널(2026-09-11 신설).

   기존에 있던 두 조각(프롬프트 드로어의 "테스트 실행" = 1단계만 미리보기,
   "이미지 실험" = 장면 하나를 손으로 타이핑해 3단계만 테스트)이 서로
   연결이 안 돼 있었다 — 사용자 요청: "기사 원문을 붙여두면 그것을 바탕으로
   이미지로 변환할 프롬프트 스크립트를 뽑고, 각 컷별로 이미지를 생성하는
   프롬프트를 8장 두는 것... 하나의 화면에서 실험할 수 있는 환경을 만들고
   싶다". "작업자가 시선의 흐름을 따라갈 수 있도록" 요청에 맞춰 컷 카드
   내부 순서를 실제 파이프라인 3단계 순서(대사·캡션 → 장면·카메라 → 이미지)
   그대로 위→아래로 배치했다 — 리뷰어가 "이야기가 되는가" → "이렇게
   찍는 게 맞는가" → "실제로 이렇게 나오는가" 순으로 자연히 검토하게 된다.

   1·2단계(스크립트+장면연출)는 새 엔드포인트(POST .../storyboard-test,
   routes/prompts.py::handle_storyboard_test)로 체인 호출한다. 3단계
   (컷별 이미지)는 새 엔드포인트를 안 만들고 기존 webtoon-lab/generate를
   컷마다(camera/scene만 채워서) 그대로 재사용한다 — WebtoonImageLab.tsx의
   폴링 패턴과 동일(다만 8개를 동시에 관리해야 해서 job 하나짜리 상태
   대신 cut 번호로 색인한 맵을 쓴다).

   지금 "저장된"(published) 웹툰 프롬프트를 기준으로 테스트한다 — 프롬프트
   드로어에서 편집 중인 미저장 초안과는 별개다(그 드로어의 내부 편집
   상태를 이 컴포넌트까지 끌어올리려면 이미 복잡한 PromptDrawer.tsx를
   건드려야 해서 범위를 좁혔다). 초안을 테스트하고 싶으면 먼저 저장하면
   된다 — 안내 문구로 명시. */

interface CutJobState {
  status: "idle" | "pending" | "done" | "error";
  jobId: string | null;
  imageUrl: string | null;
  error: string | null;
}

const _IDLE_JOB: CutJobState = { status: "idle", jobId: null, imageUrl: null, error: null };
const _POLL_INTERVAL_MS = 4000;

interface Props {
  open: boolean;
  onClose: () => void;
  /** true면 자기 backdrop/aside/닫기 버튼 없이 헤더+본문만 렌더한다 —
   *  PromptDrawer·WebtoonImageLab과 같은 관례(webtoon/page.tsx가 한 aside
   *  안에 셋을 순서대로 쌓는다). 기본 false. */
  embedded?: boolean;
}

export function WebtoonStoryboardLab({ open, onClose, embedded = false }: Props) {
  const toast = useToast();

  const [article, setArticle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<WebtoonStoryboardResult | null>(null);
  const [cuts, setCuts] = useState<WebtoonStoryboardCut[]>([]);
  const [cutJobs, setCutJobs] = useState<Record<number, CutJobState>>({});

  const pollTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const clearAllPolls = useCallback(() => {
    Object.values(pollTimers.current).forEach(clearTimeout);
    pollTimers.current = {};
  }, []);

  useEffect(() => clearAllPolls, [clearAllPolls]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // useCallback이 아니라 일반 함수 선언 — 재귀 폴링이 자기 자신을 참조한다
  // (WebtoonImageLab.tsx의 pollJob과 같은 이유).
  function pollCutJob(cutNum: number, jobId: string) {
    adminApi
      .getWebtoonImageJob(jobId)
      .then((j) => {
        setCutJobs((prev) => ({
          ...prev,
          [cutNum]: { status: j.status, jobId, imageUrl: j.image_url, error: j.error },
        }));
        if (j.status === "pending") {
          pollTimers.current[cutNum] = setTimeout(() => pollCutJob(cutNum, jobId), _POLL_INTERVAL_MS);
        }
      })
      .catch((err) => {
        setCutJobs((prev) => ({
          ...prev,
          [cutNum]: {
            status: "error",
            jobId,
            imageUrl: null,
            error: err instanceof AdminApiError ? err.message : "상태 조회 실패",
          },
        }));
      });
  }

  const generateCutImage = useCallback(async (cut: WebtoonStoryboardCut) => {
    if (!cut.scene.trim() || !cut.camera.trim()) {
      toast.show(`컷 ${cut.cut} — 장면·카메라를 먼저 입력해 주세요`, "error");
      return;
    }
    if (pollTimers.current[cut.cut]) {
      clearTimeout(pollTimers.current[cut.cut]);
      delete pollTimers.current[cut.cut];
    }
    setCutJobs((prev) => ({ ...prev, [cut.cut]: { status: "pending", jobId: null, imageUrl: null, error: null } }));
    try {
      const r = await adminApi.generateWebtoonImage({ scene: cut.scene.trim(), camera: cut.camera.trim() });
      setCutJobs((prev) => ({ ...prev, [cut.cut]: { status: "pending", jobId: r.job_id, imageUrl: null, error: null } }));
      pollTimers.current[cut.cut] = setTimeout(() => pollCutJob(cut.cut, r.job_id), _POLL_INTERVAL_MS);
    } catch (err) {
      setCutJobs((prev) => ({
        ...prev,
        [cut.cut]: {
          status: "error",
          jobId: null,
          imageUrl: null,
          error: err instanceof AdminApiError ? err.message : "생성 요청 실패",
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast는 안정적인 참조, pollCutJob은 훅 의존성 대상 아님(재귀 함수 선언)
  }, []);

  const generateAllImages = () => {
    cuts.forEach((c) => void generateCutImage(c));
  };

  const anyPending = Object.values(cutJobs).some((j) => j.status === "pending");

  const handleGenerateStoryboard = async () => {
    if (generating) return;
    if (!article.trim()) {
      toast.show("기사 원문을 입력해 주세요", "error");
      return;
    }
    clearAllPolls();
    setGenerating(true);
    setGenError(null);
    setStoryboard(null);
    setCuts([]);
    setCutJobs({});
    try {
      const prompt = await adminApi.getPrompt("webtoon", "published");
      const result = await adminApi.storyboardTest("webtoon", "published", prompt.active_content, article.trim());
      setStoryboard(result);
      setCuts(result.cuts);
    } catch (err) {
      setGenError(err instanceof AdminApiError ? err.message : "스토리보드 생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const updateCut = (cutNum: number, patch: Partial<WebtoonStoryboardCut>) => {
    setCuts((prev) => prev.map((c) => (c.cut === cutNum ? { ...c, ...patch } : c)));
  };

  const headerNode = (
    <div className="ui-divider space-y-3 border-b px-5 pb-3 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="webtoon-storyboard-title" className="font-display text-[19px] font-bold text-[var(--text-primary)]">
            스토리보드 테스트
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            기사 원문 → 1·2단계(스크립트+장면연출) → 컷별 이미지까지 한 화면에서
          </p>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
            aria-label="닫기"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  const bodyNode = (
    <div className={embedded ? "px-5 py-5" : "flex-1 overflow-y-auto px-5 py-5"}>
      <div className="space-y-4">
        <div>
          <label htmlFor="wsb-article" className="text-[13px] font-semibold text-[var(--text-secondary)]">
            기사 원문
          </label>
          <textarea
            id="wsb-article"
            value={article}
            onChange={(e) => setArticle(e.target.value)}
            placeholder="여기에 기사 원문을 붙여넣으세요"
            rows={6}
            className="ui-input mt-1 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
            지금 <strong>저장된</strong> 웹툰 프롬프트(published)로 테스트합니다 — 프롬프트
            드로어에서 아직 저장 안 한 편집 내용은 반영되지 않아요. 먼저 저장한 뒤 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => void handleGenerateStoryboard()}
            disabled={generating}
            className="ui-btn ui-btn-primary mt-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
          >
            {generating ? "1·2단계 생성 중... (최대 30초)" : "스토리보드 생성"}
          </button>
        </div>

        {genError && (
          <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            {genError}
          </div>
        )}

        {storyboard && cuts.length > 0 && (
          <>
            <div className="ui-divider border-t pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">핵심 질문</p>
              <p className="mt-0.5 text-[14px] font-semibold text-[var(--text-primary)]">
                {storyboard.core_question || "-"}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
                {cuts.length}컷 스토리보드
              </p>
              <button
                type="button"
                onClick={generateAllImages}
                disabled={anyPending}
                className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[13px] font-semibold"
              >
                {anyPending ? "생성 중..." : "전체 이미지 생성"}
              </button>
            </div>

            <div className="space-y-4">
              {cuts.map((cut) => (
                <CutCard
                  key={cut.cut}
                  cut={cut}
                  job={cutJobs[cut.cut] ?? _IDLE_JOB}
                  onChange={(patch) => updateCut(cut.cut, patch)}
                  onGenerate={() => void generateCutImage(cut)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col">
        {headerNode}
        {bodyNode}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="webtoon-storyboard-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[880px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {headerNode}
        {bodyNode}
      </aside>
    </>
  );
}

/* 컷 카드 — 시선의 흐름을 실제 파이프라인 순서(1단계 대사 → 2단계 연출 →
   3단계 이미지)와 맞춰 위→아래로 배치. 왼쪽 큰 컷 번호 배지는 8장을
   스크롤하며 훑을 때 "지금 몇 컷인지" 바로 눈에 들어오게 하는 앵커. */
function CutCard({
  cut,
  job,
  onChange,
  onGenerate,
}: {
  cut: WebtoonStoryboardCut;
  job: CutJobState;
  onChange: (patch: Partial<WebtoonStoryboardCut>) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
      <div
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[13px] font-bold"
        style={{ background: "var(--accent-soft, #eef2ff)", color: "var(--accent)" }}
        aria-hidden="true"
      >
        {cut.cut}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        {/* 1단계 — 대사·캡션·내레이션(이야기가 되는가) */}
        <div className="space-y-1">
          {cut.narration && (
            <p className="text-[12.5px] italic text-[var(--text-muted)]">내레이션 — {cut.narration}</p>
          )}
          {cut.caption && (
            <p className="inline-block rounded bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              {cut.caption}
            </p>
          )}
          {cut.dialogue.length > 0 && (
            <div className="space-y-0.5">
              {cut.dialogue.map((d, i) => (
                <p key={i} className="text-[13.5px] text-[var(--text-primary)]">
                  <span className="font-semibold">{d.speaker}</span>: {d.line}
                </p>
              ))}
            </div>
          )}
          {!cut.narration && !cut.caption && cut.dialogue.length === 0 && (
            <p className="text-[12.5px] text-[var(--text-faint)]">(대사 없음)</p>
          )}
        </div>

        {/* 2단계 — 카메라·장면(이렇게 찍는 게 맞는가), 편집 가능 */}
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)]">카메라</label>
            <input
              type="text"
              value={cut.camera}
              onChange={(e) => onChange({ camera: e.target.value })}
              className="ui-input mt-0.5 w-full rounded-lg px-2 py-1.5 text-[12.5px]"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)]">장면 묘사</label>
            <textarea
              value={cut.scene}
              onChange={(e) => onChange({ scene: e.target.value })}
              rows={2}
              className="ui-input mt-0.5 w-full resize-y rounded-lg px-2 py-1.5 text-[12.5px]"
            />
          </div>
        </div>

        {/* 3단계 — 실제로 이렇게 나오는가 */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={job.status === "pending"}
            className="ui-btn rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
          >
            {job.status === "pending" ? "생성 중..." : job.status === "done" ? "재생성" : "이미지 생성"}
          </button>
          {job.status === "pending" && <div className="ui-spinner h-4 w-4" aria-hidden="true" />}
          {job.status === "error" && (
            <span className="text-[12px]" style={{ color: "var(--danger)" }}>
              {job.error}
            </span>
          )}
        </div>

        {job.status === "done" && job.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구, WebtoonImageLab.tsx와 동일)
          <img
            src={job.imageUrl}
            alt={`컷 ${cut.cut} 생성 이미지`}
            className="w-full max-w-sm rounded-xl border"
            style={{ borderColor: "var(--border-hairline)" }}
          />
        )}
      </div>
    </div>
  );
}
