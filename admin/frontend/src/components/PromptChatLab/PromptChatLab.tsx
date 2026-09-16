"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useAdminChatSocket } from "@/lib/useAdminChatSocket";
import type { ChatThreadSummary, WebtoonStoryboardCut } from "@/lib/types";
// IMAGE_MODELS는 이제 이미지를 안 만드는 이 컴포넌트에선 CutImagePreview
// (구버전 저장 대화에 남아있는 imagePreview 메시지 렌더용)에서만 쓴다.
import { IMAGE_MODELS } from "@/lib/webtoonImageModels";
import { PromptSectionsPanel } from "./PromptSectionsPanel";
import { WebtoonImageSettingsPanel } from "./WebtoonImageSettingsPanel";
import { CollapsibleSection } from "./CollapsibleSection";
import { ChatThreadSidebar } from "./ChatThreadSidebar";
import { WebtoonCutGenerator } from "../WebtoonCutGenerator/WebtoonCutGenerator";
import { WebtoonImageLab } from "../WebtoonImageLab";

/* 프롬프트·이미지 실험 — 채팅형 통합(2026-09-14, 사용자 요청: "클로드처럼
   채팅을 할 수 있는 형태로 통합해주세요" → "실제 대화 가능하도록 백엔드
   작업 진행해주세요" → "웹소켓을 연결해서 실시간 스트리밍 방식으로").

   2026-09-16 — 좌우 역할을 다시 나눴다(사용자 요청: "좌측 부분에서는
   텍스트만 출력되는 걸로 목적을 잡으면 될 것 같고, 우측에서는 이미지를
   출력하는걸로"). 이 컴포넌트(왼쪽)는 기사 → 1단계(스크립트) → 2단계
   (장면 연출)까지 텍스트만 다룬다 — 컷 이미지 생성은 전부 오른쪽
   패널(../WebtoonCutGenerator)이 독자적인 WebSocket 연결로 처리한다.
   "N번 컷"/"전체 컷" 텍스트 명령, 모델 선택, GPU 켜기/끄기는 전부 그쪽
   으로 옮겨갔다 — 여기 남기면 두 군데서 같은 일을 하는 꼴이라 전부 뺐다.

   **전송 방식**: HTTP job/폴링(4초 간격) 대신 API Gateway WebSocket API
   (routes/chat_ws.py, HTTP API인 adminClient.ts의 BASE와는 별개 API)로
   붙는다 — 서버가 완료 즉시 이 연결에 결과를 밀어넣는다. 기사 반응
   문구는 Bedrock converse_stream()으로 진짜 토큰 단위 스트리밍(아래
   text_chunk 처리 참고) — 이 앱에서 유일하게 실제 스트리밍이 붙는
   지점이다(스토리보드 JSON은 완성돼야 의미가 있는 데이터라 토큰 단위로
   보여줄 게 못 된다, routes/chat_ws.py 모듈 docstring 참고).

   의도 분류는 충분히 긴 텍스트(새 기사)와 "(1)/(2)" 숫자 하나(단계 전환
   선택지)만 간단한 규칙으로 걸러내고, 그 외 나머지는 전부 일반 대화로
   Bedrock에 그대로 흘려보낸다(2026-09-15, 사용자 요청: "자연스럽게 대화가
   가능하도록... 일반 챗봇처럼... 베드락 모두 호출되도록" — 예전엔 이
   나머지 분기가 Bedrock 호출 없이 고정 안내 문구만 돌려줬다). */

type MsgRole = "user" | "assistant";

interface StoryboardCutPreview {
  cut: number;
  title: string;
  scene: string;
}

/** 1단계(스크립트) 결과 — human-in-the-loop 확인용(2026-09-15, 사용자
 *  요청: "1단계 출력하면 다음 단계 진행할지 확인받고 2단계 진행"). script/
 *  article을 그대로 들고 있다가 확인 버튼을 누르면 서버로 그대로
 *  되돌려보낸다(서버가 연결별 상태를 안 들고 있으므로 — chat_ws.py
 *  모듈 docstring 참고). confirmed는 버튼 중복 클릭 방지용. */
interface Step1Data {
  coreQuestion: string | null;
  cuts: Array<{ cut: number | null; summary: string }>;
  script: unknown;
  article: string;
  confirmed?: boolean;
}

interface ChatMessage {
  id: string;
  role: MsgRole;
  text?: string;
  step1?: Step1Data;
  storyboard?: { coreQuestion: string; cuts: StoryboardCutPreview[] };
  imagePreview?: { cut: number; imageUrl: string; model?: string };
  /** true면 처음 나타날 때 타이핑되듯 스트리밍 연출 — 상태 메시지("GPU를
   *  켜는 중입니다" 등)처럼 완성본이 한 번에 오는 텍스트에만 쓴다. 진짜
   *  스트리밍(기사 반응 문구)은 아래 liveText가 따로 담당하므로 여기선
   *  animate:false로 붙인다(이미 실시간으로 보여줬으니 다시 타이핑할
   *  필요 없음). 이미 렌더된 적 있는 메시지(초기 인사말 등)도 false. */
  animate?: boolean;
}

