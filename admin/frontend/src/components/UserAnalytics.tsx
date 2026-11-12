"use client";

/* CMS 홈 "사용자 데이터 분석" (2026-11-12)
 *
 * GA4 BigQuery 내보내기를 백엔드(GET /admin/analytics/summary)가 계산한 결과를 보여 준다.
 * 계산 규칙의 정본: admin/backend/repo/ga4_repo.py · routes/analytics.py
 *
 * 읽는 사람은 기획·디자인 포함 LENS 팀 전체 → 화면 원칙:
 *  1. 3단 구조 — 한눈에 보기(7일) → 어디서 막히나(30일 세부 분석) → 기사별 성적(30일)
 *  2. 세부 분석 카드는 "질문 → 핵심 한 문장(데이터로 자동 생성) → 막대" 순서. 문장이 결론, 막대는 근거.
 *  3. 강조(emphasis): 문장이 가리키는 줄만 파랑, 나머지는 회색 — 어디를 봐야 할지 색이 알려 준다.
 *  4. 내부 용어(v1/v2, medium, 경로 slug)는 화면에 내보내지 않고 아래 LABEL 표로 풀어 쓴다.
 */

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { publicPathUrl } from "@/lib/publicUrl";
import { ErrorNote } from "@/components/Feedback";
import type {
  AnalyticsArticle,
  AnalyticsBreakdownRow,
  AnalyticsSpan,
  AnalyticsSummary,
} from "@/lib/types";

/* ── 이름표 ─────────────────────────────────────────────────────────── */

// packages/domain/src/constants/econCategories.ts ECON_CATEGORIES (slug → label) 사본.
const SECTION_LABEL: Record<string, string> = {
  markets: "시그널",
  property: "부동산",
  economy: "경제",
  finance: "금융",
  industry: "산업",
  politics: "정치",
  national: "사회",
  international: "국제",
  culture: "문화",
};
const SOURCE_LABEL: Record<string, string> = {
  search: "검색 (구글·네이버 등)",
  ai: "AI 답변 (ChatGPT 등)",
  direct: "직접 접속·메신저 앱",
  referral: "다른 사이트 링크",
};
// 문장용(조사 포함) — "검색으로 온 사람은…"
const SOURCE_VIA: Record<string, string> = {
  search: "검색으로",
  ai: "AI 답변 링크로",
  direct: "직접",
  referral: "다른 사이트 링크로",
};
const AGE_ORDER = ["d0", "d1", "d2_3", "d4_7", "d8p"] as const;
const AGE_LABEL: Record<string, string> = {
  d0: "발행 당일",
  d1: "다음 날",
  d2_3: "2~3일 뒤",
  d4_7: "4~7일 뒤",
  d8p: "8일 넘게 지나서",
};
const LANDING_LABEL: Record<string, string> = {
  article: "기사",
  home: "홈",
  letter: "레터",
  webtoon: "웹툰",
  my_lens: "나의 LENS",
  other: "그 밖의 페이지",
};
// service/frontend trackEvent 이벤트 이름 → 기능 이름. 백엔드 ga4_repo.FEATURE_EVENTS 와 짝.
const FEATURE_LABEL: Record<string, string> = {
  format_switch: "형식 바꿔 보기 (웹툰·글 등)",
  webtoon_start: "웹툰 보기",
  source_link_click: "원문·출처 링크 클릭",
  post_vote: "기사 투표 참여",
  letter_card_click: "레터 카드 클릭",
  article_neighbor_click: "이전·다음 기사로 이동",
  onboarding_result: "온보딩 끝까지 완료",
  letter_sub_open: "레터 구독 창 열기",
  game_open: "게임 열기",
};
const DEVICE_LABEL: Record<string, string> = { desktop: "PC", mobile: "모바일", tablet: "태블릿" };
// 웹툰 방식 — service/frontend shared/lib/tracking/webtoonVariant.ts 기준.
const WEBTOON_LABEL: Record<string, { name: string; desc: string }> = {
  v2: { name: "새 디자인", desc: "웹툰식 말풍선 + 마지막 '핵심 정리' 카드" },
  v1: { name: "이전 디자인", desc: "말풍선 개편 전 형식" },
};

/* ── 형식 ───────────────────────────────────────────────────────────── */

