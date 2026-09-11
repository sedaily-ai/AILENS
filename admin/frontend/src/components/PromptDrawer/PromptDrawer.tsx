"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_PDF_BYTES,
  PROMPT_PAYLOAD_LIMIT_BYTES,
  SECTION_DEFS,
  buildPromptText,
  emptyPreset,
  formatBytes,
  payloadBytes,
  presetCharCount,
  presetFromDetail,
  presetHasContent,
  promptIdFor,
  samePresetContent,
  type PromptPreset,
  type PromptSection,
  type PromptSectionKey,
} from "@/lib/prompt";
import { Icon, ICON } from "./Icons";
import { ChannelTabs } from "./ChannelTabs";
import { PromptField } from "./PromptField";

/* 콘텐츠 목록 화면(글 관리·영상·웹툰)의 "프롬프트" 버튼이 여는 우측 슬라이드 패널.
   2026-08-09 의 정중앙 모달(PromptEditModal)을 대체한다.

   구조: 채널(letters/webtoon/podcast/video)당 문서 하나(백엔드 프롬프트 id
         `<channel>/published`), 섹션은 "프롬프트" 하나(2026-09-11까지는
         설명·구조·지침·파일로 나뉘어 있었다 — 전부 이 하나로 합쳐졌다,
         아래 2026-09-11 항목 참조). 그 하나 안에서
           · 형식(Markdown · 텍스트 · 코드+언어)을 골라 직접 입력하거나
           · 텍스트 기반 파일·PDF 를 첨부한다(본문을 읽어 보관 → 프롬프트에 들어간다).

   저장은 기존 백엔드를 그대로 쓴다 — POST /admin/prompts/{category}/{name} 이
   새 버전(v#N)을 쌓고, 산문은 content, 구조는 sections 로 나눠 보낸다. 이력·
   버전 표시는 모달에 있던 걸 유지했다. 데이터 규칙은 전부 @/lib/prompt.

   2026-08-19 — Icon/FileIcon(Icons.tsx), FormatPicker, PromptField 를 각자
   파일로 분리(PostForm/ 폴더와 같은 컨벤션). 로직·마크업은 그대로, 구조만
   나눴다 — service/frontend 의 ArchiveTab.tsx 분리와 동일한 이유(916줄 한 파일에
   컴포넌트 5개가 섞여 있었다). 이때 같이 분리했던 ScopeTabs는 2026-09-11에
   스코프 개념 자체가 없어지며 폐기·삭제됐다(바로 아래).

   2026-09-11 — "초안"/"발행" 스코프 탭(ScopeTabs) 폐기. 저장하면 곧바로
   파이프라인이 읽는 문서가 바뀌도록 채널당 문서를 하나로 합쳤다 —
   @/lib/prompt 상단 주석 참조.

   2026-09-11(같은 날) — "설명"/"지침"/"파일" 3섹션도 "프롬프트" 한
   섹션으로 합쳤다("이 둘을 어떤 기준으로 나누냐"는 사용자 지적 —
   SECTION_DEFS 정의는 @/lib/prompt, 마이그레이션은 presetFromSections/
   presetFromProse 참조). 이 파일 쪽 코드는 SECTION_DEFS를 그대로
   순회해서 렌더하므로 섹션 개수가 바뀌어도 따로 손 볼 데가 없었다.

   2026-09-11(같은 날) — 버전 히스토리 표(버전·저장 시각·작성자)도 없앴다
   ("굳이 보여줄 이유가 있냐"는 사용자 지적). 단일 공유 관리자 계정이라
   작성자 칸이 항상 "admin"이었고, 옛 버전을 눌러 보거나 되돌리는 액션도
   없어서 순수 읽기용 표가 화면만 길게 늘렸다 — 실제로 쓸모 있으려면
   "이 버전으로 되돌리기" 같은 액션이 있어야 하는데 지금은 없다. 백엔드
   API는 여전히 history를 내려주니 필요해지면 다시 붙이면 된다. */

/** 채널 하나의 서버 상태. */
interface ChannelState {
  saved: PromptPreset; // 서버에 있는 것
  draft: PromptPreset; // 편집 중인 것
  version: number; // 0 = 아직 서버에 없음
  loading: boolean;
  error: string | null;
}

