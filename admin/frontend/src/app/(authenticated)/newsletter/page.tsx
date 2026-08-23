"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { NewsletterStatsResponse } from "@/lib/types";

const PERIOD_OPTIONS = [
  { days: 1, label: "1일" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: 90, label: "90일" },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return d.toISOString().slice(0, 10);
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase">{label}</p>
      <p
        className="mt-2 text-3xl font-bold tracking-tight"
        style={{ color: accent ?? "rgb(15, 23, 42)" }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function NewsletterPage() {
  const [data, setData] = useState<NewsletterStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // drivers/page.tsx의 초기 로드 effect와 같은 이유 — setLoading/setError는
    // await 이전(동기)에 걸리지만 실제 데이터 setData는 await 이후에 걸려서
    // "마운트/day 변경 시 fetch" 정석 패턴이지 cascading-render 안티패턴이
    // 아니다(2026-08-23, CLAUDE.md의 기존 예외와 같은 근거로 추가).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    adminApi
      .getNewsletterStats(days)
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  const totalActive = data?.subscribers.active ?? 0;
  const totalAll = data?.subscribers.total ?? 0;
  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Newsletter</h1>
          <p className="mt-1 text-sm text-gray-500">
            구독자 · 발송 · 오픈 · 클릭 — SES Configuration Set <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">ailens-newsletter</code>
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                days === opt.days
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">불러오는 중…</div>
      )}

      {data && (
        <>
          {/* 구독자 */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">구독자</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="활성"
                value={totalActive.toLocaleString()}
                sub={totalAll !== totalActive ? `전체 ${totalAll} 중` : "전체와 동일"}
                accent="rgb(37, 99, 235)"
              />
            </div>
          </section>

          {/* 발송 지표 — 최근 N일 */}
          {m && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">
                발송 지표 · 최근 {m.days}일
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="발송" value={m.send.toLocaleString()} accent="rgb(59, 130, 246)" />
                <StatCard
                  label="도착"
                  value={m.delivery.toLocaleString()}
                  sub={m.send > 0 ? `${m.delivery_rate}%` : "—"}
                  accent="rgb(16, 185, 129)"
                />
                <StatCard
                  label="오픈"
                  value={m.open.toLocaleString()}
                  sub={m.send > 0 ? `오픈율 ${m.open_rate}%` : "—"}
                  accent="rgb(245, 158, 11)"
                />
                <StatCard
                  label="클릭"
                  value={m.click.toLocaleString()}
                  sub={m.send > 0 ? `클릭율 ${m.click_rate}%` : "—"}
                  accent="rgb(168, 85, 247)"
                />
              </div>
              {(m.bounce > 0 || m.complaint > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <StatCard label="Bounce" value={m.bounce.toLocaleString()} accent="rgb(239, 68, 68)" />
                  <StatCard label="Complaint" value={m.complaint.toLocaleString()} accent="rgb(220, 38, 38)" />
                </div>
              )}
            </section>
          )}

          {/* 최근 구독 */}
          <section>
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase mb-3">최근 구독 · 10건</h2>
            <div className="rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden">
              {data.subscribers.recent.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">아직 구독자가 없어요.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">이메일</th>
                      <th className="text-left px-4 py-2 font-semibold">상태</th>
                      <th className="text-right px-4 py-2 font-semibold">구독</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscribers.recent.map((r, i) => (
                      <tr key={`${r.email}-${i}`} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{r.email}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{r.status ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                          {formatRelative(r.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <p className="text-xs text-gray-400 text-center pt-2">
            CloudWatch{" "}
            <a
              href="https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/sedaily-mbti-newsletter"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              dashboard ↗
            </a>{" "}
            에서 시간별 그래프 확인 · 데이터 갱신 ~5분 지연
          </p>
        </>
      )}
    </div>
  );
}