const md = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
};
const span = (s: AnalyticsSpan) => `${md(s.from)}~${md(s.to)}`;
const fmtSec = (s: number | null) => {
  if (s === null) return "–";
  if (s < 60) return `${Math.round(s)}초`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m}분 ${r}초` : `${m}분`;
};
// 10% 미만은 소수 한 자리(2.3%), 그 이상은 정수(53%) — 작은 비율이 0%·2%로 뭉개지지 않게.
const fmtPct = (p: number | null) => {
  if (p === null) return "–";
  if (p > 0 && p < 10) return `${p.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(p)}%`;
};
const fmtNum = (n: number) => n.toLocaleString("ko-KR");
const share = (part: number, whole: number) => (whole ? (100 * part) / whole : 0);

/* ── 공통 부품 ──────────────────────────────────────────────────────── */

type Tone = "up" | "down" | "flat";

function deltaOf(cur: number | null, prev: number | null, unit: "%p" | "초") {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  const r = unit === "초" ? Math.round(diff) : Math.round(diff * 10) / 10;
  if (r === 0) return { text: "지난주와 같음", tone: "flat" as Tone };
  return { text: `지난주보다 ${r > 0 ? "▲" : "▼"} ${Math.abs(r)}${unit}`, tone: (r > 0 ? "up" : "down") as Tone };
}

function DeltaChip({ d }: { d: { text: string; tone: Tone } | null }) {
  if (!d) return null;
  const style =
    d.tone === "down"
      ? { color: "var(--danger)", background: "var(--danger-soft)" }
      : d.tone === "up"
        ? { color: "var(--accent)", background: "var(--accent-soft)" }
        : { color: "var(--text-muted)", background: "var(--surface-sunken)" };
  return (
    <span className="inline-flex items-center text-[12px] font-semibold rounded-full px-2.5 py-1 tabular-nums" style={style}>
      {d.text}
    </span>
  );
}

function SubHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pt-2">
      <h3 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {note}
      </span>
    </div>
  );
}

/* 세부 분석 카드: 질문(작게) → 핵심 문장(크게) → 근거(막대). */
function InsightCard({
  question,
  finding,
  children,
  footnote,
}: {
  question: string;
  finding: React.ReactNode;
  children: React.ReactNode;
  footnote?: string;
}) {
  return (
    <div className="ui-card rounded-2xl p-6 h-full flex flex-col">
      <div className="text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
        {question}
      </div>
      <p className="mt-2 text-[16px] leading-[1.55] font-medium" style={{ color: "var(--text-primary)" }}>
        {finding}
      </p>
      <div className="mt-5 flex-1">{children}</div>
      {footnote && (
        <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {footnote}
        </p>
      )}
    </div>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-bold">{children}</strong>;

/* 줄마다 이름 · 막대 · 값. 강조 줄만 파랑, 나머지는 회색(dataviz "emphasis"). */
type MeterRow = { key: string; label: string; value: number; display: string; sub?: string; emphasis?: boolean };

function MeterList({ rows, max }: { rows: MeterRow[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label} · ${r.display}${r.sub ? ` · ${r.sub}` : ""}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="text-[13px] truncate"
              style={{ color: r.emphasis ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: r.emphasis ? 600 : 400 }}
            >
              {r.label}
            </span>
            <span className="flex items-baseline gap-2 flex-shrink-0">
              {r.sub && (
                <span className="text-[11.5px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.sub}
                </span>
              )}
              <span className="text-[13px] font-semibold tabular-nums min-w-[3rem] text-right whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                {r.display}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-[6px] rounded-full overflow-hidden" style={{ background: "var(--series-track)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, (r.value / top) * 100))}%`,
                background: r.emphasis ? "var(--series-solo)" : "var(--border-input)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── 한눈에 보기 타일 ───────────────────────────────────────────────── */

function KpiTile({
  label,
  value,
  context,
  delta,
  definition,
  loading,
}: {
  label: string;
  value: string;
  context?: string;
  delta: { text: string; tone: Tone } | null;
  definition: string;
  loading: boolean;
}) {
  return (
    <div className="ui-card rounded-2xl p-6 h-full flex flex-col">
      <div className="text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      {loading ? (
        <div className="ui-skeleton h-11 w-28 mt-4" />
      ) : (
        <>
          <div className="mt-3 text-[40px] font-bold leading-none tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
            {value}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 min-h-[26px]">
            <DeltaChip d={delta} />
            {context && (
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {context}
              </span>
            )}
          </div>
          <p className="mt-auto pt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {definition}
          </p>
        </>
      )}
    </div>
  );
}

