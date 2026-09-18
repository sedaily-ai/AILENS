"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { WebtoonStageLab } from "../WebtoonStageLab";

/* 프롬프트·이미지 실험 — 채팅형 통합(2026-09-14, 사용자 요청: "클로드처럼
   채팅을 할 수 있는 형태로 통합해주세요" → "실제 대화 가능하도록 백엔드
   작업 진행해주세요" → "웹소켓을 연결해서 실시간 스트리밍 방식으로").

   2026-09-16 — 좌우 역할을 다시 나눴다(사용자 요청: "좌측 부분에서는
   텍스트만 출력되는 걸로 목적을 잡으면 될 것 같고, 우측에서는 이미지를
   출력하는걸로"). 이 컴포넌트(왼쪽)는 기사 → 스크립트·장면 연출까지
   텍스트만 다룬다 — 컷 이미지 생성은 전부 오른쪽 패널
   (../WebtoonCutGenerator)이 독자적인 WebSocket 연결로 처리한다.
   "N번 컷"/"전체 컷" 텍스트 명령, 모델 선택, GPU 켜기/끄기는 전부 그쪽
   으로 옮겨갔다 — 여기 남기면 두 군데서 같은 일을 하는 꼴이라 전부 뺐다.

   2026-09-18 — "1단계(스크립트)/2단계(장면 연출)" 구분 자체를 없앴다
   (사용자 요청: "스테이지 구분 자체가 왜 있어야하는거죠?? 그런거
   필요없을텐데요"). 기사를 보내면 서버가 단일 Bedrock 호출로 스크립트+
   장면 연출을 한 번에 만들어 storyboard 메시지 하나로 돌려준다
   (routes/chat_ws.py::_run_article_flow 참고) — 화면에 "1단계"/"2단계"·
   "장면 연출 생성 중" 같은 중간 단계 표시가 따로 뜨지 않는다.

   **전송 방식**: HTTP job/폴링(4초 간격) 대신 API Gateway WebSocket API
   (routes/chat_ws.py, HTTP API인 adminClient.ts의 BASE와는 별개 API)로
   붙는다 — 서버가 완료 즉시 이 연결에 결과를 밀어넣는다. 기사 반응
   문구는 Bedrock converse_stream()으로 진짜 토큰 단위 스트리밍(아래
   text_chunk 처리 참고) — 이 앱에서 유일하게 실제 스트리밍이 붙는
   지점이다(스토리보드 JSON은 완성돼야 의미가 있는 데이터라 토큰 단위로
   보여줄 게 못 된다, routes/chat_ws.py 모듈 docstring 참고).

   의도 분류는 충분히 긴 텍스트(새 기사)만 간단한 규칙으로 걸러내고, 그
   외 나머지는 전부 일반 대화로 Bedrock에 그대로 흘려보낸다(2026-09-15,
   사용자 요청: "자연스럽게 대화가 가능하도록... 일반 챗봇처럼... 베드락
   모두 호출되도록" — 예전엔 이 나머지 분기가 Bedrock 호출 없이 고정
   안내 문구만 돌려줬다). */

type MsgRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: MsgRole;
  text?: string;
  storyboard?: { coreQuestion: string; cuts: WebtoonStoryboardCut[] };
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
  // 2026-09-18, 사용자 요청 — "원빵에 출력하는 방향으로 하기로 했는데요":
  // 스크립트→장면 연출을 한 번에 이어서 만든다. "1단계/2단계" 구분·
  // 확인 절차는 더 이상 없다.
  text: "기사를 붙여넣어 주세요 — 스크립트부터 장면 연출까지 한 번에 만들어 보여드릴게요. 컷 이미지는 오른쪽 패널에서 만드시면 됩니다.",
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
  // 스크립트+장면 연출 JSON 생성 중 원문 미리보기 청크(2026-09-16) —
  // script_chunk_done 다음에 완성된 storyboard 메시지가 온다. 2026-09-18
  // — "1단계/2단계" 구분을 없애면서 step1_chunk/step2_chunk 두 종류였던
  // 걸 script_chunk 하나로 합쳤다(사용자 요청: "스테이지 구분 자체가 왜
  // 있어야하는거죠?? 그런거 필요없을텐데요").
  | { type: "script_chunk"; text: string }
  | { type: "script_chunk_done" }
  // 완료 후 안내 텍스트 — 그냥 평범한 어시스턴트 텍스트 메시지로 렌더한다.
  | { type: "options_prompt"; message: string }
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
  const [stageLabOpen, setStageLabOpen] = useState(false);
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
  // 스크립트+장면 연출 JSON 생성 중 원문 미리보기(2026-09-16, 사용자 요청
  // — "출력하는것도 단계별로 쪼개서 출력을 해줘야 해요": 점 세 개만 뜨고
  // 아무것도 안 보이던 구간을 없앤다). liveStepActive는 "지금 실시간
  // 미리보기를 보여줄지"만 담당 — 실제 원문·리빌 진행도는 아래
  // fullTextRef/revealedIndexRef(ref, 리렌더 유발 안 함)가 담당한다.
  // storyboard 메시지가 도착하면(=완성) liveStepActive를 끄고 그 카드로
  // 교체된다.
  const [liveStepActive, setLiveStepActive] = useState(false);
  const [liveStepLabel, setLiveStepLabel] = useState<string>("");
  const [liveParsed, setLiveParsed] = useState<{ value: unknown; inProgressPath: JsonPath } | null>(null);
  // 2026-09-18, 사용자 요청 — "타이핑하듯이.. 타닥타닥타닥 이런게 나와야
  // 하는데.. 지금은 쭉 한번에 끊기듯이 나오잖아요.. 노바 챗봇 서비스는
  // 어떻게 만들었는지 봐주시고 똑같은 값을 적용" — nova/frontend의
  // useSmoothStreaming.js를 그대로 포팅한다: 서버에서 온 원문은
  // fullTextRef(참조)에 즉시 그대로 쌓이고(네트워크 속도와 무관, 싸다),
  // requestAnimationFrame 루프가 "밀린 양(backlog)에 비례한 속도"로 한
  // 글자씩 드러낸다(최소 25자/초, 밀릴수록 더 빨리 — nova 원본과 동일
  // 공식) — 그 "드러난 부분"만 매 프레임 다시 파싱해 DumpNode로 그린다.
  // 그래서 필드가 통째로 뚝뚝 나타나는 대신 글자 단위로 자연스럽게
  // 채워진다. nova는 markdown 문자열을 그대로 리빌하지만, 여기는 구조화
  // 렌더링(DumpNode)이라 "리빌된 원문 prefix"를 매번 다시 파싱해서 쓴다.
  const fullTextRef = useRef("");
  const revealedIndexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  // 2026-09-18(같은 날 후속) — 사용자 요청: "스크롤 하고 싶은데 계속
  // 아래쪽으로.. 그리고 지금 버벅임.. 코드블럭 때문에 그런것 같은데":
  // liveParsed가 매 프레임(최대 초당 60번) 바뀌면서, (1) 코드블럭 포함된
  // 트리 전체를 60번/초 리렌더해 버벅이고, (2) 그때마다 스크롤도 같이
  // 호출돼 사용자가 위로 스크롤해도 다음 프레임에 바로 눌려버렸다.
  // 리빌 인덱스 계산(revealedIndexRef)은 매 프레임 그대로 하되, 실제
  // setLiveParsed(=리렌더+스크롤 트리거)는 RENDER_INTERVAL_MS 간격으로만
  // 묶는다 — nova의 rAF 리빌은 유지하면서 리렌더 빈도만 낮춘다.
  const lastRenderTimeRef = useRef(0);
  const RENDER_INTERVAL_MS = 90;

  const revealStep = (timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const deltaTime = timestamp - lastTimeRef.current;
    const targetLength = fullTextRef.current.length;
    const caughtUp = revealedIndexRef.current >= targetLength;
    if (!caughtUp && deltaTime > 0) {
      const backlog = targetLength - revealedIndexRef.current;
      const cps = Math.max(25, backlog * 2.2); // nova useSmoothStreaming.js와 동일 공식
      const step = Math.max(1, Math.round((cps * deltaTime) / 1000));
      revealedIndexRef.current = Math.min(targetLength, revealedIndexRef.current + step);
      lastTimeRef.current = timestamp;
    }
    const justCaughtUp = !caughtUp && revealedIndexRef.current >= targetLength;
    if (justCaughtUp || timestamp - lastRenderTimeRef.current >= RENDER_INTERVAL_MS) {
      lastRenderTimeRef.current = timestamp;
      setLiveParsed(tryParsePartialJson(fullTextRef.current.slice(0, revealedIndexRef.current)));
    }
    if (revealedIndexRef.current < targetLength) {
      rafRef.current = requestAnimationFrame(revealStep);
    } else {
      rafRef.current = null;
      lastTimeRef.current = 0;
    }
  };

  const appendLiveText = (chunk: string) => {
    fullTextRef.current += chunk;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(revealStep);
    }
  };

  /** 다음 단계(1단계→2단계) 전환 시 버퍼만 비우고 진행 표시는 유지한다. */
  const resetLiveBuffer = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    fullTextRef.current = "";
    revealedIndexRef.current = 0;
    lastTimeRef.current = 0;
  };
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

  // 2026-09-18, 사용자 요청 — "출력될때 위로 스크롤하면.. 안움직이도록..
  // 계속 출력되는쪽으로 스크롤 이동되네.. 위로 스크롤 가능하게 해주세요":
  // 이미 바닥 근처에 있을 때만 자동 스크롤한다 — 사용자가 위로 올려서
  // 읽고 있으면(바닥에서 멀어졌으면) 새 내용이 와도 억지로 안 끌어내린다.
  const isNearBottomRef = useRef(true);
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // 새 메시지(드묾)는 부드럽게, 실시간 리빌 중(초당 ~11회) 갱신은 즉시
  // 스냅한다 — smooth 애니메이션이 겹쳐 쌓이면 그 자체가 사용자의 위쪽
  // 스크롤 조작과 계속 부딪힌다(애니메이션이 끝나기 전에 다음 스크롤이
  // 또 걸림).
  useEffect(() => {
    if (isNearBottomRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (isNearBottomRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" });
    }
  }, [liveText, liveParsed]);

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
          storyboard: m.storyboard as { coreQuestion: string; cuts: WebtoonStoryboardCut[] } | undefined,
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
          // 2026-09-18 — 원문(JSON 조각)은 fullTextRef에 즉시 쌓이고,
          // requestAnimationFrame 리빌 루프(revealStep)가 타이핑하듯 한
          // 글자씩 드러내며 그때그때 DumpNode로 그린다(위 상태 선언부
          // 주석 참고) — 완성 전후로 디자인이 안 바뀐다.
          case "script_chunk":
            setLiveStepLabel("스크립트·장면 연출 작성 중");
            setLiveStepActive(true);
            appendLiveText(msg.text);
            break;
          case "script_chunk_done":
            resetLiveBuffer();
            setLiveStepActive(false);
            setLiveParsed(null);
            break;
          case "options_prompt":
            appendMessage({ role: "assistant", text: msg.message, animate: false });
            break;
          case "storyboard":
            setStoryboard({ coreQuestion: msg.core_question, cuts: msg.cuts });
            // 2026-09-18, 사용자 요청 — "정리해서 나오는 작업 없애주시고, 날것으로
            // 모든 출력결과 다 출력해주세요"(예: 대사가 카드 요약에선 안 보였음).
            // 컷을 title+scene으로 추려내던 걸 걷어내고 msg.cuts(2단계 산출물 전체
            // — narration/caption/dialogue/camera/scene/title 등)를 그대로 싣는다.
            appendMessage(
              {
                role: "assistant",
                storyboard: { coreQuestion: msg.core_question ?? "", cuts: msg.cuts },
              },
              { fullCuts: msg.cuts } // 컷 이미지 재요청에 쓰는 원본 — 지금은 storyboard.cuts와 내용이 같지만 용도가 달라 그대로 둔다
            );
            break;
          case "error":
            appendMessage({ role: "assistant", text: msg.message });
            break;
        }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appendMessage는 매 렌더 새로 만들어지지만 messages/threadIdRef를 함수형 갱신·ref로만 다뤄 클로저가 오래돼도 안전하다(위 주석 참고) — subscribe 자체는 마운트 시 한 번만
  }, []);

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
    <div ref={listRef} onScroll={handleListScroll} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
      {messages.map((m) => (
        <ChatBubble key={m.id} msg={m} />
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
      {liveStepActive && (
        <div className="flex justify-start">
          <div className="w-full max-w-[92%]">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              {liveStepLabel}
              <span className="inline-block h-[7px] w-[7px] animate-pulse rounded-full bg-[var(--accent)]" aria-hidden="true" />
            </p>
            {liveParsed ? (
              <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                <DumpNode value={liveParsed.value} inProgressPath={liveParsed.inProgressPath} />
              </div>
            ) : null}
          </div>
        </div>
      )}
      {waiting && liveText === null && !liveStepActive && <TypingDots />}
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
          <WebtoonImageSettingsPanel
            onOpenFullLab={() => setImageLabOpen(true)}
            onOpenStageLab={() => setStageLabOpen(true)}
          />
        </CollapsibleSection>
      </aside>
      <WebtoonImageLab open={imageLabOpen} onClose={() => setImageLabOpen(false)} />
      <WebtoonStageLab open={stageLabOpen} onClose={() => setStageLabOpen(false)} />
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

function ChatBubble({ msg }: { msg: ChatMessage }) {
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
            {msg.storyboard && <StoryboardCard data={msg.storyboard} animate={!!msg.animate} />}
            {msg.imagePreview && <CutImagePreview data={msg.imagePreview} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* 2026-09-18, 사용자 요청 — "전체 출력을 하고나서.. 보정을 하네요(코드블럭에
   감싼다거나.. 구조를 깔끔하게 개선한다거나).. 실시간으로 바로바로
   디자인해야 합니다": 스트리밍 중엔 평문으로 보여주다 완성되면 DumpNode
   (코드블럭 포함)로 "바뀌는" 게 바로 그 "보정"이었다. 그래서 스트리밍
   중에도 완성본과 똑같이 DumpNode를 쓴다 — 아직 안 끝난 JSON 원문을
   최선을 다해(짝 안 맞는 따옴표·괄호를 보정해) 매 청크마다 다시 파싱해서,
   그 순간까지 들어온 필드만큼만 완성본과 동일한 디자인으로 보여준다.
   파싱 자체가 안 되는 극초반(예: 아직 "{"밖에 없음)에는 null을 돌려주고
   호출부가 "작성 중" 표시만 보여준다. */
type JsonPath = Array<string | number>;

/** 스트리밍 원문(repair 전)에서 "지금 값이 채워지고 있는 자리"의 경로를
 *  추적한다 — 예: {"cuts":[{"camera":"클로즈"  ← 아직 안 끝남
 *  이면 ["cuts", 0, "camera"]를 돌려준다. DumpNode가 이 경로와 자기
 *  경로가 같은 필드만 "아직 쓰는 중"으로 보고 코드블럭 박스를 미룬다
 *  (2026-09-18, 사용자 요청 — "다 쓰고 나서 보정은 제가 원하는게
 *  아닙니다": 전체 응답이 아니라 필드 하나하나가 끝나는 시점마다
 *  자연스럽게 감싸야 한다는 뜻이라, "이 필드가 지금도 자라는 중인지"를
 *  알아야 한다). JSON이 완전히 닫혀 있으면(스택이 빈 상태) 빈 배열을
 *  돌려준다 — "지금 진행 중인 필드가 없다"는 뜻. */
function computeInProgressPath(text: string): JsonPath {
  type Frame = { type: "obj"; key: string | null } | { type: "arr"; index: number };
  const stack: Frame[] = [];
  let inString = false;
  let escapeNext = false;
  let stringIsKey = false;
  let keyBuffer = "";
  let expectKeyNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
        const top = stack[stack.length - 1];
        if (stringIsKey) {
          if (top && top.type === "obj") top.key = keyBuffer;
        } else if (top && top.type === "obj") {
          // 문자열 "값"이 닫혔다 — 콤마/닫는 중괄호를 기다릴 것 없이 이
          // 키는 지금 이 순간 완성이다(카메라/장면처럼 값이 항상 문자열인
          // 필드가 대부분이라, 이 시점을 놓치면 다음 키가 시작될 때까지
          // "아직 쓰는 중"으로 잘못 붙잡아 두게 된다).
          top.key = null;
        }
      } else if (stringIsKey) {
        keyBuffer += ch;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    switch (ch) {
      case '"':
        inString = true;
        stringIsKey = !!(top && top.type === "obj" && expectKeyNext);
        keyBuffer = "";
        expectKeyNext = false;
        break;
      case "{":
        stack.push({ type: "obj", key: null });
        expectKeyNext = true;
        break;
      case "[":
        stack.push({ type: "arr", index: 0 });
        break;
      case "}":
      case "]":
        stack.pop();
        break;
      case ",":
        if (top?.type === "obj") {
          top.key = null;
          expectKeyNext = true;
        } else if (top?.type === "arr") {
          top.index += 1;
        }
        break;
      default:
        break;
    }
  }
  const path: JsonPath = [];
  for (const frame of stack) {
    if (frame.type === "obj") {
      if (frame.key != null) path.push(frame.key);
    } else {
      path.push(frame.index);
    }
  }
  return path;
}

function pathsEqual(a: JsonPath, b: JsonPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* 2026-09-18, 사용자 요청 — "전체 출력을 하고나서.. 보정을 하네요(코드블럭에
   감싼다거나.. 구조를 깔끔하게 개선한다거나).. 실시간으로 바로바로
   디자인해야 합니다" + (같은 날 후속) "다 쓰고 나서 보정은 제가 원하는게
   아닙니다": 스트리밍 중엔 평문으로 보여주다 완성되면 DumpNode(코드블럭
   포함)로 "바뀌는" 게 바로 그 "보정"이었다. 그래서 스트리밍 중에도
   완성본과 똑같이 DumpNode를 쓴다 — 아직 안 끝난 JSON 원문을 최선을
   다해(짝 안 맞는 따옴표·괄호를 보정해) 매 청크마다 다시 파싱해서, 그
   순간까지 들어온 필드만큼만 완성본과 동일한 디자인으로 보여준다.
   파싱 자체가 안 되는 극초반(예: 아직 "{"밖에 없음)에는 null을 돌려주고
   호출부가 "작성 중" 표시만 보여준다.

   다만 전체가 아니라 "필드 단위"로 완성 시점을 맞추려면(위 사용자 요청)
   응답 전체가 끝나기 전이라도 이미 다음 필드로 넘어간 필드는 완성된
   것으로 보고 코드블럭을 씌워야 한다 — 지금 한 글자씩 자라고 있는
   마지막 필드만 예외로 평문 유지한다. inProgressPath가 그 "지금 자라는
   중인 필드"의 경로다(computeInProgressPath 참고). */
function tryParsePartialJson(raw: string): { value: unknown; inProgressPath: JsonPath } | null {
  let text = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "");
  if (!text) return null;
  const inProgressPath = computeInProgressPath(text);
  try {
    return { value: JSON.parse(text), inProgressPath };
  } catch {
    // 아래 보정 시도로 넘어간다
  }
  // 마지막에 안 닫힌 문자열(따옴표 개수가 홀수)이 있으면 그 시작 지점까지 잘라낸다.
  const quoteCount = (text.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 === 1) {
    text = text.slice(0, text.lastIndexOf('"'));
  }
  text = text.replace(/,\s*$/, "");
  // 값 없이 key만 덜렁 남은 경우(콜론 유무 무관) 그 key째로 버린다 —
  // "key"까지만 왔고 값이 아직 하나도 없으면 유효한 JSON을 못 만든다.
  text = text.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, "");
  text = text.replace(/,\s*$/, "");
  // 안 닫힌 { [ 를 스택으로 추적해 끝에 닫아준다(문자열 내부는 건너뜀).
  const closers: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (ch === "{" || ch === "[") closers.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") closers.pop();
  }
  while (closers.length) text += closers.pop();
  try {
    return { value: JSON.parse(text), inProgressPath };
  } catch {
    return null;
  }
}

