export interface DraftFile {
  id: string;
  name: string;
  content: string;
}

/** 초안 필드·파일 편집 모달 — PromptVersionReference.tsx 에서 리팩토링 7단계에서 분리(내용 불변). */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi } from "@/lib/adminClient";
import { parsePromptLabSections } from "@/lib/promptLabSections";
import { parseMdHeadings, findHeadingByText, jumpTextareaToHeading } from "./markdownHeadings";

/** 프로덕션 패널(PromptSectionsPanel.tsx)의 FieldModal과 똑같이 "취소/저장"
 *  두 버튼을 둔다 — 2026-09-26, 사용자 지적: "설명, 지침, 파일 부분에
 *  저장 버튼이 있어야 안정적일 것 같네요.. 지금은 저장 버튼이 없어서..
 *  뭔가 안정적이지 않아." (전엔 "닫기" 하나뿐이라 타이핑하는 족족 즉시
 *  반영돼 "저장했다"는 확신을 주는 지점이 없었다). 이 모달 안에서만
 *  로컬로 값을 들고 있다가, "저장"을 눌러야 카드의 draft에 반영된다 —
 *  "취소"를 누르거나 바깥을 클릭하면 편집 내용이 버려진다(카드 draft는
 *  안 바뀜). 그래도 이건 여전히 카드 로컬 상태일 뿐이다 — 서버에 실제로
 *  남기려면 카드의 "버전 저장" 버튼을 한 번 더 눌러야 한다.
 *
 *  2026-09-27, 사용자 지적(후속) — 1차로는 편집 영역 하단에 읽기 전용
 *  색깔 diff 패널(VersionDiffPanel.tsx)을 붙였는데, "지금 같은 구조를
 *  말한게 아니긴 한데... 여기에서, 프롬프트를 수정하려고 해도, 이전
 *  버전이랑 비교하거나, 다른 버전들이랑 비교하면서 수정하면 좋으니깐..
 *  지금 수정하려는 건 오른쪽, 비교하려는건 왼쪽으로"라는 재지적으로
 *  방향이 바뀌었다 — "수정하는 그 순간" 옆에 참고할 과거 버전을
 *  띄워달라는 것. 왼쪽에 버전 칩(쓰레드 목록과 같은 구조 — 눌러서 바로
 *  다른 버전 참고 내용으로 전환)+읽기 전용 텍스트, 오른쪽에 지금
 *  고치는 중인 편집 가능한 textarea. 왼쪽은 그냥 "보기용"이라 저장에
 *  영향 없다. 이 모달 안 비교가 진짜 요구였다고 확인돼(뒤이은 지적:
 *  "기존에 만들어주신 버전 비교 부분은 삭제해주시고요, edit 부분 눌러서
 *  모달에서만 보여줄거"), VersionDiffPanel.tsx는 더 안 쓰고 파일 자체를
 *  지웠다(PromptVersionReference.tsx의 이 모달들이 정본). */
