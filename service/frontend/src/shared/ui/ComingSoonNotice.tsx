'use client';

import { useState } from "react";

interface Props {
  feature: "archive" | "dna";
  title: string;
  description: string;
}

const STORAGE_KEY = "ailens-coming-soon-waitlist";

type WaitlistEntry = { feature: string; email: string; at: string };

function saveWaitlist(entry: WaitlistEntry) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: WaitlistEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage 접근 실패는 무시 — 알림 신청은 best-effort
  }
}

export function ComingSoonNotice({ feature, title, description }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitted">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    saveWaitlist({ feature, email: trimmed, at: new Date().toISOString() });
    setStatus("submitted");
    setEmail("");
  };

  return (
    <div className="flex justify-center px-4 py-16 lg:py-24">
      <div className="w-full max-w-md text-center">
        <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-600 text-[11px] font-medium rounded-full tracking-wide">
          COMING SOON
        </span>
        <h2 className="mt-5 text-[22px] lg:text-[24px] font-bold text-gray-900 leading-tight">
          {title}
        </h2>
        <p className="mt-3 text-[14px] text-gray-500 leading-relaxed whitespace-pre-line">
          {description}
        </p>

        {status === "submitted" ? (
          <div className="mt-8 px-5 py-4 bg-gray-50 rounded-2xl text-[13px] text-gray-700">
            알림 신청이 접수되었어요. 출시 소식 보내드릴게요.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
              aria-label="알림 신청 이메일"
            />
            <button
              type="submit"
              className="w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white text-[14px] font-medium rounded-xl transition-colors"
            >
              출시 알림 받기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
