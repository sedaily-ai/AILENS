"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useAdminChatSocket } from "@/lib/useAdminChatSocket";
import type { PromptHistoryEntry, ChatThreadMessage } from "@/lib/types";
import { LatestPublishedContentLink } from "./LatestPublishedContentLink";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";
import { StepTabs } from "./StepTabs";
import { ChatThreadSidebar } from "./ChatThreadSidebar";
import { CollapsibleSection } from "./CollapsibleSection";
import { ActivationHistoryButton } from "./ActivationHistory";
import { PodcastVoiceSettingsPanel, type PodcastVoiceSettingsPanelHandle, type ParsedDoc as PodcastParsedDoc } from "./PodcastVoiceSettingsPanel";
import { VoicePreviewGenerator, VoiceProductionPanel } from "./VoicePreviewGenerator";
import { VideoCardGenerator, VideoProductionPanel } from "./VideoCardGenerator";
import { VideoRenderSettingsPanel, type VideoRenderSettingsPanelHandle, type ParsedDoc as VideoParsedDoc } from "./VideoRenderSettingsPanel";
import { CustomSelect } from "@/components/CustomSelect";
import { TEXT_MODELS } from "./textModels";
import { useChatLabThread } from "./useChatLabThread";
import { useCurrentModelLabel } from "./useCurrentModel";

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
   형태로". VoicePreviewGenerator.tsx(웹툰 컷 이미지 패널과 같은 골격)가
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
  const currentModelLabel = useCurrentModelLabel(category, open);

  const greeting = (): ChatMessage => ({
    id: "greeting",
    role: "assistant",
    text: `기사를 붙여넣어 주세요 — 지금 저장된 ${categoryLabel} 지침을 기준으로 산출물을 만들어 보여드릴게요.`,
  });

  const {
    messages,
    threads,
    threadId,
    appendMessage,
    startNewThread: startNewThreadCore,
    openThread: openThreadCore,
    ensureThread,
    persistArtifact,
    renameThread,
    setThreadTag,
    deleteThread,
    bulkDeleteThreads,
  } = useChatLabThread<ChatMessage>({
    category,
    promptName: PROMPT_NAME,
    enabled: open,
    makeGreeting: greeting,
    mapSavedMessage: (m) => ({ id: `saved-${m.id}`, role: m.role, text: m.text ?? "" }),
  });
  // 2026-09-24, 사용자 지적 — "대화 하고 나갔다 오면... 음성, 영상...
  // 사라지는데... 대화들은 살아있는데, 나머지들도 다 남으면 좋지":
  // 팟캐스트 "성우 미리듣기" 카드·영상 "성우+영상 생성" 카드를 이
  // 대화(threadId)에 묶어서 서버에 저장하고, 대화를 열 때 복원한다
  // (PromptChatLab.tsx가 웹툰 컷 이미지에 대해 이미 하고 있는 것과
  // 같은 패턴). 카드 자체가 채팅 말풍선은 아니라서 messages 배열은 안
  // 건드리고, persistArtifact(위 훅에서 받음)로 서버에만 조용히
  // 저장한다 — 아래 openThread/startNewThread 래퍼가 저장된 데이터를
  // 모아 이 두 state에 담아 각 생성기 컴포넌트에 내려준다.
  const [restoredAudioCards, setRestoredAudioCards] = useState<NonNullable<ChatThreadMessage["audioPreview"]>[]>([]);
  const [restoredVideoCards, setRestoredVideoCards] = useState<NonNullable<ChatThreadMessage["videoPreview"]>[]>([]);
  const [input, setInput] = useState("");
  // 2026-09-23 버그 수정(사용자 리포트: 소제목 기호가 "◾"가 아니라 "■"로
  // 나옴) — 기본값을 ""(=모델 미지정)으로 둔다. chat_ws.py::
  // _run_article_text_flow가 "model_id가 없으면 그 카테고리의 실제
  // 프로덕션 모델(_CATEGORY_BEDROCK[category]["model"])을 쓴다"는 폴백을
  // 갖고 있는데, DEFAULT_TEXT_MODEL("sonnet-46")을 항상 같이 보내는
  // 바람에 그 폴백이 한 번도 안 타고 매번 웹툰용 Sonnet 4.6로 테스트되고
  // 있었다(레터는 실제로 Opus 5) — 웹툰만 우연히 드롭다운 기본값과
  // 프로덕션 모델이 같아서 안 드러났다. 사용자가 드롭다운에서 직접
  // 고를 때만 그 값을 보낸다.
  const [textModel, setTextModel] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 2026-09-24, 사용자 요청 — "웹툰쪽처럼.. 사이드를 끌고 당길 수 있도록":
  // 우측 패널 폭 드래그 조절. 2026-09-25 — 팟캐스트/영상 가운데 칸(음성
  // 생성/미리듣기)과 우측 "설정" 칼럼을 하나로 합쳤다(사용자 지적:
  // "중간 섹션이랑.. 우측 사이드 섹션.. 통합하면 어떨까.. 공통된
  // 기능들이잖아요?" — PromptChatLab.tsx와 동일 결정·동일 구조, 그
  // 파일 주석 참고) — 폭 state도 하나로 합쳤다(이전 mediaPanelWidth+
  // settingsPanelWidth 두 개 드래그 핸들 → 하나).
  const [settingsPanelWidth, setSettingsPanelWidth] = useState(640);
  const handleSettingsPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = settingsPanelWidth;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.min(900, Math.max(320, startWidth + delta));
      setSettingsPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // 2026-09-26, 사용자 요청 — "프로덕션 부분은.. 고정하고 싶네요...
  // 위아래로 잡아당기고 끌 수 있도록": 프로덕션 카드가 스크롤에 고정된
  // 채로 펼쳐지면 테스트 카드들을 가려서, 기본은 접힌 채로 시작하되
  // (그 아래 CollapsibleSection defaultOpen 제거) 펼쳤을 때도 사용자가
  // 직접 높이를 줄일 수 있게 세로 드래그 핸들을 하나 더 둔다 — 위
  // settingsPanelWidth 드래그와 동일 패턴(가로→세로만 다름).
  const [productionHeight, setProductionHeight] = useState(360);
  // 2026-09-27 — PromptChatLab.tsx와 동일 요청 대응("테스트 추가" 띠
  // sticky 고정 + <details> toggle 강제 재측정 이중 방어), 그 파일 주석
  // 참고.
  const productionCardRef = useRef<HTMLDivElement>(null);
  const [productionCardHeight, setProductionCardHeight] = useState(0);
  useEffect(() => {
    const el = productionCardRef.current;
    if (!el) return;
    const measure = () => setProductionCardHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const detailsEls = Array.from(el.querySelectorAll("details"));
    detailsEls.forEach((d) => d.addEventListener("toggle", measure));
    return () => {
      observer.disconnect();
      detailsEls.forEach((d) => d.removeEventListener("toggle", measure));
    };
  }, []);
  const handleProductionResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = productionHeight;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const next = Math.min(720, Math.max(120, startHeight + delta));
      setProductionHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // 2026-09-26(후속×3), 사용자 요청(PromptChatLab.tsx와 동일) — "프로덕션
  // 부분 카드도.. 테스트 카드랑 동일한 구조가 되도록": PromptSectionsPanel
  // (별도 prompt_lab_docs 저장소, VersionSwitcher 드롭다운)을 걷어내고
  // 테스트 카드와 똑같은 PromptVersionReference를 그대로 쓴다 — 레터/
  // 팟캐스트/영상 전부 동일.
  const scriptPromptRef = useRef<PromptVersionReferenceHandle>(null);
  const podcastVoiceRef = useRef<PodcastVoiceSettingsPanelHandle>(null);
  const videoRenderRef = useRef<VideoRenderSettingsPanelHandle>(null);
  const [scriptServerVersion, setScriptServerVersion] = useState<number | null>(null);
  const [applyingScriptVersion, setApplyingScriptVersion] = useState(false);
  const hasCompanionPanel = category === "podcast" || category === "video";
  const handleApplyScriptVersion = async () => {
    if (applyingScriptVersion) return;
    setApplyingScriptVersion(true);
    try {
      await scriptPromptRef.current?.activateIfNeeded();
    } finally {
      setApplyingScriptVersion(false);
    }
  };
  // 2026-09-26(후속×4), 사용자 지적(PromptChatLab.tsx와 동일) — "처음
  // 들어갈때 프로덕션 카드 보면, 프로덕션에 적용 카드가 활성화되어있는데,
  // 고치지 않았으면, 활성화가 되지 않아야하는거 아닌가요?": 사이드바에
  // 불러와 둔 버전이 이미 프로덕션과 같으면(=눌러도 no-op) 비활성화한다.
  const [scriptActiveInfo, setScriptActiveInfo] = useState<{ version: number; label: string | null } | null>(null);
  const scriptVersionUnchanged =
    scriptActiveInfo !== null && scriptServerVersion !== null && scriptActiveInfo.version === scriptServerVersion;
  // 2026-09-26(후속), 사용자 요청 — "테스트 카드도 마찬가지": 테스트
  // 카드들이 지금 실제 발행된 음성/영상 설정이 뭔지 알아야 한다 — 각
  // 패널이 방금 fetch한 defaults를 여기로 올려보내고, 해당 생성기에
  // 그대로 내려준다(카테고리별로 하나만 실제로 쓰인다).
  const [productionPodcastDefaults, setProductionPodcastDefaults] = useState<PodcastParsedDoc | null>(null);
  const [productionVideoDefaults, setProductionVideoDefaults] = useState<VideoParsedDoc | null>(null);
  // 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
  // 이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
  // 테스트 카드에서 적용할 수 있게": "테스트 N" 카드의 통합 "프로덕션에
  // 적용" 버튼(VoicePreviewGenerator.tsx/VideoCardGenerator.tsx)이 부른다
  // — 이제 값만 채우는 게 아니라 그 자리에서 바로 발행까지 한다
  // (PodcastVoiceSettingsPanel.tsx/VideoRenderSettingsPanel.tsx::applyAndPublish).
  const handleApplyPodcastTest = (data: PodcastParsedDoc) => podcastVoiceRef.current?.applyAndPublish(data) ?? Promise.resolve();
  const handleApplyVideoTest = (data: VideoParsedDoc) => videoRenderRef.current?.applyAndPublish(data) ?? Promise.resolve();
  const [liveText, setLiveText] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  // 팟캐스트·영상 탭 전용 — 어시스턴트 응답을 우측 생성 패널에 붙여넣을
  // 때 "어디부터 어디까지 복사해야 하는지" 헷갈리는 문제(사용자가 실제로
  // 겪음: 영상 JSON 앞부분을 빼고 복사해 "JSON을 찾지 못했습니다" 에러) —
  // 범위를 고를 필요 자체를 없앤다. 응답 전체를 넘겨도 렌더 쪽
  // extract_json_object가 ```json 블록만 알아서 골라내므로 안전하다.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [promptVersion, setPromptVersion] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const refreshPromptHistory = () => {
    adminApi
      .getPromptHistory(category, PROMPT_NAME)
      .then((r) => setPromptHistory(r.history))
      .catch((err) => console.error("프롬프트 버전 목록 불러오기 실패", err));
  };

  // 2026-09-26(후속×3) — 프로덕션 카드가 더 이상 PromptSectionsPanel을
  // 안 쓰므로(PromptChatLab.tsx와 동일 이유, 그 파일 주석 참고),
  // scriptServerVersion을 여기서 직접 가볍게 구한다.
  const refreshScriptServerVersion = () => {
    adminApi
      .listPrompts()
      .then((r) => {
        const listed = r.prompts.find((p) => p.id === `${category}/${PROMPT_NAME}`);
        setScriptServerVersion(listed ? listed.active_version : null);
      })
      .catch((err) => console.error("프로덕션 버전 조회 실패", err));
  };

  useEffect(() => {
    if (!open) return;
    refreshPromptHistory();
    refreshScriptServerVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshPromptHistory/refreshScriptServerVersion은 category에서만 파생되는 안정적 함수, open/category만 감시
  }, [open, category]);

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

  const startNewThread = () => {
    startNewThreadCore();
    setRestoredAudioCards([]);
    setRestoredVideoCards([]);
    setLiveText(null);
    setWaiting(false);
    // 2026-09-26, 사용자 요청 — "항상 처음 들어가면 프로덕션이 기본값이
    // 되도록": 테스트 버전 선택은 이 탭 전체가 공유하는 값이라, 이전
    // 대화에서 v5를 시험하던 채로 새 대화를 시작해도 그대로 남아있었다.
    // 대화를 새로 시작/전환할 때마다 "최신(프로덕션)"으로 되돌린다.
    setPromptVersion(null);
  };

  const openThread = (id: number) => {
    openThreadCore(id).then((detail) => {
      setRestoredAudioCards(detail ? detail.messages.flatMap((m) => (m.audioPreview ? [m.audioPreview] : [])) : []);
      setRestoredVideoCards(detail ? detail.messages.flatMap((m) => (m.videoPreview ? [m.videoPreview] : [])) : []);
      setLiveText(null);
      setWaiting(false);
      setPromptVersion(null);
    });
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

  // 2026-09-27, 사용자 지적 — "답변 출력중에는 또 다른 채팅 못보내도록
  // 하시고... 한번 입력했는데 2번 출력되는 것도 있구요": 응답이 오는
  // 동안(waiting=요청 보냈고 아직 첫 청크 전, liveText!==null=스트리밍
  // 중) send()를 막는 가드가 아예 없어서, 응답을 기다리며 Enter를 두 번
  // 누르면(특히 짧은 인사말처럼 응답이 빨리 끝나는 경우) 같은 텍스트가
  // 두 번 전송돼 똑같은 답이 중복으로 쌓였다 — 실제로 겪은 버그.
  const isGenerating = waiting || liveText !== null;

  const send = () => {
    const text = input.trim();
    if (!text || !wsOpen || isGenerating) return;
    setInput("");
    ensureThread(text);
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
      <div className="flex flex-none items-center gap-1.5">
        {/* 2026-09-24, 사용자 요청 — 드롭다운의 "프로덕션 기본값(...)"이
            헷갈린다는 지적으로 배지로 옮김: 지금 실제 발행에 쓰이는 모델을
            보여준다. 값은 백엔드(_CATEGORY_BEDROCK["model_label"])에서
            매번 받아오므로, 모델이 바뀌면 프론트 재배포 없이 다음
            새로고침부터 바로 반영된다. */}
        {currentModelLabel && (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            title="지금 실제 발행에 쓰이는 모델"
          >
            {currentModelLabel}
          </span>
        )}
        <span
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={wsOpen ? { background: "var(--ok-soft)", color: "var(--ok)" } : { background: "var(--warn-soft)", color: "var(--warn)" }}
          title={wsOpen ? "실시간 연결됨" : "연결 중..."}
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
          {wsOpen ? "실시간 연결됨" : "연결 중..."}
        </span>
      </div>
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
                {/* 2026-09-27, 사용자 요청 — "복사버튼 있으면 좋을것같고요..
                    nova 서비스처럼": 팟캐스트/영상 전용("우측 패널에
                    붙여넣으세요")이던 걸 전 카테고리(레터 포함)로 넓혔다 —
                    nova의 Message.jsx와 같은 자리(답변 아래, 아이콘+라벨). */}
                {m.id !== "greeting" && m.text && (
                  <button
                    type="button"
                    onClick={() => handleCopy(m)}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
                  >
                    {copiedId === m.id ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {copiedId === m.id
                      ? category === "podcast" || category === "video"
                        ? "복사됨 — 우측 패널에 붙여넣으세요"
                        : "복사됨"
                      : "복사"}
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
        <CustomSelect
          value={textModel}
          onChange={setTextModel}
          options={TEXT_MODELS.map((m) => ({ value: m.id, label: m.label }))}
          placeholder={currentModelLabel ? `${currentModelLabel} (기본값)` : "기본값 사용"}
          openUp
        />
      </div>
      {/* 2026-09-26, 사용자 요청 — "채팅 부분에.. 처음 들어가면, 어떤
          버전의 생성 프롬프트가 사용되는지 활성화되었는지 항상 뜨도록":
          예전엔 promptVersion !== null(테스트 버전을 골랐을 때)에만
          보였다 — 기본값(프로덕션)일 땐 아무 표시도 없어서 "지금 뭘로
          시험 중인지"를 한눈에 확인할 방법이 없었다. 항상 보이게 바꾸고,
          기본값일 땐 프로덕션임을 명시한다. */}
      <p
        className="mb-1.5 px-1 text-[10.5px] font-medium"
        style={{ color: promptVersion !== null ? "var(--warn)" : "var(--text-faint)" }}
      >
        {promptVersion !== null
          ? `v${promptVersion}로 시험 중 — 다음 채팅 생성부터 이 버전이 쓰입니다(프로덕션·편집 중인 지침엔 영향 없음)`
          : scriptServerVersion !== null
            ? `v${scriptServerVersion} (프로덕션) 사용 중`
            : "프로덕션 (아직 발행 전) 사용 중"}
      </p>
      <div className="ui-input flex items-end gap-2 rounded-2xl px-3 py-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={!wsOpen ? "연결 중..." : isGenerating ? "응답을 기다리는 중..." : "기사를 붙여넣어 보세요"}
          rows={1}
          disabled={!wsOpen || isGenerating}
          className="max-h-60 min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-60"
          style={{ border: "none" }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || !wsOpen || isGenerating}
          title={isGenerating ? "응답이 끝난 뒤에 다시 보낼 수 있어요" : undefined}
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
        onRename={renameThread}
        onTag={setThreadTag}
        onDelete={deleteThread}
        onBulkDelete={bulkDeleteThreads}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {headerNode}
        {bodyNode}
        {composerNode}
      </div>
      {/* 2026-09-25 — "중간 섹션이랑.. 우측 사이드 섹션.. 통합하면
          어떨까.. 공통된 기능들이잖아요? .. 처음 오는 사람이 이해하기
          편해야하니"(사용자 지적) — 팟캐스트·영상의 중간 칸(음성 생성/
          미리듣기)과 우측 "설정" 칼럼을 하나로 합쳤다(PromptChatLab.tsx와
          동일 구조: "프로덕션" 토글이 실제 발행되는 값, 그 아래가
          테스트용 실험 카드). 레터는 원래도 이 중간 칸이 필요한 별도
          산출물 단계가 없었다(순수 텍스트 한 번으로 끝) — "프로덕션"
          토글 하나만 있다. */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleSettingsPanelResizeStart}
        className="w-1.5 flex-none cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
        title="드래그해서 폭 조절"
      />
      <aside
        className="flex flex-none flex-col border-l ui-divider bg-[var(--surface-card)]"
        style={{ width: settingsPanelWidth }}
      >
        {/* 2026-09-27 — PromptChatLab.tsx와 동일 요청 대응(여백/카드 그림자
            제거), 그 파일 주석 참고. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 2026-09-26 — "프로덕션"/"테스트" 상자 자체를 없애고 카드
              리스트 하나로 합쳤는데(사용자 지적: "프로덕션 토글, 테스트
              토글로 분류할 필요가 있을까요? ... 카드들만 쭉 나오는거겠지?"),
              프로덕션의 하위 토글 3개가 카드로 안 감싸인 채 바깥에
              노출돼 있던 게 잘못이었다(사용자 재지적: "3개 토글이 지금
              외부에 보이는데.. 이걸 감싸야합니다... 카드1, 카드2, 카드3...
              이렇게 뻗어나가는 구조여야"). 이제 프로덕션도 "테스트 N"과
              똑같이 그 자체가 하나의 카드(테두리+배경, 접이식 토글)이고,
              그 안에 하위 토글들이 들어간다 — 유일한 차이는 accent
              테두리+"프로덕션" 배지뿐이다. 팟캐스트·영상은 2번째 설정
              그룹(음성/렌더)을 더 둔다(2026-09-23 결정). 레터는 대본
              프롬프트 하나뿐이라 "테스트" 카드 자체가 없다 — 프로덕션
              카드 혼자 남는다. */}
          <div>
            {/* 2026-09-26 — 사용자 요청: "프로덕션 부분은.. 고정하고
                싶네요. 스크롤 내려도 볼 수 있도록.. 그래야 비교가
                가능할 것 같아서" — 스크롤 컨테이너(이 div의 부모, min-h-0
                overflow-y-auto) 기준으로 맨 위에 붙인다.
                2026-09-26(후속) — 펼친 채로 고정되면 테스트 카드 시야를
                가린다는 지적("프로덕션 카드가 너무 길어서.. 테스트
                카드의 시야를 가리는 현상")을 받고 두 가지를 같이 넣었다:
                기본은 접힌 채 시작(아래 CollapsibleSection defaultOpen
                제거)하고, 펼쳤을 때도 세로 드래그 핸들로 높이를 직접
                줄일 수 있다(사용자 제안 — "위아래로 잡아당기고 끌 수
                있도록"). maxHeight를 넘으면 카드 내부만 스크롤된다. */}
            <div
              ref={productionCardRef}
              className="sticky top-0 z-10 flex flex-col overflow-hidden border-b bg-[var(--surface-card)]"
              style={{ borderColor: "var(--border-hairline)", maxHeight: productionHeight }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
              <CollapsibleSection
                title="프로덕션"
                titleExtra={
                  scriptServerVersion !== null ? (
                    <span className="flex items-center gap-1">
                      <span className="flex-none truncate rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}>
                        v{scriptServerVersion}
                      </span>
                      {/* 2026-09-27 — PromptChatLab.tsx와 동일 요청 대응,
                          그 파일 주석 참고. 팟캐스트는 channel="podcast"가
                          없어(LatestPublishedContentLink.tsx 주석 참고)
                          home_player/listen으로 대체한다. */}
                      <ActivationHistoryButton
                        category={category}
                        name={PROMPT_NAME}
                        channel={category === "podcast" ? "home_player" : category === "video" ? "video" : "letters"}
                        urlPath={category === "podcast" ? "listen" : category === "video" ? "video" : "letters"}
                        caveat={
                          category !== "letters"
                            ? "목록 매칭이 실제 페이지 존재와 다를 수 있어 링크가 404로 연결될 수 있습니다(실측 확인됨)."
                            : undefined
                        }
                      />
                    </span>
                  ) : undefined
                }
                badge={
                  <div className="flex items-center gap-1.5">
                    {/* 2026-09-26(후속×3), 사용자 요청(PromptChatLab.tsx와
                        동일) — "프로덕션 부분 카드도.. 테스트 카드랑
                        동일한 구조가 되도록": 이 카드도 자기 전용
                        "프로덕션에 적용" 버튼을 갖는다. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        void handleApplyScriptVersion();
                      }}
                      disabled={applyingScriptVersion || scriptVersionUnchanged}
                      title={scriptVersionUnchanged ? "지금 불러온 버전이 이미 프로덕션과 같습니다" : undefined}
                      className="ui-btn ui-btn-primary rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-50"
                    >
                      {applyingScriptVersion ? "적용 중..." : "프로덕션에 적용"}
                    </button>
                    <span className="ui-badge ui-badge-published text-[10px]">발행 중</span>
                  </div>
                }
              >
                {/* 2026-09-27 — PromptChatLab.tsx와 동일 요청 대응, 그
                    파일 주석 참고. */}
                <div className="pb-1">
                  {/* 2026-09-26(후속×3) — PromptSectionsPanel+VersionSwitcher
                      대신 테스트 카드와 똑같은 PromptVersionReference를
                      그대로 쓴다(PromptChatLab.tsx와 동일, 그 파일 주석
                      참고). */}
                  {hasCompanionPanel ? (
                    category === "podcast" ? (
                      <StepTabs
                        steps={[
                          {
                            key: "prompt",
                            label: "생성 프롬프트",
                            content: (
                              <PromptVersionReference
                                ref={scriptPromptRef}
                                category={category}
                                name={PROMPT_NAME}
                                serverVersion={scriptServerVersion}
                                promptHistory={promptHistory}
                                testVersion={promptVersion}
                                onTestVersionChange={setPromptVersion}
                                onServerVersionChange={setScriptServerVersion}
                                onPromptHistoryRefresh={refreshPromptHistory}
                                onActiveInfoChange={setScriptActiveInfo}
                                bare
                              />
                            ),
                          },
                          {
                            key: "voice",
                            label: "음성 설정",
                            content: (
                              <>
                                <PodcastVoiceSettingsPanel ref={podcastVoiceRef} onDefaultsChange={setProductionPodcastDefaults} />
                                {/* 2026-09-27 — 사용자 지적: "프로덕션 결과물이라는
                                    거를 만드는게 아니고요.. 음성 설정 단계로
                                    가면 생성 하도록.. 별도 섹션을 만들라는게
                                    아닙니다": VoiceProductionPanel(위,
                                    VoicePreviewGenerator.tsx 참고)을 이 탭
                                    안에 직접 붙인다 — key={threadId}로 대화가
                                    바뀔 때마다 새로 시작. */}
                                <div className="border-t ui-divider mt-2 pt-2">
                                  <VoiceProductionPanel key={threadId ?? "draft"} format="podcast" wsOpen={wsOpen} send={wsSend} subscribe={subscribe} />
                                </div>
                                {/* 2026-09-27, "4개 유형 모두 된건가요?" 재질문
                                    대응 — 조사 결과, 팟캐스트는 CmsChannel에
                                    "podcast" 자체가 없다(이 admin
                                    페이지들 중 podcast/page.tsx 자체가 "아직
                                    팟캐스트 생성 파이프라인이 연결되지
                                    않았습니다"라고 밝히는 상태). 이 프롬프트
                                    랩 설정과 1:1로 연결된 발행물은 없다는
                                    뜻이라, 가장 가까운 실제 발행물(홈 오디오
                                    플레이어, channel="home_player", /listen)을
                                    정직하게 라벨을 다르게 붙여 보여준다 —
                                    "팟캐스트 발행"이라고 속이지 않는다. */}
                                <LatestPublishedContentLink
                                  channel="home_player"
                                  urlPath="listen"
                                  label="홈 오디오 플레이어 최근 항목 (팟캐스트 전용 발행 파이프라인은 아직 없음)"
                                  caveat="목록 매칭이 실제 /listen 페이지 존재와 다를 수 있어 링크가 404로 연결될 수 있습니다(실측 확인됨)."
                                />
                              </>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <VideoRenderSettingsPanel ref={videoRenderRef} onDefaultsChange={setProductionVideoDefaults}>
                        {({ voiceSection, formatSection }) => (
                          <StepTabs
                            steps={[
                              {
                                key: "prompt",
                                label: "생성 프롬프트",
                                content: (
                                  <PromptVersionReference
                                    ref={scriptPromptRef}
                                    category={category}
                                    name={PROMPT_NAME}
                                    serverVersion={scriptServerVersion}
                                    promptHistory={promptHistory}
                                    testVersion={promptVersion}
                                    onTestVersionChange={setPromptVersion}
                                    onServerVersionChange={setScriptServerVersion}
                                    onPromptHistoryRefresh={refreshPromptHistory}
                                    onActiveInfoChange={setScriptActiveInfo}
                                    bare
                                  />
                                ),
                              },
                              { key: "voice", label: "음성 설정", content: voiceSection },
                              {
                                key: "video",
                                label: "영상 설정",
                                content: (
                                  <>
                                    {formatSection}
                                    {/* 2026-09-27 — 사용자 지적: "프로덕션 결과물
                                        이라는 거를 만드는게 아니고요.. 영상
                                        설정 단계로 가면 생성 하도록.. 별도
                                        섹션을 만들라는게 아닙니다":
                                        VideoProductionPanel(VideoCardGenerator.tsx
                                        참고)을 이 탭 안에 직접 붙인다 —
                                        key={threadId}로 대화가 바뀔 때마다
                                        새로 시작. */}
                                    <div className="border-t ui-divider mt-2 pt-2">
                                      <VideoProductionPanel key={threadId ?? "draft"} wsOpen={wsOpen} send={wsSend} subscribe={subscribe} />
                                    </div>
                                    <LatestPublishedContentLink
                                      channel="video"
                                      urlPath="video"
                                      label="최근 발행 영상 확인"
                                      caveat="목록 매칭이 실제 영상 유무와 다를 수 있어 링크가 404로 연결될 수 있습니다(실측 확인됨)."
                                    />
                                  </>
                                ),
                              },
                            ]}
                          />
                        )}
                      </VideoRenderSettingsPanel>
                    )
                  ) : (
                    <>
                      <PromptVersionReference
                        ref={scriptPromptRef}
                        category={category}
                        name={PROMPT_NAME}
                        serverVersion={scriptServerVersion}
                        promptHistory={promptHistory}
                        testVersion={promptVersion}
                        onTestVersionChange={setPromptVersion}
                        onServerVersionChange={setScriptServerVersion}
                        onPromptHistoryRefresh={refreshPromptHistory}
                        onActiveInfoChange={setScriptActiveInfo}
                      />
                      {category === "letters" && (
                        <LatestPublishedContentLink channel="letters" urlPath="letters" label="최근 발행 레터 확인" />
                      )}
                    </>
                  )}
                </div>
              </CollapsibleSection>
              </div>
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={handleProductionResizeStart}
                className="h-1.5 flex-none cursor-row-resize bg-transparent transition-colors hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
                title="드래그해서 높이 조절"
              />
            </div>
            {category === "podcast" && (
              <VoicePreviewGenerator
                format="podcast"
                stickyTop={productionCardHeight}
                threadId={threadId}
                restoredCards={restoredAudioCards}
                persistArtifact={persistArtifact}
                wsOpen={wsOpen}
                send={wsSend}
                subscribe={subscribe}
                onApplyToProduction={handleApplyPodcastTest}
                productionDefaults={productionPodcastDefaults}
                serverVersion={scriptServerVersion}
                promptHistory={promptHistory}
                testVersion={promptVersion}
                onTestVersionChange={setPromptVersion}
                onServerVersionChange={setScriptServerVersion}
                onPromptHistoryRefresh={refreshPromptHistory}
                category={category}
                name={PROMPT_NAME}
              />
            )}
            {/* 2026-09-24 — "성우 미리듣기"(음성만, 실제 렌더 전 확인용)와
                "영상 생성"(전체 렌더)이 위/아래로 따로 떨어진 두 개의 독립
                목록이었는데, 사용자 지적: "음성이랑 영상 생성이 따로
                떨어져있는데... 붙어있어야 하지 않을까요?? 카드처럼... 서로
                합쳐지고... 음성쪽처럼... 카드를 추가 하면서 만드는
                방향이거든요" — VideoCardGenerator.tsx(신설, 구 VoicePreviewGenerator
                format="video" + VideoRenderGenerator를 카드 단위로 병합)로 교체. */}
            {category === "video" && (
              <VideoCardGenerator
                stickyTop={productionCardHeight}
                threadId={threadId}
                restoredCards={restoredVideoCards}
                persistArtifact={persistArtifact}
                wsOpen={wsOpen}
                send={wsSend}
                subscribe={subscribe}
                onApplyToProduction={handleApplyVideoTest}
                productionDefaults={productionVideoDefaults}
                serverVersion={scriptServerVersion}
                promptHistory={promptHistory}
                testVersion={promptVersion}
                onTestVersionChange={setPromptVersion}
                onServerVersionChange={setScriptServerVersion}
                onPromptHistoryRefresh={refreshPromptHistory}
                category={category}
                name={PROMPT_NAME}
              />
            )}
          </div>
        </div>
      </aside>
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
