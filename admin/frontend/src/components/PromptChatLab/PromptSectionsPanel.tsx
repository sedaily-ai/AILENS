"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";

/* 우측 사이드 패널 — "편집 대상"(webtoon/published) 프롬프트를 설명(단일)·
   지침(단일)·파일(다중, 추가/삭제) 셋으로 나눠 각각 독립적으로 저장한다
   (2026-09-15, 사용자 요청 + 노바 nova/backend/prompt_admin 구조 확인,
   그리고 이후 "각각 따로입니다" 재확인). 어느 저장 버튼을 눌러도 그
   필드/파일 하나만 서버(prompt_lab_docs/prompt_lab_files, 발행된 프로덕션
   프롬프트 버전과는 별개 저장소)에 반영된다 — 다른 칸의 편집 중인 내용은
   안 건드린다.

   설명/지침/파일 전부 Claude 프로젝트의 "프로젝트 지침 설정" 모달과 같은
   모양이다 — 헤더의 "+"를 누르면 모달이 뜨고, 거기서 편집 + 취소/저장
   한다(2026-09-15, 사용자 요청). 토스트 알림은 쓰지 않는다(같은 요청 —
   "토스트 메시지 삭제해주세요") — 저장/삭제 실패는 콘솔에만 남긴다.

   2026-09-16 — 편집 중(저장 전) 내용을 채팅으로 실시간 전송하던
   onAssembledChange 연결은 제거했다(사용자 확인: "그거 필요없어요..
   노바랑 동일한 방식으로 하면 됩니다" — nova/backend/websocket/
   prompt_builder.py::load_engine_full_prompt 처럼 서버가 저장된 지침을
   DB에서 직접 읽어오는 방식으로 통일). 이제 "저장"을 눌러야 채팅
   테스트(routes/chat_ws.py)에 반영된다 — 이 패널은 그 저장 자체만
   책임진다. */

interface LabFile {
  id: number;
  name: string;
  content: string;
  serverName: string;
  serverContent: string;
  saving: boolean;
}

