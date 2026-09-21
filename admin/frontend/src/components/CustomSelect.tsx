"use client";

import { useEffect, useRef, useState } from "react";

// 네이티브 <select>는 스타일을 못 입힌다 — DateRangeCalendar.tsx와 같은
// 팝오버/accent 톤으로 통일해달라는 요청(2026-08-07 "공통되게 해주시죠")에
// 맞춘 범용 드롭다운. 외부 의존성 없이 직접 구현(zero-new-dependency).

interface Option<T extends string> {
  value: T;
  label: string;
  /** 2026-09-20, 웹툰 모델 선택 — "사용 중"/"운영 중"/"사업상 미사용"처럼
   *  옵션 옆에 작은 상태 태그를 붙이고 싶을 때. 없으면 안 그린다(기존
   *  호출부는 그대로 동작). */
  badge?: string;
  /** true면 선택은 그대로 가능하되(비교용으로 여전히 골라볼 수 있어야
   *  하므로 클릭 자체는 안 막는다) 글자색을 흐리게 렌더해 "정책상 지금은
   *  안 쓰기로 한 옵션"임을 표시한다. */
  muted?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  /** 2026-09-20, 좌측 채팅창 입력창 위 모델 드롭다운 요청 — 트리거가 화면
   *  하단(채팅 입력창)에 가까우면 기본(아래로 펼침) 팝업이 뷰포트 밖으로
   *  잘린다. true면 팝업이 트리거 위쪽으로 펼쳐진다. */
  openUp?: boolean;
}

export function CustomSelect<T extends string>({ value, options, onChange, placeholder, openUp = false }: Props<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 outline-none"
      >
        <span
          className="text-[12.5px] font-medium"
          style={{ color: current?.muted ? "var(--text-faint)" : current ? "var(--text-primary)" : "var(--text-muted)" }}
        >
          {current?.label ?? placeholder ?? "선택"}
        </span>
        {current?.badge && <OptionBadge text={current.badge} muted={current.muted} />}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-gray-400"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-20 min-w-[140px] rounded-xl border p-1 ${
            openUp ? "bottom-full mb-1.5" : "mt-1.5"
          }`}
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border-hairline)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              style={{
                color: o.muted ? "var(--text-faint)" : o.value === value ? "var(--accent)" : "var(--text-secondary)",
                background: o.value === value && !o.muted ? "var(--accent-soft)" : undefined,
              }}
            >
              <span>{o.label}</span>
              {o.badge && <OptionBadge text={o.badge} muted={o.muted} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 옵션 옆 작은 상태 태그 — muted면 회색(정책상 미사용), 아니면 accent
 *  톤(현재 사용/운영 중처럼 눈에 띄어야 하는 상태). */
function OptionBadge({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-medium"
      style={{
        color: muted ? "var(--text-faint)" : "var(--accent)",
        background: muted ? "var(--surface-sunken)" : "var(--accent-soft)",
      }}
    >
      {text}
    </span>
  );
}
