"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useAdminChatSocket } from "@/lib/useAdminChatSocket";
import type { ChatThreadSummary, PromptHistoryEntry } from "@/lib/types";
import { PromptSectionsPanel } from "./PromptSectionsPanel";
import { ChatThreadSidebar } from "./ChatThreadSidebar";
import { VersionPreviewModal } from "./VersionPreviewModal";
import { CollapsibleSection } from "./CollapsibleSection";
import { PodcastVoiceSettingsPanel } from "./PodcastVoiceSettingsPanel";
import { PodcastAudioGenerator } from "./PodcastAudioGenerator";
import { VideoRenderGenerator } from "./VideoRenderGenerator";
import { VideoRenderSettingsPanel } from "./VideoRenderSettingsPanel";
import { CustomSelect } from "@/components/CustomSelect";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL } from "./textModels";

/* 레터·팟캐스트·영상 프롬프트 실험 — 2026-09-22 신설. 사용자 요청: "웹툰
   프롬프트쪽을 활용... 상단에 탭 4개... 탭별로 이동을 하고, 원하는
   페이지로 가서 실험을 하고, 파이프라인을 웹툰 환경처럼 개선할 수 있도록"
   (PromptLab.tsx가 이 컴포넌트와 PromptChatLab을 탭으로 스위칭한다).

   PromptChatLab.tsx(웹툰)와 좌(대화)+우(설정) 골격은 같지만, 이 세
   카테고리는 웹툰처럼 컷 이미지가 없는 순수 텍스트 산출물이라 오른쪽
   이미지 패널·GPU 제어·storyboard JSON 리빌(script_chunk) 같은 웹툰
   전용 로직을 전부 뺐다 — 서버(routes/chat_ws.py)도 이 세 카테고리는
   text_chunk/text_done(웹툰 챗랩의 "일반 대화"와 동일한 이벤트)으로만
   스트리밍한다. 실제 프로덕션 모델·프롬프트 조립은
   routes/prompts.py::_CATEGORY_BEDROCK(PromptDrawer의 "테스트 실행"이
   이미 쓰고 있는 것과 동일) — chat_ws.py가 그걸 스트리밍으로 재사용한다.

   음성 생성(팟캐스트만)은 채팅 메시지에 안 붙는다 — 1차로 메시지마다
   버튼을 달았다가, 사용자 요청으로 재설계: "왼쪽은 텍스트만, 우측은
   음성을 생성하는거죠 — 웹툰처럼 컷별로... 음성도 여러개를 리스트
   형태로". PodcastAudioGenerator.tsx(웹툰 컷 이미지 패널과 같은 골격)가
   그 우측 패널을 맡는다 — 여기(채팅)는 순수 텍스트 스트리밍만 담당. */

const MIN_ARTICLE_LEN = 40;
const PROMPT_NAME = "published";

type MsgRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MsgRole;
  text: string;
}

type WsPush =
  | { type: "text_chunk"; text: string }
  | { type: "text_done" }
  | { type: "error"; message: string };

