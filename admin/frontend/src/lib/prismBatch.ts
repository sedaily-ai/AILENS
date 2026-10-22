/* PRISM 일괄 제작(2026-10-22) — 그룹 표·파일 이름 해석·API 타입.
   그룹 코드·이름은 대본 작성 지침(마케팅팀 클로드 프로젝트 v6.3)의 "12개 카테고리 개요"와 같고,
   admin/backend/routes/prism_batch.py::GROUPS, pipelines/video/prism_batch.py::GROUPS와 맞춰야 한다. */
import type { RenderProgress } from "@/components/PromptChatLab/videoCardModel";

export const PRISM_GROUPS = [
  { code: "SG1", name: "Students & Grads", keyword: "취준생" },
  { code: "SG2", name: "Early Careers", keyword: "신입직장인" },
  { code: "SG3", name: "Founders", keyword: "스타트업" },
  { code: "SG4", name: "Global Investors", keyword: "글로벌" },
  { code: "SG5", name: "CEO", keyword: "기업" },
  { code: "SG6", name: "Retail Investors", keyword: "개인투자자" },
  { code: "SG7", name: "Real Estate", keyword: "부동산" },
  { code: "SG8", name: "Stock Investors", keyword: "주식" },
  { code: "PG1", name: "Front Page Daily", keyword: "1면" },
  { code: "PG2", name: "Securities Daily", keyword: "증권" },
  { code: "PG3", name: "Industry Daily", keyword: "산업" },
  { code: "PG4", name: "Finance Daily", keyword: "금융" },
] as const;

export type PrismGroupCode = (typeof PRISM_GROUPS)[number]["code"];

export function groupName(code: string | null | undefined): string {
  return PRISM_GROUPS.find((g) => g.code === code)?.name ?? "";
}

function todayKst(): Date {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 파일 이름 `MMDD_항목명.txt`(예: 1021_취준생.txt) → 그룹 코드·녹음일. 못 알아보면 null(화면에서 고른다).
 *  항목명은 정확히 같은 이름을 먼저 찾고, 없으면 이름에 포함된 키워드로 찾는다("신입직장인 (1)" 같은 사본 이름 대비).
 *  날짜가 없으면 오늘(KST). 연도는 올해 — 1월에 12월 파일을 넣는 경우처럼 두 달 넘게 미래면 작년으로 본다. */
export function parseFileName(fileName: string): { type: PrismGroupCode | null; recordingDate: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = base.match(/^(\d{2})(\d{2})[_\s-]+(.+)$/);
  const label = (m ? m[3] : base).replace(/\s*\(\d+\)\s*$/, "").trim();
  const exact = PRISM_GROUPS.find((g) => g.keyword === label);
  const partial = PRISM_GROUPS.find((g) => label.includes(g.keyword));
  const type = (exact ?? partial)?.code ?? null;

  const today = todayKst();
  let recordingDate = iso(today);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let d = new Date(today.getFullYear(), month - 1, day);
      if (d.getTime() - today.getTime() > 60 * 86400000) d = new Date(today.getFullYear() - 1, month - 1, day);
      recordingDate = iso(d);
    }
  }
  return { type, recordingDate };
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function dateLabel(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  if (!y || !mo || !d) return isoDate;
  return `${mo}/${d} (${WEEKDAYS_KO[new Date(y, mo - 1, d).getDay()]})`;
}

/** 기사 수 — 파일마다 머리글은 제각각이지만 기사마다 "제목:" 줄은 있다(10/21 샘플 6종 확인). */
export function countArticles(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().startsWith("제목:")).length;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type PrismStage = "queued" | "script" | "scene" | "render" | "done" | "error";

export interface PrismBatchItem {
  item_id: string;
  file_name: string;
  type: PrismGroupCode;
  group: string;
  recording_date: string;
  job_id: string;
  stage: PrismStage | null;
  message?: string | null;
  title?: string | null;
  script_url?: string;
  progress?: RenderProgress | null;
  video_url?: string;
  thumb_url?: string;
}

export interface PrismBatchDetail {
  batch_id: string;
  created_at: string;
  items: PrismBatchItem[];
}

export interface PrismBatchSummary {
  batch_id: string;
  created_at: string;
  count: number;
  groups: string[];
}
