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

export function promptIdFor(channel: string, scopeId: string): string {
  return `${channel}/${scopeId}`;
}

export function scopeLabel(id: string): string {
  return PROMPT_SCOPES.find((s) => s.id === id)?.label ?? id;
}

export function scopeGroups(): Array<{ kind: PromptScopeKind; scopes: PromptScope[] }> {
  const kinds: PromptScopeKind[] = ["status"];
  return kinds
    .map((kind) => ({ kind, scopes: PROMPT_SCOPES.filter((s) => s.kind === kind) }))
    .filter((g) => g.scopes.length > 0);
}

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

export interface PromptAttachment {
  name: string;
  size: number;
  type: string;
  format: PromptFormat;
  language?: string;
  content: string;
  extractedFrom?: "pdf";
  pages?: number;
  truncated?: boolean;
}

export interface PromptSection {
  text: string;
  format: PromptFormat;
  language?: string;
  attachments: PromptAttachment[];
}

export type PromptSectionKey = "description" | "structure" | "guidelines";

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
    key: "structure",
    label: "구조",
    hint: "출력이 따라야 할 틀 · 순서",
    rows: 7,
    defaultFormat: "markdown",
    placeholder: "예)\n1. 헤드라인\n2. 3문단 요약\n3. 핵심 키워드 3개",
  },
  {
    key: "guidelines",
    label: "지침",
    hint: "지켜야 할 규칙 · 톤 · 제약",
    rows: 7,
    defaultFormat: "markdown",
    placeholder: "예)\n- 문장은 간결하게\n- 추측성 표현 금지\n- 숫자는 출처와 함께",
  },
];

export function emptySection(format: PromptFormat): PromptSection {
  return { text: "", format, attachments: [] };
}

export function emptyPreset(): PromptPreset {
  return {
    description: emptySection("text"),
    structure: emptySection("markdown"),
    guidelines: emptySection("markdown"),
  };
}

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

export const ATTACHMENT_ACCEPT = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",");

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

export function shortFormatLabel(a: PromptAttachment): string {
  if (a.extractedFrom === "pdf") return "PDF";
  if (a.format === "code") return (a.language ?? "code").toUpperCase();
  return a.format === "markdown" ? "MD" : "TXT";
}

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
    format: "text",
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

function fence(content: string): string {
  const runs = content.match(/`{3,}/g);
  const width = runs ? Math.max(...runs.map((r) => r.length)) + 1 : 3;
  return "`".repeat(width);
}

function wrap(content: string, language: string): string {
  const f = fence(content);
  return `${f}${language}\n${content}\n${f}`;
}

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

export const PROMPT_PAYLOAD_LIMIT_BYTES = 340 * 1024;

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function sectionsPayload(p: PromptPreset): Record<string, PromptSection> {
  return {
    description: p.description,
    structure: p.structure,
    guidelines: p.guidelines,
  };
}

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

export function presetFromSections(raw: unknown): PromptPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const known = SECTION_DEFS.some((d) => r[d.key] && typeof r[d.key] === "object");
  if (!known) return null;
  return {
    description: toSection(r.description, "text"),
    structure: toSection(r.structure, "markdown"),
    guidelines: toSection(r.guidelines, "markdown"),
  };
}

const HEADING_BY_LABEL: Record<string, PromptSectionKey> = {
  설명: "description",
  구조: "structure",
  지침: "guidelines",
};

export function presetFromProse(content: string): PromptPreset {
  const preset = emptyPreset();
  const lines = content.split("\n");

  const buckets: Partial<Record<PromptSectionKey, string[]>> = {};
  const preamble: string[] = [];
  let current: PromptSectionKey | null = null;

  for (const line of lines) {
    const m = /^##\s+(설명|구조|지침)\s*$/.exec(line.trim());
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
  const lead = preamble.join("\n").trim();
  if (lead) {
    preset.description.text = [lead, preset.description.text]
      .filter((v) => v !== "")
      .join("\n\n");
  }
  return preset;
}

export function presetFromDetail(detail: {
  active_content: string;
  sections?: unknown;
}): PromptPreset {
  return (
    presetFromSections(detail.sections) ?? presetFromProse(detail.active_content ?? "")
  );
}
