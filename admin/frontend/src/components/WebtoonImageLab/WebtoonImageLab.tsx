"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type { WebtoonLabDefaults, WebtoonLabHistoryItem, WebtoonLabJob } from "@/lib/types";

/* 웹툰 3단계(이미지 생성) 프롬프트 실험 패널 — 웹툰 목록 화면의 "이미지 실험"
   버튼이 연다(PromptDrawer와 같은 우측 슬라이드 패턴, 다만 이미지 미리보기 +
   히스토리 갤러리가 있어 더 넓다).

   2026-09-05 신설. 저희는 스테이블 디퓨전(Bedrock)만 쓴다는 제약이라 GPT
   image_generation 같은 대안은 없다 — 프롬프트/파라미터를 바꿔가며 실제
   생성 결과를 바로 보는 게 유일한 튜닝 방법이라 이 패널을 만들었다.

   백엔드(admin/backend/routes/webtoon_lab.py)는 API Gateway 30초 타임아웃
   때문에 동기 응답이 없다 — POST generate로 job을 만들고 GET {job_id}를
   폴링한다(_POLL_INTERVAL_MS). 완료된 생성은 전부 히스토리에 쌓여
   공용 갤러리로 남는다(이 admin 계정을 쓰는 모두가 같이 본다). */

const _POLL_INTERVAL_MS = 4000;
const _MAX_SCENE_CHARS = 1200; // 백엔드 _MAX_SCENE_BYTES(4000바이트)에 여유를 둔 UTF-8 대략치

interface Props {
  open: boolean;
  onClose: () => void;
}

type PanelTab = "generate" | "history";

