"use client";

import { useRef, useState } from "react";
import { uploadImage, ImageUploadError } from "@/lib/uploadImage";
import { useToast } from "@/components/Toast";
import type { CmsImage } from "@/lib/types";

// 웹툰 파일럿(2026-08-06) — 컷 이미지+캡션 나열. 새 필드 없이 기존
// body_inline.images(url+caption)를 컷 목록으로 그대로 쓴다(백엔드
// _shape_webtoon 과 1:1). 그림 자체는 GPT 등 외부 생성 후 여기서 업로드만.
//
// 2026-08-09 세 가지를 더했다:
// 1. 여러 장 업로드가 하나씩 순서대로 끝나는 대로 바로바로 화면에 나타난다
//    (전엔 다 끝날 때까지 기다렸다 한 번에 붙였다 — "1번은 먼저 되는 거
//    아니냐"는 지적).
// 2. 체크박스로 여러 컷을 골라 한 번에 삭제(전체 선택도 겸한다).
// 3. 이 영역 어디에 파일을 놓아도(카드 사이 여백·라벨 텍스트 등, 꼭 하단
//    "컷 추가" 박스가 아니어도) 업로드되는 전체 드롭존 — 드래그 중엔 옅은
//    오버레이로 "여기에 놓으면 추가돼요"를 보여준다.
export function WebtoonPanelsEditor({
  panels,
  onChange,
}: {
  panels: CmsImage[];
  onChange: (next: CmsImage[]) => void;
}) {
  const toast = useToast();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadingBatch, setUploadingBatch] = useState<{ done: number; total: number } | null>(null);
  // 컷 위로 이미지를 끌어다 놓으면 교체, 하단 추가 영역에 놓으면 새 컷으로
  // 추가된다(2026-08-07, "던지면 교체되게" 요청) — CoverImageField.tsx의
  // 드래그앤드롭 패턴과 동일. -1 은 "컷 추가" 드롭존.
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // 컷 순서 재배열 — "↑ 위로/↓ 아래로" 버튼만으로는 컷이 많을 때(8~10컷)
  // 너무 느리다는 지적(2026-08-07)으로 드래그 정렬을 추가했다. 왼쪽 손잡이
  // (⠿)를 끌어 다른 컷 위에 놓으면 그 자리로 순서가 바뀐다 — 이미지
  // 영역(파일 드롭 = 교체)과 겹치지 않게 손잡이만 draggable로 뒀다. 버튼은
  // 키보드/스크린리더 접근성을 위해 그대로 남겨둔다(드래그는 대체 불가능).
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  // url을 키로 쓴다 — 인덱스는 재배열·삭제로 계속 바뀌어서 선택 상태가
  // 엉뚱한 컷을 가리키게 될 수 있다. url은 업로드된 실제 파일을 가리키는
  // 안정적인 값이라 순서가 바뀌어도 선택이 같은 컷을 계속 따라간다.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 이 영역 전체가 드롭존이다 — dragenter/dragleave는 자식 요소를 넘나들
  // 때마다도 버블링돼서(mouseover/mouseout과 같은 계열) 카운터 없이 boolean만
  // 쓰면 자식 위를 지날 때마다 깜빡인다. 진입할 때 +1, 이탈할 때 -1 해서
  // 0보다 클 때만 "이 영역 안에 있다"로 본다 — 표준적인 회피법.
  const dragCounter = useRef(0);
  const [containerDragActive, setContainerDragActive] = useState(false);

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...panels];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const doUpload = async (file: File): Promise<string | null> => {
    try {
      return await uploadImage(file);
    } catch (err) {
      toast.show(err instanceof ImageUploadError ? err.message : "업로드 실패", "error");
      return null;
    }
  };

  // 순서를 지키려고 병렬(Promise.all)이 아니라 순차로 업로드한다 — 병렬로
  // 하면 어느 게 먼저 끝나느냐에 따라 컷 순서가 파일을 고른 순서와 달라질
  // 수 있다. 파일이 끝날 때마다 바로바로 onChange를 호출해서 화면에
  // 나타나게 하되(2026-08-09, "실시간으로 쭉 되는 것처럼" 요청), panels
  // prop을 매번 다시 읽으면 아직 리렌더 전이라 오래된 값일 수 있어서
  // 로컬 변수(current)로 누적해 매번 정확한 전체 배열을 넘긴다.
  const addPanels = async (files: File[]) => {
    setUploadingBatch({ done: 0, total: files.length });
    let current = panels;
    for (const file of files) {
      const url = await doUpload(file);
      if (url) {
        current = [...current, { url, caption: "" }];
        onChange(current);
      }
      setUploadingBatch((b) => (b ? { done: b.done + 1, total: b.total } : b));
    }
    setUploadingBatch(null);
  };

  const replacePanel = async (index: number, file: File) => {
    setUploadingIndex(index);
    const url = await doUpload(file);
    if (url) onChange(panels.map((p, i) => (i === index ? { ...p, url } : p)));
    setUploadingIndex(null);
  };

  const removePanel = (index: number) => {
    if (!window.confirm(`컷 ${index + 1}을(를) 삭제할까요?`)) return;
    const url = panels[index]?.url;
    onChange(panels.filter((_, i) => i !== index));
    if (url) setSelected((prev) => { const next = new Set(prev); next.delete(url); return next; });
  };

  const toggleSelect = (url: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const allSelected = panels.length > 0 && panels.every((p) => selected.has(p.url));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(panels.map((p) => p.url)));

  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}개 컷을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    onChange(panels.filter((p) => !selected.has(p.url)));
    setSelected(new Set());
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= panels.length) return;
    const next = [...panels];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const setCaption = (index: number, caption: string) =>
    onChange(panels.map((p, i) => (i === index ? { ...p, caption } : p)));

  return (
    <div
      className="relative space-y-3"
      // 컨테이너 전체 드롭존(2026-08-09) — 더 안쪽의 구체적인 드롭존(컷
      // 교체, 하단 추가 박스)은 각자 stopPropagation으로 여기까지 안
      // 올라오게 막는다. 여기 onDrop은 그 외 나머지(카드 사이 여백, 라벨
      // 텍스트 등 어디든)에 떨어진 파일을 받는 catch-all이다.
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter.current += 1;
        setContainerDragActive(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setContainerDragActive(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter.current = 0;
        setContainerDragActive(false);
        setDragOverIndex(null);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) void addPanels(files);
      }}
    >
      {containerDragActive && (
        <div
          className="ui-toast pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl"
          style={{ background: "var(--accent-soft)", border: "2px dashed var(--accent)" }}
        >
          <span className="text-[14px] font-semibold" style={{ color: "var(--accent)" }}>
            여기에 놓으면 컷으로 추가돼요
          </span>
        </div>
      )}

      {panels.length > 0 && (
        <div className="flex items-center gap-3 px-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <label className="flex cursor-pointer select-none items-center gap-1.5">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="cursor-pointer" />
            전체 선택
          </label>
          {selected.size > 0 && (
            <>
              <span>{selected.size}개 선택됨</span>
              <button
                type="button"
                onClick={deleteSelected}
                className="ml-auto cursor-pointer font-semibold hover:opacity-75"
                style={{ color: "var(--danger)" }}
              >
                선택 삭제
              </button>
            </>
          )}
        </div>
      )}

      {panels.map((p, i) => (
        <div
          key={i}
          className={`ui-card rounded-xl p-3 flex gap-3 transition-shadow ${
            draggingIndex !== null && draggingIndex !== i ? "ring-1 ring-[var(--accent-ring)]" : ""
          } ${draggingIndex === i ? "opacity-40" : ""}`}
          // 카드 전체가 재배열 드롭 타겟 — 손잡이(⠿)를 끌어 이 카드 위에
          // 놓으면 그 자리로 옮겨간다. 이미지 위 파일 드롭(교체)과는 별개 영역.
          onDragOver={(e) => {
            if (draggingIndex === null) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (draggingIndex === null) return;
            e.preventDefault();
            reorder(draggingIndex, i);
            setDraggingIndex(null);
          }}
        >
          <label className="flex shrink-0 items-start self-stretch pt-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected.has(p.url)}
              onChange={() => toggleSelect(p.url)}
              className="cursor-pointer"
              aria-label={`컷 ${i + 1} 선택`}
            />
          </label>
          <div
            draggable
            onDragStart={(e) => {
              setDraggingIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDraggingIndex(null)}
            className="flex shrink-0 cursor-grab items-center self-stretch px-0.5 text-gray-300 hover:text-gray-500 active:cursor-grabbing"
            aria-label={`컷 ${i + 1} 끌어서 순서 바꾸기`}
            title="끌어서 순서 바꾸기"
          >
            ⠿
          </div>
          <div
            className={`shrink-0 text-center rounded-lg transition-colors ${
              dragOverIndex === i ? "ring-2 ring-[var(--accent)] bg-[var(--accent-soft)]" : ""
            }`}
            onDragOver={(e) => {
              if (draggingIndex !== null) return; // 컷 재배열 중 — 교체 드롭존이 아니라 카드 전체가 타겟
              e.preventDefault();
              e.stopPropagation();
              setDragOverIndex(i);
            }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              if (draggingIndex !== null) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverIndex(null);
              // stopPropagation 때문에 이 드롭은 컨테이너까지 안 올라간다 —
              // 컨테이너 쪽 오버레이 상태(dragCounter/containerDragActive)를
              // 여기서 직접 안 지우면 "드롭은 끝났는데 전체 드롭존 오버레이가
              // 안 사라진다"는 버그가 난다(2026-08-09 발견 — 업로드는 됐는데
              // 화면이 계속 파란 드롭존으로 덮여 컷이 안 보였다).
              dragCounter.current = 0;
              setContainerDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void replacePanel(i, file);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본 URL */}
            <img src={p.url} alt="" className="h-28 w-28 rounded-lg object-cover bg-gray-100 pointer-events-none" />
            <label className="mt-1 block text-[11px] font-medium text-[var(--accent)] cursor-pointer">
              {uploadingIndex === i ? "업로드 중..." : dragOverIndex === i ? "여기에 놓으세요" : "교체 (끌어놓기 가능)"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void replacePanel(i, file);
                }}
              />
            </label>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <textarea
              value={p.caption ?? ""}
              onChange={(e) => setCaption(i, e.target.value)}
              rows={3}
              placeholder={`컷 ${i + 1} 대사/캡션 (선택)`}
              className="ui-input w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
            />
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-gray-900 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                ↑ 위로
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === panels.length - 1} className="hover:text-gray-900 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                ↓ 아래로
              </button>
              <button type="button" onClick={() => removePanel(i)} className="ml-auto text-[var(--danger)] hover:opacity-75 cursor-pointer">
                삭제
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* 클릭·드롭 둘 다 받는 타겟 자체가 얇아서 놓치기 쉽다는 지적
          (2026-08-09, "박스 범위가 너무 작아서 불편하다" — 두 번 더 키워달라는
          요청으로 처음보다 훨씬 크게). 컷이 아직 하나도 없는 "새 웹툰"
          상태에서는 이 박스가 화면의 사실상 유일한 조작 대상이라, 최소
          높이(min-h)를 크게 잡고 아이콘·글자도 키워서 화면에서 확실히
          도드라지게 했다. */}
      <label
        className={`flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed py-16 cursor-pointer transition-colors ${
          dragOverIndex === -1
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-gray-300 text-gray-500 hover:bg-gray-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOverIndex(-1);
        }}
        onDragLeave={() => setDragOverIndex((cur) => (cur === -1 ? null : cur))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOverIndex(null);
          // 컨테이너 오버레이 리셋 — 위 per-cut 교체 onDrop과 같은 이유.
          dragCounter.current = 0;
          setContainerDragActive(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) void addPanels(files);
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <span className="text-[22px] font-semibold">
          {uploadingBatch
            ? `업로드 중... (${uploadingBatch.done}/${uploadingBatch.total})`
            : dragOverIndex === -1
            ? "여기에 놓으세요"
            : "컷 추가"}
        </span>
        {!uploadingBatch && dragOverIndex !== -1 && (
          <span className="text-[14.5px]" style={{ opacity: 0.75 }}>
            여러 장 한번에 가능 · 이미지 업로드 또는 끌어놓기
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addPanels(files);
          }}
        />
      </label>
    </div>
  );
}
