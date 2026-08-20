// 프롬프트 편집 문서 모델 — 스코프 · 섹션 · 형식 · 첨부 · 백엔드 직렬화.
//
// PromptDrawer 는 UI 만 담당하고 데이터 규칙은 전부 여기 모은다.
//
// ## 저장 구조 (admin/backend/routes/prompts.py 와 1:1)
//
// 백엔드는 `PROMPT#<category>/<name>` 하나당 버전 행(`v#N`)을 쌓는다. 그 행에
// 두 가지를 넣는다:
//
//   content       ← 3섹션을 이어붙인 **산문**. prompt_loader 가 읽어 Bedrock 에
//                   그대로(템플릿 치환·파싱 없이) 넘기는 값이라 여기엔 모델이
//                   읽을 텍스트만 들어가야 한다. JSON 을 넣으면 모델이 JSON 을 읽는다.
//   sections_json ← 편집기가 폼을 복원하기 위한 **구조**. 읽기 경로는 이 속성을
//                   보지 않으므로 추론에 영향이 없다.
//
// 즉 content 는 sections 에서 파생된다(buildPromptText). 되읽을 때는 sections 가
// 정본이고, 없으면(옛 버전 · /prompts/edit 평문 저장) content 에서 최대한 복원한다.
//
// ## 스코프
//
// "어떤 상황에 쓰는 프롬프트인가"를 백엔드 키로 매핑한다 — 스코프 하나가
// 프롬프트 id 하나이므로 버전 관리·이력이 스코프별로 따로 쌓인다.
//
//   초안 → `<channel>/draft`      (예: letters/draft)
//   발행 → `<channel>/published`  (예: letters/published)

/* ---------- 스코프 ---------- */

export type PromptScopeKind = "status";

export interface PromptScope {
  id: string;
  label: string;
  hint: string;
  kind: PromptScopeKind;
}

export const PROMPT_SCOPES: PromptScope[] = [
  { id: "draft", label: "초안", hint: "초안을 처음 만들어낼 때", kind: "status" },
  { id: "published", label: "발행", hint: "발행할 원고로 다듬을 때", kind: "status" },
];

export const SCOPE_KIND_LABEL: Record<PromptScopeKind, string> = { status: "상태" };

export const DEFAULT_SCOPE_ID = "draft";

/** 스코프 + 채널 → 백엔드 프롬프트 id (`category/name`). */
export function promptIdFor(channel: string, scopeId: string): string {
  return `${channel}/${scopeId}`;
}

export function scopeLabel(id: string): string {
  return PROMPT_SCOPES.find((s) => s.id === id)?.label ?? id;
}

/** kind 별로 묶은 스코프 목록. 지금은 상태 한 줄뿐이지만 토픽이 추가되면
 *  탭이 줄을 나눠 렌더할 수 있게 모양을 맞춰 둔다. */
export function scopeGroups(): Array<{ kind: PromptScopeKind; scopes: PromptScope[] }> {
  const kinds: PromptScopeKind[] = ["status"];
  return kinds
    .map((kind) => ({ kind, scopes: PROMPT_SCOPES.filter((s) => s.kind === kind) }))
    .filter((g) => g.scopes.length > 0);
}

/* ---------- 형식 ---------- */

export type PromptFormat = "markdown" | "text" | "code";

export const FORMATS: Array<{ key: PromptFormat; label: string }> = [
  { key: "markdown", label: "Markdown" },
  { key: "text", label: "텍스트" },
  { key: "code", label: "코드" },
];

export const CODE_LANGUAGES = [
  "json",
  "yaml",
  "xml",
  "html",
  "css",
  "sql",
  "bash",
  "python",
  "javascript",
  "typescript",
  "java",
  "go",
  "rust",
  "ruby",
  "php",
  "plaintext",
] as const;

export const DEFAULT_CODE_LANGUAGE = "json";

function isFormat(v: unknown): v is PromptFormat {
  return v === "markdown" || v === "text" || v === "code";
}

function normalizeLanguage(v: unknown): string | undefined {
  return typeof v === "string" && (CODE_LANGUAGES as readonly string[]).includes(v)
    ? v
    : undefined;
}

/* ---------- 문서 모양 ---------- */

export interface PromptAttachment {
  name: string;
  size: number;
  type: string;
  format: PromptFormat;
  /** format === "code" 일 때 코드펜스에 붙는 언어. */
  language?: string;
  /** 파일 본문. 프롬프트 조립에 그대로 들어간다. */
  content: string;
  /** 텍스트가 아니어서 변환을 거친 경우의 원본 종류. */
  extractedFrom?: "pdf";
  /** PDF 쪽수. */
  pages?: number;
  /** 길이 상한에 걸려 뒷부분이 잘렸는지. */
  truncated?: boolean;
}