export function PromptSectionsPanel({ category, name }: { category: string; name: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [savedDescription, setSavedDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [instructions, setInstructions] = useState("");
  const [savedInstructions, setSavedInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  const [files, setFiles] = useState<LabFile[]>([]);
  const [addingFile, setAddingFile] = useState(false);
  // 지금 모달로 편집 중인 파일 하나 — 새 파일을 만들면 바로 그 파일의
  // 모달을 연다.
  const [editingFileId, setEditingFileId] = useState<number | null>(null);

  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [descModalOpen, setDescModalOpen] = useState(false);
  const [instrModalOpen, setInstrModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await adminApi.getPromptLabDoc(category, name);
        if (cancelled) return;

        let initialInstructions = doc.instructions;
        const isEmpty = !doc.description && !doc.instructions && doc.files.length === 0;
        if (isEmpty) {
          // 이 챗랩 저장소를 아직 한 번도 안 쓴 프롬프트 — 발행된 내용을
          // 지침 칸의 시작값으로만 보여준다(저장 전까지는 서버에 안
          // 남는다 — 그래서 아래 savedInstructions는 빈 문자열로 둬서
          // "저장 안 됨" 상태로 보이게 한다).
          try {
            const published = await adminApi.getPrompt(category, name);
            initialInstructions = published.active_content;
            if (cancelled) return;
            setServerVersion(published.active_version);
          } catch {
            // 발행된 것도 없으면 그냥 빈 채로 시작
          }
        } else {
          try {
            const published = await adminApi.getPrompt(category, name);
            if (!cancelled) setServerVersion(published.active_version);
          } catch {
            // 버전 표시만 못 할 뿐 패널 자체는 정상 동작
          }
        }

        const loadedFiles = await Promise.all(
          doc.files.map((f) => adminApi.getPromptLabFile(category, name, f.id))
        );
        if (cancelled) return;

        setDescription(doc.description);
        setSavedDescription(doc.description);
        setInstructions(initialInstructions);
        setSavedInstructions(doc.instructions);
        setFiles(
          loadedFiles.map((f) => ({
            id: f.id,
            name: f.name,
            content: f.content,
            serverName: f.name,
            serverContent: f.content,
            saving: false,
          }))
        );
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, name]);

  const saveDescription = async () => {
    setSavingDescription(true);
    try {
      await adminApi.updatePromptLabDescription(category, name, description);
      setSavedDescription(description);
    } catch (err) {
      console.error("설명 저장 실패", err);
    } finally {
      setSavingDescription(false);
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    try {
      await adminApi.updatePromptLabInstructions(category, name, instructions);
      setSavedInstructions(instructions);
    } catch (err) {
      console.error("지침 저장 실패", err);
    } finally {
      setSavingInstructions(false);
    }
  };

  const addFile = async () => {
    setAddingFile(true);
    try {
      const meta = await adminApi.createPromptLabFile(category, name, "새 파일", "");
      setFiles((prev) => [
        ...prev,
        { id: meta.id, name: meta.name, content: "", serverName: meta.name, serverContent: "", saving: false },
      ]);
      setEditingFileId(meta.id);
    } catch (err) {
      console.error("파일 추가 실패", err);
    } finally {
      setAddingFile(false);
    }
  };

  const updateFileField = (id: number, patch: Partial<Pick<LabFile, "name" | "content">>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const saveFile = async (id: number) => {
    const target = files.find((f) => f.id === id);
    if (!target) return;
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, saving: true } : f)));
    try {
      const meta = await adminApi.updatePromptLabFile(category, name, id, {
        name: target.name,
        content: target.content,
      });
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, name: meta.name, serverName: meta.name, serverContent: target.content, saving: false }
            : f
        )
      );
    } catch (err) {
      console.error("파일 저장 실패", err);
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, saving: false } : f)));
    }
  };

  const removeFile = async (id: number) => {
    try {
      await adminApi.deletePromptLabFile(category, name, id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      setEditingFileId((prev) => (prev === id ? null : prev));
    } catch (err) {
      console.error("파일 삭제 실패", err);
    }
  };

  const publish = async () => {
    try {
      const r = await adminApi.publishPromptLab(category, name);
      setServerVersion(r.new_version);
    } catch (err) {
      console.error("발행 실패", err);
    }
  };

  if (loadError) {
    return (
      <div className="p-4">
        <p className="text-[13px] text-[var(--danger)]">{loadError}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="ui-spinner h-5 w-5" />
      </div>
    );
  }

  const descDirty = description !== savedDescription;
  const instrDirty = instructions !== savedInstructions;
  const anySavedContent = savedDescription.trim() || savedInstructions.trim() || files.some((f) => f.serverContent.trim());
  const editingFile = files.find((f) => f.id === editingFileId) ?? null;

  return (
    <div>
      <div className="ui-divider border-b px-3.5 py-3.5">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">발행 버전 v{serverVersion ?? "-"}</p>
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-faint)]">
          각 칸의 저장 버튼을 눌러야 채팅 테스트에 반영됩니다(최대 60초 지연). 저장은 칸마다 따로 서버에 남습니다.
        </p>
      </div>

      <div className="space-y-4 px-3.5 py-3.5">
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">설명</h3>
            <button
              type="button"
              onClick={() => setDescModalOpen(true)}
              aria-label="설명 편집"
              className="ui-btn flex h-5 w-5 flex-none items-center justify-center rounded-md text-[13px] font-bold leading-none"
            >
              +
            </button>
          </div>
          {description.trim() ? (
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {description}
              {descDirty && <span className="ml-1 text-[var(--warn)]">●</span>}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">이 프롬프트가 무엇인지 짧게 추가</p>
          )}
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">
              지침 <span className="font-normal text-[var(--text-faint)]">({instructions.length.toLocaleString()}자)</span>
            </h3>
            <button
              type="button"
              onClick={() => setInstrModalOpen(true)}
              aria-label="지침 편집"
              className="ui-btn flex h-5 w-5 flex-none items-center justify-center rounded-md text-[13px] font-bold leading-none"
            >
              +
            </button>
          </div>
          {instructions.trim() ? (
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {instructions.slice(0, 80)}
              {instrDirty && <span className="ml-1 text-[var(--warn)]">●</span>}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">이 프롬프트의 동작 지침 추가</p>
          )}
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">
              파일 <span className="font-normal text-[var(--text-faint)]">({files.length})</span>
            </h3>
            <button
              type="button"
              onClick={addFile}
              disabled={addingFile}
              aria-label="파일 추가"
              className="ui-btn flex h-5 w-5 flex-none items-center justify-center rounded-md text-[13px] font-bold leading-none disabled:opacity-50"
            >
              +
            </button>
          </div>
          {files.length === 0 && <p className="text-[11px] text-[var(--text-faint)]">비어 있음</p>}
          <div className="grid grid-cols-2 gap-2">
            {files.map((f) => (
              <FileCard key={f.id} file={f} onSelect={() => setEditingFileId(f.id)} onRemove={() => removeFile(f.id)} />
            ))}
          </div>
        </section>
      </div>

      <div className="ui-divider space-y-2 border-t px-3.5 py-3.5">
        <button
          type="button"
          onClick={publish}
          disabled={!anySavedContent}
          className="ui-btn ui-btn-primary w-full rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
        >
          발행 → v{(serverVersion ?? 0) + 1}
        </button>
        <p className="text-[10px] leading-snug text-[var(--text-faint)]">
          지금까지 저장된 설명+지침+파일을 조립해 프로덕션 프롬프트 새 버전으로 만듭니다(저장 안 한 편집 중 내용은 제외).
        </p>
      </div>

      {descModalOpen && (
        <FieldModal
          title="설명 설정"
          hint="이 프롬프트가 무엇인지 짧게 적어두세요 — 채팅 테스트엔 실시간으로, 서버엔 저장을 눌러야 반영됩니다."
          value={description}
          onChange={setDescription}
          placeholder="이 프롬프트가 무엇인지 짧게 (선택)"
          rows={4}
          saving={savingDescription}
          onCancel={() => {
            setDescription(savedDescription);
            setDescModalOpen(false);
          }}
          onSave={async () => {
            await saveDescription();
            setDescModalOpen(false);
          }}
        />
      )}
      {instrModalOpen && (
        <FieldModal
          title="지침 설정"
          hint="웹툰 프롬프트 전체 지침입니다 — 채팅 테스트엔 실시간으로, 서버엔 저장을 눌러야 반영됩니다."
          value={instructions}
          onChange={setInstructions}
          rows={20}
          wide
          saving={savingInstructions}
          onCancel={() => {
            setInstructions(savedInstructions);
            setInstrModalOpen(false);
          }}
          onSave={async () => {
            await saveInstructions();
            setInstrModalOpen(false);
          }}
        />
      )}
      {editingFile && (
        <FileModal
          file={editingFile}
          onChange={(patch) => updateFileField(editingFile.id, patch)}
          onCancel={() => {
            updateFileField(editingFile.id, { name: editingFile.serverName, content: editingFile.serverContent });
            setEditingFileId(null);
          }}
          onSave={async () => {
            await saveFile(editingFile.id);
            setEditingFileId(null);
          }}
        />
      )}
    </div>
  );
}

