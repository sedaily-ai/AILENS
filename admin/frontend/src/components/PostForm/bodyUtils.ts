import type { CmsKeyword, CmsPostBody } from "@/lib/types";

export function stringifyKeyword(k: CmsKeyword): string {
  return k.explain ? `${k.term}: ${k.explain}` : k.term;
}

export function parseKeywordLine(line: string): CmsKeyword {
  const idx = line.indexOf(":");
  if (idx === -1) return { term: line.trim(), explain: "" };
  return { term: line.slice(0, idx).trim(), explain: line.slice(idx + 1).trim() };
}

// 저장 직전 정리 — 줄바꿈 기반 입력이 타이핑 중엔 빈 줄을 그대로 담고 있어야
// 커서가 안 튀므로(입력 컴포넌트 참조), 정리는 여기서 한 번만 한다.
export function cleanPostBody(body: CmsPostBody): CmsPostBody {
  return {
    body: body.body.map((s) => s.trim()).filter(Boolean),
    body_html: body.body_html,
    key_points: body.key_points.map((s) => s.trim()).filter(Boolean),
    keywords: body.keywords
      .map((k) => ({ term: k.term.trim(), explain: k.explain.trim() }))
      .filter((k) => k.term),
    images: body.images,
  };
}

export function cleanClosingLine(s: string): string {
  return s.trim();
}

// mode="post" 는 핵심정리·키워드·닫는줄 입력창을 따로 안 둔다 — 대신 Tiptap
// 에디터 안에서 (이미 있는 H2/H3 툴바 버튼으로) "핵심 정리" / "키워드" /
// "닫는 줄" 이라는 소제목을 쓰면, 그 소제목부터 다음 소제목 전까지를 저장
// 시점에 그 필드로 갈라낸다. 새 문법을 안 배워도 되고, 한 캔버스에서 끝난다.
const SECTION_ALIASES: Record<string, "key_points" | "keywords" | "closing_line"> = {
  핵심정리: "key_points",
  핵심요약: "key_points",
  요약: "key_points",
  키워드: "keywords",
  용어: "keywords",
  닫는줄: "closing_line",
  마무리: "closing_line",
  클로징: "closing_line",
};

function matchSection(headingText: string) {
  return SECTION_ALIASES[headingText.trim().replace(/\s+/g, "")];
}

export function splitRichBody(html: string): {
  body_html: string;
  key_points: string[];
  keywords: CmsKeyword[];
  closing_line: string;
} {
  if (typeof window === "undefined" || !html) {
    return { body_html: html ?? "", key_points: [], keywords: [], closing_line: "" };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(doc.body.children);

  let section: "body" | "key_points" | "keywords" | "closing_line" = "body";
  const buckets: Record<string, Element[]> = { body: [], key_points: [], keywords: [], closing_line: [] };

  for (const el of nodes) {
    if (/^H[1-6]$/.test(el.tagName)) {
      const hit = matchSection(el.textContent ?? "");
      if (hit) {
        section = hit;
        continue; // 소제목 자체는 어느 필드에도 안 들어간다.
      }
    }
    buckets[section].push(el);
  }

  const linesOf = (els: Element[]): string[] =>
    els.flatMap((el) => {
      if (el.tagName === "UL" || el.tagName === "OL") {
        return Array.from(el.querySelectorAll("li")).map((li) => (li.textContent ?? "").trim());
      }
      return [(el.textContent ?? "").trim()];
    }).filter(Boolean);

  return {
    body_html: buckets.body.map((el) => el.outerHTML).join(""),
    key_points: linesOf(buckets.key_points),
    keywords: linesOf(buckets.keywords).map(parseKeywordLine),
    closing_line: linesOf(buckets.closing_line).join(" "),
  };
}