export interface PromptSection {
  text: string;
  format: PromptFormat;
  /** format === "code" 일 때만 의미가 있다. 형식을 되돌릴 때 쓰려고 남겨둔다. */
  language?: string;
  attachments: PromptAttachment[];
}

// "구조"(structure)는 2026-08-20 없앴다 — "지침"과 경계가 흐릿해(출력 틀도
// 결국 지켜야 할 규칙 중 하나) 실제로는 거의 항상 같이 채워졌다. 대신 그
// 자리에 "파일"(attachments) 섹션을 뒀다 — 참고 문서(레퍼런스 프롬프트
// 원본 .md, 예시 산출물 등)를 첨부 전용으로 붙이는 자리. PromptSection이
// 이미 attachments를 들고 있어 다른 두 섹션과 같은 컴포넌트(PromptField)를
// 그대로 재사용한다 — 텍스트 칸도 있지만 보통 비워두고 첨부만 쓴다.
export type PromptSectionKey = "description" | "guidelines" | "attachments";

/** 프롬프트 한 벌 = 3섹션. 버전·저장시각은 백엔드가 관리하므로 여기 없다. */
export type PromptPreset = Record<PromptSectionKey, PromptSection>;

export const SECTION_DEFS: Array<{
  key: PromptSectionKey;
  label: string;
  hint: string;
  rows: number;
  defaultFormat: PromptFormat;
  placeholder: string;
}> = [
  {
    key: "description",
    label: "설명",
    hint: "무엇인지 · 언제 쓰는지",
    rows: 3,
    defaultFormat: "text",
    placeholder: "예) 오늘의 1면 요약 기사를 만들 때 쓰는 프롬프트",
  },
  {
    key: "guidelines",
    label: "지침",
    hint: "출력 틀 · 지켜야 할 규칙 · 톤 · 제약",
    rows: 10,
    defaultFormat: "markdown",
    placeholder: "예)\n1. 헤드라인\n2. 3문단 요약\n3. 핵심 키워드 3개\n\n- 문장은 간결하게\n- 추측성 표현 금지\n- 숫자는 출처와 함께",
  },
  {
    key: "attachments",
    label: "파일",
    hint: "참고 문서 첨부 (본문은 비워둬도 됩니다)",
    rows: 3,
    defaultFormat: "text",
    placeholder: "본문 없이 첨부 파일만 붙여도 됩니다.",
  },
];

export function emptySection(format: PromptFormat): PromptSection {
  return { text: "", format, attachments: [] };
}

export function emptyPreset(): PromptPreset {
  return {
    description: emptySection("text"),
    guidelines: emptySection("markdown"),
    attachments: emptySection("text"),
  };
}

/* ---------- 첨부 읽기 ----------
   프롬프트에 넣을 수 있는 건 결국 텍스트다. 텍스트 파일은 확장자로 형식을
   추론해 그대로 읽고, PDF 는 pdf.js 로 텍스트를 뽑아 넣는다(lib/pdfText.ts).
   docx·xlsx 같은 나머지 바이너리는 파서가 없으면 의미 있는 텍스트가 안 나오니
   아예 거절한다 — 조용히 빈 첨부로 들어가는 게 더 나쁘다. */

// pdf.js 자체는 pdfText 안에서 동적 import 한다 — 이 모듈을 정적으로 들고 있어도
// 1.2MB 파서가 메인 번들에 들어오지 않는다(PDF 를 실제로 첨부할 때만 받는다).
import { PdfExtractError, extractPdfText } from "./pdfText";

const EXT_FORMAT: Record<string, { format: PromptFormat; language?: string }> = {
  md: { format: "markdown" },
  markdown: { format: "markdown" },
  mdx: { format: "markdown" },
  txt: { format: "text" },
  text: { format: "text" },
  log: { format: "text" },
  csv: { format: "text" },
  tsv: { format: "text" },
  json: { format: "code", language: "json" },
  jsonl: { format: "code", language: "json" },
  yaml: { format: "code", language: "yaml" },
  yml: { format: "code", language: "yaml" },
  toml: { format: "code", language: "plaintext" },
  ini: { format: "code", language: "plaintext" },
  xml: { format: "code", language: "xml" },
  html: { format: "code", language: "html" },
  htm: { format: "code", language: "html" },
  css: { format: "code", language: "css" },
  sql: { format: "code", language: "sql" },
  sh: { format: "code", language: "bash" },
  bash: { format: "code", language: "bash" },
  zsh: { format: "code", language: "bash" },
  py: { format: "code", language: "python" },
  js: { format: "code", language: "javascript" },
  mjs: { format: "code", language: "javascript" },
  cjs: { format: "code", language: "javascript" },
  jsx: { format: "code", language: "javascript" },
  ts: { format: "code", language: "typescript" },
  tsx: { format: "code", language: "typescript" },
  java: { format: "code", language: "java" },
  go: { format: "code", language: "go" },
  rs: { format: "code", language: "rust" },
  rb: { format: "code", language: "ruby" },
  php: { format: "code", language: "php" },
};