/* 2026-09-18, 사용자 요청 — "이미지 프롬프트 같은거는.. 코드블럭에.. 감싸서
   출력해도 좋겠네": key가 "image_prompt"류면 값을 코드블럭(모노스페이스
   +테두리 박스)으로, 그 외는 "key: value" 한 줄로 보여준다. 스트리밍 중
   미리보기(tryParsePartialJson 결과)와 완성 후 최종 카드 둘 다 이
   컴포넌트 하나로 그린다 — 완성 전후로 디자인이 갈리지 않는다.

   inProgressPath(기본 null — 완성된 메시지 카드는 항상 null)가 주어지면,
   지금 그 경로와 같은 필드만 "아직 쓰는 중"으로 보고 코드블럭 박스를
   미룬다(위 tryParsePartialJson 주석 참고) — 그 필드를 지나 다음 필드로
   넘어간 순간 바로 코드블럭으로 확정된다, 응답 전체가 끝나길 기다리지
   않는다. */
function DumpNode({
  value,
  depth = 0,
  path = [],
  inProgressPath = null,
}: {
  value: unknown;
  depth?: number;
  path?: JsonPath;
  inProgressPath?: JsonPath | null;
}): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[var(--text-faint)]">(없음)</span>;
    return (
      <div className="space-y-3">
        {value.map((v, i) => (
          <div
            key={i}
            className={depth === 0 ? "border-t border-[var(--border-hairline)] pt-3 first:border-t-0 first:pt-0" : ""}
          >
            <DumpNode value={v} depth={depth + 1} path={[...path, i]} inProgressPath={inProgressPath} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => {
          const childPath = [...path, k];
          const isCodeField = /image_prompt|animation_prompt/i.test(k);
          const isInProgress = !!inProgressPath && pathsEqual(childPath, inProgressPath);
          if (v && typeof v === "object") {
            return (
              <div key={k}>
                <span className="font-semibold text-[var(--text-muted)]">{k}:</span>
                <div className="pl-3">
                  <DumpNode value={v} depth={depth + 1} path={childPath} inProgressPath={inProgressPath} />
                </div>
              </div>
            );
          }
          if (isCodeField && !isInProgress) {
            return (
              <div key={k}>
                <span className="font-semibold text-[var(--text-muted)]">{k}:</span>
                <pre
                  className="mt-1 whitespace-pre-wrap break-words rounded-md border px-2.5 py-2 font-mono text-[11px] leading-relaxed"
                  style={{ background: "var(--surface-sunken)", borderColor: "var(--border-hairline)" }}
                >
                  {String(v ?? "")}
                </pre>
              </div>
            );
          }
          return (
            <p key={k}>
              <span className="font-semibold text-[var(--text-muted)]">{k}: </span>
              <span>{String(v ?? "")}</span>
            </p>
          );
        })}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

/* 기사 반응 문구(진짜 토큰 스트리밍, liveText 참고)를 뺀 나머지 어시스턴트
   텍스트 — "GPU를 켜는 중입니다" 같은 상태 메시지, 오류 메시지 — 는
   완성된 문자열이 웹소켓으로 한 번에 온다(스토리보드 JSON·컷 이미지처럼
   "다 돼야 의미 있는" 데이터라 토큰 단위로 쪼갤 이유가 없다, 위 모듈
   docstring·routes/chat_ws.py 참고). 그래도 채팅 톤을 맞추려고 여기서
   타자 치듯 풀어내는 연출을 입힌다. */
/** 타자 치듯 문자열을 점진적으로 드러낸다 — 이미 문자열 하나짜리 값이
 *  필요한 자리(다른 요소 안에 끼워 넣을 때)에 쓴다. 자체 마크업을 갖는
 *  텍스트 블록은 아래 TypewriterText를 쓴다. */
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
/** 2026-09-18, 사용자 요청 — "정리해서 카드처럼 나오는 작업 없애주시고, 날것으로
 *  모든 출력결과 다 출력해주세요"(예: 대사(dialogue)가 title+scene 요약 카드에선
 *  안 보였음). 컷마다 2단계 산출물 전체(narration/caption/dialogue/camera/scene/
 *  title/title_keyword/closing_caption)를 필드 그대로 나열한다 — 골라서 보여주지
 *  않는다. */
function StoryboardCard({
  data,
  animate,
}: {
  data: { coreQuestion: string; cuts: WebtoonStoryboardCut[] };
  animate: boolean;
}) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{data.coreQuestion}</p>
      <div className="mt-2.5 space-y-3">
        {data.cuts.map((c, i) => (
          <div
            key={c.cut}
            className={i > 0 ? "border-t border-[var(--border-hairline)] pt-3" : ""}
            style={animate ? { animation: `ui-fade-up 200ms ease-out both`, animationDelay: `${i * 70}ms` } : undefined}
          >
            <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              컷 {c.cut}
            </p>
            <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
              <DumpNode value={c} />
            </div>
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