const emptyChannelState = (): ChannelState => ({
  saved: emptyPreset(),
  draft: emptyPreset(),
  version: 0,
  loading: true,
  error: null,
});

interface Props {
  /** 콘텐츠 채널 — 프롬프트 id 의 category 가 된다 (letters · video · webtoon).
   *  channels 를 안 쓰는 단일 채널 화면(글 관리·웹툰·영상·팟캐스트)은 이걸 쓴다. */
  channel?: string;
  /** 채널이 여러 개인 화면(2026-08-20, "4가지 시선") 전용 — 채널 탭이 위에
   *  하나 더 뜬다. channel 대신 이걸 주면 된다. 예: 레터/웹툰/팟캐스트/영상
   *  4개 포맷 프롬프트를 한 드로어에서 오간다(LensMode.tsx 4개 포맷 탭과
   *  같은 채널 id·순서 — letters/webtoon/podcast/video). */
  channels?: Array<{ id: string; label: string }>;
  open: boolean;
  onClose: () => void;
  /** true면 자기 backdrop/aside/닫기 버튼 없이 헤더+본문+푸터만 렌더한다 —
   *  상위 화면이 다른 패널과 한 aside 안에 이어 붙여 보여주고 싶을 때
   *  쓴다(2026-09-04, webtoon/page.tsx — "프롬프트"/"이미지 실험"을 탭으로
   *  나누지 말고 한 화면에 이어서 보여달라는 피드백). 기본 false — 다른
   *  4개 화면(video/posts/lens/podcast)은 안 건드린다. */
  embedded?: boolean;
  /** 2026-09-11 — webtoon/page.tsx가 "프롬프트 편집"과 "스토리보드 테스트"
   *  단계 사이에 기사 원문을 공유하고 싶을 때만 이 둘을 같이 준다(제어
   *  컴포넌트로 전환) — 한쪽에 붙여넣으면 다른 쪽에도 그대로 보여서 두 번
   *  안 붙여도 된다. 안 주면(다른 4개 화면) 기존처럼 내부 state로 독립
   *  관리한다 — 그 화면들은 안 건드린다. */
  testArticle?: string;
  onTestArticleChange?: (v: string) => void;
}

