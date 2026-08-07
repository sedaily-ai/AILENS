"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import {
  ChartCard,
  Columns,
  Meter,
  StatTile,
  TableView,
  type Column,
} from "@/components/charts";
import { ErrorNote } from "@/components/Feedback";
import type { AuditEntry, CostResponse, DriversResponse } from "@/lib/types";

const ACTIVITY_DAYS = 14;

export default function DashboardPage() {
  const [drivers, setDrivers] = useState<DriversResponse | null>(null);
  const [cost, setCost] = useState<CostResponse | null>(null);
  const [audits, setAudits] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 마운트 시 한 번만 스냅샷 — react-hooks/purity 회피 + 활동 축 고정.
  const [nowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      adminApi.getDrivers(),
      adminApi.getCost(),
      adminApi.getAudit(200),
    ]).then(([d, c, a]) => {
      if (cancelled) return;
      if (d.status === "fulfilled") setDrivers(d.value);
      if (c.status === "fulfilled") setCost(c.value);
      if (a.status === "fulfilled") setAudits(a.value.audits);
      const failed = [d, c, a].filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        setError(
          failed
            .map((r) => (r as PromiseRejectedResult).reason?.message)
            .filter(Boolean)
            .join(", ") || "일부 위젯을 불러오지 못했습니다"
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledFlags = drivers
    ? Object.values(drivers.feature_flags).filter(Boolean).length
    : null;
  const totalFlags = drivers ? Object.keys(drivers.feature_flags).length : null;
  const activeRules = drivers
    ? drivers.rules.filter((r) => r.state === "ENABLED").length
    : null;
  const totalRules = drivers ? drivers.rules.length : null;

  // 14일 활동, KST. 감사로그 ts 를 KST 날짜로 버킷팅한 뒤 오늘로 끝나는
  // 연속 축에 재정렬 — 빈 날도 자리를 차지해야 추이가 왜곡되지 않는다.
  const columns: Column[] = useMemo(() => {
    if (!audits) return [];
    const counts = new Map<string, number>();
    for (const a of audits) {
      const parsedMs = new Date(a.ts).getTime();
      if (Number.isNaN(parsedMs)) continue; // ts 누락/손상된 로그는 활동 그래프에서 제외
      const kst = new Date(parsedMs + 9 * 3600 * 1000);
      const key = kst.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: Column[] = [];
    const todayKst = new Date(nowMs + 9 * 3600 * 1000);
    for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
      const day = new Date(todayKst);
      day.setUTCDate(todayKst.getUTCDate() - i);
      const key = day.toISOString().slice(0, 10);
      out.push({
        label: `${day.getUTCMonth() + 1}/${day.getUTCDate()}`,
        fullLabel: key,
        value: counts.get(key) ?? 0,
      });
    }
    return out;
  }, [audits, nowMs]);

  const totalActivity = columns.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          대시보드
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          운영 상태 한눈에 보기
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      {/* 헤드라인 숫자 3개. 비율은 미터로 — 2조각 도넛은 값을 읽기 어렵다. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="ui-enter">
          <StatTile
            label="7일 비용 (추정)"
            value={cost ? `$${cost.total_7d_usd.toFixed(2)}` : "–"}
            sub={cost?.note}
            loading={!cost}
          />
        </div>
        <div className="ui-enter" style={{ ["--i" as string]: 1 }}>
          <Meter
            label="활성 EventBridge 룰"
            value={activeRules}
            total={totalRules}
            loading={!drivers}
          />
        </div>
        <div className="ui-enter" style={{ ["--i" as string]: 2 }}>
          <Meter
            label="켜진 피처 플래그"
            value={enabledFlags}
            total={totalFlags}
            loading={!drivers}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 ui-enter" style={{ ["--i" as string]: 3 }}>
          <ChartCard title={`최근 ${ACTIVITY_DAYS}일 변경 활동 · 총 ${totalActivity}건`}>
            {audits === null ? (
              <div className="ui-skeleton h-[120px] w-full" />
            ) : totalActivity === 0 ? (
              <p className="text-[13px] py-10 text-center" style={{ color: "var(--text-muted)" }}>
                최근 {ACTIVITY_DAYS}일간 변경 기록이 없습니다.
              </p>
            ) : (
              <>
                <Columns data={columns} />
                <TableView
                  caption={`최근 ${ACTIVITY_DAYS}일 일자별 변경 건수`}
                  rows={columns
                    .filter((c) => c.value > 0)
                    .map((c) => ({ label: c.fullLabel, display: `${c.value}건` }))}
                />
              </>
            )}
          </ChartCard>
        </div>

        <div className="ui-enter" style={{ ["--i" as string]: 4 }}>
          <ChartCard title="최근 변경">
            {audits === null ? (
              <div className="space-y-2.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="ui-skeleton h-4 w-full" />
                ))}
              </div>
            ) : audits.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                기록 없음
              </p>
            ) : (
              <ul className="space-y-2.5">
                {audits.slice(0, 6).map((a) => (
                  <li key={a.ts} className="flex items-baseline gap-2">
                    <span
                      className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: "var(--series-solo)" }}
                      aria-hidden="true"
                    />
                    <span
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {a.action}
                    </span>
                    <span
                      className="ml-auto text-[11px] tabular-nums flex-shrink-0"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {new Date(a.ts).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "numeric",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/drivers"
              className="mt-4 inline-block text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] hover:underline underline-offset-2"
            >
              스케줄·플래그 관리 →
            </Link>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