/* ── 기사 표 ────────────────────────────────────────────────────────── */

function ArticleTable({ items, caption }: { items: AnalyticsArticle[]; caption: string }) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] py-6 text-center" style={{ color: "var(--text-muted)" }}>
        아직 기준을 넘은 기사가 없어요.
      </p>
    );
  }
  return (
    <table className="w-full text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <th className="text-left font-medium pb-2.5">기사</th>
          <th className="text-right font-medium pb-2.5 pl-4 whitespace-nowrap">끝까지</th>
          <th className="text-right font-medium pb-2.5 pl-4 whitespace-nowrap">머문 시간</th>
          <th className="text-right font-medium pb-2.5 pl-4 whitespace-nowrap">읽힘</th>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.path} className="ui-row-hover align-top" style={{ borderTop: "1px solid var(--border-hairline)" }}>
            <td className="py-2.5 pr-2">
              <a
                href={publicPathUrl(a.path)}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-2 leading-snug hover:underline underline-offset-2"
                style={{ color: "var(--text-primary)" }}
                title={a.title}
              >
                {a.title}
              </a>
            </td>
            <td className="py-2.5 pl-4 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              {fmtPct(a.read_to_end_rate)}
            </td>
            <td className="py-2.5 pl-4 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              {fmtSec(a.median_engaged_sec)}
            </td>
            <td className="py-2.5 pl-4 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              {fmtNum(a.reads)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 세부 분석 카드들 ──────────────────────────────────────────────── */

function LandingCard({ data }: { data: AnalyticsSummary }) {
  const rows = data.landing.filter((r) => r.sessions >= 10);
  const total = data.landing.reduce((s, r) => s + r.sessions, 0);
  const art = data.landing.find((r) => r.k === "article");
  const home = data.landing.find((r) => r.k === "home");
  return (
    <InsightCard
      question="처음 연 페이지에 따라 얼마나 더 보나요?"
      finding={
        art ? (
          <>
            방문의 <B>{fmtPct(share(art.sessions, total))}</B>가 기사로 바로 들어오는데, 그중 <B>{fmtPct(art.one_page_rate)}</B>는 그 기사
            하나만 보고 나가요.
            {home && <> 홈으로 들어오면 평균 <B>{home.pages_per_session}페이지</B>를 봐요.</>}
          </>
        ) : (
          "아직 데이터가 부족해요."
        )
      }
      footnote="막대: 처음 연 페이지 하나만 보고 나간 방문의 비율"
    >
      <MeterList
        max={100}
        rows={rows.map((r) => ({
          key: r.k,
          label: LANDING_LABEL[r.k] ?? r.k,
          value: r.one_page_rate ?? 0,
          display: fmtPct(r.one_page_rate),
          sub: `${fmtNum(r.sessions)}번 · 평균 ${r.pages_per_session ?? "–"}쪽`,
          emphasis: r.k === "article",
        }))}
      />
    </InsightCard>
  );
}

function SourceCard({ data }: { data: AnalyticsSummary }) {
  const rows = data.breakdowns.source.filter((r) => SOURCE_LABEL[r.k] && r.reads >= 30);
  const ranked = [...rows].sort((a, b) => (b.median_engaged_sec ?? 0) - (a.median_engaged_sec ?? 0));
  const best = ranked[0];
  const direct = rows.find((r) => r.k === "direct");
  return (
    <InsightCard
      question="어디서 온 사람이 오래 읽나요?"
      finding={
        best && direct && best.k !== "direct" ? (
          <>
            {SOURCE_VIA[best.k]} 온 사람은 기사를 <B>{fmtSec(best.median_engaged_sec)}</B> 읽지만, 직접 들어온 사람은{" "}
            <B>{fmtSec(direct.median_engaged_sec)}</B> 만에 나가요.
          </>
        ) : best ? (
          <>
            {SOURCE_VIA[best.k]} 온 사람이 기사를 가장 오래 읽어요(<B>{fmtSec(best.median_engaged_sec)}</B>).
          </>
        ) : (
          "아직 데이터가 부족해요."
        )
      }
      footnote="막대: 기사 한 번 열었을 때 머문 시간(보통 방문 기준). 오른쪽 작은 숫자는 기사를 연 횟수."
    >
      <MeterList
        rows={ranked.map((r) => ({
          key: r.k,
          label: SOURCE_LABEL[r.k],
          value: r.median_engaged_sec ?? 0,
          display: fmtSec(r.median_engaged_sec),
          sub: `${fmtNum(r.reads)}회`,
          emphasis: r.k === best?.k,
        }))}
      />
    </InsightCard>
  );
}

