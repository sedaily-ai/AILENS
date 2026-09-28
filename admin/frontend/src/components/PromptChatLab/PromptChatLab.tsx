"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { adminApi } from "@/lib/adminClient";
import { useAdminChatSocket } from "@/lib/useAdminChatSocket";
import type { PromptHistoryEntry, WebtoonStoryboardCut } from "@/lib/types";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "./PromptVersionReference";
import { WebtoonImageSettingsPanel, type WebtoonImageSettingsPanelHandle } from "./WebtoonImageSettingsPanel";
import { CollapsibleSection } from "./CollapsibleSection";
import { ActivationHistoryButton } from "./ActivationHistory";
import { StepTabs } from "./StepTabs";
import { ChatThreadSidebar } from "./ChatThreadSidebar";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL } from "./textModels";
import { useChatLabThread } from "./useChatLabThread";
import { useCurrentModelLabel } from "./useCurrentModel";
import { WebtoonCutGenerator, WebtoonProductionCutGrid } from "../WebtoonCutGenerator/WebtoonCutGenerator";
import { LatestPublishedContentLink } from "./LatestPublishedContentLink";
import { CustomSelect } from "@/components/CustomSelect";

// 좌측 채팅창 텍스트 모델 선택지 — 2026-09-22, ./textModels.ts로 이전
// (PromptTextLab.tsx와 공용, 내용 변경 없음). 원래 주석: "Opus 5.1"·
// "GPT 최신 모델"도 요청받았지만 정확한 모델명 확인 전이라 이번엔 뺐다 —
// 확인되면 textModels.ts + 백엔드 TEXT_MODELS 양쪽에 한 줄씩 추가. sonnet-5는
// 백엔드 TEXT_MODELS엔 있지만(IAM·비용태깅 프로파일까지 이미 준비됨) 여기
// 드롭다운엔 일부러 안 넣었다 — 실측으로 이 웹툰 스크립트 생성 작업에서
// 240초를 기다려도 내부 reasoning이 토큰 예산을 다 써서 실제 답변이
// 0글자로 나오는 걸 확인했다(prompts.py TEXT_MODELS 주석 참고). 고르면
// 그냥 실패하는 옵션을 보여줄 이유가 없어 뺐다. opus-5도 느리지만
// (수십~200초대) 완주는 하는 걸 확인해서 남긴다.

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
  storyboard?: { coreQuestion: string; cuts: WebtoonStoryboardCut[]; testedVersion?: number | null };
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
  // tested_version(2026-09-21 추가) — 과거 버전 드롭다운으로 시험 발화한
  // 결과면 그 버전 번호, "최신"으로 보낸 평소 요청이면 null.
  | { type: "storyboard"; core_question: string | null; cuts: WebtoonStoryboardCut[]; tested_version?: number | null }
  | { type: "error"; message: string }
  // 2026-09-21, 사용자 요청 — "특정 대화에서 출력한 이미지들이 다시 그
  // 대화를 들어가면 날아가 있는데 저장할 수 있도록": 우측 패널
  // (WebtoonCutGenerator)에서 컷을 생성하면 이 이벤트가 오는데, 지금까지
  // PromptChatLab은 이걸 안 듣고 WebtoonCutGenerator만 자기 로컬
  // state(slots)에 담아뒀다 — 스레드를 나갔다 들어오면 그 로컬 state가
  // 사라져 이미지가 없어진 것처럼 보였다.
  // 2026-09-26 — 저장은 persistArtifact로 한다(채팅 말풍선엔 안 보임,
  // 아래 case "cut_image" 참고) — 사용자 지적: "이미지 부분이 채팅
  // 부분에도 출력이 되는데, 출력할 필요 없고요... 우측에만 출력된게
  // 나오도록". 한때 appendMessage(말풍선으로도 보임)로 연결했었는데
  // 그걸 되돌린 것.
  | { type: "cut_image"; cut: number; test_id?: string; image_url: string; model?: string }
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
  const currentModelLabel = useCurrentModelLabel(PROMPT_CATEGORY, open);
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
    category: PROMPT_CATEGORY,
    promptName: PROMPT_NAME,
    enabled: open,
    makeGreeting: () => GREETING,
    // 2026-09-26 — persistArtifact로 저장된 컷 이미지(imagePreview만 있고
    // text·storyboard는 없는 메시지)는 채팅 말풍선으로 복원하지 않는다
    // (null 반환 → useChatLabThread.ts가 걸러냄). 우측 패널 복원은
    // openThread()가 detail.messages 원본을 따로 스캔해서
    // restoredCutImages에 담당한다(아래 참고) — 이 mapSavedMessage와는
    // 무관하게 항상 동작한다.
    mapSavedMessage: (m) => {
      if (m.imagePreview && !m.text && !m.storyboard) return null;
      return {
        id: `saved-${m.id}`,
        role: m.role,
        text: m.text,
        storyboard: m.storyboard as { coreQuestion: string; cuts: WebtoonStoryboardCut[]; testedVersion?: number | null } | undefined,
        animate: false,
      };
    },
    decorateMessage: (msg) => ({ animate: msg.role === "assistant", ...msg }),
    buildPersistPayload: (msg, persistExtra) => {
      const payload: Record<string, unknown> = { ...persistExtra };
      if (msg.text !== undefined) payload.text = msg.text;
      if (msg.storyboard !== undefined) payload.storyboard = msg.storyboard;
      return payload;
    },
  });
  const [input, setInput] = useState("");
  // 2026-09-20, 사용자 요청 — "좌측 채팅창에도 텍스트 모델 선택 가능하게":
  // 이미지 모델 드롭다운(WebtoonCutGenerator)과 같은 패턴. 기본값은 기존
  // 동작 그대로(Sonnet 4.6) — 아무것도 고르지 않아도 예전과 똑같이 나간다.
  const [textModel, setTextModel] = useState<string>(DEFAULT_TEXT_MODEL);
  const [storyboard, setStoryboard] = useState<{ coreQuestion: string | null; cuts: WebtoonStoryboardCut[] } | null>(null);
  // 2026-09-24, 사용자 지적 — "대화 하고 나갔다 오면... 웹툰 등... 사라지는데...
  // 대화들은 살아있는데, 나머지들도 다 남으면 좋지": 컷 이미지(imagePreview)는
  // 원래도 생성 즉시 스레드에 저장되고 있었는데(cut_image WS 케이스), 그
  // 데이터가 채팅 말풍선 렌더링에만 쓰이고 실제 사용자가 보는 우측
  // WebtoonCutGenerator 그리드로는 전혀 복원되지 않았다 — openThread에서
  // imagePreview 메시지들을 모아 여기 담아 WebtoonCutGenerator에 내려준다.
  // 2026-09-26 — "테스트 N" 카드가 여러 개로 늘어나면서(WebtoonCutGenerator.tsx
  // 모듈 docstring 참고) 컷 번호 하나만으론 키가 부족해졌다 — testId를
  // 바깥 키로 한 겹 더 둔다. 구버전(testId 없이 저장된) 메시지는 "legacy"
  // 키 하나로 묶는다 — 그 글자 자체는 의미 없고, 그냥 restoredImages의
  // Object.entries() 순서상 첫 번째 테스트로 복원되기만 하면 된다.
  const [restoredCutImages, setRestoredCutImages] = useState<Record<string, Record<number, { imageUrl: string; model?: string }>>>({});
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
  // 2026-09-25 — 화풍/인물(STYLE/CHARACTERS) 설정 삭제 결정(사용자 요청,
  // 발행된 webtoon-image 문서에 IMAGE_MODEL 섹션이 없어 실제 자동발행도
  // 기본 모델(sd_ultra)로 떨어지고 있음을 라이브로 확인 — sd_ultra는 이
  // 값들을 아예 안 읽어 실제로도 죽은 설정이었다)에 따라 이 값들을 편집
  // 하던 화면(WebtoonImageLab 히스토리 갤러리·WebtoonStageLab 단계별
  // 생성)도 함께 제거했다 — 삭제된 패널을 여는 유일한 진입점이라 남겨두면
  // 죽은 코드만 된다. "발행 모델"(어떤 모델을 쓸지) 선택 UI는 팟캐스트의
  // podcast-voice·영상의 video-settings와 같은 성격(실제 살아있는 프로덕션
  // 설정)이라 그대로 유지한다.
  // 2026-09-16, 사용자 요청 — "좌측 사이드바는 접혔다 펼 수 있도록":
  // 대화 목록이 당장 필요 없을 때 챗 영역을 넓게 쓸 수 있게 한다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 2026-09-16, 사용자 요청 — "이미지 생성 부분이 늘렸다 펴졌다.. 직접
  // 손으로 끌고 갈 수 있도록": 우측 패널 폭을 드래그로 조절한다.
  // 2026-09-25 — 중간 "이미지 생성" 칼럼과 우측 "설정" 칼럼을 하나로
  // 합쳤다(사용자 지적: "중간 섹션이랑.. 우측 사이드 섹션.. 이렇게
  // 두개가 있을 이유가 있을까요? 통합하면 어떨까..") — "설정"을
  // "프로덕션" 토글로 감싸고, 그 아래 "결과값" 토글에 컷 이미지 그리드를
  // 담아 한 칼럼에서 스크롤로 다 본다. 폭 state도 하나로 합쳐졌다(이전
  // imagePanelWidth+settingsPanelWidth 두 개 드래그 핸들 → 하나).
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
  // 위아래로 잡아당기고 끌 수 있도록" — PromptTextLab.tsx와 동일 패턴,
  // 그 파일 주석 참고.
  const [productionHeight, setProductionHeight] = useState(360);
  // 2026-09-27, 사용자 지적 — "테스트 추가 부분.. 고정해야겠네.. 스크롤
  // 내리면 사라지네": "테스트" 경계 띠(WebtoonCutGenerator.tsx)가 프로덕션
  // 카드 밑 일반 흐름에 있어서, 테스트 카드가 많아 아래로 스크롤하면
  // 화면 밖으로 사라졌다. 프로덕션 카드(sticky top-0)는 이미 고정돼
  // 있으니, 그 바로 아래에 띠도 같이 고정하면 된다 — 다만 프로덕션 카드는
  // 접혔다 펴지거나(CollapsibleSection의 <details>, 여기서 제어 못 함)
  // 드래그로 높이가 바뀌므로(productionHeight) "지금 실제로 화면에서
  // 차지하는 높이"를 고정값으로 가정할 수 없다 — ResizeObserver로 실측해서
  // 그 값을 띠의 top으로 넘긴다(WebtoonCutGenerator에 stickyTop prop).
  const productionCardRef = useRef<HTMLDivElement>(null);
  const [productionCardHeight, setProductionCardHeight] = useState(0);
  useEffect(() => {
    const el = productionCardRef.current;
    if (!el) return;
    // 2026-09-27(후속) — 사용자 리포트: "스크롤했는데 테스트 섹션 행이
    // 프로덕션 카드랑 겹치는데요": ResizeObserver 콜백만 믿었더니, 이
    // 카드 안의 <details>(CollapsibleSection, 접힘↔펼침) 토글이 이
    // 중첩된 flex+overflow-hidden+max-height 조합에서 항상 콜백을
    // 새로 안 태우는 경우가 있었다 — 접힘 상태에서 측정한 작은 높이가
    // 펼친 뒤에도 안 갱신돼서, "테스트" 띠가 그 낡은(작은) top 값에
    // 붙어 펼쳐진 프로덕션 카드 아랫부분을 덮어버린 것. ResizeObserver는
    // 그대로 두되, 이 카드 안의 모든 <details>(중첩 토글 포함)에 직접
    // toggle 리스너를 걸어 접힘/펼침 "그 즉시" 강제로 다시 잰다 —
    // 두 경로 중 하나라도 놓치지 않게 이중 방어.
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
  // 2026-09-26(후속×3), 사용자 요청 — "프로덕션 부분 카드도.. 테스트
  // 카드랑 동일한 구조가 되도록 하면 어떤가요?": PromptSectionsPanel(별도
  // prompt_lab_docs 저장소, VersionSwitcher 드롭다운)을 완전히 걷어내고
  // 테스트 카드와 똑같은 PromptVersionReference를 그대로 쓴다 — 이제
  // "프로덕션" 카드도 "테스트 N" 카드처럼 왼쪽 사이드바로 버전을 훑어보고
  // 불러오고, "+ 새 버전"으로 새로 만들고, 이 카드 전용 "프로덕션에 적용"
  // 버튼으로 승격한다. prompt_lab_docs라는 별개 저장소 자체가 없어지므로
  // "배지는 v18인데 본문은 다른 버전"처럼 둘이 어긋나는 근본 원인이
  // 사라진다 — 항상 prompt_versions 하나만 본다.
  const scriptPromptRef = useRef<PromptVersionReferenceHandle>(null);
  const imageSettingsRef = useRef<WebtoonImageSettingsPanelHandle>(null);
  const [scriptServerVersion, setScriptServerVersion] = useState<number | null>(null);
  const [applyingScriptVersion, setApplyingScriptVersion] = useState(false);
  // 2026-09-26(후속×4), 사용자 지적 — "처음 들어갈때 프로덕션 카드 보면,
  // 프로덕션에 적용 카드가 활성화되어있는데, 고치지 않았으면, 활성화가
  // 되지 않아야하는거 아닌가요?": 이 카드가 지금 사이드바에 불러와 둔
  // 버전(scriptActiveInfo)이 이미 프로덕션(scriptServerVersion)과 같으면
  // 눌러도 아무 일도 안 일어나는 버튼이라, 그 상태에선 비활성화해 둔다.
  const [scriptActiveInfo, setScriptActiveInfo] = useState<{ version: number; label: string | null } | null>(null);
  const scriptVersionUnchanged =
    scriptActiveInfo !== null && scriptServerVersion !== null && scriptActiveInfo.version === scriptServerVersion;
  // 2026-09-26(후속), 사용자 요청 — "테스트 카드도 마찬가지": 테스트
  // 카드의 "프로덕션에 적용"도 같은 원칙으로 비활성화하려면, 테스트
  // 카드들이 지금 실제 발행된 이미지 모델이 뭔지 알아야 한다 —
  // WebtoonImageSettingsPanel이 방금 fetch한 defaults.image_model을 여기로
  // 올려보내고, WebtoonCutGenerator에 그대로 내려준다.
  const [productionImageModel, setProductionImageModel] = useState<string | null>(null);
  const handleApplyScriptVersion = async () => {
    if (applyingScriptVersion) return;
    setApplyingScriptVersion(true);
    try {
      await scriptPromptRef.current?.activateIfNeeded();
    } finally {
      setApplyingScriptVersion(false);
    }
  };
  // 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
  // 이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고, 프로덕션
  // 적용은 테스트 카드에서... 테스트 1 카드에서 바로 보이게": 컷 카드의
  // 통합 "프로덕션에 적용" 버튼(WebtoonCutGenerator.tsx)이 부른다 — 이제
  // 값만 채우는 게 아니라 그 자리에서 바로 발행까지 한다
  // (WebtoonImageSettingsPanel.tsx::applyAndPublish).
  const handleApplyImageModel = (model: string) => imageSettingsRef.current?.applyAndPublish(model) ?? Promise.resolve();
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
  // 2026-09-27, 사용자 요청 — "복사버튼 있으면 좋을것같고요.. nova
  // 서비스처럼": PromptTextLab.tsx와 동일 패턴(handleCopy/copiedId).
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopy = async (m: ChatMessage) => {
    if (!m.text) return;
    try {
      await navigator.clipboard.writeText(m.text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((prev) => (prev === m.id ? null : prev)), 1800);
    } catch (err) {
      console.error("클립보드 복사 실패", err);
    }
  };
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
      setLiveParsed(normalizeLiveParsed(tryParsePartialJson(fullTextRef.current.slice(0, revealedIndexRef.current))));
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
  // 대화를 했고 출력물이 나왔는지 체크"). threads/threadId/threadIdRef는
  // useChatLabThread가 관리(2026-09-24 리팩토링 — PromptTextLab.tsx와
  // 중복이던 골격을 훅으로 뽑았다).

  // 2026-09-18, 사용자 요청 — "출력될때 위로 스크롤하면.. 안움직이도록..
  // 계속 출력되는쪽으로 스크롤 이동되네.. 위로 스크롤 가능하게 해주세요":
  // 이미 바닥 근처에 있을 때만 자동 스크롤한다 — 사용자가 위로 올려서
  // 읽고 있으면(바닥에서 멀어졌으면) 새 내용이 와도 억지로 안 끌어내린다.
  //
  // 2026-09-21(후속) — "스크롤을 위로 하려는데 계속 못 움직이게 하네":
  // 스트리밍 중엔 liveParsed가 90ms마다 갱신되며 매번 바닥으로 끌어
  // 내리는데, 거리 임계값(120px)만으로 판단하면 사용자가 살짝만 위로
  // 스크롤해도(120px 안쪽) 바로 다음 틱에 도로 끌려 내려가 "전혀 안
  // 움직이는" 것처럼 느껴졌다 — 임계값을 더 낮추는 걸로는 정도의
  // 차이일 뿐 같은 문제가 반복된다. 대신 스크롤 "방향"을 본다 —
  // scrollTop이 직전보다 줄었다(=사용자가 위로 올렸다)는 게 감지되면
  // 거리와 무관하게 즉시 자동 스크롤을 끈다(우리 코드는 스스로 위로
  // 스크롤하는 일이 없으므로 이 방향 감소는 항상 사용자 조작이다).
  // 바닥 근처(20px 이내)로 직접 돌아오면 다시 자동 스크롤을 재개한다.
  const isNearBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (el.scrollTop < lastScrollTopRef.current) {
      isNearBottomRef.current = false;
    } else if (distanceFromBottom < 20) {
      isNearBottomRef.current = true;
    }
    lastScrollTopRef.current = el.scrollTop;
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

  // 2026-09-21, 사용자 요청 — "프롬프트를 버전별로 볼 수 있으면... 버전을
  // 드롭다운 해서 선택할 수 있고 그걸로 적용해서 출력... AB 테스트 느낌".
  // "최신"(promptVersion=null)이면 기존 동작(우측 패널 초안 → 없으면
  // 발행본) 그대로, 특정 버전을 고르면 그 버전 content로 일회성 override —
  // 지금 초안/발행 상태는 전혀 안 건드린다(chat_ws.py::_resolve_prompt_content
  // 참고).
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [promptVersion, setPromptVersion] = useState<number | null>(null);

  // getPrompt()가 아니라 getPromptHistory() — active_content(웹툰 카테고리
  // 10만자 이상)까지 통째로 받는 무거운 쪽은 안 쓴다(2026-09-20 "프롬프트
  // 실험 페이지 로딩이 느리다" 신고).
  const refreshPromptHistory = () => {
    adminApi
      .getPromptHistory(PROMPT_CATEGORY, PROMPT_NAME)
      .then((r) => setPromptHistory(r.history))
      .catch((err) => console.error("프롬프트 버전 목록 불러오기 실패", err));
  };

  // 2026-09-26(후속×3) — 프로덕션 카드가 더 이상 PromptSectionsPanel을
  // 안 쓰므로(위 scriptPromptRef 주석 참고), scriptServerVersion(지금
  // 프로덕션 활성 버전 번호)을 여기서 직접 가볍게 구한다 — listPrompts()는
  // 카테고리 전체 요약뿐이라 본문 없이 active_version만 가져온다.
  const refreshScriptServerVersion = () => {
    adminApi
      .listPrompts()
      .then((r) => {
        const listed = r.prompts.find((p) => p.id === `${PROMPT_CATEGORY}/${PROMPT_NAME}`);
        setScriptServerVersion(listed ? listed.active_version : null);
      })
      .catch((err) => console.error("프로덕션 버전 조회 실패", err));
  };

  useEffect(() => {
    if (!open) return;
    refreshPromptHistory();
    refreshScriptServerVersion();
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

  /** 사이드바 "새 대화" — 지금 화면을 초기 상태로 되돌린다. 서버에 빈
   *  스레드를 미리 만들진 않는다 — 첫 메시지를 보낼 때(send()) 만든다,
   *  그래야 아무것도 안 치고 나가도 빈 스레드가 목록에 안 쌓인다. */
  const startNewThread = () => {
    startNewThreadCore();
    setStoryboard(null);
    setRestoredCutImages({});
    setLiveText(null);
    setWaiting(false);
    // 2026-09-26, 사용자 요청 — "항상 처음 들어가면 프로덕션이 기본값이
    // 되도록"(PromptTextLab.tsx와 동일 이유, 그 파일 주석 참고).
    setPromptVersion(null);
  };

  /** 사이드바에서 기존 스레드 클릭 — 저장된 메시지를 그대로 복원한다.
   *  storyboard 메시지 중 가장 최근 것에 fullCuts가 있으면 그걸로
   *  storyboard 상태까지 복원해서(컷 이미지 재요청도 이어갈 수 있게),
   *  없으면(옛 스레드거나 storyboard가 아예 없던 대화) storyboard는
   *  비운다. imagePreview가 있는 메시지들은 컷 번호별로 모아
   *  restoredCutImages에 담는다(2026-09-24, 위 주석 참고) — 같은 컷을
   *  여러 번 다시 만들었으면 나중 메시지가 이긴다(reduce가 앞→뒤 순서로
   *  덮어씀). */
  const openThread = (id: number) => {
    openThreadCore(id).then((detail) => {
      if (!detail) return;
      const withFullCuts = [...detail.messages].reverse().find((m) => m.fullCuts && m.fullCuts.length > 0);
      setStoryboard(
        withFullCuts
          ? { coreQuestion: withFullCuts.storyboard?.coreQuestion ?? null, cuts: withFullCuts.fullCuts! }
          : null
      );
      setRestoredCutImages(
        detail.messages.reduce<Record<string, Record<number, { imageUrl: string; model?: string }>>>((acc, m) => {
          if (m.imagePreview) {
            const testId = m.imagePreview.testId ?? "legacy";
            acc[testId] = { ...acc[testId], [m.imagePreview.cut]: { imageUrl: m.imagePreview.imageUrl, model: m.imagePreview.model } };
          }
          return acc;
        }, {})
      );
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
                storyboard: { coreQuestion: msg.core_question ?? "", cuts: msg.cuts, testedVersion: msg.tested_version ?? null },
              },
              { fullCuts: msg.cuts } // 컷 이미지 재요청에 쓰는 원본 — 지금은 storyboard.cuts와 내용이 같지만 용도가 달라 그대로 둔다
            );
            break;
          case "error":
            appendMessage({ role: "assistant", text: msg.message });
            break;
          case "cut_image":
            // 우측 패널(WebtoonCutGenerator)이 자기 화면(슬롯) 갱신은
            // 따로 처리한다 — 여기서는 스레드를 나갔다 다시 들어와도
            // 생성된 이미지가 안 사라지게 서버에만 저장한다.
            // 2026-09-26 — appendMessage(채팅 말풍선으로도 보임)를
            // persistArtifact(서버 저장만, 채팅엔 안 보임)로 바꿨다 —
            // 사용자 지적: "이미지 부분이 채팅 부분에도 출력이 되는데,
            // 출력할 필요 없고요... 우측에만 출력된게 나오도록". 팟캐스트
            // 음성 카드·영상 카드가 이미 쓰는 것과 동일 패턴(useChatLabThread.ts::
            // persistArtifact 모듈 docstring 참고) — 복원(openThread)은
            // 서버에 저장된 메시지를 그대로 다시 읽어오는 거라 그대로
            // 동작한다, 화면에 말풍선으로 안 보였을 뿐 저장 자체는 항상
            // 서버에 했었다.
            persistArtifact({
              imagePreview: { cut: msg.cut, imageUrl: msg.image_url, model: msg.model, testId: msg.test_id },
            });
            break;
        }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- appendMessage는 매 렌더 새로 만들어지지만 messages/threadIdRef를 함수형 갱신·ref로만 다뤄 클로저가 오래돼도 안전하다(위 주석 참고) — subscribe 자체는 마운트 시 한 번만
  }, []);

  // 2026-09-27, 사용자 지적 — "답변 출력중에는 또 다른 채팅 못보내도록
  // 하시고... 한번 입력했는데 2번 출력되는 것도 있구요"(PromptTextLab.tsx
  // 와 동일 버그·동일 수정, 그 파일 주석 참고). 웹툰은 liveStepActive
  // (JSON 미리보기 리빌 중)도 "응답 중"에 포함해야 한다 — liveText가
  // null이어도 storyboard가 아직 안 끝났으면 여전히 생성 중이다.
  const isGenerating = waiting || liveText !== null || liveStepActive;

  const send = () => {
    const text = input.trim();
    if (!text || !wsOpen || isGenerating) return;
    setInput("");

    // 2026-09-20 — 예전엔 스레드 생성(createChatThread, admin Lambda→
    // lens-cms-api HTTP 왕복)이 끝나야 sendInner()를 불렀다 — "새 대화
    // 누르고 처음 보낼 때 너무 늦게 나타난다"는 신고로 발견. 사용자가
    // 실제로 기다리는 건 AI 응답이지 스레드 저장이 아니라서, 스레드
    // 생성은 백그라운드로 돌리고 메시지 전송(sendInner, 사용자 말풍선
    // 표시 + WebSocket 전송)은 그 응답을 기다리지 않고 바로 실행한다
    // (ensureThread — useChatLabThread 참고).
    ensureThread(text);
    sendInner(text);
  };

  const sendInner = (text: string) => {
    appendMessage({ role: "user", text });

    if (text.length >= MIN_ARTICLE_LEN) {
      setWaiting(true);
      sendWs("article", { article: text, model: textModel, version: promptVersion ?? undefined });
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
      sendWs("chat", { message: text, history, model: textModel });
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
            화면으로 나갈 수 있을 것 같습니다": 그때는 이 컴포넌트가
            독립적으로 전체화면 다이얼로그였어서, embedded 모드에서 닫기
            버튼이 숨겨져 있으면(!embedded 조건) Esc 키 말고는 나갈 방법이
            없었다. 2026-09-22에 PromptLab(4포맷 탭 셸)이 이 컴포넌트를
            감싸게 되면서 그 셸 자신의 닫기(X) 버튼이 항상 보이게 됐고,
            레터/팟캐스트/영상 탭(PromptTextLab)도 처음부터 자기 헤더에
            뒤로가기를 안 뒀다 — 여기 것만 남아있던 중복이라 걷어낸다
            (2026-09-24, 사용자 지적: "4탭 모두 목록으로 나가는 로직도
            공통된 위치에 잘 있는거죠?"). */}
        <div className="min-w-0">
          <h2 id="prompt-chat-lab-title" className="font-display text-[17px] font-bold text-[var(--text-primary)]">
            프롬프트 실험
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">기사를 붙여넣고 스크립트·장면 연출을 만들어보세요 — 텍스트만</p>
        </div>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        {/* 2026-09-24 — PromptTextLab.tsx와 같은 이유·같은 배지(사용자
            요청: "배지 형태로... 하드코딩된거라 바뀌면 또 바꿔야
            하잖아요"): 지금 실제 발행에 쓰이는 모델을 백엔드에서 받아와
            보여준다. 좌측 드롭다운(textModel)은 이 채팅창에서 골라 시험
            호출할 모델일 뿐, 이 배지와는 무관하다. */}
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
        <ChatBubble key={m.id} msg={m} copiedId={copiedId} onCopy={handleCopy} />
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
      {/* 2026-09-20, 사용자 요청 — "좌측 채팅창 입력하는 부분에 모델
          드롭다운이 위로 향하게": 입력창 바로 위에 상시 노출. 화면 하단에
          붙어 있어 기본(아래로 펼침) 팝업이 잘리므로 CustomSelect의
          openUp을 쓴다. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-[10.5px] text-[var(--text-faint)]">모델</span>
        <CustomSelect value={textModel} onChange={setTextModel} options={TEXT_MODELS.map((m) => ({ value: m.id, label: m.label }))} openUp />
      </div>
      {/* 2026-09-21 — 버전 선택 드롭다운 자체는 우측 설정 패널의 "대본
          프롬프트 — 발행 버전" 쪽으로 옮겼다(사용자 요청: "버전 부분을...
          설정에... 발행 버전 부분에 드롭다운"). 여기는 지금 무엇으로
          테스트 중인지 놓치지 않게 상태만 보여준다(입력창 바로 위라 보낼
          때 한 번 더 눈에 들어옴) — 컨트롤 자체를 두 곳에 두면 어느 쪽이
          정본인지 헷갈리므로 여기서 바꾸는 기능은 없앴다. */}
      {/* 2026-09-26, 사용자 요청 — "채팅 부분에.. 처음 들어가면, 어떤
          버전의 생성 프롬프트가 사용되는지 활성화되었는지 항상 뜨도록":
          예전엔 promptVersion !== null(테스트 버전을 골랐을 때)에만
          보였다 — 기본값(프로덕션)일 땐 표시가 아예 없었다. 항상
          보이게 바꾸고, 기본값일 땐 프로덕션임을 명시한다. */}
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
          placeholder={!wsOpen ? "연결 중..." : isGenerating ? "응답을 기다리는 중..." : "기사를 붙여넣어 스크립트를 만들어보세요"}
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
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={handleSettingsPanelResizeStart}
        className="w-1.5 flex-none cursor-col-resize bg-transparent transition-colors hover:bg-[var(--accent-soft)] active:bg-[var(--accent-soft)]"
        title="드래그해서 폭 조절"
      />
      {/* 2026-09-26 — "프로덕션"/"테스트" 상자를 카드 리스트로 합친 뒤
          (사용자 지적, PromptTextLab.tsx와 동일 결정), 프로덕션의 하위
          토글 2개가 카드로 안 감싸인 채 바깥에 노출돼 있던 게 잘못이었다
          (사용자 재지적: "3개 토글이 지금 외부에 보이는데.. 이걸
          감싸야합니다... 카드1, 카드2... 이렇게 뻗어나가는 구조여야" —
          그 파일 주석 참고, 웹툰은 하위 토글이 2개뿐이라는 점만 다름).
          프로덕션도 "테스트 N"과 똑같이 그 자체가 하나의 카드다. */}
      <aside
        className="flex flex-none flex-col border-l ui-divider bg-[var(--surface-card)]"
        style={{ width: settingsPanelWidth }}
      >
        {/* 2026-09-27, 사용자 지적(후속) — "아예 여백 틈 자체가 없는
            디자인으로 가자는거지.. 카드처럼 하지말구.. 그림자도 필요없고요":
            "여백을 줄인다"가 아니라 애초에 "카드"라는 개념 자체를 뺐다 —
            바깥 padding·카드 사이 gap을 완전히 0으로, 각 카드의 둥근 모서리·
            그림자(ui-card)도 뺐다. 구분은 오직 border-b 헤어라인 하나로만
            한다(문서/리스트처럼 이어지는 느낌 — 서로 다른 "떠있는 상자"가
            아니라 하나의 패널 안에 쌓인 섹션들). */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div>
            {/* 2026-09-26 — 사용자 요청: "프로덕션 부분은.. 고정하고
                싶네요. 스크롤 내려도 볼 수 있도록" — PromptTextLab.tsx와
                동일 이유, 그 파일 주석 참고. 후속 — 기본 접힘 + 세로
                드래그로 높이 조절(PromptTextLab.tsx와 동일 패턴). */}
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
                      {/* 2026-09-27 — 사용자 요청: "그렇게 변경된것도 화면에
                          나오도록.. 프로덕션 카드에 히스토리 아이콘". 버전
                          배지 바로 옆에 둬서 "지금 이 버전이 언제부터
                          프로덕션이었는지"를 한 클릭으로 확인할 수 있게. */}
                      <ActivationHistoryButton category={PROMPT_CATEGORY} name={PROMPT_NAME} channel="webtoon" urlPath="webtoon" />
                    </span>
                  ) : undefined
                }
                badge={
                  <div className="flex items-center gap-1.5">
                    {/* 2026-09-26(후속×3), 사용자 요청 — "프로덕션 부분
                        카드도.. 테스트 카드랑 동일한 구조가 되도록":
                        이 카드도 테스트 카드처럼 자기 전용 "프로덕션에
                        적용" 버튼을 갖는다 — 왼쪽 사이드바에서 과거
                        버전으로 옮겨보고 있었다면, 그걸 바로 진짜
                        프로덕션으로 승격한다(이미 최신이면 아무 일도
                        안 함). */}
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
                {/* 2026-09-27, 사용자 지적 — "프로덕션쪽에.. 파란 색상
                    없애주세요.. 테스트 카드랑 색상 동일하게": 이 옅은
                    파란 배경(--accent-soft)이 프로덕션 카드 전체 몸통을
                    덮고 있어서, 앞서 여러 차례 지적받은 "배경에 색상이
                    있다"의 진짜 원인이었다 — 테스트 카드(WebtoonCutGenerator
                    쪽)는 이 래퍼 자체가 없어 항상 무색이었다. 배경을 뺘서
                    두 카드가 완전히 같은 색으로 보이게 했다. */}
                <div className="pb-1">
                  {/* 2026-09-26(후속×3) — PromptSectionsPanel+VersionSwitcher
                      (별도 prompt_lab_docs 저장소) 대신 테스트 카드와 똑같은
                      PromptVersionReference를 그대로 쓴다 — 왼쪽 사이드바로
                      버전을 훑어보고, "+ 새 버전"으로 새로 만들고, 연필/
                      휴지통으로 이름 수정·삭제까지 전부 이 컴포넌트 하나
                      안에서 끝난다(테스트 카드와 완전히 동일한 구조). */}
                  <StepTabs
                    steps={[
                      {
                        key: "prompt",
                        label: "생성 프롬프트",
                        content: (
                          <PromptVersionReference
                            ref={scriptPromptRef}
                            category={PROMPT_CATEGORY}
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
                        key: "image",
                        label: "이미지 설정",
                        content: (
                          <>
                            <WebtoonImageSettingsPanel ref={imageSettingsRef} onProductionModelChange={setProductionImageModel} />
                            {/* 2026-09-27 — 사용자 지적: "프로덕션 결과물이라는
                                거를 만드는게 아니고요.. 이미지 설정 단계로
                                가면 이미지 생성 하도록 되잖아? .. 프로덕션
                                결과물 섹션을 만들라는게 아닙니다": 별도
                                CollapsibleSection이 아니라 이 탭 안에 그리드를
                                직접 붙인다(WebtoonCutGenerator.tsx의
                                WebtoonProductionCutGrid 참고) — "테스트 N"
                                카드의 "이미지 생성" 탭과 완전히 같은 모양.
                                key={threadId}로 대화가 바뀔 때마다 통째로
                                새로 마운트되게 해서(복원은 restoredCutImages
                                초기값으로 한 번만) 복잡한 리셋 로직 없이도
                                항상 그 대화 것만 보인다. */}
                            <div className="border-t ui-divider mt-2 pt-2">
                              <WebtoonProductionCutGrid
                                key={threadId ?? "draft"}
                                cuts={storyboard?.cuts ?? []}
                                wsOpen={wsOpen}
                                send={wsSend}
                                subscribe={subscribe}
                                productionModel={productionImageModel}
                                restoredImages={restoredCutImages}
                              />
                            </div>
                            <LatestPublishedContentLink channel="webtoon" urlPath="webtoon" label="최근 발행 웹툰 확인" />
                          </>
                        ),
                      },
                    ]}
                  />
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
            <WebtoonCutGenerator
              cuts={storyboard?.cuts ?? []}
              compact
              stickyTop={productionCardHeight}
              threadId={threadId}
              restoredImages={restoredCutImages}
              wsOpen={wsOpen}
              send={wsSend}
              subscribe={subscribe}
              onApplyModelToProduction={handleApplyImageModel}
              productionModel={productionImageModel}
              serverVersion={scriptServerVersion}
              promptHistory={promptHistory}
              testVersion={promptVersion}
              onTestVersionChange={setPromptVersion}
              onServerVersionChange={setScriptServerVersion}
              onPromptHistoryRefresh={refreshPromptHistory}
              category={PROMPT_CATEGORY}
              name={PROMPT_NAME}
            />
          </div>
        </div>
      </aside>
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
  copiedId,
  onCopy,
}: {
  msg: ChatMessage;
  copiedId: string | null;
  onCopy: (m: ChatMessage) => void;
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
            {msg.storyboard && <StoryboardCard data={msg.storyboard} />}
            {/* 2026-09-27, 사용자 요청 — "복사버튼 있으면 좋을것같고요..
                nova 서비스처럼": PromptTextLab.tsx와 동일한 위치·모양
                (답변 아래, 아이콘+라벨). storyboard(JSON 카드)만 있고
                text가 없는 메시지엔 복사할 평문이 없어 안 보여준다. */}
            {msg.id !== "greeting" && msg.text && (
              <button
                type="button"
                onClick={() => onCopy(msg)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
              >
                {copiedId === msg.id ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copiedId === msg.id ? "복사됨" : "복사"}
              </button>
            )}
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

/* 2026-09-20, 사용자 요청 — "스트리밍 중에도 이미 정리된 필드명으로
   보이게": 백엔드(routes/webtoon/script.py::normalize_cuts)는 전체
   JSON이 다 온 뒤에야 cut_id→cut, new_conclusion→narration, keyword→
   caption, headline→title, bubble_1/bubble_2→dialogue 같은 필드명
   정리를 한다. 스트리밍 중엔 위 tryParsePartialJson이 모델이 실제로
   쓰고 있는 원본 필드명(22장 스키마)을 그대로 돌려주므로, 스트리밍
   화면과 완성 후 storyboard 카드가 다른 필드명으로 보여 "다 쓰고 나서
   갑자기 정리된다"는 인상을 줬다(chat_ws.py::_stream_json_completion
   독스트링 참고 — 원래 의도된 설계였지만 사용자가 이 전환 자체를
   없애고 싶어함). 서버의 normalize_cuts()와 정확히 같은 규칙을
   여기서도 적용해 스트리밍 중에도 이미 정리된 필드명으로 보이게
   한다 — 서버 쪽 정규화는 그대로 둔다(최종 storyboard 메시지는 여전히
   서버가 만든다, 여긴 그 결과를 미리 보여주는 클라이언트 전용 거울). */
function liveCutNumber(c: Record<string, unknown>): number | null {
  const n = c["cut"];
  if (typeof n === "number") return n;
  const cutId = c["cut_id"] ?? c["id"];
  if (typeof cutId === "string") {
    const digits = cutId.replace(/\D/g, "");
    if (digits) return parseInt(digits, 10);
  }
  return null;
}

function liveFirstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function liveDialogueFromBubbles(c: Record<string, unknown>): unknown[] {
  const existing = c["dialogue"];
  if (Array.isArray(existing) && existing.length) return existing;
  const lines: { speaker: string; line: string }[] = [];
  for (const key of ["bubble_1", "bubble_2"] as const) {
    const b = c[key];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      const bo = b as Record<string, unknown>;
      const text = bo["text"];
      if (typeof text === "string" && text) {
        const speakerRaw = bo["speaker"];
        const speaker = speakerRaw === "female" ? "A" : speakerRaw === "male" ? "B" : key;
        lines.push({ speaker, line: text });
      }
    }
  }
  return lines;
}

function normalizeLiveCut(c: unknown): unknown {
  if (!c || typeof c !== "object" || Array.isArray(c)) return c;
  const co = c as Record<string, unknown>;
  return {
    cut: liveCutNumber(co),
    narration: liveFirstNonEmpty(co["narration"], co["new_conclusion"]),
    caption: liveFirstNonEmpty(co["caption"], co["keyword"]),
    closing_caption: (typeof co["closing_caption"] === "string" && co["closing_caption"]) || "",
    title: liveFirstNonEmpty(co["title"], co["headline"]),
    title_keyword: (typeof co["title_keyword"] === "string" && co["title_keyword"]) || "",
    dialogue: liveDialogueFromBubbles(co),
    image_prompt: (typeof co["image_prompt"] === "string" && co["image_prompt"]) || "",
  };
}

function normalizeLiveParsed(
  parsed: { value: unknown; inProgressPath: JsonPath } | null
): { value: unknown; inProgressPath: JsonPath } | null {
  if (!parsed) return null;
  const v = parsed.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) return parsed;
  const vo = v as Record<string, unknown>;
  if (!Array.isArray(vo["cuts"])) return parsed;
  return { value: { ...vo, cuts: vo["cuts"].map(normalizeLiveCut) }, inProgressPath: parsed.inProgressPath };
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
          // 2026-09-20, 사용자 요청 — "코드블럭 때문에 복잡해지네.. 대신
          // 선을 두거나 해서 구분하는 좀 더 간편한 방식으로": 배경+테두리
          // 박스(border-radius·padding·surface-sunken 배경)가 스트리밍 중
          // 필드 하나가 "미완성(평문)"에서 "완성(박스)"으로 바뀌는 순간
          // 박스가 갑자기 나타나며 레이아웃이 흔들리는 게 거슬렸다 — 박스
          // 대신 왼쪽 세로선 하나로만 코드 필드임을 표시한다(배경·둘레
          // 테두리·둥근 모서리 없음, 등장할 때 튀는 느낌이 훨씬 적다).
          // 모노스페이스 폰트는 코드 필드라는 걸 구분하는 용도로 유지.
          if (isCodeField && !isInProgress) {
            return (
              <div key={k}>
                <span className="font-semibold text-[var(--text-muted)]">{k}:</span>
                <pre
                  className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-2.5 font-mono text-[11px] leading-relaxed"
                  style={{ borderColor: "var(--border-hairline)" }}
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
/* 2026-09-20, 사용자 요청 — "답변 출력을 모두 마무리하고 깔끔한 디자인으로
   렌더링 하는 과정이 있는데 이 과정을 없애고 싶어요.. 처음 출력한 거
   그대로 가도록": 이 카드는 스트리밍이 끝난 뒤(storyboard 메시지 도착
   시점) 붙는 "완성본" 카드다. 1차로 컷마다 순차 fade-up 애니메이션
   (animationDelay: i*70ms)을 없앴는데도, 사용자가 스크린샷으로 "아직도
   디자인 입혀서 나온다"고 재지적 — "컷 N"이라는 라벨을 accent 색상
   굵은 글씨로 별도로 얹고 있던 게 남아있었다(실시간 스트리밍 중엔
   DumpNode가 배열을 그냥 나열만 하지 "컷 N" 헤더를 안 만든다 — 이
   컴포넌트가 완성 후에만 그 헤더를 "입혀서" 보여준 것). 이제 스트리밍
   중 보던 것과 완전히 같은 렌더러(DumpNode)에 같은 값을 그대로 넘긴다
   — 이 컴포넌트에 남는 건 DumpNode 호출 하나뿐이다. */
function StoryboardCard({ data }: { data: { coreQuestion: string; cuts: WebtoonStoryboardCut[]; testedVersion?: number | null } }) {
  return (
    <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
      {/* 2026-09-21 — 과거 버전으로 시험 발화한 결과인지 배지로 구분(A/B
          테스트 느낌, 사용자 요청). 채팅 기록을 스크롤해서 보면 어느 결과가
          최신 기준이고 어느 게 과거 버전 테스트였는지 헷갈릴 수 있어서. */}
      {data.testedVersion != null && (
        <span
          className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          v{data.testedVersion}로 시험 발화
        </span>
      )}
      <DumpNode value={data} />
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

