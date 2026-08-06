"use client";

import { useEffect, useState } from "react";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { ErrorNote, TableSkeleton } from "@/components/Feedback";
import { useToast } from "@/components/Toast";
import type { CronPreset, DriversResponse } from "@/lib/types";

const CRON_PRESETS: { value: CronPreset; label: string }[] = [
  { value: "5m", label: "5분마다" },
  { value: "30m", label: "30분마다" },
  { value: "1h", label: "1시간마다" },
  { value: "3h", label: "3시간마다" },
  { value: "6h", label: "6시간마다" },
  { value: "12h", label: "12시간마다" },
  { value: "daily-22kst", label: "매일 22:00 KST" },
  { value: "daily-04kst", label: "매일 04:00 KST" },
];

export default function DriversPage() {
  const [data, setData] = useState<DriversResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const refresh = async () => {
    try {
      const fresh = await adminApi.getDrivers();
      setData(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    }
  };

  useEffect(() => {
    // Initial data load — refresh() awaits adminApi.getDrivers() then setData.
    // setData fires after the await (off the synchronous effect body), so this
    // is a canonical "fetch on mount" pattern, not the cascading-render anti-
    // pattern the lint rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const wrap = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.show(`${label} 적용`, "success");
      await refresh();
    } catch (err) {
      const msg =
        err instanceof AdminApiError ? err.message : "변경 실패";
      toast.show(`${label} 실패: ${msg}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = (id: string, enable: boolean) =>
    wrap(`rule ${enable ? "enable" : "disable"} ${id}`, () =>
      adminApi.updateRule(id, { action: enable ? "enable" : "disable" })
    );

  const setCron = (id: string, preset: string) =>
    wrap(`rule cron ${preset} for ${id}`, () =>
      adminApi.updateRule(id, { action: "set-cron", cron_preset: preset })
    );

  const toggleFlag = (name: string, enable: boolean) =>
    wrap(`flag ${name} ${enable ? "enable" : "disable"}`, () =>
      adminApi.toggleFeatureFlag(name, enable ? "enable" : "disable")
    );

  if (error && !data) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Drivers
        </h1>
        <ErrorNote message={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
          Drivers
        </h1>
        <TableSkeleton rows={6} cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
        Drivers
      </h1>

      {/* === EventBridge Rules === */}
      <section className="space-y-3">
        <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
          EventBridge Rules{" "}
          <span className="text-gray-600 font-normal">
            ({data.rules.length})
          </span>
        </h2>
        <div className="ui-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="ui-thead">
              <tr>
                <th className="text-left px-4 py-2.5">
                  Rule
                </th>
                <th className="text-left px-4 py-2.5">
                  Schedule
                </th>
                <th className="text-left px-4 py-2.5">
                  Cron Preset
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-800">
                  State
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr
                  key={rule.name}
                  className="border-b ui-divider last:border-0 ui-row-hover transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-800">
                    {rule.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {rule.schedule}
                  </td>
                  <td className="px-4 py-3">
                    {rule.preset === "custom" ? (
                      <span className="text-xs text-gray-600 italic">
                        custom (manual)
                      </span>
                    ) : (
                      <select
                        disabled={busy}
                        value={rule.preset}
                        onChange={(e) => setCron(rule.name, e.target.value)}
                        className="ui-input rounded-md px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {CRON_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      disabled={busy}
                      onClick={() =>
                        toggleRule(rule.name, rule.state !== "ENABLED")
                      }
                      className={`text-xs px-3 py-1 rounded-full font-semibold transition-all disabled:opacity-50 ${
                        rule.state === "ENABLED"
                          ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                          : "bg-gray-500/15 text-gray-700 ring-1 ring-gray-400/30 hover:bg-gray-500/25"
                      }`}
                    >
                      {rule.state}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === Feature Flags === */}
      <section className="space-y-3">
        <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
          Feature Flags{" "}
          <span className="text-gray-600 font-normal">
            ({Object.keys(data.feature_flags).length})
          </span>
        </h2>
        <div className="ui-card rounded-2xl divide-y divide-gray-300/30 overflow-hidden">
          {Object.entries(data.feature_flags).map(([name, enabled]) => (
            <div
              key={name}
              className="flex items-center justify-between px-4 py-3 ui-row-hover transition-colors"
            >
              <span className="font-mono text-sm text-gray-800">{name}</span>
              <button
                disabled={busy}
                onClick={() => toggleFlag(name, !enabled)}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all disabled:opacity-50 ${
                  enabled
                    ? "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                    : "bg-gray-500/15 text-gray-700 ring-1 ring-gray-400/30 hover:bg-gray-500/25"
                }`}
              >
                {enabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* === Thresholds === */}
      <section className="space-y-3">
        <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
          Thresholds{" "}
          <span className="text-gray-600 font-normal">
            ({Object.keys(data.thresholds).length})
          </span>
        </h2>
        <div className="ui-card rounded-2xl divide-y divide-gray-300/30 overflow-hidden">
          {Object.entries(data.thresholds).map(([name, value]) => (
            <ThresholdRow
              key={name}
              name={name}
              value={value}
              busy={busy}
              onSave={(newValue) =>
                wrap(`threshold ${name}=${newValue}`, () =>
                  adminApi.updateThreshold(name, newValue)
                )
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ThresholdRow({
  name,
  value,
  busy,
  onSave,
}: {
  name: string;
  value: number;
  busy: boolean;
  onSave: (v: number) => void;
}) {
  // Track which `value` the draft was last seeded from. When parent passes a
  // new value (after a save round-trip), reset draft synchronously rather than
  // syncing through a useEffect — avoids the React 19 set-state-in-effect lint
  // and keeps the input snappy.
  const [seed, setSeed] = useState(value);
  const [draft, setDraft] = useState(String(value));
  if (seed !== value) {
    setSeed(value);
    setDraft(String(value));
  }

  const dirty = draft !== String(value);
  const parsed = parseInt(draft, 10);
  const valid = !isNaN(parsed) && parsed >= 1 && parsed <= 10000;

  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3 ui-row-hover transition-colors">
      <span className="font-mono text-sm flex-1 text-gray-800">{name}</span>
      <input
        type="number"
        min={1}
        max={10000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="ui-input w-24 px-2 py-1 rounded-md text-sm tabular-nums text-gray-900"
      />
      <button
        disabled={busy || !dirty || !valid}
        onClick={() => onSave(parsed)}
        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-500/20"
      >
        Save
      </button>
    </div>
  );
}