export const TEXT_EXTENSIONS = Object.keys(EXT_FORMAT);
export const SUPPORTED_EXTENSIONS = [...TEXT_EXTENSIONS, "pdf"];

/** `<input type="file" accept>` 값. */
export const ATTACHMENT_ACCEPT = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",");

/** 텍스트 파일 크기 상한. DDB 아이템 한계(400KB)에 content·sections 양쪽으로
 *  들어가므로 예전 512KB 보다 훨씬 낮게 잡는다. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024;

export { MAX_EXTRACTED_CHARS, MAX_PDF_BYTES } from "./pdfText";

export class PromptFileError extends Error {}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function isPdf(filename: string): boolean {
  return extensionOf(filename) === "pdf";
}

export function detectFormat(
  filename: string
): { format: PromptFormat; language?: string } | null {
  return EXT_FORMAT[extensionOf(filename)] ?? null;
}

/** 첨부 목록·미리보기에 붙는 짧은 배지 문자열. */
export function shortFormatLabel(a: PromptAttachment): string {
  if (a.extractedFrom === "pdf") return "PDF";
  if (a.format === "code") return (a.language ?? "code").toUpperCase();
  return a.format === "markdown" ? "MD" : "TXT";
}

/** 첨부 목록에 붙는 부가 설명 (없으면 null). */
export function attachmentNote(a: PromptAttachment): string | null {
  if (a.extractedFrom !== "pdf") return null;
  const pages = a.pages ? `${a.pages}쪽` : null;
  return [pages, a.truncated ? "일부만 추출" : "텍스트 추출"]
    .filter((v): v is string => v !== null)
    .join(" · ");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readPdfAttachment(file: File): Promise<PromptAttachment> {
  let extracted;
  try {
    extracted = await extractPdfText(file);
  } catch (err) {
    // PdfExtractError 의 메시지는 그대로 사용자에게 보여줄 수 있게 써 뒀다.
    throw new PromptFileError(
      err instanceof PdfExtractError
        ? err.message
        : `PDF 를 읽지 못했습니다: ${(err as Error).message}`
    );
  }

  return {
    name: file.name,
    size: file.size,
    type: file.type || "application/pdf",
    format: "text", // 추출 결과는 서식 없는 평문이다.
    content: extracted.text,
    extractedFrom: "pdf",
    pages: extracted.pages,
    truncated: extracted.truncated,
  };
}

export async function readAttachment(file: File): Promise<PromptAttachment> {
  if (isPdf(file.name)) return readPdfAttachment(file);

  const detected = detectFormat(file.name);
  if (!detected) {
    throw new PromptFileError(
      "텍스트 기반 파일 또는 PDF 만 첨부할 수 있습니다 (md, txt, json, yaml, csv, 코드 파일, pdf)"
    );
  }
  if (file.size === 0) throw new PromptFileError("빈 파일입니다");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new PromptFileError(
      `파일이 너무 큽니다 (${formatBytes(file.size)}, 최대 ${formatBytes(
        MAX_ATTACHMENT_BYTES
      )})`
    );
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    throw new PromptFileError("파일을 읽지 못했습니다");
  }
  if (!content.trim()) throw new PromptFileError("내용이 비어 있습니다");

  return {
    name: file.name,
    size: file.size,
    type: file.type || "text/plain",
    format: detected.format,
    language: detected.language,
    content,
  };
}

/* ---------- 집계 · 비교 ---------- */

export function sectionCharCount(s: PromptSection): number {
  return s.text.length + s.attachments.reduce((sum, a) => sum + a.content.length, 0);
}

export function presetCharCount(p: PromptPreset): number {
  return SECTION_DEFS.reduce((sum, d) => sum + sectionCharCount(p[d.key]), 0);
}

export function presetHasContent(p: PromptPreset): boolean {
  return SECTION_DEFS.some(
    (d) => p[d.key].text.trim() !== "" || p[d.key].attachments.length > 0
  );
}