/** Claude 프로젝트의 "프로젝트 지침 설정" 모달과 같은 모양 — 헤더의
 *  "+"를 누르면 뜬다. 텍스트영역은 상위 state(description/instructions)에
 *  직접 바인딩돼 있어 타이핑하는 동안에도 왼쪽 채팅 실시간 테스트에
 *  그대로 반영된다(2026-09-15 실시간 반영 요건과 호환) — "취소"를 누르면
 *  마지막 저장값으로 되돌리고, "저장"을 눌러야 서버에 남는다. */
function FieldModal({
  title,
  hint,
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  rows,
  wide = false,
  placeholder,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  rows: number;
  wide?: boolean;
  placeholder?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">{hint}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          autoFocus
          placeholder={placeholder}
          className="ui-input mt-3 max-h-[60vh] w-full resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {saving ? "저장 중..." : `${title.replace(" 설정", "")} 저장`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 노바 관리자 패널·Claude 프로젝트의 "컨텍스트" 파일 카드와 같은 모양
 *  — 이름 + 글자수 + 형식 배지만 보이는 작은 박스. 클릭하면 모달이 뜬다
 *  (2026-09-15, 사용자 요청: "파일 부분도 새창 나타나고 거기서 저장
 *  버튼 누르도록" — 이전엔 카드 아래 인라인으로 펼쳐졌었다). */
function FileCard({
  file,
  onSelect,
  onRemove,
}: {
  file: LabFile;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const dirty = file.name !== file.serverName || file.content !== file.serverContent;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="ui-card relative flex cursor-pointer flex-col items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="파일 삭제"
        className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <span className="w-full truncate pr-4 text-[12px] font-medium text-[var(--text-primary)]">
        {file.name || "(제목 없음)"}
        {dirty && <span className="ml-1 text-[var(--warn)]">●</span>}
      </span>
      <span className="text-[10px] tabular-nums text-[var(--text-faint)]">
        {file.content.length.toLocaleString()}자
      </span>
      <span className="ui-divider rounded border px-1 py-0.5 text-[9.5px] font-semibold leading-none text-[var(--text-faint)]">
        TXT
      </span>
    </div>
  );
}

function FileModal({
  file,
  onChange,
  onCancel,
  onSave,
}: {
  file: LabFile;
  onChange: (patch: Partial<Pick<LabFile, "name" | "content">>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dirty = file.name !== file.serverName || file.content !== file.serverContent;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel} role="presentation">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl">
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">파일 설정</h3>
        <input
          type="text"
          value={file.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="파일명"
          className="ui-input mt-3 w-full rounded-lg px-3 py-2 text-[13px]"
          autoFocus
        />
        <textarea
          value={file.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={14}
          spellCheck={false}
          placeholder="파일 내용"
          className="ui-input mt-2 max-h-[55vh] w-full resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
            취소
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={file.saving || !dirty}
            className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          >
            {file.saving ? "저장 중..." : "파일 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
