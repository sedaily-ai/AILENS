"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

/* 흰 카드 + 색 아이콘. 예전엔 통째로 색을 칠했는데, 화면 전체가 밝은 톤이라
   컬러 블록이 튀었다. 색은 아이콘과 좌측 바에만 쓴다. */
const STYLE: Record<ToastType, { accent: string; soft: string; icon: React.ReactNode }> = {
  success: {
    accent: "var(--ok)",
    soft: "var(--ok-soft)",
    icon: <path d="m4.5 12.5 5 5 10-11" />,
  },
  error: {
    accent: "var(--danger)",
    soft: "var(--danger-soft)",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </>
    ),
  },
  info: {
    accent: "var(--accent)",
    soft: "var(--accent-soft)",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5v.01" />
      </>
    ),
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => {
          const s = STYLE[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className="ui-toast ui-card-strong pointer-events-auto flex items-center gap-2.5 rounded-xl pl-3 pr-4 py-2.5 min-w-[220px] max-w-[360px] relative overflow-hidden"
            >
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: s.accent }}
              />
              <span
                className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: s.soft, color: s.accent }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {s.icon}
                </svg>
              </span>
              <span
                className="text-[13px] font-medium leading-5"
                style={{ color: "var(--text-primary)" }}
              >
                {t.message}
              </span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
