"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { saveAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    try {
      const { token, expires_at } = await adminApi.login(password);
      saveAuth(token, expires_at);
      router.replace("/");
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 423) {
          toast.show("잠금 상태 — 5분 후 재시도", "error");
        } else if (err.status === 401) {
          toast.show("비밀번호가 일치하지 않습니다", "error");
        } else {
          toast.show(`로그인 실패: ${err.message}`, "error");
        }
      } else {
        toast.show("네트워크 오류", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="ui-card-strong p-8 rounded-3xl w-full max-w-sm space-y-5"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            mbti-admin.sedaily.ai
          </h1>
          <p className="text-sm text-gray-700">관리자 비밀번호 입력</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="ui-input w-full px-4 py-2.5 rounded-lg text-sm text-gray-900"
          autoFocus
          required
        />
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-all shadow-md shadow-blue-500/25"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
