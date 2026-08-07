"use client";

import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import {
  BarList,
  ChartCard,
  StackedBar,
  TableView,
  type BarItem,
  type StackSegment,
} from "@/components/charts";
import { CardSkeleton, ErrorNote } from "@/components/Feedback";
import type { CostResponse } from "@/lib/types";

// 색은 globals.css 의 --series-* 토큰만 쓴다. 예전엔 여기서 눈대중으로
// 고른 6색을 돌려썼는데, 색각 이상 분리도를 검증한 적이 없었다.
// 지금 토큰은 dataviz 검증기를 흰 표면 기준으로 통과시킨 조합이다.

// `sedaily-mbti-` 접두어를 줄여서 라벨에 더 많은 정보가 들어가도록.
function shortLambda(name: string): string {
  return name.replace(/^sedaily-mbti-/, "");
}

function shortModel(model: string): string {
  // "us.anthropic.claude-opus-4-6-v1:0" → "claude-opus-4-6"
  return model
    .replace(/^us\./, "")
    .replace(/^anthropic\./, "")
    .replace(/^amazon\./, "")
    .replace(/-v\d+:\d+$/, "");
}

export default function CostPage() {
  const [data, setData] = useState<CostResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getCost()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  // Flat per (lambda, model) rows + aggregate views.
  const flat = useMemo(() => {
    if (!data) return null;
    const rows: {
      lambda: string;
      model: string;
      input_tokens?: number;
      output_tokens?: number;
      cost_usd: number;
    }[] = [];
    for (const [lambda, byModel] of Object.entries(data.by_lambda)) {
      for (const [model, entry] of Object.entries(byModel)) {
        rows.push({
          lambda,
          model,
          input_tokens: entry.input_tokens,
          output_tokens: entry.output_tokens,
          cost_usd: entry.cost_usd,
        });
      }
    }
    rows.sort((a, b) => b.cost_usd - a.cost_usd);

    // Lambda → total cost
    const byLambda = new Map<string, number>();
    for (const r of rows) {
      byLambda.set(r.lambda, (byLambda.get(r.lambda) ?? 0) + r.cost_usd);
    }
    const lambdaBars: BarItem[] = Array.from(byLambda.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lambda, cost]) => ({
        label: shortLambda(lambda),
        value: cost,
        display: `$${cost.toFixed(4)}`,
      }));

    // Model → total cost. 도넛이 아니라 가로 누적 막대 — 모델명이 길어
    // 도넛 라벨이 안 들어가고, part-to-whole 의 기본형이 누적 막대다.
    const byModel = new Map<string, number>();
    for (const r of rows) {
      byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.cost_usd);
    }
    const modelSegments: StackSegment[] = Array.from(byModel.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([model, cost]) => ({
        label: shortModel(model),
        value: cost,
        display: `$${cost.toFixed(4)}`,
      }));

    // Lambda → total tokens (input vs output, top 8)
    type TokenRow = { lambda: string; input: number; output: number };
    const tokenMap = new Map<string, TokenRow>();
    for (const r of rows) {
      const cur = tokenMap.get(r.lambda) ?? {
        lambda: r.lambda,
        input: 0,
        output: 0,
      };
      cur.input += r.input_tokens ?? 0;
      cur.output += r.output_tokens ?? 0;
      tokenMap.set(r.lambda, cur);
    }
    const tokenRows = Array.from(tokenMap.values())
      .sort((a, b) => b.input + b.output - (a.input + a.output))
      .slice(0, 8);

    return { rows, lambdaBars, modelSegments, tokenRows };
  }, [data]);

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          비용
        </h1>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!data || !flat) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          비용
        </h1>
        <CardSkeleton count={4} />
      </div>
    );
  }

  const { rows, lambdaBars, modelSegments, tokenRows } = flat;
  const tokenMax = Math.max(
    ...tokenRows.map((r) => Math.max(r.input, r.output)),
    1
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
            비용
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            최근 7일 추정치
          </p>
        </div>
        {/* 히어로 숫자 — 비례 숫자(큰 글자에 tabular-nums 는 헐거워 보인다) */}
        <div
          className="text-[38px] font-bold leading-none"
          style={{ color: "var(--text-primary)" }}
        >
          ${data.total_7d_usd.toFixed(2)}
        </div>
      </div>

      <p
        className="text-[12px] leading-relaxed max-w-3xl"
        style={{ color: "var(--text-muted)" }}
      >
        {data.note}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 ui-enter">
          <ChartCard title="Lambda 별 비용 (상위 8)">
            {/* 크기 비교 — 전부 같은 색. 막대 길이가 이미 크기다. */}
            <BarList items={lambdaBars.slice(0, 8)} />
          </ChartCard>
        </div>
        <div className="ui-enter" style={{ ["--i" as string]: 1 }}>
          <ChartCard title="모델별 구성">
            {modelSegments.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                데이터 없음
              </p>
            ) : (
              <>
                {/* 부분-전체 — 도넛 대신 가로 누적 막대. 모델명이 길어
                    도넛 라벨이 안 들어가고, 범례에 값을 직접 찍어야 한다
                    (팔레트 검증에서 대비 WARN → 라벨 의무). */}
                <StackedBar segments={modelSegments} />
                <TableView
                  caption="모델별 7일 비용"
                  rows={modelSegments.map((s) => ({
                    label: s.label,
                    display: s.display,
                  }))}
                />
              </>
            )}
          </ChartCard>
        </div>
      </div>

      {/* 입력/출력 토큰 — 2계열 비교라 범례 + 값 직접 표기.
          색은 검증된 series-1/2 (adjacent CVD ΔE 통과분). */}
      <div className="ui-enter">
        <ChartCard title="입력 · 출력 토큰 (상위 8)">
          {tokenRows.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              데이터 없음
            </p>
          ) : (
            <>
              <div className="flex gap-4 text-[12px] mb-4">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: "var(--series-1)" }}
                    aria-hidden="true"
                  />
                  <span style={{ color: "var(--text-secondary)" }}>입력</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: "var(--series-2)" }}
                    aria-hidden="true"
                  />
                  <span style={{ color: "var(--text-secondary)" }}>출력</span>
                </span>
              </div>

              <div className="space-y-3.5">
                {tokenRows.map((r) => (
                  <div key={r.lambda}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span
                        className="text-[13px] font-medium truncate"
                        style={{ color: "var(--text-secondary)" }}
                        title={r.lambda}
                      >
                        {shortLambda(r.lambda)}
                      </span>
                      <span
                        className="text-[12px] tabular-nums flex-shrink-0 font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {r.input.toLocaleString()} / {r.output.toLocaleString()}
                      </span>
                    </div>
                    {/* 두 막대 사이 2px 표면 간격 — 테두리로 나누지 않는다. */}
                    <div className="space-y-[2px]">
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--series-track)" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${(r.input / tokenMax) * 100}%`,
                            background: "var(--series-1)",
                          }}
                        />
                      </div>
                      <div
                        className="h-2 rounded-full overflow-hidden"
                        style={{ background: "var(--series-track)" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{
                            width: `${(r.output / tokenMax) * 100}%`,
                            background: "var(--series-2)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <TableView
                caption="Lambda 별 입력·출력 토큰"
                rows={tokenRows.map((r) => ({
                  label: shortLambda(r.lambda),
                  display: `입력 ${r.input.toLocaleString()} · 출력 ${r.output.toLocaleString()}`,
                }))}
              />
            </>
          )}
        </ChartCard>
      </div>

      {/* 상세 — 모든 값을 읽을 수 있는 경로 (색만으로 전달하지 않기 위함) */}
      <div className="ui-card rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="ui-thead">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-800">
                Lambda
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-800">
                Model
              </th>
              <th className="text-right px-4 py-3 font-semibold text-gray-800">
                Input Tokens
              </th>
              <th className="text-right px-4 py-3 font-semibold text-gray-800">
                Output Tokens
              </th>
              <th className="text-right px-4 py-3 font-semibold text-gray-800">
                Cost (USD)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.lambda}/${r.model}`}
                className="border-b ui-divider last:border-0 ui-row-hover transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                  {r.lambda}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                  {r.model}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {r.input_tokens != null
                    ? r.input_tokens.toLocaleString()
                    : "-"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {r.output_tokens != null
                    ? r.output_tokens.toLocaleString()
                    : "-"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                  ${r.cost_usd.toFixed(4)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-gray-600"
                >
                  데이터 없음 (지난 7일간 token 사용 0)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