export function PromptTextLab({
  open,
  onClose,
  embedded = false,
  category,
  categoryLabel,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  category: string;
  categoryLabel: string;
}) {
  const { wsOpen, send: wsSend, subscribe } = useAdminChatSocket();

  const greeting = (): ChatMessage => ({
    id: "greeting",
    role: "assistant",
    text: `기사를 붙여넣어 주세요 — 지금 저장된 ${categoryLabel} 지침을 기준으로 산출물을 만들어 보여드릴게요.`,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => [greeting()]);
  const [input, setInput] = useState("");
  const [textModel, setTextModel] = useState<string>(DEFAULT_TEXT_MODEL);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [liveText, setLiveText] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  // 팟캐스트·영상 탭 전용 — 어시스턴트 응답을 우측 생성 패널에 붙여넣을
  // 때 "어디부터 어디까지 복사해야 하는지" 헷갈리는 문제(사용자가 실제로
  // 겪음: 영상 JSON 앞부분을 빼고 복사해 "JSON을 찾지 못했습니다" 에러) —
  // 범위를 고를 필요 자체를 없앤다. 응답 전체를 넘겨도 렌더 쪽
  // extract_json_object가 ```json 블록만 알아서 골라내므로 안전하다.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadId, setThreadIdState] = useState<number | null>(null);
  const threadIdRef = useRef<number | null>(null);
  const setThreadId = (id: number | null) => {
    threadIdRef.current = id;
    setThreadIdState(id);
  };
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [promptVersion, setPromptVersion] = useState<number | null>(null);
  const [versionPreviewOpen, setVersionPreviewOpen] = useState(false);
  const [versionPreviewContent, setVersionPreviewContent] = useState<string | null>(null);
  const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const refreshThreads = () => {
    adminApi
      .listChatThreads(category, PROMPT_NAME)
      .then((r) => setThreads(r.threads))
      .catch((err) => console.error("대화 목록 불러오기 실패", err));
  };

  useEffect(() => {
    if (!open) return;
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- category별 독립 스레드 목록이라 category도 키에 포함
  }, [open, category]);

  useEffect(() => {
    if (!open) return;
    adminApi
      .getPromptHistory(category, PROMPT_NAME)
      .then((r) => setPromptHistory(r.history))
      .catch((err) => console.error("프롬프트 버전 목록 불러오기 실패", err));
  }, [open, category]);

  const openVersionPreview = () => {
    if (promptVersion === null) return;
    setVersionPreviewOpen(true);
    setVersionPreviewLoading(true);
    setVersionPreviewContent(null);
    adminApi
      .getPromptVersion(category, PROMPT_NAME, promptVersion)
      .then((v) => setVersionPreviewContent(v.content))
      .catch((err) => {
        console.error("프롬프트 버전 내용 불러오기 실패", err);
        setVersionPreviewContent("(불러오기 실패)");
      })
      .finally(() => setVersionPreviewLoading(false));
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" });
    }
  }, [messages, liveText]);

  const appendMessage = (msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: `${msg.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ]);
    if (threadIdRef.current !== null) {
      adminApi
        .appendChatMessage(threadIdRef.current, msg.role, { text: msg.text })
        .then(() => refreshThreads())
        .catch((err) => console.error("메시지 저장 실패", err));
    }
  };

  const startNewThread = () => {
    setThreadId(null);
    setMessages([greeting()]);
    setLiveText(null);
    setWaiting(false);
  };

  const openThread = (id: number) => {
    adminApi
      .getChatThread(id)
      .then((detail) => {
        setThreadId(id);
        const loaded: ChatMessage[] = detail.messages
          .filter((m) => !!m.text)
          .map((m) => ({ id: `saved-${m.id}`, role: m.role, text: m.text! }));
        setMessages(loaded.length ? loaded : [greeting()]);
        setLiveText(null);
        setWaiting(false);
      })
      .catch((err) => console.error("대화 불러오기 실패", err));
  };

  const sendWs = (kind: string, data: unknown = {}) => {
    const result = wsSend(kind, data);
    if (result.sent) return;
    if (result.tooLarge) {
      appendMessage({
        role: "assistant",
        text: `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`,
      });
      return;
    }
    appendMessage({ role: "assistant", text: "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요." });
  };

  useEffect(() => {
    return subscribe((raw) => {
      const msg = raw as WsPush;
      setWaiting(false);
      switch (msg.type) {
        case "text_chunk":
          setLiveText((prev) => (prev ?? "") + msg.text);
          break;
        case "text_done":
          setLiveText((prev) => {
            if (prev) appendMessage({ role: "assistant", text: prev });
            return null;
          });
          break;
        case "error":
          appendMessage({ role: "assistant", text: msg.message });
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appendMessage는 함수형 갱신·ref만 써서 오래된 클로저도 안전(PromptChatLab.tsx와 동일 근거)
  }, []);

  const send = () => {
    const text = input.trim();
    if (!text || !wsOpen) return;
    setInput("");
    if (threadIdRef.current === null) {
      adminApi
        .createChatThread(category, PROMPT_NAME, text.slice(0, 60))
        .then((thread) => {
          setThreadId(thread.id);
          // 버그 수정(2026-09-22, 사용자 리포트 — "이전 대화 쓰레드...
          // 사용자가 입력한 말풍선은 안보이더라고") — sendInner()가 이미
          // 화면에 띄운 이 첫 사용자 메시지는 그 시점에 threadIdRef가
          // 아직 null이라 저장이 조용히 스킵됐다(appendMessage 참고).
          // 스레드 생성이 끝난 지금 뒤늦게라도 저장해야, 나중에
          // openThread()로 이 스레드를 다시 열었을 때 그 말풍선이 보인다.
          adminApi
            .appendChatMessage(thread.id, "user", { text })
            .then(() => refreshThreads())
            .catch((err) => console.error("첫 메시지 저장 실패", err));
        })
        .catch((err) => console.error("대화 스레드 생성 실패", err));
    }
    sendInner(text);
  };

  const sendInner = (text: string) => {
    appendMessage({ role: "user", text });
    setWaiting(true);
    if (text.length >= MIN_ARTICLE_LEN) {
      sendWs("article", { article: text, category, model: textModel, version: promptVersion ?? undefined });
    } else {
      const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      sendWs("chat", { message: text, history, category, model: textModel });
    }
  };

  const handleCopy = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((prev) => (prev === m.id ? null : prev)), 1800);
    } catch (err) {
      console.error("클립보드 복사 실패", err);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      send();
    }
  };

  const headerNode = (
    <div className="ui-divider flex items-start justify-between gap-4 border-b px-5 pb-3 pt-5">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">{categoryLabel} 프롬프트 실험</h2>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">기사를 붙여넣으면 지금 저장된 지침으로 산출물을 만들어 보여드릴게요.</p>
      </div>
      <span
        className="flex flex-none items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold"
        style={wsOpen ? { background: "var(--ok-soft)", color: "var(--ok)" } : { background: "var(--warn-soft)", color: "var(--warn)" }}
        title={wsOpen ? "실시간 연결됨" : "연결 중..."}
      >
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
        {wsOpen ? "실시간 연결됨" : "연결 중..."}
      </span>
    </div>
  );

  const bodyNode = (
    <div ref={listRef} onScroll={handleListScroll} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={m.role === "user" ? "max-w-[78%]" : "w-full max-w-[92%]"}>
            {m.role === "user" ? (
              <div
                className="whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] leading-relaxed"
                style={{ background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)" }}
              >
                {m.text}
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">{m.text}</p>
                {m.id !== "greeting" && (category === "podcast" || category === "video") && (
                  <button
                    type="button"
                    onClick={() => handleCopy(m)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {copiedId === m.id ? "복사됨 — 우측 패널에 붙여넣으세요" : "이 응답 전체 복사"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {liveText !== null && (
        <div className="flex justify-start">
          <div className="w-full max-w-[92%]">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">
              {liveText}
              <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-[var(--text-faint)] align-middle" aria-hidden="true" />
            </p>
          </div>
        </div>
      )}
      {waiting && liveText === null && (
        <div className="flex justify-start">
          <span className="inline-flex gap-1 rounded-2xl px-4 py-2.5" style={{ background: "var(--surface-sunken)" }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-faint)]"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );

  const composerNode = (
    <div className="ui-divider border-t px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-[10.5px] text-[var(--text-faint)]">모델</span>
        <CustomSelect value={textModel} onChange={setTextModel} options={TEXT_MODELS.map((m) => ({ value: m.id, label: m.label }))} openUp />
      </div>
      {promptVersion !== null && (
        <p className="mb-1.5 px-1 text-[10.5px] font-medium" style={{ color: "var(--warn)" }}>
          v{promptVersion}로 시험 중 — 지금 편집 중인 지침·발행본은 그대로 유지됩니다
        </p>
      )}
      <div className="ui-input flex items-end gap-2 rounded-2xl px-3 py-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={wsOpen ? "기사를 붙여넣어 보세요" : "연결 중..."}
          rows={1}
          disabled={!wsOpen}
          className="max-h-60 min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-60"
          style={{ border: "none" }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || !wsOpen}
          className="ui-btn ui-btn-primary flex-none rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-[var(--text-faint)]">
        Enter로 보내기 · Shift+Enter로 줄바꿈 — 지침을 바꾸려면 우측 패널에서 편집 후 저장해 주세요.
      </p>
    </div>
  );

  const layout = (
    <div className="relative flex h-full min-h-0">
      <ChatThreadSidebar
        threads={threads}
        activeId={threadId}
        onSelect={openThread}
        onNew={startNewThread}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {headerNode}
        {bodyNode}
        {composerNode}
      </div>
      {/* 2026-09-22 — 팟캐스트·영상만 웹툰(텍스트|이미지 두 칸)과 같은 3단
          레이아웃을 쓴다: 왼쪽 채팅은 순수 텍스트(대본/각본)만, 가운데가
          실제 미디어 생성 전용 칸. 사용자 요청: "왼쪽은 텍스트만, 우측은
          음성을 생성하는거죠 — 웹툰처럼 컷별로... 음성도 여러개를 리스트
          형태로"(팟캐스트) → "동영상도 가능?"(2026-09-23, 같은 구조로
          영상 렌더도 추가). 레터는 이 중간 칸이 필요한 별도 산출물 단계가
          없어서(순수 텍스트 한 번으로 끝) 없다. */}
      {category === "podcast" && (
        <aside className="flex w-[360px] flex-none flex-col border-l ui-divider bg-[var(--surface-card)]">
          <PodcastAudioGenerator wsOpen={wsOpen} send={wsSend} subscribe={subscribe} />
        </aside>
      )}
      {category === "video" && (
        <aside className="flex w-[360px] flex-none flex-col border-l ui-divider bg-[var(--surface-card)]">
          <VideoRenderGenerator wsOpen={wsOpen} send={wsSend} subscribe={subscribe} />
        </aside>
      )}
      <aside className="flex w-[380px] flex-none flex-col overflow-y-auto border-l ui-divider bg-[var(--surface-card)]">
        <div className="ui-divider border-b px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">설정</p>
        </div>
        {/* 팟캐스트·영상은 웹툰(대본/이미지 두 그룹)과 같은 구조로 2번째
            그룹(음성/렌더 설정)을 더 둔다(2026-09-23, 사용자 요청: "팟캐스트
            부분처럼... 대본 프롬프트 아래에 동일하게... 동영상 부분은
            동영상 관련해서 설정 가능한 걸 넣어주세요"). 레터는 대본
            프롬프트 하나만 있으면 충분하다. */}
        {category === "podcast" || category === "video" ? (
          <>
            <CollapsibleSection title="대본 프롬프트 — 설명·지침·파일" defaultOpen>
              <PromptSectionsPanel
                category={category}
                name={PROMPT_NAME}
                promptHistory={promptHistory}
                promptVersion={promptVersion}
                onPromptVersionChange={setPromptVersion}
                onPreviewVersion={openVersionPreview}
              />
            </CollapsibleSection>
            <div className="ui-divider border-t" />
            {category === "podcast" ? (
              <CollapsibleSection title="음성 설정 — 성우·속도·음량" defaultOpen>
                <PodcastVoiceSettingsPanel />
              </CollapsibleSection>
            ) : (
              <CollapsibleSection title="영상 설정 — 성우·엔진·포맷" defaultOpen>
                <VideoRenderSettingsPanel />
              </CollapsibleSection>
            )}
          </>
        ) : (
          <PromptSectionsPanel
            category={category}
            name={PROMPT_NAME}
            promptHistory={promptHistory}
            promptVersion={promptVersion}
            onPromptVersionChange={setPromptVersion}
            onPreviewVersion={openVersionPreview}
          />
        )}
      </aside>
      {versionPreviewOpen && (
        <VersionPreviewModal
          version={promptVersion}
          content={versionPreviewContent}
          loading={versionPreviewLoading}
          onClose={() => setVersionPreviewOpen(false)}
        />
      )}
    </div>
  );

  if (embedded) return layout;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      inert={!open}
      className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-[var(--surface-card)] transition-opacity duration-200 ease-out ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {layout}
    </aside>
  );
}
