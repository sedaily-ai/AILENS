import type { PromptLabSections } from "./types";

/** service/lens-cms-api::prompt_lab_repo.assemble_draft / main.py::
 *  internal_publish_prompt_lab과 정확히 같은 조립 규칙("설명 → 지침 →
 *  파일(### 파일 · 이름 헤딩)" 순서로 빈 줄 두 개로 이어붙임) — 2026-09-26
 *  신설, 테스트 카드가 자기 로컬 초안을 "버전 저장"할 때 서버로 보낼
 *  content 문자열을 클라이언트에서 직접 만들어야 해서 필요해졌다(서버
 *  쪽 assemble_draft는 prompt_lab_docs 테이블을 읽는 함수라 카드의 로컬
 *  상태엔 못 씀). 두 구현이 갈라지면 "버전 저장"으로 만든 content가
 *  프로덕션 "발행"으로 만든 것과 미묘하게 달라지는 버그가 생기니, 이
 *  규칙을 바꿀 땐 반드시 파이썬 쪽도 같이 고칠 것. */
export function assemblePromptLabContent(draft: {
  description: string;
  instructions: string;
  files: { name: string; content: string }[];
}): string {
  const parts: string[] = [];
  if (draft.description.trim()) parts.push(draft.description.trim());
  if (draft.instructions.trim()) parts.push(draft.instructions.trim());
  for (const f of draft.files) {
    if (f.content.trim()) parts.push(`### 파일 · ${f.name || "이름 없음"}\n\n${f.content.trim()}`);
  }
  return parts.join("\n\n");
}

/** PromptVersionDetail.sections(unknown, service/lens-cms-api::
 *  internal_publish_prompt_lab이 채워 넣음)를 신뢰할 수 있는 형태로
 *  검증한다 — 2026-09-26 신설. /prompts/edit(PromptDrawer)가 발행한
 *  버전은 sections가 다른 모양({content: PromptSection})이라 "kind"
 *  판별값으로 걸러낸다(lib/prompt.ts::presetFromSections와 같은 원칙 —
 *  unknown 경계값은 항상 이런 검증기를 거친다). */
export function parsePromptLabSections(raw: unknown): PromptLabSections | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== "prompt_lab") return null;
  const filesRaw = Array.isArray(obj.files) ? obj.files : [];
  const files = filesRaw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      name: typeof f.name === "string" ? f.name : "",
      content: typeof f.content === "string" ? f.content : "",
    }));
  return {
    kind: "prompt_lab",
    label: typeof obj.label === "string" && obj.label.trim() ? obj.label : undefined,
    description: typeof obj.description === "string" ? obj.description : "",
    instructions: typeof obj.instructions === "string" ? obj.instructions : "",
    files,
  };
}