const GREETING: ChatMessage = {
  id: "greeting",
  role: "assistant",
  text: "기사를 붙여넣어 주세요 — 먼저 1단계(스크립트)만 만들어 보여드리고, 완성되면 (1)/(2) 선택지로 2단계(장면 연출) 진행 여부를 물어볼게요. 컷 이미지는 오른쪽 패널에서 만드시면 됩니다.",
  animate: false,
};

// 지금은 웹툰 하나만 이 챗랩에서 쓴다 — 대화 스레드도 프롬프트별로 나눠
// 담기지만(chat_threads_repo.py) category/name 선택 UI는 아직 없다.
const PROMPT_CATEGORY = "webtoon";
const PROMPT_NAME = "published";

const MIN_ARTICLE_LEN = 40; // 이보다 짧으면 "새 기사"가 아니라 다른 요청(단계 선택지 등)으로 본다

/** 서버(routes/chat_ws.py)가 이 연결로 밀어넣는 메시지 모양 — 백엔드
 *  push() 호출과 1:1로 대응한다. */
type WsPush =
  | { type: "text_chunk"; text: string }
  | { type: "text_done" }
  // 1·2단계 JSON 생성 중 원문 미리보기 청크(2026-09-16) — step1_chunk_done/
  // step2_chunk_done 다음에 완성된 step1/storyboard 메시지가 온다.
  | { type: "step1_chunk"; text: string }
  | { type: "step1_chunk_done" }
  | { type: "step2_chunk"; text: string }
  | { type: "step2_chunk_done" }
  // 단계 완료 후 다음 선택지 안내 텍스트(2026-09-16) — 그냥 평범한
  // 어시스턴트 텍스트 메시지로 렌더한다. 실제 번호 해석은 sendInner가
  // 한다(서버는 안내 문구만 보낸다).
  | { type: "options_prompt"; message: string }
  | {
      type: "step1";
      core_question: string | null;
      cuts: Array<{ cut: number | null; summary: string }>;
      script: unknown;
      article: string;
    }
  | { type: "storyboard"; core_question: string | null; cuts: WebtoonStoryboardCut[] }
  | { type: "error"; message: string }
  | { type: "pong" };