/* 키를 고정 순서로 펼친다 — JSON.stringify 비교는 **키 삽입 순서**에 민감하다.
   그냥 stringify 하면 이런 오탐이 난다: 새 프롬프트(emptySection 은 language
   키가 없다)에서 형식을 코드로 바꾸면 language 가 맨 뒤에 붙는데, 저장 후
   서버에서 되읽으면 toSection 이 language 를 중간에 놓는다. 내용이 같아도
   문자열이 달라져 저장 직후에도 계속 "저장 안 됨"으로 보인다.
   undefined 와 키 없음도 여기서 같이 흡수한다. */
function canonicalSection(s: PromptSection) {
  return {
    text: s.text,
    format: s.format,
    language: s.language ?? null,
    attachments: s.attachments.map((a) => ({
      name: a.name,
      size: a.size,
      type: a.type,
      format: a.format,
      language: a.language ?? null,
      content: a.content,
      extractedFrom: a.extractedFrom ?? null,
      pages: a.pages ?? null,
      truncated: a.truncated ?? false,
    })),
  };
}

export function samePresetContent(a: PromptPreset, b: PromptPreset): boolean {
  const shape = (p: PromptPreset) =>
    JSON.stringify(SECTION_DEFS.map((d) => canonicalSection(p[d.key])));
  return shape(a) === shape(b);
}

export function clonePreset(p: PromptPreset): PromptPreset {
  return structuredClone(p);
}

/* ---------- 조립 (→ content) ---------- */

/** 코드펜스 길이를 본문의 백틱보다 길게 잡는다 — 안에 ``` 이 있어도 안 깨진다. */
function fence(content: string): string {
  const runs = content.match(/`{3,}/g);
  const width = runs ? Math.max(...runs.map((r) => r.length)) + 1 : 3;
  return "`".repeat(width);
}

function wrap(content: string, language: string): string {
  const f = fence(content);
  return `${f}${language}\n${content}\n${f}`;
}

/**
 * 3섹션 + 첨부를 모델이 읽을 하나의 산문으로 조립한다 — 이 결과가 백엔드
 * `content` 가 되고 그대로 Bedrock 에 들어간다.
 *
 * 첨부는 항상 코드펜스로 감싼다 — 본문과 경계가 흐려지면 모델이 지침과
 * 참고자료를 구분하지 못한다.
 */
export function buildPromptText(p: PromptPreset): string {
  const blocks: string[] = [];

  for (const def of SECTION_DEFS) {
    const s = p[def.key];
    const text = s.text.trim();
    const attachments = s.attachments.filter((a) => a.content.trim() !== "");
    if (!text && attachments.length === 0) continue;

    blocks.push(`## ${def.label}`);
    if (text) {
      blocks.push(
        s.format === "code" ? wrap(text, s.language ?? DEFAULT_CODE_LANGUAGE) : text
      );
    }
    for (const a of attachments) {
      // PDF 는 추출본이라는 사실을 명시한다 — 표·다단이 흐트러졌을 수 있다는
      // 걸 모델이 알아야 그대로 인용하지 않는다.
      const origin =
        a.extractedFrom === "pdf"
          ? ` (PDF${a.pages ? ` ${a.pages}쪽` : ""} 텍스트 추출${
              a.truncated ? ", 일부만" : ""
            })`
          : "";
      blocks.push(`### 첨부 · ${a.name}${origin}`);
      const language =
        a.format === "code"
          ? a.language ?? DEFAULT_CODE_LANGUAGE
          : a.format === "markdown"
            ? "markdown"
            : "";
      blocks.push(wrap(a.content.trim(), language));
    }
  }

  return blocks.join("\n\n");
}

/* ---------- 백엔드 왕복 ---------- */

/** DDB 아이템 한계(400KB)에 맞춘 상한. 백엔드 _MAX_PAYLOAD_BYTES 와 같은 값이라
 *  프런트에서 먼저 막아 400 을 안 보게 한다. */
export const PROMPT_PAYLOAD_LIMIT_BYTES = 340 * 1024;

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 백엔드 `sections` 로 보낼 구조. content 와 달리 모델이 읽지 않는다. */
export function sectionsPayload(p: PromptPreset): Record<string, PromptSection> {
  return {
    description: p.description,
    guidelines: p.guidelines,
    attachments: p.attachments,
  };
}

/** 저장 시 실제로 DDB 아이템에 들어갈 바이트 수 (content + sections_json).
 *  한글은 UTF-8 에서 3바이트라 글자 수로 재면 3배를 놓친다. */
export function payloadBytes(p: PromptPreset): number {
  return (
    utf8Bytes(buildPromptText(p)) + utf8Bytes(JSON.stringify(sectionsPayload(p)))
  );
}

function toAttachment(v: unknown): PromptAttachment | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Partial<PromptAttachment>;
  if (typeof a.name !== "string" || !a.name) return null;
  const detected = detectFormat(a.name);
  return {
    name: a.name,
    size: typeof a.size === "number" ? a.size : 0,
    type: typeof a.type === "string" ? a.type : "text/plain",
    format: isFormat(a.format) ? a.format : detected?.format ?? "text",
    language: normalizeLanguage(a.language) ?? detected?.language,
    content: typeof a.content === "string" ? a.content : "",
    extractedFrom: a.extractedFrom === "pdf" || isPdf(a.name) ? "pdf" : undefined,
    pages: typeof a.pages === "number" ? a.pages : undefined,
    truncated: a.truncated === true ? true : undefined,
  };
}

