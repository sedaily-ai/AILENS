"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { ErrorNote } from "@/components/Feedback";
import { IssueLetterStatusBadge } from "@/components/IssueLetterStatus";
import { IssueLetterCandidateSearch } from "@/components/IssueLetterCandidateSearch";
import type { IssueLetterDetail, IssueLetterSegment } from "@/lib/types";

// 이슈 레터 입력·검수·발행 화면(2026-10-09). 편집자는 레터 생성 프롬프트 템플릿 v2 가 만든 "저장용 JSON"을 붙여넣는다.
// 입력 오류(출처가 서울경제 기사 DB에 없음, 투표 문구 규칙 등)와 발행 규칙 위반 사유는 서버가 문장으로 돌려주고 여기서는 그대로 보여 준다.
// useSearchParams 는 정적 export 에서 Suspense 경계가 필수다(quiz/edit 과 같은 패턴).
export default function IssueLetterEditPageWrapper() {
  return (
    <Suspense fallback={<div className="ui-spinner w-5 h-5 mt-4" />}>
      <IssueLetterEditPage />
    </Suspense>
  );
}

const AXIS_LABEL: Record<string, string> = { news: "소식", substance: "실체", other: "다른 시각" };

const EXAMPLE = `{
  "slug": "2026-10-09-주제",
  "title": "제목",
  "deck": "한두 문장 요약",
  "summary": ["1분 요약 1", "1분 요약 2"],
  "editor_note": "에디터 한마디(본문 사실의 연결 정리, 2문장 이내)",
  "read_minutes": 5,
  "categories": ["markets", "national"],
  "topics": ["금리", "삼성전자"],
  "sections": [
    { "axis": "news", "axis_label": "짧은 설명", "heading": "소제목", "key_line": "핵심 한 줄",
      "paragraphs": [["문장 ", { "text": "링크 걸 문구", "href": "https://www.sedaily.com/article/..." }, " 이어지는 문장"]] }
  ],
  "sources": [{ "url": "https://www.sedaily.com/article/...", "axes": ["news"] }],
  "poll": { "kind": "emotion", "question": "처음 들었을 때 어떠셨나요?",
    "options": [{ "key": "curious", "label": "신기했어요" }, { "key": "worried", "label": "걱정됐어요" }, { "key": "unsure", "label": "잘 모르겠어요" }] }
}`;

/** 화면에서 읽은 레터를 저장용 JSON(입력 형식)으로 되돌린다 — 수정 시 편집 칸의 초기값. */
function toInputJson(l: IssueLetterDetail): string {
  return JSON.stringify(
    {
      slug: l.slug,
      title: l.title,
      deck: l.deck,
      summary: l.summary,
      editor_note: l.editor_note ?? "",
      read_minutes: l.read_minutes,
      categories: l.categories,
      topics: l.topics.map((t) => t.name),
      sections: l.sections.map((s) => ({ axis: s.axis, axis_label: s.axis_label, heading: s.heading, key_line: s.key_line, paragraphs: s.paragraphs })),
      sources: l.sources.map((s) => ({ url: s.url, axes: s.axes })),
      poll: l.poll
        ? { kind: l.poll.kind, question: l.poll.question, options: l.poll.options.map((o) => ({ key: o.key, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })) }
        : undefined,
    },
    null,
    2,
  );
}