export function WebtoonImageLab({ open, onClose }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<PanelTab>("generate");

  const [scene, setScene] = useState("");
  const [camera, setCamera] = useState("medium shot, eye level");
  const [customStyle, setCustomStyle] = useState(false);
  const [style, setStyle] = useState("");
  const [customChars, setCustomChars] = useState(false);
  const [charFemale, setCharFemale] = useState("");
  const [charMale, setCharMale] = useState("");
  const [sceneReinforce, setSceneReinforce] = useState(true);
  const [charReinforce, setCharReinforce] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<WebtoonLabJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [history, setHistory] = useState<WebtoonLabHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 기본 STYLE/FIXED_CHARACTERS(백엔드 pipelines/common/webtoon_image.py가 정본) —
  // "직접 입력" 토글을 켰을 때 빈 칸이 아니라 지금 실제로 쓰이는 프롬프트를
  // placeholder로 보여준다(2026-09-04 실사용 피드백: 빈 textarea만 있으면
  // 뭘 기준으로 고쳐야 할지 알 수 없다).
  const [defaults, setDefaults] = useState<WebtoonLabDefaults | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    adminApi
      .getWebtoonImageHistory()
      .then((r) => setHistory(r.items))
      .catch((err) =>
        setHistoryError(err instanceof AdminApiError ? err.message : "히스토리 조회 실패")
      )
      .finally(() => setHistoryLoading(false));
  }, []);

  const loadDefaults = useCallback(() => {
    adminApi
      .getWebtoonImageDefaults()
      .then(setDefaults)
      .catch(() => {
        /* placeholder 용도라 실패해도 조용히 무시 — generate는 백엔드가 어차피 기본값을 채운다 */
      });
  }, []);

  useEffect(() => {
    if (!open) {
      clearPoll();
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (history === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 패널이 열릴 때 최초 1회 히스토리 fetch(정당한 케이스, admin/frontend/CLAUDE.md의 drivers/page.tsx와 같은 패턴)
      loadHistory();
    }
    if (defaults === null) {
      // loadDefaults는 loadHistory와 달리 setState를 .then() 콜백 안에서만 호출해
      // 이펙트 본문에서 동기적으로 부르는 게 아니라 react-hooks/set-state-in-effect가
      // 안 걸린다 — disable 주석 불필요.
      loadDefaults();
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 1회만: history/defaults를 deps에 넣으면 매 갱신마다 재실행된다
  }, [open]);

  useEffect(() => clearPoll, [clearPoll]);

  // useCallback이 아니라 일반 함수 선언 — setTimeout 콜백에서 자기 자신을 다시
  // 부르는 재귀 폴링이라 useCallback으로 감싸면 "선언 전에 참조" 린트 에러가 난다
  // (함수 선언은 호이스팅되므로 재귀 참조가 안전하다). 훅 의존성 배열에 넣을 일이
  // 없어 메모이제이션이 필요하지도 않다 — handleGenerate(이벤트 핸들러)에서만 호출.
  function pollJob(jobId: string) {
    adminApi
      .getWebtoonImageJob(jobId)
      .then((j) => {
        setJob(j);
        if (j.status === "pending") {
          pollTimerRef.current = setTimeout(() => pollJob(jobId), _POLL_INTERVAL_MS);
        } else if (j.status === "done") {
          loadHistory();
        }
      })
      .catch((err) => {
        setJobError(err instanceof AdminApiError ? err.message : "상태 조회 실패");
      });
  }

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose는 onClose 참조만 바뀌면 재바인딩되면 됨
  }, [open, onClose]);

  const handleGenerate = async () => {
    if (submitting) return;
    if (!scene.trim()) {
      toast.show("장면 설명을 입력해 주세요", "error");
      return;
    }
    if (!camera.trim()) {
      toast.show("카메라 지시를 입력해 주세요", "error");
      return;
    }
    clearPoll();
    setJob(null);
    setJobError(null);
    setSubmitting(true);
    try {
      const r = await adminApi.generateWebtoonImage({
        scene: scene.trim(),
        camera: camera.trim(),
        style: customStyle && style.trim() ? style.trim() : undefined,
        char_female: customChars && charFemale.trim() ? charFemale.trim() : undefined,
        char_male: customChars && charMale.trim() ? charMale.trim() : undefined,
        scene_reinforce: sceneReinforce,
        char_reinforce: charReinforce,
      });
      setJob({
        job_id: r.job_id,
        status: "pending",
        image_url: null,
        error: null,
        scene: scene.trim(),
        camera: camera.trim(),
        style: null,
        char_female: null,
        char_male: null,
        scene_reinforce: sceneReinforce,
        char_reinforce: charReinforce,
        prompt_preview: null,
        created_at: null,
      });
      pollTimerRef.current = setTimeout(() => pollJob(r.job_id), _POLL_INTERVAL_MS);
    } catch (err) {
      toast.show(
        `생성 요청 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const applyHistoryItem = (item: WebtoonLabHistoryItem) => {
    setScene(item.scene ?? "");
    setCamera(item.camera ?? "");
    if (item.style) {
      setCustomStyle(true);
      setStyle(item.style);
    } else {
      setCustomStyle(false);
      setStyle("");
    }
    if (item.char_female || item.char_male) {
      setCustomChars(true);
      setCharFemale(item.char_female ?? "");
      setCharMale(item.char_male ?? "");
    } else {
      setCustomChars(false);
    }
    setSceneReinforce(item.scene_reinforce ?? true);
    setCharReinforce(item.char_reinforce ?? true);
    setTab("generate");
    toast.show("이 생성의 설정을 폼에 불러왔습니다", "info");
  };

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
        aria-labelledby="webtoon-lab-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[880px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="ui-divider space-y-3 border-b px-5 pb-3 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="webtoon-lab-title"
                className="font-display text-[19px] font-bold text-[var(--text-primary)]"
              >
                이미지 실험
              </h2>
              <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                Bedrock Stable Diffusion · 프롬프트/파라미터를 바꿔 실제 생성 결과를 확인
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
              aria-label="닫기"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1">
            {(
              [
                { id: "generate" as const, label: "생성" },
                { id: "history" as const, label: `히스토리${history ? ` (${history.length})` : ""}` },
              ]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "generate" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* 왼쪽 — 입력 폼 */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="wl-scene" className="text-[13px] font-semibold text-[var(--text-secondary)]">
                    장면 설명 (SCENE)
                  </label>
                  <textarea
                    id="wl-scene"
                    value={scene}
                    onChange={(e) => setScene(e.target.value.slice(0, _MAX_SCENE_CHARS))}
                    placeholder="예: 기자가 노트북 화면을 가리키며 통계 그래프를 설명하는 장면, 청자는 흥미롭게 듣고 있다."
                    rows={4}
                    className="ui-input mt-1 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                  />
                  <p className="mt-0.5 text-right text-[11px] text-[var(--text-faint)]">
                    {scene.length.toLocaleString("ko-KR")} / {_MAX_SCENE_CHARS}자
                  </p>
                </div>

                <div>
                  <label htmlFor="wl-camera" className="text-[13px] font-semibold text-[var(--text-secondary)]">
                    카메라 지시
                  </label>
                  <input
                    id="wl-camera"
                    type="text"
                    value={camera}
                    onChange={(e) => setCamera(e.target.value)}
                    placeholder="예: medium shot, eye level"
                    className="ui-input mt-1 w-full rounded-lg px-3 py-2 text-[13px]"
                  />
                </div>

                <ToggleField
                  label="스타일(STYLE) 직접 입력"
                  hint="끄면 기본 스타일(모던 한국 웹툰체)을 그대로 씁니다"
                  checked={customStyle}
                  onChange={setCustomStyle}
                >
                  <textarea
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder={defaults?.style ?? "불러오는 중..."}
                    rows={6}
                    className="ui-input w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                  />
                </ToggleField>

                <ToggleField
                  label="캐릭터(CHARACTERS) 직접 입력"
                  hint="끄면 고정 캐릭터 A(여성 기자)/B(남성 청자) 기본값을 그대로 씁니다"
                  checked={customChars}
                  onChange={setCustomChars}
                >
                  <div className="space-y-2">
                    <div>
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">A — 여성 기자</span>
                      <textarea
                        value={charFemale}
                        onChange={(e) => setCharFemale(e.target.value)}
                        placeholder={defaults?.char_female ?? "불러오는 중..."}
                        rows={4}
                        className="ui-input mt-0.5 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">B — 남성 청자</span>
                      <textarea
                        value={charMale}
                        onChange={(e) => setCharMale(e.target.value)}
                        placeholder={defaults?.char_male ?? "불러오는 중..."}
                        rows={4}
                        className="ui-input mt-0.5 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                      />
                    </div>
                  </div>
                </ToggleField>

                <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
                  <CheckboxField
                    label="장면 재강조 문구 추가"
                    hint="STRICT: 현대 배경·불필요한 인물 추가 금지 문구"
                    checked={sceneReinforce}
                    onChange={setSceneReinforce}
                  />
                  <CheckboxField
                    label="캐릭터 재강조 문구 추가"
                    hint="STRICT: 고정 캐릭터 외모를 그대로 유지하라는 문구"
                    checked={charReinforce}
                    onChange={setCharReinforce}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={submitting || job?.status === "pending"}
                  className="ui-btn ui-btn-primary w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  {submitting
                    ? "요청 중..."
                    : job?.status === "pending"
                      ? "생성 중..."
                      : "이미지 생성"}
                </button>
              </div>

              {/* 오른쪽 — 미리보기 */}
              <div className="space-y-3">
                <JobPreview job={job} error={jobError} />
              </div>
            </div>
          )}

          {tab === "history" && (
            <HistoryGallery
              items={history}
              loading={historyLoading}
              error={historyError}
              onRetry={loadHistory}
              onApply={applyHistoryItem}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
          <span className="block text-[11px] text-[var(--text-faint)]">{hint}</span>
        </span>
      </label>
      {checked && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="block text-[11px] text-[var(--text-faint)]">{hint}</span>
      </span>
    </label>
  );
}

function JobPreview({ job, error }: { job: WebtoonLabJob | null; error: string | null }) {
  if (error) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        {error}
      </div>
    );
  }
  if (!job) {
    return (
      <div
        className="flex aspect-[3/2] items-center justify-center rounded-xl text-[13px]"
        style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}
      >
        왼쪽에서 장면을 입력하고 생성을 눌러 보세요
      </div>
    );
  }
  if (job.status === "pending") {
    return (
      <div
        className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-xl text-[13px]"
        style={{ background: "var(--surface-sunken)", color: "var(--text-muted)" }}
      >
        <div className="ui-spinner h-6 w-6" />
        생성 중... (최대 몇 분 걸릴 수 있습니다)
      </div>
    );
  }
  if (job.status === "error") {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        생성 실패: {job.error ?? "알 수 없는 오류"}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {job.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구)
        <img
          src={job.image_url}
          alt="생성된 웹툰 배경 이미지"
          className="w-full rounded-xl border"
          style={{ borderColor: "var(--border-hairline)" }}
        />
      )}
      {job.prompt_preview && (
        <details className="rounded-lg border p-2 text-[11px]" style={{ borderColor: "var(--border-hairline)" }}>
          <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">
            실제 전송된 프롬프트 보기
          </summary>
          <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-faint)]">
            {job.prompt_preview}
          </pre>
        </details>
      )}
    </div>
  );
}

function HistoryGallery({
  items,
  loading,
  error,
  onRetry,
  onApply,
}: {
  items: WebtoonLabHistoryItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onApply: (item: WebtoonLabHistoryItem) => void;
}) {
  if (error) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
        <button type="button" onClick={onRetry} className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">
          다시 시도
        </button>
      </div>
    );
  }
  if (loading && !items) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton aspect-[3/2] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-[var(--text-faint)]">
        아직 완료된 생성이 없습니다
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.job_id}
          type="button"
          onClick={() => onApply(item)}
          className="group text-left"
          title="이 설정을 생성 폼에 불러오기"
        >
          {item.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구)
            <img
              src={item.image_url}
              alt={item.scene ?? "웹툰 실험 이미지"}
              className="aspect-[3/2] w-full rounded-xl border object-cover transition-transform group-hover:scale-[1.02]"
              style={{ borderColor: "var(--border-hairline)" }}
            />
          )}
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
            {item.scene ?? "-"}
          </p>
        </button>
      ))}
    </div>
  );
}