function toSection(v: unknown, fallback: PromptFormat): PromptSection {
  if (!v || typeof v !== "object") return emptySection(fallback);
  const s = v as Partial<PromptSection>;
  return {
    text: typeof s.text === "string" ? s.text : "",
    format: isFormat(s.format) ? s.format : fallback,
    language: normalizeLanguage(s.language),
    attachments: Array.isArray(s.attachments)
      ? s.attachments.map(toAttachment).filter((a): a is PromptAttachment => a !== null)
      : [],
  };
}

/** 백엔드 `sections` (unknown) → 프리셋. 모양이 아니면 null. */
export function presetFromSections(raw: unknown): PromptPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // 세 키 중 하나라도 섹션 모양이면 구조가 있는 것으로 본다.
  const known = SECTION_DEFS.some((d) => r[d.key] && typeof r[d.key] === "object");
  if (!known) return null;
  return {
    description: toSection(r.description, "text"),
    guidelines: toSection(r.guidelines, "markdown"),
    attachments: toSection(r.attachments, "text"),
  };
}

const HEADING_BY_LABEL: Record<string, PromptSectionKey> = {
  설명: "description",
  지침: "guidelines",
  파일: "attachments",
};

/**
 * sections 가 없는 프롬프트(옛 버전 · /prompts/edit 평문 저장 · 시드 .md)를
 * 최대한 섹션으로 되돌린다. `## 설명` / `## 지침` / `## 파일` 헤딩만 인식하고,
 * 하나도 없으면 전체를 지침에 넣는다 — 내용을 잃지 않는 게 우선이다. 옛
 * `## 구조` 헤딩(2026-08-20 폐기)은 더 이상 안 잡힌다 — 그 아래 내용은
 * 헤딩 자체가 일반 텍스트로 취급되어 직전 섹션(대개 설명)에 그대로 붙는다.
 *
 * ⚠️ sections 가 있으면 그게 정본이다. 이건 폴백 전용이다.
 */
export function presetFromProse(content: string): PromptPreset {
  const preset = emptyPreset();
  const lines = content.split("\n");

  const buckets: Partial<Record<PromptSectionKey, string[]>> = {};
  const preamble: string[] = [];
  let current: PromptSectionKey | null = null;

  for (const line of lines) {
    const m = /^##\s+(설명|지침|파일)\s*$/.exec(line.trim());
    if (m) {
      current = HEADING_BY_LABEL[m[1]];
      buckets[current] = buckets[current] ?? [];
      continue;
    }
    if (current) buckets[current]!.push(line);
    else preamble.push(line);
  }

  const matched = Object.keys(buckets).length > 0;
  if (!matched) {
    preset.guidelines.text = content.trim();
    return preset;
  }

  for (const def of SECTION_DEFS) {
    const body = buckets[def.key];
    if (body) preset[def.key].text = body.join("\n").trim();
  }
  // 첫 헤딩 앞에 있던 내용은 버리지 않고 설명 앞에 붙인다.
  const lead = preamble.join("\n").trim();
  if (lead) {
    preset.description.text = [lead, preset.description.text]
      .filter((v) => v !== "")
      .join("\n\n");
  }
  return preset;
}

/** 백엔드 상세 응답 → 편집용 프리셋. sections 우선, 없으면 content 에서 복원. */
export function presetFromDetail(detail: {
  active_content: string;
  sections?: unknown;
}): PromptPreset {
  return (
    presetFromSections(detail.sections) ?? presetFromProse(detail.active_content ?? "")
  );
}
