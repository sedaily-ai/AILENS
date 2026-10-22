"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { CustomSelect } from "@/components/CustomSelect";
import { ErrorNote } from "@/components/Feedback";
import { VideoDownloadButton } from "@/components/PromptChatLab/VideoDownloadButton";
import { progressLabel, progressPercent } from "@/components/PromptChatLab/videoCardModel";
import {
  PRISM_GROUPS,
  countArticles,
  dateLabel,
  groupName,
  parseFileName,
  sha256,
  type PrismBatchDetail,
  type PrismBatchItem,
  type PrismBatchSummary,
  type PrismGroupCode,
} from "@/lib/prismBatch";

/* PRISM 일괄 제작(2026-10-22) — 사용자 요청: 편집자가 그날 그룹별 기사 파일(1~12개)을 한 번에 끌어다 놓고
   "제작 시작"만 누르면 대본 → 영상까지 동시에 자동으로. 파일 1개 = 렌더 태스크 1개(admin/backend/routes/
   prism_batch.py). 그룹·날짜는 파일 이름(MMDD_항목명.txt)에서 채우고, 못 알아본 것만 사람이 고른다.
   진행 중 배치는 URL(?batch=)에 남겨 새로고침·다른 사람이 열어도 같은 상태를 본다. */

const MAX_FILES = 12;
const POLL_MS = 5000;

interface DraftRow {
  id: string;
  file: File;
  text: string;
  type: PrismGroupCode | "";
  recordingDate: string;
  articles: number;
  duplicate: boolean;
}

const GROUP_OPTIONS = [
  { value: "" as const, label: "그룹 선택" },
  ...PRISM_GROUPS.map((g) => ({ value: g.code, label: `${g.name} (${g.keyword})` })),
];

const STAGE_LABEL: Record<string, string> = {
  queued: "대기 중",
  script: "대본 작성 중",
  scene: "장면 나누는 중",
  render: "렌더링",
  done: "완료",
  error: "실패",
};

