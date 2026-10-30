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
  // 2026-10-23 — 마케팅팀 8개 카테고리 파일의 "금융"은 개인투자자(SG6)다(지침 표 "금융(개인투자자)").
  // 금융 지면(PG4)은 지금 만들지 않아 "금융지면"으로 둔다. aliases도 같은 그룹으로 읽는다.
  { code: "SG6", name: "Retail Investors", keyword: "금융", aliases: ["개인투자자"] },
  { code: "SG7", name: "Real Estate", keyword: "부동산" },
  { code: "SG8", name: "Stock Investors", keyword: "주식" },
  { code: "PG1", name: "Front Page Daily", keyword: "1면" },
  { code: "PG2", name: "Securities Daily", keyword: "증권" },
  { code: "PG3", name: "Industry Daily", keyword: "산업" },
  { code: "PG4", name: "Finance Daily", keyword: "금융지면" },
] as const;

export type PrismGroupCode = (typeof PRISM_GROUPS)[number]["code"];

/** 실제 PRISM 제작 영상의 그룹별 고정 성우 — pipelines/video/prism_batch.py::_GROUP_VOICES와 맞춰야 한다
 *  (마케팅팀 지정, 2026-10-23). 표에 없는 PG1~PG4는 CMS PRISM 음성 설정 발행값을 쓴다. 화면에는 보기용으로만
 *  보여 준다(2026-10-30 — 사용자: "성우는 이미 고정이니까 반영 버튼 없이 이리저리 들어볼 수나 있는 용도로"). */
export const PRISM_GROUP_VOICES: Partial<Record<PrismGroupCode, string>> = {
  SG1: "Matthew", SG2: "Joanna", SG3: "Stephen", SG4: "Joanna",
  SG5: "Matthew", SG6: "Danielle", SG7: "Stephen", SG8: "Ruth",
};

const _WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 대본 작성 지침이 요구하는 머리줄(pipelines/video/prism_batch.py::run과 같은 모양). 요일은 날짜로 계산한다. */
export function prismHeader(type: PrismGroupCode, isoDate: string): string {
  const weekday = _WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return `[TYPE: ${type}]\n[RECORDING DATE: ${isoDate}]\n[WEEKDAY: ${weekday}]\n`;
}

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

/** 오늘 날짜(KST) "YYYY-MM-DD". */
export const todayKstIso = (): string => iso(todayKst());

/** 파일 이름 `MMDD_항목명.txt`(예: 1021_취준생.txt) → 그룹 코드·녹음일. 못 알아보면 null(화면에서 고른다).
 *  항목명은 정확히 같은 이름을 먼저 찾고, 없으면 이름에 포함된 키워드로 찾는다("신입직장인 (1)" 같은 사본 이름 대비).
 *  날짜가 없으면 오늘(KST). 연도는 올해 — 1월에 12월 파일을 넣는 경우처럼 두 달 넘게 미래면 작년으로 본다. */
export function parseFileName(fileName: string): { type: PrismGroupCode | null; recordingDate: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = base.match(/^(\d{2})(\d{2})[_\s-]+(.+)$/);
  const label = (m ? m[3] : base).replace(/\s*\(\d+\)\s*$/, "").trim();
  const names = (g: (typeof PRISM_GROUPS)[number]): readonly string[] => ["aliases" in g ? g.aliases : [], g.keyword].flat();
  const exact = PRISM_GROUPS.find((g) => names(g).includes(label));
  const partial = PRISM_GROUPS.find((g) => names(g).some((k) => label.includes(k)));
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

export type PrismStage = "queued" | "script" | "scene" | "render" | "upload" | "done" | "error";

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
  /** 채널 연결(시크릿)이 있을 때만 — pipelines/video/youtube_upload.py */
  youtube_url?: string | null;
  youtube_error?: string | null;
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