export function DraftFieldModal({
  title,
  fieldKey,
  value,
  onSave,
  onCancel,
  rows,
  category,
  name,
  compareCandidates,
  currentDateLabel,
}: {
  title: string;
  /** 비교 참고용 콘텐츠를 어느 필드에서 뽑을지 — parsePromptLabSections
   *  결과의 같은 키를 그대로 읽는다. */
  fieldKey: "description" | "instructions";
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  rows: number;
  category: string;
  name: string;
  /** 왼쪽 비교 칩에 띄울 버전 목록 — 지금 로드된 버전은 이미 오른쪽에서
   *  보고 있으니 호출부가 미리 걸러서 넘긴다. */
  compareCandidates: { version: number; label: string | null; isProduction: boolean; dateLabel: string }[];
  /** "지금 수정 중"(=지금 로드된 버전)이 언제 저장됐는지 — 2026-09-27,
   *  사용자 요청: "변경이력? 그런것도 뜨면 좋긴할듯요.. 언제 변경했고
   *  그런". 버전 목록엔 이미 있던 정보(sidebarVersions.dateLabel)를
   *  모달 안에도 그대로 보여준다. */
  currentDateLabel: string | null;
}) {
  const [draft, setDraft] = useState(value);
  const [compareVersion, setCompareVersion] = useState<number | null>(compareCandidates[0]?.version ?? null);
  const [compareText, setCompareText] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);
  // 목차는 "지금 수정 중"(draft) 기준으로 뽑는다 — 이게 정본이고, 비교
  // 참고 쪽은 버전마다 구조가 다를 수 있어 클릭 시 findHeadingByText로
  // 그때그때 찾는다(위 모듈 함수 참고).
  const headings = parseMdHeadings(draft);

  useEffect(() => {
    if (compareVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompareText(null);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    adminApi
      .getPromptVersion(category, name, compareVersion)
      .then((v) => {
        if (cancelled) return;
        const parsed = parsePromptLabSections(v.sections);
        setCompareText(parsed ? parsed[fieldKey] : fieldKey === "instructions" ? v.content : "");
      })
      .catch((err) => console.error("비교 버전 조회 실패", err))
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, name, compareVersion, fieldKey]);

  // 2026-09-27, 사용자 지적 — "설명, 지침, 파일 부분 열면.. 테스트 /
  // 테스트 추가 부분이 보이넹... 중앙모달 쪽에 겹치는데?": 이 모달이
  // z-[70]인데도 그보다 z-10인 "테스트" 경계 띠한테 덮였다 — 원인은
  // 프로덕션 카드 래퍼가 position: sticky + 명시적 z-index를 갖고 있어서
  // 그 자체로 새 스태킹 컨텍스트를 만들고, 이 모달이 그 안에 중첩
  // 렌더되는 바람에 z-[70]이 "그 컨텍스트 안에서만" 유효해졌기 때문이다
  // (바깥에서 보면 사실상 z-10 취급) — 그 컨텍스트 바로 다음 형제인
  // "테스트" 띠(마찬가지로 z-10)가 DOM 순서상 나중이라 위에 그려졌다.
  // 포털로 document.body에 바로 붙여서 어떤 조상의 스태킹 컨텍스트에도
  // 안 갇히게 한다(react-dom createPortal).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl"
      >
        <h3 className="flex-none text-[16px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          {/* 2026-09-27, 사용자 요청 — "좌측에 목차처럼... 마크다운 문법
              활용... 클릭하면 바로 넘어갈 수 있도록": 헤딩이 있을 때만
              보인다(설명처럼 짧은 산문엔 보통 헤딩이 없다 — 빈 칼럼을
              굳이 안 그림). */}
          {headings.length > 0 && (
            <div
              className="w-40 flex-none space-y-0.5 overflow-y-auto border-r pr-2.5"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">목차</p>
              {headings.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    jumpTextareaToHeading(draftRef.current, draft, h);
                    if (compareText) {
                      const match = findHeadingByText(compareText, h.text);
                      if (match) jumpTextareaToHeading(compareRef.current, compareText, match);
                    }
                  }}
                  className="block w-full truncate rounded py-0.5 pr-1 text-left text-[10.5px] transition-colors hover:bg-[var(--surface-sunken)]"
                  style={{ paddingLeft: `${(h.level - 1) * 10 + 6}px`, color: "var(--text-secondary)" }}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                  비교 참고 (읽기 전용){compareText !== null && !compareLoading && ` · ${compareText.length.toLocaleString()}자`}
                  {/* 2026-09-27, 사용자 요청 — "변경이력? 그런것도 뜨면
                      좋긴할듯요.. 언제 변경했고 그런": 버전 목록에 이미
                      있던 저장 시각을 여기서도 보여준다. */}
                  {compareCandidates.find((v) => v.version === compareVersion)?.dateLabel &&
                    ` · ${compareCandidates.find((v) => v.version === compareVersion)!.dateLabel}`}
                </span>
                {compareCandidates.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {compareCandidates.map((v) => (
                      <button
                        key={v.version}
                        type="button"
                        onClick={() => setCompareVersion(v.version)}
                        title={v.dateLabel}
                        className="flex-none rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={
                          v.version === compareVersion
                            ? { background: "var(--accent-soft)", color: "var(--accent)" }
                            : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                        }
                      >
                        v{v.version}
                        {v.isProduction ? " · 프로덕션" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                ref={compareRef}
                readOnly
                value={compareLoading ? "불러오는 중..." : (compareText ?? "")}
                rows={rows}
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
                style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                지금 수정 중 · {draft.length.toLocaleString()}자{currentDateLabel && ` · 마지막 저장 ${currentDateLabel}`}
              </span>
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={rows}
                spellCheck={false}
                autoFocus
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-none justify-end gap-2">
          <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function DraftFileModal({
  file,
  onSave,
  onRemove,
  onCancel,
  category,
  promptName,
  compareCandidates,
  currentDateLabel,
}: {
  file: DraftFile;
  onSave: (patch: Pick<DraftFile, "name" | "content">) => void;
  onRemove: () => void;
  onCancel: () => void;
  category: string;
  promptName: string;
  /** 왼쪽 비교 칩에 띄울 버전 목록(DraftFieldModal과 동일 원칙). */
  compareCandidates: { version: number; label: string | null; isProduction: boolean; dateLabel: string }[];
  /** "지금 수정 중"이 언제 저장됐는지(DraftFieldModal과 동일 원칙). */
  currentDateLabel: string | null;
}) {
  const [name, setName] = useState(file.name);
  const [content, setContent] = useState(file.content);
  const [compareVersion, setCompareVersion] = useState<number | null>(compareCandidates[0]?.version ?? null);
  const [compareText, setCompareText] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMissing, setCompareMissing] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);
  const headings = parseMdHeadings(content);

  useEffect(() => {
    if (compareVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompareText(null);
      setCompareMissing(false);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    adminApi
      .getPromptVersion(category, promptName, compareVersion)
      .then((v) => {
        if (cancelled) return;
        const parsed = parsePromptLabSections(v.sections);
        // 파일은 "이름"으로 매칭한다 — 같은 이름의 파일이 그 버전엔
        // 없었을 수 있다(새로 추가한 파일이거나 그때는 다른 이름이었거나).
        const match = parsed?.files.find((f) => f.name === name);
        setCompareText(match?.content ?? null);
        setCompareMissing(!match);
      })
      .catch((err) => console.error("비교 버전 조회 실패", err))
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, promptName, compareVersion, name]);

  // 위 DraftFieldModal과 동일한 이유로 포털 사용.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl"
      >
        <h3 className="flex-none text-[16px] font-semibold text-[var(--text-primary)]">파일 설정</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="파일명"
          className="ui-input mt-3 w-full flex-none rounded-lg px-3 py-2 text-[13px]"
          autoFocus
        />
        {/* 2026-09-27, 사용자 지적 — "프롬프트를 수정하려고 해도, 이전
            버전이랑 비교하거나.. 다른 버전들이랑 비교하면서 수정하면
            좋으니깐.. 지금 수정하려는 건 오른쪽, 비교하려는건 왼쪽으로":
            DraftFieldModal과 동일 구조, 다만 파일은 이름으로 다른 버전의
            같은 파일을 찾는다(없으면 "이 버전엔 없음"). */}
        <div className="mt-2 flex min-h-0 flex-1 gap-3">
          {headings.length > 0 && (
            <div
              className="w-40 flex-none space-y-0.5 overflow-y-auto border-r pr-2.5"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">목차</p>
              {headings.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    jumpTextareaToHeading(contentRef.current, content, h);
                    if (compareText) {
                      const match = findHeadingByText(compareText, h.text);
                      if (match) jumpTextareaToHeading(compareRef.current, compareText, match);
                    }
                  }}
                  className="block w-full truncate rounded py-0.5 pr-1 text-left text-[10.5px] transition-colors hover:bg-[var(--surface-sunken)]"
                  style={{ paddingLeft: `${(h.level - 1) * 10 + 6}px`, color: "var(--text-secondary)" }}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                  비교 참고 (읽기 전용){compareText !== null && !compareLoading && ` · ${compareText.length.toLocaleString()}자`}
                  {compareCandidates.find((v) => v.version === compareVersion)?.dateLabel &&
                    ` · ${compareCandidates.find((v) => v.version === compareVersion)!.dateLabel}`}
                </span>
                {compareCandidates.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {compareCandidates.map((v) => (
                      <button
                        key={v.version}
                        type="button"
                        onClick={() => setCompareVersion(v.version)}
                        title={v.dateLabel}
                        className="flex-none rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={
                          v.version === compareVersion
                            ? { background: "var(--accent-soft)", color: "var(--accent)" }
                            : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                        }
                      >
                        v{v.version}
                        {v.isProduction ? " · 프로덕션" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {compareMissing ? (
                <p
                  className="flex min-h-[45vh] w-full flex-1 items-center justify-center rounded-lg text-[11px]"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}
                >
                  이 버전엔 &ldquo;{name || "이름 없음"}&rdquo; 파일이 없습니다
                </p>
              ) : (
                <textarea
                  ref={compareRef}
                  readOnly
                  value={compareLoading ? "불러오는 중..." : (compareText ?? "")}
                  rows={14}
                  className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
                />
              )}
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                지금 수정 중 · {content.length.toLocaleString()}자{currentDateLabel && ` · 마지막 저장 ${currentDateLabel}`}
              </span>
              <textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder="파일 내용"
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-none justify-between gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-[var(--danger)]"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
              취소
            </button>
            <button
              type="button"
              onClick={() => onSave({ name, content })}
              className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