function AgeCard({ data }: { data: AnalyticsSummary }) {
  const byKey = new Map(data.breakdowns.age.map((r) => [r.k, r]));
  const total = data.breakdowns.age.reduce((s, r) => s + r.reads, 0);
  const old = byKey.get("d8p");
  const today = byKey.get("d0");
  return (
    <InsightCard
      question="기사는 발행 후 언제 읽히나요?"
      finding={
        old && today ? (
          <>
            읽힌 기사의 <B>{fmtPct(share(old.reads, total))}</B>는 발행 후 8일이 넘은 기사예요
            {old.reads >= today.reads * 0.8 ? (
              <>. 발행 당일({fmtPct(share(today.reads, total))})만큼 많아서, 지난 기사도 꾸준히 읽혀요.</>
            ) : (
              <>. 발행 당일에 읽히는 비율은 {fmtPct(share(today.reads, total))}예요.</>
            )}
          </>
        ) : (
          "아직 데이터가 부족해요."
        )
      }
      footnote="막대: 전체 기사 읽힘 중 비율. 오른쪽 작은 숫자는 그때 머문 시간."
    >
      <MeterList
        rows={AGE_ORDER.filter((k) => byKey.has(k)).map((k) => {
          const r = byKey.get(k) as AnalyticsBreakdownRow;
          return {
            key: k,
            label: AGE_LABEL[k],
            value: share(r.reads, total),
            display: fmtPct(share(r.reads, total)),
            sub: fmtSec(r.median_engaged_sec),
            emphasis: k === "d8p",
          };
        })}
      />
    </InsightCard>
  );
}

function SectionCard({ data }: { data: AnalyticsSummary }) {
  const known = data.breakdowns.section.filter((r) => SECTION_LABEL[r.k]);
  const total = known.reduce((s, r) => s + r.reads, 0);
  const [a, b] = known;
  // "머문 시간도 길다"는 읽힘 30번 이상인 분야 중 머문 시간 상위 2개와 같을 때만 말한다.
  const longest = known
    .filter((r) => r.reads >= 30)
    .sort((x, y) => (y.median_engaged_sec ?? 0) - (x.median_engaged_sec ?? 0))
    .slice(0, 2)
    .map((r) => r.k);
  const alsoLongest = a && b && longest.includes(a.k) && longest.includes(b.k);
  return (
    <InsightCard
      question="어떤 분야가 많이 읽히나요?"
      finding={
        a && b ? (
          <>
            <B>{SECTION_LABEL[a.k]}</B>·<B>{SECTION_LABEL[b.k]}</B> 두 분야가 전체 기사 읽힘의{" "}
            <B>{fmtPct(share(a.reads + b.reads, total))}</B>예요.{alsoLongest && " 머문 시간도 이 두 분야가 가장 길어요."}
          </>
        ) : (
          "아직 데이터가 부족해요."
        )
      }
      footnote="막대: 전체 기사 읽힘 중 비율. 오른쪽 작은 숫자는 머문 시간."
    >
      <MeterList
        rows={known.map((r, i) => ({
          key: r.k,
          label: SECTION_LABEL[r.k],
          value: share(r.reads, total),
          display: fmtPct(share(r.reads, total)),
          sub: fmtSec(r.median_engaged_sec),
          emphasis: i < 2,
        }))}
      />
    </InsightCard>
  );
}