function slug(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function DraftPanel({ onStarted }: { onStarted: (batchId: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".txt"));
    if (list.length === 0) {
      toast.show(".txt 파일만 넣을 수 있습니다", "error");
      return;
    }
    const read = await Promise.all(
      list.map(async (file) => {
        const text = await file.text();
        return { file, text, hash: await sha256(text) };
      })
    );
    setRows((prev) => {
      const seen = new Set(prev.filter((r) => !r.duplicate).map((r) => r.id));
      const next = [...prev];
      for (const { file, text, hash } of read) {
        const parsed = parseFileName(file.name);
        next.push({
          id: hash,
          file,
          text,
          type: parsed.type ?? "",
          recordingDate: parsed.recordingDate,
          articles: countArticles(text),
          duplicate: seen.has(hash),
        });
        seen.add(hash);
      }
      return next.slice(0, MAX_FILES + 8);
    });
  };

  const active = rows.filter((r) => !r.duplicate);
  const typeCounts = new Map<string, number>();
  active.forEach((r) => r.type && typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1));
  const problems = [
    active.length > MAX_FILES ? `한 번에 ${MAX_FILES}개까지 제작할 수 있습니다` : null,
    active.some((r) => !r.type) ? "그룹을 못 알아본 파일이 있습니다 — 그룹을 골라 주세요" : null,
    [...typeCounts.values()].some((n) => n > 1) ? "같은 그룹 파일이 두 개 있습니다 — 하나를 빼 주세요" : null,
  ].filter((x): x is string => x !== null);

  const update = (id: string, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id && !r.duplicate ? { ...r, ...patch } : r)));
  const remove = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const start = async () => {
    if (busy || active.length === 0 || problems.length > 0) return;
    setBusy(true);
    try {
      const { batch_id, uploads } = await adminApi.prismBatchUploadUrls(active.length);
      await Promise.all(
        active.map(async (row, i) => {
          const res = await fetch(uploads[i].url, {
            method: "PUT",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            body: row.text,
          });
          if (!res.ok) throw new Error(`${row.file.name} 업로드 실패 (HTTP ${res.status})`);
        })
      );
      const r = await adminApi.prismBatchStart(
        batch_id,
        active.map((row, i) => ({
          input_key: uploads[i].key,
          file_name: row.file.name,
          type: row.type,
          recording_date: row.recordingDate,
        }))
      );
      if (r.failed.length > 0) toast.show(`시작 실패: ${r.failed.join(", ")}`, "error");
      else toast.show(`${r.started}편 제작을 시작했습니다`, "success");
      setRows([]);
      onStarted(batch_id);
    } catch (err) {
      console.error("PRISM 일괄 제작 시작 실패", err);
      toast.show(`제작 시작 실패: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-card space-y-3 rounded-xl p-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors"
        style={{
          borderColor: "var(--accent)",
          background: dragging ? "var(--accent-soft)" : "transparent",
        }}
      >
        <p className="text-[14px] font-semibold text-[var(--accent)]">여기에 기사 파일을 끌어다 놓으세요</p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          .txt 여러 개 가능 · 파일 이름 <code>MMDD_항목명.txt</code>(예: 1021_취준생.txt)로 그룹·날짜를 자동으로 채웁니다
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-[var(--text-faint)]">
                  <th className="py-1.5 pr-3 font-medium">파일</th>
                  <th className="py-1.5 pr-3 font-medium">그룹</th>
                  <th className="py-1.5 pr-3 font-medium">날짜</th>
                  <th className="py-1.5 pr-3 font-medium">기사</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const sameGroup = !row.duplicate && row.type !== "" && (typeCounts.get(row.type) ?? 0) > 1;
                  return (
                    <tr key={`${row.id}-${i}`} className="border-t ui-divider" style={row.duplicate ? { opacity: 0.5 } : undefined}>
                      <td className="py-2 pr-3">{row.file.name}</td>
                      <td className="py-2 pr-3">
                        {row.duplicate ? (
                          <span className="text-[12px] text-[var(--danger)]">중복 — 제외됨</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <CustomSelect
                              value={row.type}
                              options={GROUP_OPTIONS}
                              onChange={(v) => update(row.id, { type: v })}
                            />
                            {(!row.type || sameGroup) && (
                              <span className="text-[11.5px] text-[var(--danger)]">{row.type ? "같은 그룹" : "확인 필요"}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="date"
                          value={row.recordingDate}
                          disabled={row.duplicate}
                          onChange={(e) => update(row.id, { recordingDate: e.target.value })}
                          className="ui-input rounded-lg px-2 py-1 text-[12.5px]"
                        />
                        <span className="ml-1.5 text-[11.5px] text-[var(--text-faint)]">{dateLabel(row.recordingDate)}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={row.articles < 3 || row.articles > 6 ? "text-[var(--danger)]" : undefined}>{row.articles}건</span>
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => remove(i)} className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[12px]">
                          빼기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {problems.map((p) => (
              <span key={p} className="text-[12px] text-[var(--danger)]">
                {p}
              </span>
            ))}
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy || active.length === 0 || problems.length > 0}
              className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {busy ? "올리는 중..." : `제작 시작 (${active.length}편)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ItemStatus({ item }: { item: PrismBatchItem }) {
  const stage = item.stage ?? "queued";
  if (stage === "render") {
    return (
      <div className="min-w-[180px] space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progressPercent(item.progress ?? null)}%` }} />
        </div>
        <p className="text-[11.5px] text-[var(--text-faint)]">{progressLabel(item.progress ?? null)}</p>
      </div>
    );
  }
  const color = stage === "done" ? "var(--ok)" : stage === "error" ? "var(--danger)" : "var(--accent)";
  return (
    <div>
      <span className="text-[12.5px] font-semibold" style={{ color }}>
        {STAGE_LABEL[stage] ?? stage}
      </span>
      {stage === "error" && item.message && <p className="mt-0.5 max-w-[360px] text-[11.5px] text-[var(--text-muted)]">{item.message}</p>}
    </div>
  );
}

function BatchPanel({ batchId }: { batchId: string }) {
  const toast = useToast();
  const [batch, setBatch] = useState<PrismBatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const running = !batch || batch.items.some((it) => it.stage !== "done" && it.stage !== "error");

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getPrismBatch(batchId)
      .then((r) => {
        if (!cancelled) {
          setBatch(r);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [batchId, tick]);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [running, tick]);

  const retry = async (itemId: string) => {
    try {
      await adminApi.prismBatchRetry(batchId, itemId);
      toast.show("다시 시작했습니다", "success");
      setTick((n) => n + 1);
    } catch (err) {
      toast.show(`다시 시작 실패: ${(err as Error).message}`, "error");
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!batch) return <div className="ui-spinner mt-2 h-5 w-5" />;

  const done = batch.items.filter((it) => it.stage === "done").length;
  return (
    <div className="ui-card space-y-3 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[var(--text-primary)]">제작 {batch.batch_id}</h2>
        <span className="text-[12.5px] text-[var(--text-muted)]">
          {done}/{batch.items.length}편 완료{running ? " · 5초마다 새로고침" : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-[var(--text-faint)]">
              <th className="py-1.5 pr-3 font-medium">그룹</th>
              <th className="py-1.5 pr-3 font-medium">파일 · 제목</th>
              <th className="py-1.5 pr-3 font-medium">상태</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {batch.items.map((it) => (
              <tr key={it.item_id} className="border-t ui-divider align-top">
                <td className="py-2 pr-3 font-semibold">
                  {it.group || groupName(it.type)}
                  <div className="text-[11.5px] font-normal text-[var(--text-faint)]">{dateLabel(it.recording_date)}</div>
                </td>
                <td className="py-2 pr-3">
                  <div>{it.file_name}</div>
                  {it.title && <div className="text-[12px] text-[var(--text-muted)]">{it.title}</div>}
                </td>
                <td className="py-2 pr-3">
                  <ItemStatus item={it} />
                </td>
                <td className="py-2">
                  <div className="flex flex-col items-end gap-1">
                    {it.script_url && (
                      <a href={it.script_url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline">
                        대본 보기
                      </a>
                    )}
                    {it.stage === "done" && it.video_url && (
                      <>
                        <a href={it.video_url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline">
                          영상 보기
                        </a>
                        <VideoDownloadButton jobId={it.job_id} filePrefix={`ai_prism_${slug(it.group || groupName(it.type))}_EN`} />
                      </>
                    )}
                    {it.stage === "error" && (
                      <button type="button" onClick={() => void retry(it.item_id)} className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[12px] font-semibold">
                        다시 시도
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentBatches({ current, onSelect }: { current: string | null; onSelect: (id: string) => void }) {
  const [batches, setBatches] = useState<PrismBatchSummary[] | null>(null);
  useEffect(() => {
    adminApi
      .listPrismBatches()
      .then((r) => setBatches(r.batches))
      .catch((err) => console.error("지난 제작 목록 불러오기 실패", err));
  }, [current]);
  if (!batches || batches.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-[14px] font-bold text-[var(--text-primary)]">지난 제작</h2>
      <div className="flex flex-wrap gap-2">
        {batches.slice(0, 20).map((b) => (
          <button
            key={b.batch_id}
            type="button"
            onClick={() => onSelect(b.batch_id)}
            className={`ui-btn rounded-lg px-3 py-1.5 text-[12px] ${b.batch_id === current ? "ui-btn-primary" : "ui-btn-ghost"}`}
            title={b.groups.join(", ")}
          >
            {b.created_at.slice(5, 16).replace("T", " ")} · {b.count}편
          </button>
        ))}
      </div>
    </div>
  );
}

function PrismBatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch");
  const select = useCallback((id: string) => router.push(`/prism-batch?batch=${encodeURIComponent(id)}`), [router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">PRISM 제작</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          그날 그룹별 기사 파일을 한 번에 넣으면 편마다 영어 대본 → 장면 → 성우 → 영상이 동시에 자동으로 만들어집니다.
          대본·장면 규칙은 프롬프트 실험실 PRISM 탭에서 &quot;적용&quot;한 버전을 씁니다.
        </p>
      </div>
      <DraftPanel onStarted={select} />
      {batchId && <BatchPanel key={batchId} batchId={batchId} />}
      <RecentBatches current={batchId} onSelect={select} />
    </div>
  );
}

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수(video/page.tsx와 같다).
export default function PrismBatchPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner mt-4 h-5 w-5" />}>
      <PrismBatchPage />
    </Suspense>
  );
}