function Segment({ seg }: { seg: IssueLetterSegment }) {
  if (typeof seg === "string") return <>{seg}</>;
  return seg.href ? (
    <a href={seg.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
      {seg.text}
    </a>
  ) : (
    <>{seg.text}</>
  );
}

function IssueLetterEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const idParam = params.get("id");
  const id = idParam ? Number(idParam) : null;
  const toast = useToast();

  const [letter, setLetter] = useState<IssueLetterDetail | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [json, setJson] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await adminApi.getIssueLetter(id);
      setLetter(r.letter);
      setProblems(r.publish_problems ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // 초기 비동기 조회 — admin CLAUDE.md 의 set-state-in-effect 예외 패턴(drivers/page.tsx 와 동일).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.show(label, "success");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const parse = (): unknown | null => {
    try {
      return JSON.parse(json);
    } catch (err) {
      setError(`JSON 형식이 올바르지 않습니다: ${(err as Error).message}`);
      return null;
    }
  };

  const saveNew = async () => {
    const data = parse();
    if (data === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.createIssueLetter(data);
      toast.show("초안으로 저장했습니다", "success");
      router.replace(`/issue-letters/edit?id=${r.letter.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const data = parse();
    if (data === null || !id) return;
    await run("저장했습니다", async () => {
      await adminApi.updateIssueLetter(id, data);
      setEditing(false);
    });
  };

  // ── 새 레터: JSON 붙여넣기 ──
  if (!id) {
    return (
      <div className="space-y-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">새 이슈 레터</h1>
          <Link href="/issue-letters" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
            목록으로
          </Link>
        </div>
        <p className="text-[13px] leading-[1.6]" style={{ color: "var(--text-muted)" }}>
          레터 생성 프롬프트 템플릿 v2 의 출력(1) &quot;저장용 JSON&quot;을 그대로 붙여넣으세요. 저장하면 초안이 만들어집니다. 주제 태그(topics)는 주제 사전의 이름·별칭만 쓸 수 있고, 사전에 없는 태그는 거부됩니다. 출처 주소는 위 검색에서 &quot;후보로 담은&quot; 서울경제 기사와 대조해 연결하고, 담지 않은 주소는 거부됩니다.
        </p>
        <IssueLetterCandidateSearch />
        {error && <ErrorNote message={error} />}
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={22}
          spellCheck={false}
          placeholder={EXAMPLE}
          aria-label="저장용 JSON"
          className="ui-input w-full rounded-lg px-3 py-2 text-[12.5px] leading-[1.6] font-mono"
        />
        <div className="flex gap-2">
          <button type="button" disabled={busy || !json.trim()} onClick={saveNew} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {busy ? "저장 중…" : "초안으로 저장"}
          </button>
          <button type="button" onClick={() => setJson(EXAMPLE)} className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold">
            형식 예시 채우기
          </button>
        </div>
      </div>
    );
  }

  // ── 기존 레터 ──
  if (!letter) {
    return error ? (
      <div className="space-y-4">
        <ErrorNote message={error} />
        <Link href="/issue-letters" className="text-sm hover:underline">
          목록으로
        </Link>
      </div>
    ) : (
      <div className="ui-skeleton h-40 rounded-xl" />
    );
  }

  const canEdit = letter.status === "draft" || letter.status === "in_review";
  const publicUrl = `https://ailens.sedaily.ai/letter/${encodeURIComponent(letter.slug)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <IssueLetterStatusBadge status={letter.status} />
            {letter.issue_no && <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>제 {letter.issue_no}호</span>}
          </div>
          <h1 className="font-display text-[24px] font-bold text-[var(--text-primary)] leading-[1.3]">{letter.title}</h1>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{letter.slug}</div>
        </div>
        <Link href="/issue-letters" className="text-sm hover:underline" style={{ color: "var(--text-muted)" }}>
          목록으로
        </Link>
      </div>

      {error && <ErrorNote message={error} />}

      {/* 발행 전 점검 — 서버의 발행 규칙 */}
      {(letter.status === "draft" || letter.status === "in_review") && (
        <div className="ui-card rounded-xl p-5 space-y-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">발행 전 점검</h2>
          {problems.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--ok)" }}>모든 발행 규칙을 통과했습니다.</p>
          ) : (
            <ul className="text-[13px] leading-[1.7] list-disc pl-5" style={{ color: "var(--danger)" }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 상태 전환 */}
      <div className="flex flex-wrap gap-2">
        {letter.status === "draft" && (
          <button type="button" disabled={busy} onClick={() => run("검수를 요청했습니다", () => adminApi.submitIssueLetter(letter.id))} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            검수 요청
          </button>
        )}
        {letter.status === "in_review" && (
          <button
            type="button"
            disabled={busy || problems.length > 0}
            onClick={() => {
              if (!window.confirm("발행하면 사이트 레터 탭에 공개됩니다. 발행할까요?")) return;
              void run("발행했습니다", () => adminApi.publishIssueLetter(letter.id));
            }}
            className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            발행
          </button>
        )}
        {letter.status === "published" && (
          <>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold">
              사이트에서 보기
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("사이트에서 내릴까요? 다시 발행할 수는 없습니다.")) return;
                void run("내렸습니다", () => adminApi.archiveIssueLetter(letter.id));
              }}
              className="ui-btn ui-btn-warn-soft rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              내리기
            </button>
          </>
        )}
        {canEdit && !editing && (
          <button type="button" onClick={() => { setJson(toInputJson(letter)); setEditing(true); }} className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold">
            JSON 수정
          </button>
        )}
      </div>

      {editing && (
        <div className="space-y-3">
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={24} spellCheck={false} aria-label="저장용 JSON" className="ui-input w-full rounded-lg px-3 py-2 text-[12.5px] leading-[1.6] font-mono" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={saveEdit} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="ui-btn ui-btn-ghost rounded-lg px-4 py-2 text-sm font-semibold">
              취소
            </button>
          </div>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>slug 는 바꿀 수 없습니다. 발행된 레터는 수정할 수 없습니다.</p>
        </div>
      )}

      {/* 미리보기 */}
      <div className="ui-card rounded-xl p-6 space-y-5">
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {letter.category_names.join(" · ")} · 약 {letter.read_minutes}분
        </div>
        <p className="text-[15px] leading-[1.7] text-[var(--text-primary)]">{letter.deck}</p>
        <div className="flex flex-wrap gap-1.5 items-center" aria-label="주제 태그">
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>주제</span>
          {letter.topics.length === 0 ? (
            <span className="text-[12.5px]" style={{ color: "var(--danger)" }}>없음 — 발행 전에 주제 사전의 이름으로 1개 이상 필요합니다</span>
          ) : (
            letter.topics.map((t) => (
              <span key={t.slug} className={`ui-badge ${t.is_primary ? "ui-badge-published" : "ui-badge-draft"}`} title={t.is_primary ? "주 주제" : "보조 주제"}>
                {t.name}
              </span>
            ))
          )}
        </div>

        <div>
          <h3 className="text-[13px] font-semibold mb-1.5">1분 요약</h3>
          <ol className="list-decimal pl-5 text-[14px] leading-[1.7] space-y-1">
            {letter.summary.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>

        {letter.sections.map((sec, i) => (
          <div key={i} className="space-y-2 border-t ui-divider pt-4">
            <div className="flex items-center gap-2">
              <span className="ui-badge ui-badge-draft">{AXIS_LABEL[sec.axis] ?? sec.axis}</span>
              {sec.axis_label && <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{sec.axis_label}</span>}
            </div>
            <h3 className="text-[16px] font-semibold">{sec.heading}</h3>
            <p className="text-[13px] font-medium">핵심: {sec.key_line}</p>
            {sec.paragraphs.map((para, j) => (
              <p key={j} className="text-[14px] leading-[1.75]">
                {para.map((seg, k) => (
                  <Segment key={k} seg={seg} />
                ))}
              </p>
            ))}
          </div>
        ))}

        {letter.editor_note && (
          <div className="border-t ui-divider pt-4">
            <h3 className="text-[13px] font-semibold mb-1">에디터 한마디</h3>
            <p className="text-[14px] leading-[1.7]">{letter.editor_note}</p>
          </div>
        )}

        {letter.poll && (
          <div className="border-t ui-divider pt-4">
            <h3 className="text-[13px] font-semibold mb-1">투표 · {letter.poll.question}</h3>
            <ul className="text-[14px] flex gap-2 flex-wrap">
              {letter.poll.options.map((o) => (
                <li key={o.key} className="ui-badge ui-badge-draft">{o.label}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t ui-divider pt-4">
          <h3 className="text-[13px] font-semibold mb-1.5">쓰인 기사 ({letter.sources.length}건)</h3>
          <ul className="text-[13px] leading-[1.8] space-y-1">
            {letter.sources.map((s) => (
              <li key={s.article_no ?? s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>
                  {s.title}
                </a>{" "}
                <span style={{ color: "var(--text-muted)" }}>· {s.axes.map((a) => AXIS_LABEL[a] ?? a).join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
