/* 차트 컴포넌트.
 *
 * 형태 선택은 dataviz 스킬의 "job → form" 표를 따랐다:
 *  - 한 값 + 추이            → StatTile (한 칸짜리 막대차트 금지)
 *  - 한계 대비 비율          → Meter    (2조각 파이 금지)
 *  - 크기 비교               → BarList  (단일 색조 — 길이가 이미 크기다)
 *  - 부분-전체(긴 이름)      → StackedBar (가로) + 범례·값 직접 표기
 *  - 시간 추이(이산 일자)    → Columns
 *
 * 색은 --series-* 토큰만 쓴다. 검증기에서 series-3/4 가 대비 3:1 미만이라
 * WARN 이 떴고, 그 완화책이 '직접 라벨'이라 계열 차트는 이름+값을 항상 찍는다.
 */

const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

/* ── 한 값 + 부가설명. 큰 숫자는 비례 숫자(tabular-nums 금지 — 큰 글자에서
   등폭 숫자는 헐거워 보인다). ─────────────────────────────────────────── */
export function StatTile({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="ui-card rounded-2xl p-5">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      {loading ? (
        <div className="ui-skeleton h-9 w-24 mt-2.5" />
      ) : (
        <div
          className="text-[32px] font-bold leading-none mt-2.5"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </div>
      )}
      {sub && (
        <div
          className="text-[12px] mt-2.5 leading-snug"
          style={{ color: "var(--text-muted)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── 한계 대비 비율. 도넛 2조각을 대체한다. ───────────────────────────── */
export function Meter({
  label,
  value,
  total,
  hint,
  loading,
}: {
  label: string;
  value: number | null;
  total: number | null;
  hint?: string;
  loading?: boolean;
}) {
  const ratio = value !== null && total ? value / total : 0;
  return (
    <div className="ui-card rounded-2xl p-5">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>

      {loading ? (
        <>
          <div className="ui-skeleton h-9 w-20 mt-2.5" />
          <div className="ui-skeleton h-2 w-full mt-4" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mt-2.5">
            <span
              className="text-[32px] font-bold leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              {value ?? "–"}
            </span>
            <span
              className="text-[15px] font-medium"
              style={{ color: "var(--text-faint)" }}
            >
              / {total ?? "–"}
            </span>
            <span
              className="ml-auto text-[12px] font-semibold tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {fmtPct(ratio)}
            </span>
          </div>

          <div
            className="mt-3.5 h-2 rounded-full overflow-hidden"
            style={{ background: "var(--series-track)" }}
            role="meter"
            aria-valuenow={value ?? 0}
            aria-valuemin={0}
            aria-valuemax={total ?? 0}
            aria-label={label}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.min(100, ratio * 100)}%`,
                background: "var(--series-solo)",
              }}
            />
          </div>
        </>
      )}

      {hint && (
        <div
          className="text-[12px] mt-2.5"
          style={{ color: "var(--text-muted)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  display: string;
}

/* ── 크기 비교. 전부 같은 색 — 길이가 이미 크기를 나타내므로 색을 크기에
   연동하면(value-ramp) 채널만 낭비하고 검증도 깨진다. ────────────────── */
export function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1;
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span
              className="text-[13px] font-medium truncate"
              style={{ color: "var(--text-secondary)" }}
              title={it.label}
            >
              {it.label}
            </span>
            <span
              className="text-[12px] font-semibold tabular-nums flex-shrink-0"
              style={{ color: "var(--text-primary)" }}
            >
              {it.display}
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--series-track)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${(it.value / max) * 100}%`,
                background: "var(--series-solo)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface StackSegment {
  label: string;
  value: number;
  display: string;
}

const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];

/* ── 부분-전체. 도넛 대신 가로 누적 막대 — 모델명이 길어서 도넛 라벨이
   안 들어간다. 세그먼트 사이 2px 표면 간격(테두리 아님)으로 분리하고,
   범례에 이름+값을 반드시 적는다(대비 WARN 완화책). ─────────────────── */
export function StackedBar({ segments }: { segments: StackSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const shown = segments.slice(0, 4);
  const rest = segments.slice(4);
  const rows = rest.length
    ? [
        ...shown,
        {
          label: "기타",
          value: rest.reduce((s, x) => s + x.value, 0),
          display: `${rest.length}개`,
        },
      ]
    : shown;

  return (
    <div>
      <div className="flex gap-[2px] h-3 rounded-full overflow-hidden">
        {rows.map((seg, i) => (
          <div
            key={seg.label}
            style={{
              width: `${(seg.value / total) * 100}%`,
              background: i < SERIES.length ? SERIES[i] : "var(--text-faint)",
            }}
            title={`${seg.label} ${seg.display}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((seg, i) => (
          <li key={seg.label} className="flex items-center gap-2 text-[13px]">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{
                background: i < SERIES.length ? SERIES[i] : "var(--text-faint)",
              }}
              aria-hidden="true"
            />
            <span
              className="truncate"
              style={{ color: "var(--text-secondary)" }}
              title={seg.label}
            >
              {seg.label}
            </span>
            <span
              className="ml-auto font-semibold tabular-nums flex-shrink-0"
              style={{ color: "var(--text-primary)" }}
            >
              {seg.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Column {
  label: string;
  fullLabel: string;
  value: number;
}

/* ── 이산 일자 추이. 단일 계열이라 범례가 없다(제목이 이름을 말한다).
   값은 hover 로, 축은 양 끝만 — 모든 점에 숫자를 찍으면 읽히지 않는다. ── */
export function Columns({
  data,
  height = 120,
}: {
  data: Column[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div
        className="flex items-end gap-[3px]"
        style={{ height }}
        role="img"
        aria-label={`최근 ${data.length}일 활동 추이`}
      >
        {data.map((d) => (
          <div
            key={d.fullLabel}
            className="flex-1 flex items-end h-full group/col"
            title={`${d.fullLabel} · ${d.value}건`}
          >
            <div
              className="w-full rounded-t-[3px] transition-[height,opacity] duration-500 ease-out group-hover/col:opacity-80"
              style={{
                height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 1.5)}%`,
                background:
                  d.value > 0 ? "var(--series-solo)" : "var(--series-track)",
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="flex justify-between mt-2 text-[11px] tabular-nums"
        style={{ color: "var(--text-faint)" }}
      >
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/* ── 표 보기. 색만으로 값을 전달하지 않기 위한 대체 경로(스킬 요구사항). ─ */
export function TableView({
  caption,
  rows,
}: {
  caption: string;
  rows: Array<{ label: string; display: string }>;
}) {
  return (
    <details className="mt-4">
      <summary
        className="text-[12px] cursor-pointer select-none hover:underline underline-offset-2"
        style={{ color: "var(--text-muted)" }}
      >
        표로 보기
      </summary>
      <table className="w-full mt-2 text-[12px]">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b ui-divider last:border-0">
              <td className="py-1.5 pr-3" style={{ color: "var(--text-secondary)" }}>
                {r.label}
              </td>
              <td
                className="py-1.5 text-right tabular-nums font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {r.display}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* 차트 카드 껍데기 */
export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-card rounded-2xl p-5">
      <h3
        className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