export function PromptDrawer({
  channel,
  channels,
  open,
  onClose,
  embedded = false,
  testArticle: controlledTestArticle,
  onTestArticleChange,
}: Props) {
  const toast = useToast();
  // 단일 채널(channel)이면 그 하나짜리 목록으로, 여러 채널(channels)이면
  // 그대로 — 아래 로직은 항상 이 배열 하나만 본다.
  const channelList = channels ?? (channel ? [{ id: channel, label: channel }] : []);
  const [activeChannel, setActiveChannel] = useState<string>(channelList[0]?.id ?? "");
  const [states, setStates] = useState<Record<string, ChannelState>>({});
  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // LLMOps 테스트 실행(2026-08-19, 2026-09-11 Bedrock 이관) — 저장 여부와
  // 무관하게 "지금 편집 중인" 프롬프트를 기사 원문과 함께 그 채널의 실제
  // 프로덕션 모델에 던져 실제 산출물을 바로 보여준다. 기사 원문은 채널을
  // 넘나들며 같은 걸로 비교해보고 싶을 때가 많아 채널 공용 상태로 둔다 —
  // 탭을 바꿔도 article은 유지.
  const [internalTestArticle, setInternalTestArticle] = useState("");
  const testArticle = controlledTestArticle ?? internalTestArticle;
  const setTestArticle = onTestArticleChange ?? setInternalTestArticle;
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const key = activeChannel;
  const state = states[key];
  const preset = state?.draft ?? emptyPreset();

  const load = useCallback(
    async (targetChannel: string, { silent = false } = {}) => {
      const promptId = promptIdFor(targetChannel);
      const slash = promptId.indexOf("/");
      const category = promptId.slice(0, slash);
      const name = promptId.slice(slash + 1);
      const k = targetChannel;

      if (!silent) {
        setStates((s) => ({ ...s, [k]: s[k] ?? emptyChannelState() }));
      }
      try {
        const detail = await adminApi.getPrompt(category, name);
        const loaded = presetFromDetail(detail);
        setStates((s) => ({
          ...s,
          [k]: {
            saved: loaded,
            // 편집 중인 내용은 지키지 않는다 — 저장 직후 재조회 경로라 draft==saved 가 맞다.
            draft: structuredClone(loaded),
            version: detail.active_version,
            loading: false,
            error: null,
          },
        }));
      } catch (err) {
        // 404 는 "아직 안 만든 프롬프트"다 — 에러가 아니라 빈 폼으로 시작한다.
        // 저장하면 백엔드가 v#1 로 만들어 준다(handle_update upsert).
        const notFound = err instanceof AdminApiError && err.status === 404;
        setStates((s) => ({
          ...s,
          [k]: {
            saved: emptyPreset(),
            draft: emptyPreset(),
            version: 0,
            loading: false,
            error: notFound
              ? null
              : err instanceof AdminApiError
                ? err.message
                : "불러오기 실패",
          },
        }));
      }
    },
    []
  );

  // 이미 요청을 보낸 채널 — setStates 안에서 side effect를 실행하는
  // 반패턴을 피하려고 렌더와 무관한 ref로 따로 추적한다. 열 때마다 비워서
  // (아래 effect) "다시 열면 서버 최신값으로 새로고침"하던 기존 동작을
  // 유지한다 — 채널 탭 전환 중 같은 채널을 반복 방문할 때만 중복 요청을
  // 막는 용도.
  const requestedKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (open) requestedKeysRef.current = new Set();
  }, [open]);

  // 열릴 때, 그리고 채널 탭을 바꿀 때마다 그 채널을 받아 둔다(2026-08-20,
  // 채널이 여러 개인 화면 대응 — 매번 전부 다시 받지 않고 아직 안 불러온
  // 채널만). 탭을 눌렀을 때 기다리지 않게, 그리고 어느 채널에 프롬프트가
  // 있는지 점으로 바로 보여주려면 필요하다.
  useEffect(() => {
    if (!open || !activeChannel) return;
    if (requestedKeysRef.current.has(activeChannel)) return;
    requestedKeysRef.current.add(activeChannel);
    void load(activeChannel);
  }, [open, activeChannel, load]);

  // 배경 스크롤 잠금 + 첫 입력칸 포커스 — open 이 바뀔 때만.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // 채널을 바꾸면 내용이 통째로 갈리므로 스크롤을 위로 되돌린다.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [activeChannel]);

  // ChannelTabs용(2026-08-20) — 채널마다 저장 안 된 변경/저장된 내용
  // 여부로 점을 찍는다. channelList가 1개뿐인 화면(단일 channel prop
  // 사용처)은 ChannelTabs 자체를 안 그리니 계산해도 무해하다.
  const dirtyChannelIds = channelList
    .map((c) => c.id)
    .filter((cid) => {
      const st = states[cid];
      return st && !st.loading && !samePresetContent(st.saved, st.draft);
    });
  const filledChannelIds = channelList
    .map((c) => c.id)
    .filter((cid) => {
      const st = states[cid];
      return st && !st.loading && presetHasContent(st.saved);
    });
  const dirty = state ? !state.loading && !samePresetContent(state.saved, state.draft) : false;
  const filled = presetHasContent(preset);
  const bytes = payloadBytes(preset);
  const overBudget = bytes > PROMPT_PAYLOAD_LIMIT_BYTES;

  const handleClose = () => {
    // 채널이 여러 개면(2026-08-20) 지금 안 보고 있는 채널의 미저장 변경도
    // 놓치지 않게 전체를 훑는다 — dirty는 activeChannel 하나만 본다.
    const dirtyChannels = Object.keys(states).filter((k) => {
      const st = states[k];
      return st && !st.loading && !samePresetContent(st.saved, st.draft);
    });
    if (dirtyChannels.length > 0) {
      // 채널이 하나뿐인 화면(글 관리·웹툰·영상·팟캐스트)은 어차피 그
      // 채널 얘기니 이름을 또 안 붙인다 — "4가지 시선"처럼 여러 채널을
      // 오갈 때만 어느 채널인지 밝힌다.
      const suffix =
        channelList.length > 1
          ? ` (${dirtyChannels.map((ch) => channelList.find((c) => c.id === ch)?.label ?? ch).join(" · ")})`
          : "";
      if (!window.confirm(`저장하지 않은 변경이 있습니다${suffix}. 닫을까요?`)) {
        return;
      }
    }
    onClose();
  };
  const closeRef = useRef(handleClose);
  closeRef.current = handleClose;

  // ESC 로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const patchSection = (sectionKey: PromptSectionKey, next: PromptSection) =>
    setStates((s) => {
      const cur = s[key];
      if (!cur) return s;
      return { ...s, [key]: { ...cur, draft: { ...cur.draft, [sectionKey]: next } } };
    });

  const handleSave = async () => {
    if (!state || saving) return;
    if (!filled) {
      toast.show("설명·구조·지침 중 하나는 입력해 주세요", "error");
      return;
    }
    if (overBudget) {
      toast.show(
        `내용이 너무 큽니다 (${formatBytes(bytes)} / 최대 ${formatBytes(
          PROMPT_PAYLOAD_LIMIT_BYTES
        )}) — 첨부를 줄여 주세요`,
        "error"
      );
      return;
    }

    const promptId = promptIdFor(activeChannel);
    const slash = promptId.indexOf("/");
    const category = promptId.slice(0, slash);
    const name = promptId.slice(slash + 1);

    setSaving(true);
    try {
      const r = await adminApi.updatePrompt(
        category,
        name,
        buildPromptText(state.draft),
        state.draft
      );
      toast.show(
        r.created
          ? "프롬프트를 만들었습니다 (v1)"
          : `v${r.new_version} 저장 — 다음 실행부터 바로 적용됩니다`,
        "success"
      );
      await load(activeChannel, { silent: true });
    } catch (err) {
      toast.show(
        `저장 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  // 2026-09-11 — 테스트 실행이 GPT-4o에서 각 채널의 실제 프로덕션 모델
  // (Bedrock — 레터는 Opus 5)로 바뀌면서 작업+폴링 방식이 됐다. 레터는
  // 실측상 25초에 480자밖에 못 뽑을 만큼 느려서(routes/prompts.py 참고)
  // API Gateway 30초 벽 안에 동기 응답이 불가능하다 — WebtoonImageLab.tsx의
  // pollJob과 같은 패턴(재귀 setTimeout, useCallback 아님 — 자기 자신을
  // 참조하는 재귀 폴링이라 함수 선언 호이스팅이 필요).
  const testPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (testPollTimerRef.current) clearTimeout(testPollTimerRef.current);
    },
    []
  );

  function pollTestJob(category: string, name: string, jobId: string) {
    adminApi
      .getPromptTestJob(category, name, jobId)
      .then((j) => {
        if (j.status === "pending") {
          testPollTimerRef.current = setTimeout(() => pollTestJob(category, name, jobId), 4000);
          return;
        }
        setTesting(false);
        if (j.status === "done") setTestOutput(j.output);
        else setTestError(j.error ?? "알 수 없는 오류");
      })
      .catch((err) => {
        setTesting(false);
        setTestError(err instanceof AdminApiError ? err.message : "상태 조회 실패");
      });
  }

  const handleTest = async () => {
    if (!state || testing) return;
    if (!testArticle.trim()) {
      toast.show("테스트할 기사 원문을 붙여넣어 주세요", "error");
      return;
    }
    const text = buildPromptText(preset);
    if (!text.trim()) {
      toast.show("설명·구조·지침 중 하나는 입력해 주세요", "error");
      return;
    }

    const promptId = promptIdFor(activeChannel);
    const slash = promptId.indexOf("/");
    const category = promptId.slice(0, slash);
    const name = promptId.slice(slash + 1);

    if (testPollTimerRef.current) {
      clearTimeout(testPollTimerRef.current);
      testPollTimerRef.current = null;
    }
    setTesting(true);
    setTestError(null);
    setTestOutput(null);
    try {
      const r = await adminApi.testPrompt(category, name, text, testArticle);
      testPollTimerRef.current = setTimeout(() => pollTestJob(category, name, r.job_id), 4000);
    } catch (err) {
      setTesting(false);
      setTestError(err instanceof AdminApiError ? err.message : "알 수 없는 오류");
    }
  };

  const handleReset = () => {
    if (!state) return;
    setStates((s) => ({
      ...s,
      [key]: { ...s[key], draft: structuredClone(s[key].saved) },
    }));
  };

  const handleCopy = async () => {
    const text = buildPromptText(preset);
    if (!text) {
      toast.show("복사할 내용이 없습니다", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.show("프롬프트를 복사했습니다", "success");
    } catch {
      toast.show("복사에 실패했습니다 (브라우저 권한 확인)", "error");
    }
  };

  const chars = presetCharCount(preset);

  const headerNode = (
    <div className="ui-divider space-y-3 border-b px-5 pb-3 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="prompt-drawer-title"
            className="font-display text-[19px] font-bold text-[var(--text-primary)]"
          >
            프롬프트
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            <span className="font-mono">{activeChannel}</span>
            {state && !state.loading && (
              <>
                {" · "}
                {state.version > 0 ? (
                  <span className="font-mono font-semibold">v{state.version}</span>
                ) : (
                  "새 프롬프트"
                )}
              </>
            )}
          </p>
        </div>
        {/* embedded면 상위 패널이 닫기 버튼을 하나만 갖는다(2026-09-04). */}
        {!embedded && (
          <button
            type="button"
            onClick={handleClose}
            className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
            aria-label="닫기"
          >
            <Icon d={ICON.close} className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 2026-09-11 — "지금 화면이 실제 쓰이는 프롬프트와 같은 상태인지
          실시간으로 보여달라"는 요청. dirty는 draft/saved를 매 렌더마다
          직접 비교하므로 타이핑하는 즉시(별도 폴링·debounce 없이) 뒤집힌다
          — 스크롤해야 보이는 푸터의 작은 점 표시(예전엔 이것만 있었다)
          말고, 패널을 열자마자 보이는 자리에 뒀다. state.version === 0
          (아직 한 번도 저장 안 한 새 프롬프트)이면 본문에 이미 있는
          안내(“저장하면 v1로 새로 생깁니다”)와 뜻이 겹쳐서 여기선 뺀다. */}
      {state && !state.loading && state.version > 0 && (
        <div
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
          style={
            dirty
              ? { background: "var(--warn-soft)", color: "var(--warn)" }
              : { background: "var(--ok-soft)", color: "var(--ok)" }
          }
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
          {dirty
            ? `저장 안 된 변경이 있습니다 — 지금 파이프라인은 v${state.version} 그대로 씁니다`
            : `저장됨 — 지금 파이프라인이 쓰는 내용과 같습니다`}
        </div>
      )}

      {/* 채널 탭 — channels prop을 받은 화면(2026-08-20, "4가지 시선")만
          뜬다. 단일 channel 화면은 channelList.length === 1이라 안 뜬다. */}
      {channelList.length > 1 && (
        <ChannelTabs
          channels={channelList}
          activeId={activeChannel}
          dirtyChannelIds={dirtyChannelIds}
          filledChannelIds={filledChannelIds}
          onSelect={setActiveChannel}
        />
      )}
    </div>
  );

  const bodyNode = (
    <div
      ref={bodyRef}
      className={embedded ? "space-y-6 px-5 py-5" : "flex-1 space-y-6 overflow-y-auto px-5 py-5"}
    >
          {(!state || state.loading) && <div className="ui-skeleton h-64 rounded-xl" />}

          {state?.error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {state.error}
            </p>
          )}

          {state && !state.loading && !state.error && (
            <>
              {state.version === 0 && (
                <p
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                >
                  아직 만들어지지 않은 프롬프트입니다. 저장하면 v1 로 새로 생깁니다.
                </p>
              )}

              {SECTION_DEFS.map((def, i) => (
                // key 에 채널을 섞는다 — 채널 탭을 바꾸면 첨부 미리보기 같은
                // 필드 내부 상태가 이전 채널 값을 물고 있으면 안 된다.
                <PromptField
                  key={`${activeChannel}-${def.key}`}
                  fieldId={`pm-${def.key}`}
                  label={def.label}
                  hint={def.hint}
                  rows={def.rows}
                  placeholder={def.placeholder}
                  section={preset[def.key]}
                  onChange={(next) => patchSection(def.key, next)}
                  onError={(message) => toast.show(message, "error")}
                  textareaRef={i === 0 ? firstFieldRef : undefined}
                />
              ))}

              <section className="ui-divider space-y-2.5 rounded-xl border p-4">
                <div>
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    테스트 실행
                  </h3>
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    저장 여부와 상관없이 지금 편집 중인 내용을 기사 원문에
                    바로 적용해 봅니다 — 이 채널의 실제 프로덕션 모델을 그대로 씁니다.
                  </p>
                </div>
                <textarea
                  value={testArticle}
                  onChange={(e) => setTestArticle(e.target.value)}
                  placeholder="테스트할 기사 원문을 붙여넣으세요"
                  rows={6}
                  className="ui-input w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--text-faint)]">
                    {testArticle.length.toLocaleString("ko-KR")}자
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleTest()}
                    disabled={testing}
                    className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-sm font-semibold"
                  >
                    {testing ? "생성 중..." : "테스트 실행"}
                  </button>
                </div>
                {testing && (
                  <p className="text-[11px] text-[var(--text-faint)]">
                    채널마다 실제 프로덕션 모델을 그대로 쓰다 보니(레터는 Opus 5) 수십 초 걸릴 수 있습니다.
                  </p>
                )}
                {testError && (
                  <p className="text-sm" style={{ color: "var(--danger)" }}>
                    {testError}
                  </p>
                )}
                {testOutput && (
                  <div
                    className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-[13px] leading-relaxed"
                    style={{ background: "var(--surface-sunken)" }}
                  >
                    {testOutput}
                  </div>
                )}
              </section>

              <div className="space-y-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                <p>
                  텍스트 파일 (md · txt · json · yaml · csv · 코드 파일, 최대{" "}
                  {formatBytes(MAX_ATTACHMENT_BYTES)}) 과 PDF (최대{" "}
                  {formatBytes(MAX_PDF_BYTES)}) 를 첨부할 수 있습니다.
                </p>
                <p>
                  PDF 는 <strong className="font-semibold">텍스트만 뽑아서</strong>{" "}
                  저장합니다 — 스캔한 이미지 PDF 는 글자가 없어 첨부되지 않고(OCR
                  필요), 표·다단 편집은 읽는 순서가 흐트러질 수 있습니다. docx·xlsx
                  는 아직 지원하지 않습니다.
                </p>
              </div>

            </>
          )}
    </div>
  );

  const footerNode = (
    <div className="ui-divider space-y-3 border-t px-5 py-4">
          <p className="text-xs text-[var(--text-muted)]">
            {chars > 0 ? `${chars.toLocaleString("ko-KR")}자` : "비어 있음"}
            {chars > 0 && (
              <span style={{ color: overBudget ? "var(--danger)" : undefined }}>
                {" · "}
                {formatBytes(bytes)} / {formatBytes(PROMPT_PAYLOAD_LIMIT_BYTES)}
              </span>
            )}
            {dirty && (
              <span className="font-semibold" style={{ color: "var(--warn)" }}>
                {" · ● 저장 안 됨"}
              </span>
            )}
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!filled}
                className="ui-btn rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                title="프롬프트 내용과 첨부 파일을 하나로 합쳐 복사"
              >
                <Icon d={ICON.copy} className="h-3.5 w-3.5" />
                복사
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={!dirty || saving}
                className="ui-btn ui-btn-ghost rounded-lg px-3 py-2 text-sm font-medium"
              >
                되돌리기
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!dirty || saving || overBudget}
                className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
              >
                {saving
                  ? "저장 중..."
                  : state && state.version > 0
                    ? `저장 → v${state.version + 1}`
                    : "저장 → v1"}
              </button>
            </div>
          </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col">
        {headerNode}
        {bodyNode}
        {footerNode}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* 항상 마운트하고 translate 로 밀어낸다(Sidebar 와 동일 패턴) — 그래야
          열고 닫을 때 부드럽게 슬라이드된다. 닫힌 동안은 inert 로 막아 화면
          밖 패널에 Tab 이 걸리지 않게 한다. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-drawer-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[600px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {headerNode}
        {bodyNode}
        {footerNode}
      </aside>
    </>
  );
}