export function PromptChatLab({
  open,
  onClose,
  embedded = false,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}) {
  const { wsOpen, send: wsSend, subscribe } = useAdminChatSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [storyboard, setStoryboard] = useState<{ coreQuestion: string | null; cuts: WebtoonStoryboardCut[] } | null>(null);
  // 2026-09-16 — 우측은 항상 이미지 생성 패널(WebtoonCutGenerator)을 보여준다
  // (사용자 요청: "항상 2개 단이 구분되어서 보여지면 좋겠어요" — 텍스트|이미지
  // 두 칸이 탭으로 서로를 가리는 대신 늘 같이 보여야 한다는 뜻).
  //
  // 지침/설명/파일(PromptSectionsPanel)+고정값 설정(WebtoonImageSettingsPanel)은
  // 처음엔 아이콘을 눌러야 뜨는 오버레이 두 개였는데(같은 날 두 번 다시
  // 설계), 사용자가 "왔다갔다 하는 것 자체가 비효율... 프리미어 프로
  // 설정 바처럼 한 화면에서 원클릭으로"라고 다시 요청해 상시 노출되는
  // 3번째 칼럼(아래 layout)으로 최종 정착했다 — 이제 promptPanelOpen 같은
  // 토글 state는 필요 없다.
  //
  // imageLabOpen만 남겨둔다 — 장면 하나로 테스트 생성·히스토리 갤러리처럼
  // 자주 안 쓰는 기능은 여전히 WebtoonImageLab 전체 화면(standalone
  // 모드, 자기 backdrop+aside 880px)을 그대로 재사용해서 필요할 때만 연다.
  const [imageLabOpen, setImageLabOpen] = useState(false);
  // 2026-09-16, 사용자 요청 — "좌측 사이드바는 접혔다 펼 수 있도록":
  // 대화 목록이 당장 필요 없을 때 챗 영역을 넓게 쓸 수 있게 한다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 2026-09-16, 사용자 요청 — "이미지 생성 부분이 늘렸다 펴졌다.. 직접
  // 손으로 끌고 갈 수 있도록": 우측 이미지 패널 폭을 드래그로 조절한다.
  const [imagePanelWidth, setImagePanelWidth] = useState(340);
  const handleImagePanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = imagePanelWidth;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX; // 왼쪽으로 끌수록(마우스 X 감소) 패널이 넓어진다
      const next = Math.min(720, Math.max(280, startWidth + delta));
      setImagePanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // 기사 반응 문구가 토큰 단위로 도착하는 동안 임시로 담아두는 곳(완료
  // 전까지는 messages 배열에 안 넣는다 — text_done에서 한 번에 확정).
  const [liveText, setLiveText] = useState<string | null>(null);
  // 1·2단계 JSON 생성 중 원문 미리보기(2026-09-16, 사용자 요청 — "출력하는
  // 것도 단계별로 쪼개서 출력을 해줘야 해요": 점 세 개만 뜨고 아무것도
  // 안 보이던 구간을 없앤다). 반쪽짜리 JSON이라 파싱해서 카드로는 못
  // 보여주고, 생성되는 원문을 그대로 스크롤되는 미리보기로만 보여준다 —
  // step1/storyboard 메시지가 도착하면(=완성) liveStepText를 지우고 그
  // 카드로 교체된다.
  const [liveStepText, setLiveStepText] = useState<string | null>(null);
  const [liveStepLabel, setLiveStepLabel] = useState<string>("");
  // 요청 보내고 첫 응답이 오기 전까지 "생각 중" 점 세 개(2026-09-15,
  // 사용자 요청 — "기다리는 동안 심심하니까"). 서버에서 뭐든 한 번 오면
  // (반응 스트리밍 첫 토큰이든, 스토리보드 완성이든) 바로 끈다.
  const [waiting, setWaiting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 좌측 사이드바 — 대화 스레드 목록/현재 스레드(2026-09-15, 사용자 요청:
  // "대화들.. 저장 가능한 세션들.. 좌측 사이드바.. 각 대화마다 어떤
  // 대화를 했고 출력물이 나왔는지 체크"). threadIdRef는 ws.onmessage
  // 클로저에서 최신값을 안전히 읽기 위함(2026-09-16, 예전엔
  // draftPromptRef도 같은 이유였으나 그건 제거됨 — 아래 sendWs 참고) —
  // appendMessage가 호출될 때마다 이 값이 있으면 그 스레드에 메시지를
  // 이어붙인다.
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadId, setThreadIdState] = useState<number | null>(null);
  const threadIdRef = useRef<number | null>(null);
  const setThreadId = (id: number | null) => {
    threadIdRef.current = id;
    setThreadIdState(id);
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveText, liveStepText]);

  const refreshThreads = () => {
    adminApi
      .listChatThreads(PROMPT_CATEGORY, PROMPT_NAME)
      .then((r) => setThreads(r.threads))
      .catch((err) => console.error("대화 목록 불러오기 실패", err));
  };

  useEffect(() => {
    if (!open) return;
    refreshThreads();
  }, [open]);

  // 입력창 자동 높이 조절(2026-09-14, 사용자 요청 — "글이 많이 들어가면
  // 크기가 늘어나도록") — height를 auto로 되돌린 다음 scrollHeight로
  // 다시 재는 표준 패턴. rows={1} 고정이라 CSS만으로는 안 늘어난다.
  // max-h-60(아래 textarea className)을 넘으면 CSS overflow-y로 자동 스크롤.
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

  /** persistExtra는 화면 렌더에는 안 쓰지만 저장은 해야 하는 값 —
   *  storyboard 메시지의 fullCuts(컷 이미지 재요청에 필요한 원본 전체
   *  cuts, 화면에 보이는 storyboard 필드는 요약본이라 따로 챙긴다)가
   *  유일한 예. */
  const appendMessage = (msg: Omit<ChatMessage, "id">, persistExtra?: Record<string, unknown>) => {
    setMessages((prev) => [
      ...prev,
      {
        animate: msg.role === "assistant", // 사용자 메시지는 이미 화면에 입력해뒀던 텍스트라 타이핑 연출 불필요
        ...msg,
        id: `${msg.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
    ]);
    if (threadIdRef.current !== null) {
      const payload: Record<string, unknown> = { ...persistExtra };
      if (msg.text !== undefined) payload.text = msg.text;
      if (msg.step1 !== undefined) payload.step1 = msg.step1;
      if (msg.storyboard !== undefined) payload.storyboard = msg.storyboard;
      if (msg.imagePreview !== undefined) payload.imagePreview = msg.imagePreview;
      adminApi
        .appendChatMessage(threadIdRef.current, msg.role, payload)
        .then(() => refreshThreads()) // updated_at 갱신 -> 최신 대화가 목록 맨 위로
        .catch((err) => console.error("메시지 저장 실패", err));
    }
  };

  /** 사이드바 "새 대화" — 지금 화면을 초기 상태로 되돌린다. 서버에 빈
   *  스레드를 미리 만들진 않는다 — 첫 메시지를 보낼 때(send()) 만든다,
   *  그래야 아무것도 안 치고 나가도 빈 스레드가 목록에 안 쌓인다. */
  const startNewThread = () => {
    setThreadId(null);
    setMessages([GREETING]);
    setStoryboard(null);
    setLiveText(null);
    setWaiting(false);
  };

  /** 사이드바에서 기존 스레드 클릭 — 저장된 메시지를 그대로 복원한다.
   *  storyboard 메시지 중 가장 최근 것에 fullCuts가 있으면 그걸로
   *  storyboard 상태까지 복원해서(컷 이미지 재요청도 이어갈 수 있게),
   *  없으면(옛 스레드거나 storyboard가 아예 없던 대화) storyboard는
   *  비운다. */
  const openThread = (id: number) => {
    adminApi
      .getChatThread(id)
      .then((detail) => {
        setThreadId(id);
        const loaded: ChatMessage[] = detail.messages.map((m) => ({
          id: `saved-${m.id}`,
          role: m.role,
          text: m.text,
          step1: m.step1 as Step1Data | undefined,
          storyboard: m.storyboard as { coreQuestion: string; cuts: StoryboardCutPreview[] } | undefined,
          imagePreview: m.imagePreview,
          animate: false,
        }));
        setMessages(loaded.length ? loaded : [GREETING]);
        const withFullCuts = [...detail.messages].reverse().find((m) => m.fullCuts && m.fullCuts.length > 0);
        setStoryboard(
          withFullCuts
            ? { coreQuestion: withFullCuts.storyboard?.coreQuestion ?? null, cuts: withFullCuts.fullCuts! }
            : null
        );
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
    // 연결이 끊긴 채로 보내려던 경우 — 소켓은 useAdminChatSocket이 이미
    // 닫아 재연결을 앞당겼다(2026-09-15, 사용자가 실제로 겪은 버그 —
    // readyState 미확인 시 메시지가 조용히 증발했었다. 이제 hook이 확인함).
    appendMessage({ role: "assistant", text: "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요." });
  };

  // 수신 메시지 처리 — 연결·하트비트·재연결 자체는 useAdminChatSocket이
  // 전담한다(2026-09-16 리팩토링 감사, 그 훅 docstring 참고 — WebtoonCutGenerator
  // 와 소켓을 공유). 이 리스너는 messages/storyboard를 "읽지"는 않고
  // setState의 함수형 갱신·ref만 쓰므로 마운트 시 한 번만 등록해도 안전하다.
  useEffect(() => {
    return subscribe((raw) => {
        const msg = raw as WsPush;
        setWaiting(false); // 뭐가 됐든 서버에서 응답이 왔다는 뜻 — 대기 표시(점 세 개) 끔
        switch (msg.type) {
          case "text_chunk":
            setLiveText((prev) => (prev ?? "") + msg.text);
            break;
          case "text_done":
            setLiveText((prev) => {
              if (prev) appendMessage({ role: "assistant", text: prev, animate: false });
              return null;
            });
            break;
          case "step1_chunk":
            setLiveStepLabel("1단계(스크립트) 생성 중");
            setLiveStepText((prev) => (prev ?? "") + msg.text);
            break;
          case "step1_chunk_done":
            setLiveStepText(null);
            break;
          case "step2_chunk":
            setLiveStepLabel("2단계(장면 연출) 생성 중");
            setLiveStepText((prev) => (prev ?? "") + msg.text);
            break;
          case "step2_chunk_done":
            setLiveStepText(null);
            break;
          case "options_prompt":
            appendMessage({ role: "assistant", text: msg.message, animate: false });
            break;
          case "step1":
            appendMessage({
              role: "assistant",
              step1: { coreQuestion: msg.core_question, cuts: msg.cuts, script: msg.script, article: msg.article },
            });
            break;
          case "storyboard":
            setStoryboard({ coreQuestion: msg.core_question, cuts: msg.cuts });
            appendMessage(
              {
                role: "assistant",
                storyboard: {
                  coreQuestion: msg.core_question ?? "",
                  cuts: msg.cuts.map((c) => ({
                    cut: c.cut,
                    title: c.title || c.caption || c.narration || `컷 ${c.cut}`,
                    scene: c.scene,
                  })),
                },
              },
              { fullCuts: msg.cuts } // 컷 이미지 재요청까지 이어가려면 화면 요약본 말고 원본 전체가 필요
            );
            break;
          case "error":
            appendMessage({ role: "assistant", text: msg.message });
            break;
        }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appendMessage는 매 렌더 새로 만들어지지만 messages/threadIdRef를 함수형 갱신·ref로만 다뤄 클로저가 오래돼도 안전하다(위 주석 참고) — subscribe 자체는 마운트 시 한 번만
  }, []);

  /** 1단계 카드의 "2단계로 진행" 버튼 — script/article을 그대로 서버에
   *  되돌려보낸다. 해당 메시지에 confirmed:true를 찍어 버튼이 다시
   *  안 눌리게 한다(중복 클릭 방지). */
  const confirmStep2 = (messageId: string, step1: Step1Data) => {
    if (step1.confirmed) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId && m.step1 ? { ...m, step1: { ...m.step1, confirmed: true } } : m))
    );
    appendMessage({ role: "assistant", text: "2단계(장면 연출)를 만들고 있어요..." });
    setWaiting(true);
    sendWs("confirm_step2", { script: step1.script, article: step1.article });
  };

  const send = () => {
    const text = input.trim();
    if (!text || !wsOpen) return;
    setInput("");

    // 이 세션의 첫 메시지면 스레드를 먼저 만든다(2026-09-15, 사용자 요청
    // — 좌측 사이드바에 대화 저장). 실패해도 채팅 자체는 계속 진행 —
    // 저장이 안 될 뿐 실험은 막지 않는다.
    const proceed = () => sendInner(text);
    if (threadIdRef.current === null) {
      adminApi
        .createChatThread(PROMPT_CATEGORY, PROMPT_NAME, text.slice(0, 60))
        .then((thread) => {
          setThreadId(thread.id);
          refreshThreads();
          proceed();
        })
        .catch((err) => {
          console.error("대화 스레드 생성 실패", err);
          proceed();
        });
    } else {
      proceed();
    }
  };

  const sendInner = (text: string) => {
    appendMessage({ role: "user", text });

    const isShortCommand = text.length < MIN_ARTICLE_LEN;

    // 1단계 결과 뒤에 붙는 "(1)/(2)" 선택지를 화면의 버튼 대신 숫자만 쳐서
    // 보내도 처리한다(2026-09-16, 사용자 요청 — "사용자는 1이나 2번을
    // 입력창에 넣고 전송하면... 다음 단계에 대한 답변 결과물도
    // 출력하겠네요"). 번호 해석은 반드시 여기(프론트)가 한다 — 모델에게
    // "사용자가 2라고 했으니 알아서 해석하라"고 맡기지 않는다. 아직 확인
    // 안 된 1단계 카드가 없으면(엉뚱한 "2"를 여기서 가로채면 오히려
    // 헷갈리므로) 그냥 아래 일반 분기로 흘려보낸다.
    const bareDigitMatch = isShortCommand ? /^[12]$/.exec(text.trim()) : null;
    if (bareDigitMatch) {
      const lastStep1Msg = [...messages].reverse().find((m) => m.role === "assistant" && m.step1 && !m.step1.confirmed);
      if (lastStep1Msg?.step1) {
        if (bareDigitMatch[0] === "2") {
          confirmStep2(lastStep1Msg.id, lastStep1Msg.step1);
          return;
        }
        // "1" — 같은 기사로 1단계를 다시 만든다.
        appendMessage({ role: "assistant", text: "1단계를 다시 만들고 있어요..." });
        setWaiting(true);
        sendWs("article", { article: lastStep1Msg.step1.article });
        return;
      }
    }

    if (text.length >= MIN_ARTICLE_LEN) {
      setWaiting(true);
      sendWs("article", { article: text });
    } else {
      // 기사도 컷 요청도 아니면 일반 챗봇처럼 Bedrock을 직접 호출한다
      // (2026-09-15, 사용자 요청: "자연스럽게 대화가 가능하도록... 일반
      // 챗봇처럼... 베드락 모두 호출되도록" — 예전엔 이 분기가 Bedrock을
      // 안 부르고 고정 안내 문구만 돌려줬다). 최근 대화 몇 턴을 같이
      // 보내 자연스럽게 이어지게 한다. 답변이 고정된 챗봇 페르소나가
      // 아니라 지금 저장된 지침을 시스템 프롬프트로 삼아 나오는 건
      // 서버(routes/chat_ws.py)가 저장된 지침을 직접 읽어와 처리한다
      // (2026-09-16부터 nova와 같은 방식 — 원문을 여기서 안 실어 보낸다).
      const history = messages
        .filter((m): m is ChatMessage & { text: string } => !!m.text)
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));
      setWaiting(true);
      sendWs("chat", { message: text, history });
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // 한글 등 IME로 글자를 조합하는 도중 Enter로 조합을 확정하면
      // 브라우저가 그 확정용 keydown도 "Enter"로 흘려보낸다 —
      // isComposing 체크 없이 그대로 send()를 부르면 조합이 아직 안 끝난
      // 텍스트가 먼저 전송되고, 남은 글자가 뒤이어 또 전송돼 한 번 누른
      // Enter가 두 번 보낸 것처럼 쪼개진다(2026-09-15, 사용자가 실제로
      // 겪은 버그 — "안녕"/"넹"처럼 짧게 두 번 나뉘어 전송됨). keyCode
      // 229는 조합 중임을 나타내는 구형 브라우저 호환 신호.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      send();
    }
  };

  const headerNode = (
    <div className="ui-divider flex items-start justify-between gap-4 border-b px-5 pb-3 pt-5">
      <div className="flex min-w-0 items-start gap-3">
        {/* 2026-09-16, 사용자 요청 — "뒤로가기 버튼을 만들어주셔야 이전
            화면으로 나갈 수 있을 것 같습니다": 전체화면으로 열리는
            embedded 모드에서 닫기 버튼이 아예 숨겨져 있어(!embedded 조건),
            Esc 키 말고는 나갈 방법이 없었다 — 항상 보이는 뒤로가기로
            바꾸고, "닫기"(X)보다 "이전 화면으로 돌아간다"는 의도가 더
            분명한 화살표+라벨 버튼으로 뺐다. */}
        <button
          type="button"
          onClick={onClose}
          className="-ml-1 mt-0.5 flex flex-none cursor-pointer items-center gap-1 rounded-lg py-1 pl-1 pr-2 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          aria-label="목록으로 돌아가기"
          title="목록으로 돌아가기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          목록으로
        </button>
        <div className="min-w-0">
          <h2 id="prompt-chat-lab-title" className="font-display text-[17px] font-bold text-[var(--text-primary)]">
            프롬프트 실험
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">기사를 붙여넣고 스크립트·장면 연출을 만들어보세요 — 텍스트만</p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <span
          className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={
            wsOpen
              ? { background: "var(--ok-soft)", color: "var(--ok)" }
              : { background: "var(--warn-soft)", color: "var(--warn)" }
          }
          title={wsOpen ? "실시간 연결됨" : "연결 중..."}
        >
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
          {wsOpen ? "실시간 연결됨" : "연결 중..."}
        </span>
      </div>
    </div>
  );

  const bodyNode = (
    <div ref={listRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
      {messages.map((m) => (
        <ChatBubble key={m.id} msg={m} onConfirmStep2={confirmStep2} />
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
      {liveStepText !== null && (
        <div className="flex justify-start">
          <div className="w-full max-w-[92%]">
            <p className="mb-1 text-[11px] font-medium text-[var(--text-muted)]">{liveStepLabel}</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">
              {liveStepText}
              <span className="ml-0.5 inline-block h-[13px] w-[2px] animate-pulse bg-[var(--text-faint)] align-middle" aria-hidden="true" />
            </p>
          </div>
        </div>
      )}
      {waiting && liveText === null && liveStepText === null && <TypingDots />}
    </div>
  );

  const composerNode = (
    <div className="ui-divider border-t px-4 py-3">
      <div className="ui-input flex items-end gap-2 rounded-2xl px-3 py-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={wsOpen ? "기사를 붙여넣어 스크립트를 만들어보세요" : "연결 중..."}
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
        Enter로 보내기 · Shift+Enter로 줄바꿈 — 지침을 바꾸려면 우측 상단 톱니바퀴에서 편집 후 저장해 주세요.
      </p>
    </div>
  );

  // 채팅(왼쪽, 가변폭) + 이미지 생성 패널(오른쪽, 드래그로 폭 조절) 두 칸 —
  // 손그림 스케치(2026-09-16, 사용자 요청 "text | image" 좌우 분할 +
  // "항상 2개 단이 구분되어서 보여지면 좋겠어요")를 그대로 따른다. 2단계
  // (장면 연출)가 아직 안 끝났으면 오른쪽엔 "아직 컷이 없다" 빈 상태만
  // 보이다가, storyboard가 채워지는 순간 같은 자리에서 컷 카드가 나온다 —
  // 별도 페이지로 이동하지 않는다(탭으로 서로 가리지도 않는다).
  // 지침/설명/파일 편집(PromptSectionsPanel)은 이 칸을 더는 못 쓰므로
  // 우측 상단 아이콘으로 여닫는 오버레이로 옮겼다.
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
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleImagePanelResizeStart}
        className="w-1.5 flex-none cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
        title="드래그해서 폭 조절"
      />
      <aside
        className="flex flex-none flex-col border-l ui-divider bg-[var(--surface-card)]"
        style={{ width: imagePanelWidth }}
      >
        <div className="ui-divider border-b px-3.5 py-3.5">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">이미지 생성</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WebtoonCutGenerator cuts={storyboard?.cuts ?? []} compact wsOpen={wsOpen} send={wsSend} subscribe={subscribe} />
        </div>
      </aside>
      {/* 2026-09-16 — 톱니바퀴(지침 편집)·사람 아이콘(이미지 실험) 두 개짜리
          숨김 오버레이를 걷어내고 항상 보이는 3번째 칼럼으로 바꿨다(사용자
          요청: "하나의 화면에서 원클릭 정도로 보면서 수정하는 스타일을
          선호... 프리미어 프로 설정 바·일레븐랩스 값 조정 바처럼"). 왔다갔다
          여닫을 필요 없이 설명/지침/파일(PromptSectionsPanel) 바로 아래에
          고정값 설정(WebtoonImageSettingsPanel, STYLE/CHARACTERS+참조
          이미지)이 스크롤 한 번으로 쭉 이어진다.
          2026-09-16(같은 날 후속) — "설명/지침/파일도 보여야 한다, 그럼
          토글로 접었다 펴게, 단계별로(대본/이미지) + 이미지 하위에 인물
          같은 걸로 구분되면 깔끔하겠다"는 후속 요청으로, 대본 프롬프트
          (설명·지침·파일)와 이미지 프롬프트(화풍·인물) 두 최상위 그룹을
          CollapsibleSection으로 감쌌다 — WebtoonImageSettingsPanel 내부도
          화풍/인물, 인물 하위 A·B까지 같은 컴포넌트로 한 번 더 나뉜다.
          장면 하나로 테스트 생성·히스토리 갤러리처럼 자주 안 쓰는 기능은
          이 칼럼 맨 아래 링크로 기존 WebtoonImageLab 전체 화면을 그대로
          열 수 있게 남겨뒀다. */}
      <aside className="flex w-[380px] flex-none flex-col overflow-y-auto border-l ui-divider bg-[var(--surface-card)]">
        <div className="ui-divider border-b px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">설정</p>
        </div>
        <CollapsibleSection title="대본 프롬프트 — 설명·지침·파일" defaultOpen>
          <PromptSectionsPanel category={PROMPT_CATEGORY} name={PROMPT_NAME} />
        </CollapsibleSection>
        <div className="ui-divider border-t" />
        <CollapsibleSection title="이미지 프롬프트 — 화풍·인물" defaultOpen>
          <WebtoonImageSettingsPanel onOpenFullLab={() => setImageLabOpen(true)} />
        </CollapsibleSection>
      </aside>
      <WebtoonImageLab open={imageLabOpen} onClose={() => setImageLabOpen(false)} />
    </div>
  );

  if (embedded) {
    return layout;
  }

  // 전체화면 모달(2026-09-15, 사용자 요청 — webtoon/page.tsx 쪽과 동일한
  // 전환, 이 standalone(비-embedded) 경로도 같은 모양을 유지).
  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-chat-lab-title"
      inert={!open}
      className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-[var(--surface-card)] transition-opacity duration-200 ease-out ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {layout}
    </aside>
  );
}

function ChatBubble({
  msg,
  onConfirmStep2,
}: {
  msg: ChatMessage;
  onConfirmStep2: (messageId: string, step1: Step1Data) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={isUser ? "max-w-[78%]" : "w-full max-w-[92%]"}>
        {isUser ? (
          <div
            className="whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] leading-relaxed"
            style={{ background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)" }}
          >
            {msg.text}
          </div>
        ) : (
          <div className="space-y-2.5">
            {msg.text && <TypewriterText text={msg.text} animate={!!msg.animate} />}
            {msg.step1 && <Step1Card data={msg.step1} onConfirm={() => onConfirmStep2(msg.id, msg.step1!)} />}
            {msg.storyboard && <StoryboardCard data={msg.storyboard} animate={!!msg.animate} />}
            {msg.imagePreview && <CutImagePreview data={msg.imagePreview} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* 1단계 결과 카드 — human-in-the-loop 확인 지점(2026-09-15). 컷별 요약은
   scene_type·camera 같은 연출 디테일 없이 "이 컷이 뭘 다루는지"만 한
   줄로 보여준다(2단계가 있어야 나오는 정보라 아직 없음). */
/* animateKey — 이 카드가 방금 도착했을 때만 애니메이션을 태운다. React가
   같은 컴포넌트 인스턴스를 재사용하면(confirmed 값만 바뀌는 리렌더 등)
   useState 초기값이 다시 안 돌아서 스토리보드 카드처럼 마운트 시점에만
   흘려보내면 된다 — 매 리렌더마다 다시 재생되지 않게 useRef로 "이미 한
   번 재생했는지"를 기억한다. */
function Step1Card({ data, onConfirm }: { data: Step1Data; onConfirm: () => void }) {
  // 이 카드는 메시지 하나당 한 번만 마운트된다(부모가 안정적인 key로
  // 렌더) — confirmed 값이 바뀌어 리렌더돼도 useTypewriter의 useEffect는
  // 빈 의존성 배열이라 다시 안 돌고, CSS 애니메이션도 같은 style 값을
  // 다시 대입한다고 브라우저가 재생을 재시작하진 않는다. 그래서 "이미
  // 재생했는지"를 ref로 따로 추적할 필요가 없다(추적하려면 렌더 중
  // ref.current를 읽고 쓰게 돼 react-hooks/refs 규칙 위반이 된다).
  const coreQuestion = useTypewriter(data.coreQuestion ?? "", true);

  return (
    <div>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{coreQuestion}</p>
      <div className="mt-2 space-y-1">
        {data.cuts.map((c, i) => (
          <p
            key={i}
            className="text-[13px] leading-relaxed text-[var(--text-secondary)]"
            style={{ animation: `ui-fade-up 200ms ease-out both`, animationDelay: `${500 + i * 70}ms` }}
          >
            <span className="font-semibold text-[var(--text-faint)]">{c.cut ?? i + 1}.</span> {c.summary}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={data.confirmed}
        className="ui-btn ui-btn-primary mt-3 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
      >
        {data.confirmed ? "2단계 진행 중..." : "2단계(장면 연출)로 진행"}
      </button>
    </div>
  );
}

/* 기사 반응 문구(진짜 토큰 스트리밍, liveText 참고)를 뺀 나머지 어시스턴트
   텍스트 — "GPU를 켜는 중입니다" 같은 상태 메시지, 오류 메시지 — 는
   완성된 문자열이 웹소켓으로 한 번에 온다(스토리보드 JSON·컷 이미지처럼
   "다 돼야 의미 있는" 데이터라 토큰 단위로 쪼갤 이유가 없다, 위 모듈
   docstring·routes/chat_ws.py 참고). 그래도 채팅 톤을 맞추려고 여기서
   타자 치듯 풀어내는 연출을 입힌다. */
/** 타자 치듯 문자열을 점진적으로 드러낸다 — 이미 문자열 하나짜리 값이
 *  필요한 자리(다른 요소 안에 끼워 넣을 때, 예: Step1Card의 핵심 질문)에
 *  쓴다. 자체 마크업을 갖는 텍스트 블록은 아래 TypewriterText를 쓴다. */
function useTypewriter(text: string, animate: boolean): string {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate) return; // 초기 state가 이미 text 전체 — 애니메이션 없이 그대로 둔다
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i = Math.min(i + 2, text.length);
      setShown(text.slice(0, i));
      if (i < text.length) timer = setTimeout(step, 12);
    };
    timer = setTimeout(step, 12);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- text/animate는 메시지 생성 시점에 고정, 재생 중 바뀌지 않음
  }, []);
  return shown;
}

function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const shown = useTypewriter(text, animate);
  return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">{shown}</p>;
}

/* 박스·카드 없이 대화 텍스트처럼 바로 흘러나오게(2026-09-15, 사용자 요청
   — "박스 같은거 만들 필요없이 날것으로 빠르게 대화 답변 출력"). 구분은
   테두리·배경이 아니라 타이포그래피(굵기·크기)와 컷 번호만으로 준다. */
function StoryboardCard({
  data,
  animate,
}: {
  data: { coreQuestion: string; cuts: StoryboardCutPreview[] };
  animate: boolean;
}) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{data.coreQuestion}</p>
      <div className="mt-2.5 space-y-2.5">
        {data.cuts.map((c, i) => (
          <div
            key={c.cut}
            className={i > 0 ? "border-t border-[var(--border-hairline)] pt-2.5" : ""}
            style={animate ? { animation: `ui-fade-up 200ms ease-out both`, animationDelay: `${i * 70}ms` } : undefined}
          >
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              <span className="mr-1.5" style={{ color: "var(--accent)" }}>
                컷 {c.cut}
              </span>
              {c.title}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">{c.scene}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CutImagePreview({ data }: { data: { cut: number; imageUrl: string; model?: string } }) {
  const modelLabel = IMAGE_MODELS.find((m) => m.id === data.model)?.label ?? data.model;
  return (
    <div className="ui-card overflow-hidden rounded-xl" style={{ maxWidth: 360 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구) */}
      <img src={data.imageUrl} alt={`컷 ${data.cut} 생성 이미지`} className="w-full" />
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">컷 {data.cut}</span>
        {modelLabel && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}>
            {modelLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/* "생각 중" 표시 — 요청 보내고 첫 응답 오기 전까지(2026-09-15, 사용자
   요청 — "출력할 때 기다리는 동안 심심하니까"). 점 세 개가 순서대로
   튀어 오르는 흔한 채팅 UI 패턴, Tailwind 기본 animate-bounce 재사용. */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" role="status" aria-label="응답 준비 중">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full"
          style={{ background: "var(--text-faint)", animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