function TimeCard({ data }: { data: AnalyticsSummary }) {
  const hours = data.hourly;
  const total = hours.reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(max);
  // 업무 시간(9~16시) 몰림 정도
  const work = hours.slice(9, 17).reduce((s, v) => s + v, 0);
  const dev = data.breakdowns.device;
  const devTotal = dev.reduce((s, r) => s + r.reads, 0);
  const pc = dev.find((r) => r.k === "desktop");
  return (
    <InsightCard
      question="언제, 무엇으로 보나요?"
      finding={
        total > 0 ? (
          <>
            방문의 <B>{fmtPct(share(work, total))}</B>가 오전 9시~오후 5시에 몰려 있고, 기사의 <B>{fmtPct(share(pc?.reads ?? 0, devTotal))}</B>를
            PC로 읽어요.
            {share(work, total) >= 50 && share(pc?.reads ?? 0, devTotal) >= 50 && " 주로 일하는 시간에 PC로 보는 사이트예요."}
          </>
        ) : (
          "아직 데이터가 부족해요."
        )
      }
      footnote={`막대: 시간대(한국 시간)별 방문 수. 가장 많은 때는 ${peak}시.`}
    >
      <div className="flex items-end gap-[2px] h-[96px]" role="img" aria-label="시간대별 방문 수">
        {hours.map((v, h) => (
          <div key={h} className="flex-1 h-full flex items-end" title={`${h}시 · ${fmtNum(v)}번`}>
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: `${Math.max(2, (v / max) * 100)}%`,
                background: h >= 9 && h <= 16 ? "var(--series-solo)" : "var(--border-input)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>23시</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
        {dev
          .filter((r) => DEVICE_LABEL[r.k])
          .map((r) => (
            <span key={r.k}>
              {DEVICE_LABEL[r.k]} <span className="font-semibold tabular-nums">{fmtPct(share(r.reads, devTotal))}</span>
            </span>
          ))}
      </div>
    </InsightCard>
  );
}

function FeatureCard({ data }: { data: AnalyticsSummary }) {
  const items = data.features.items.filter((f) => FEATURE_LABEL[f.k]);
  const neighbor = items.find((f) => f.k === "article_neighbor_click");
  return (
    <InsightCard
      question="사이트 기능을 얼마나 쓰나요?"
      finding={
        neighbor ? (
          <>
            이전·다음 기사로 넘어간 방문은{" "}
            <B>
              100번 중 {(neighbor.rate ?? 0) < 1 ? "1번이 안 돼요" : `${Math.round(neighbor.rate ?? 0)}번이에요`}
            </B>
            .{(neighbor.rate ?? 0) < 5 && " 기사 아래에서 다음 읽을거리로 이어 주는 장치가 거의 안 쓰여요."}
          </>
        ) : (
          "기능별로 한 번이라도 쓴 방문의 비율이에요."
        )
      }
      footnote={`막대: 전체 방문 ${fmtNum(data.features.total_sessions)}번 중 그 기능을 한 번이라도 쓴 비율`}
    >
      <MeterList
        rows={items.map((f) => ({
          key: f.k,
          label: FEATURE_LABEL[f.k],
          value: f.rate ?? 0,
          display: fmtPct(f.rate),
          emphasis: f.k === "article_neighbor_click",
        }))}
      />
    </InsightCard>
  );
}

/* ── 본체 ───────────────────────────────────────────────────────────── */

export function UserAnalytics() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getAnalyticsSummary()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "사용자 데이터를 불러오지 못했습니다");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = !data && !error;
  const cur = data?.engagement.cur ?? null;
  const prev = data?.engagement.prev ?? null;
  const ret = data?.retention.cur ?? null;
  const retPrev = data?.retention.prev ?? null;

  return (
    <section className="space-y-5" aria-labelledby="user-analytics-title">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 id="user-analytics-title" className="font-display text-[22px] font-bold text-[var(--text-primary)]">
            사용자 데이터 분석
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            LENS 방문 기록(GA4)으로 매일 계산해요{data ? ` · ${md(data.as_of)}까지 반영` : ""}
          </p>
        </div>
        <p
          className="text-[12px] rounded-lg px-3 py-1.5"
          style={{ color: "var(--text-secondary)", background: "var(--surface-sunken)" }}
        >
          직원 방문(회사 와이파이)은 {data ? md(data.internal_filter_since) : "11/12"}부터 따로 구분해 빼요. 그 전 기록에는 섞여 있어요.
        </p>
      </header>

      {error && <ErrorNote message={`사용자 데이터 분석: ${error}`} />}

      {/* ① 한눈에 보기 */}
      <SubHeading title="한눈에 보기" note={data ? `최근 7일 ${span(data.windows.cur)} · 그 전 7일과 비교` : "최근 7일"} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile
          label="머문 시간"
          value={fmtSec(cur?.median_engaged_sec ?? null)}
          delta={deltaOf(cur?.median_engaged_sec ?? null, prev?.median_engaged_sec ?? null, "초")}
          context={cur ? `방문 ${fmtNum(cur.sessions)}번` : undefined}
          definition="방문 한 번에 실제로 화면을 본 시간. 보통의 방문 기준이에요."
          loading={loading}
        />
        <KpiTile
          label="기사를 끝까지 읽음"
          value={fmtPct(cur?.read_to_end_rate ?? null)}
          delta={deltaOf(cur?.read_to_end_rate ?? null, prev?.read_to_end_rate ?? null, "%p")}
          context={cur ? `기사 ${fmtNum(cur.article_reads)}번 열람` : undefined}
          definition="기사를 연 뒤 페이지 아래(90%)까지 내려간 비율이에요."
          loading={loading}
        />
        <KpiTile
          label="7일 안에 다시 옴"
          value={fmtPct(ret?.rate ?? null)}
          delta={deltaOf(ret?.rate ?? null, retPrev?.rate ?? null, "%p")}
          context={ret ? `${fmtNum(ret.new_users)}명 중 ${fmtNum(ret.returned_7d)}명` : undefined}
          definition={
            data
              ? `${span(data.windows.retention_cur)}에 처음 온 사람 중 7일 안에 다른 날 또 온 비율이에요.`
              : "처음 온 사람 중 7일 안에 다른 날 또 온 비율이에요."
          }
          loading={loading}
        />
      </div>

      {/* ② 어디서 막히나 */}
      <SubHeading title="어디서 막히나" note={data ? `최근 30일 ${span(data.windows.month)}` : "최근 30일"} />
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="ui-card rounded-2xl p-6">
              <div className="ui-skeleton h-[220px] w-full" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 줄 수가 비슷한 카드끼리 한 줄에 — 높이가 맞아야 빈 공간이 안 생긴다. */}
          <LandingCard data={data} />
          <SourceCard data={data} />
          <AgeCard data={data} />
          <TimeCard data={data} />
          <SectionCard data={data} />
          <FeatureCard data={data} />
        </div>
      ) : null}

      {/* ③ 기사별 성적 */}
      <SubHeading
        title="기사별 성적"
        note={data ? `최근 30일 · ${data.articles.min_reads}번 넘게 읽힌 기사 ${data.articles.count}개 중` : "최근 30일"}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="ui-card rounded-2xl p-6">
          <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
            끝까지 많이 읽힌 기사
          </div>
          {loading ? (
            <div className="ui-skeleton h-[180px] w-full" />
          ) : (
            <ArticleTable items={data?.articles.top ?? []} caption="끝까지 읽은 비율이 높은 기사" />
          )}
        </div>
        <div className="ui-card rounded-2xl p-6">
          <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
            들어왔다가 금방 나간 기사
          </div>
          {loading ? (
            <div className="ui-skeleton h-[180px] w-full" />
          ) : (
            <ArticleTable items={data?.articles.bottom ?? []} caption="머문 시간이 짧은 기사" />
          )}
        </div>
      </div>
      {data && data.webtoon.length > 0 && (
        <div className="ui-card rounded-2xl p-6">
          <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
            웹툰을 끝까지 보나요?
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4">
            {data.webtoon.map((w) => {
              const info = WEBTOON_LABEL[w.variant] ?? { name: w.variant, desc: "" };
              return (
                <MeterList
                  key={w.variant}
                  max={100}
                  rows={[
                    {
                      key: w.variant,
                      label: `${info.name} — ${info.desc}`,
                      value: w.rate ?? 0,
                      display: fmtPct(w.rate),
                      sub: `${fmtNum(w.starts)}번 중 ${fmtNum(w.completes)}번`,
                      emphasis: true,
                    },
                  ]}
                />
              );
            })}
          </div>
        </div>
      )}

      <details className="text-[12.5px] leading-relaxed px-1" style={{ color: "var(--text-muted)" }}>
        <summary className="cursor-pointer select-none font-medium" style={{ color: "var(--text-secondary)" }}>
          이 숫자를 볼 때 알아 둘 것
        </summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li>머문 시간은 평균이 아니라 &quot;보통 방문&quot;(중앙값)이에요. 탭을 오래 켜 둔 방문 하나에 흔들리지 않게요.</li>
          <li>&quot;끝까지 읽음&quot;은 본문 아래 영역까지 포함한 페이지 길이 기준이라, 실제 본문 완독보다 낮게 나올 수 있어요.</li>
          <li>방문 수가 적은 항목(10번 미만)은 목록에서 뺐어요. 작은 차이는 우연일 수 있어요.</li>
          <li>숫자는 하루 한 번 전날 기록까지 반영되고, 무료 저장소라 최근 60일만 계산할 수 있어요.</li>
        </ul>
      </details>
    </section>
  );
}
