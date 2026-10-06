"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import type { BubbleLayout, PromptHistoryEntry, WebtoonStoryboardCut } from "@/lib/types";
import { IMAGE_MODELS } from "@/lib/webtoonImageModels";
import { CustomSelect } from "@/components/CustomSelect";
import { BubbleEditorModal } from "./BubbleEditorModal";
import { WebtoonPreviewModal } from "./WebtoonPreviewModal";
import { CollapsibleSection } from "../PromptChatLab/CollapsibleSection";
import { PromptVersionReference, type PromptVersionReferenceHandle } from "../PromptChatLab/PromptVersionReference";
import { ApplyReviewModal } from "../PromptChatLab/ApplyReviewModal";
import { StepTabs } from "../PromptChatLab/StepTabs";

/* 이미지 생성 패널(2026-09-16 신설, 같은 날 두 번 다시 설계) — 텍스트
   페이지(PromptChatLab) 우측에 상시 붙는다.

   2026-09-16 사용자 요청 세 가지가 지금 모양을 결정했다:
   1) "이미지 컷 부분이 미리 이렇게 사각형으로 위치되면 좋을 듯... 저희
      서비스에 들어가는 화면 구성처럼 크기 비율을 맞추고요" — 구글 Flow
      참고 스크린샷처럼 카드가 격자로 미리 자리잡혀 있어야 한다. 실제
      발행 웹툰 컷 비율(4:5 세로, pipelines/webtoon/README.md 참고)을
      그대로 쓴다.
   2) "2단계를 꼭 하지 않더라도. 언제든지 이미지 부분에 프롬프트 넣고
      출력될 수 있도록요" — 스토리보드(2단계) 유무와 무관하게 8칸이
      항상 떠 있고, 아무 칸에나 프롬프트를 직접 써서 바로 생성할 수
      있어야 한다.
   3) "자동으로 채워지지 않으면 좋겠는데요... 사용자가 직접 복붙하면
      좋겠어요, 헷갈려서" — 처음엔 storyboard(cuts prop)가 오면 camera+
      scene을 프롬프트 칸에 자동으로 채워줬는데, 뭐가 자동으로 들어와
      있는 건지 헷갈린다는 피드백으로 되돌렸다. 이제 프롬프트 칸은
      항상 빈 채로 시작하고, 사용자가 왼쪽 채팅의 장면 연출 텍스트를
      직접 복사해 붙여넣어야 한다.

   그래서 슬롯(컷)은 한 "테스트" 안에서 항상 8개 고정이고 프롬프트는
   항상 빈 채로 시작한다. storyboard(cuts prop)가 들어오면 narration/
   caption/dialogue 같은 말풍선·캡션용 메타데이터만 컷 번호로 조용히
   매칭해 들고 있다가 생성 요청에 실어 보낸다(compose_text.py가 이걸로
   말풍선을 그린다) — 화면에 보이는 프롬프트 텍스트는 건드리지 않는다.
   storyboard와 매칭 안 되는 슬롯(사용자가 순수하게 직접 채운 슬롯)은
   그 메타데이터가 비어 있어 배경 이미지만 나온다(대사가 없으니 당연한
   동작 — 구글 Flow처럼 순수 프롬프트→이미지 도구로 쓰는 셈).

   전송은 기존 WebSocket kind="cut_image"(routes/chat_ws.py::
   _run_cut_image_flow)를 그대로 재사용 — 새 백엔드 엔드포인트 없음.
   슬롯마다 완전히 독립된 요청이라 8컷을 한 Lambda invocation에
   몰아넣다 타임아웃 나던 문제(2026-09-16 실제로 겪음) 자체가 없다.

   2026-09-25 — GPU 상태 배지·"GPU 끄기" 버튼·인물/화풍 고정 체크박스를
   전부 뗐다. 사용자 지적: "인물/화풍 고정은 지금 없는거 아닌가요?" —
   맞는 말이었다. 이 두 토글은 모델이 "pipeline"(GPU IP-Adapter + Style
   Transfer)일 때만 의미가 있었는데, IMAGE_MODELS에서 pipeline 자체를
   뺐다(webtoonImageModels.ts 참고 — 발행 문서에 IMAGE_MODEL이 없어 실제
   자동발행이 이미 sd_ultra로 떨어지고 있었고, pipeline이 실제로 발행된
   적이 없어 "지원 가능"과 "지금 쓰임"을 착각했던 판단이었다). 이 화면이
   pipeline을 고를 방법 자체가 없어지니 GPU 기동 요청(gpu_start/gpu_stop)·
   대기열(pendingAfterGpuRef)도 전부 죽은 코드였다.

   2026-09-25(후속) — 중간 칼럼과 우측 설정 칼럼을 하나로 합치면서
   "결과값 — 컷 이미지"라는 이름을 썼는데, 팟캐스트·영상 탭(VoicePreviewGenerator/
   VideoCardGenerator)은 같은 자리를 "테스트"라 부른다는 지적("토글
   구조의 워딩이 다르다")을 받고 통일했다.

   2026-09-26 — "테스트" 토글을 열면 8컷이 한 번에 다 보여서, 8컷
   전체에 대한 여러 번의 시도(1차 시도, 2차 시도)를 비교하기 어렵다는
   지적("웹툰 8컷에 대한 첫번째 테스트, 두번째 테스트를 하고자 하며...
   다른 탭들의 토글구조와 동일하게 테스트 토글을 열면 테스트 1 토글,
   테스트 2 토글이 나와야") — 팟캐스트·영상의 "테스트 N" 카드 패턴을
   그대로 들여왔다: 이 컴포넌트가 스스로 "테스트" CollapsibleSection을
   그리고(그 두 컴포넌트와 동일하게 부모가 바깥에서 또 감싸지 않는다),
   그 안에 "테스트 1"/"테스트 2"... 카드가 "+추가"로 늘어나며, 카드마다
   독립된 8컷 세트를 갖는다. 스토리보드 메타데이터(narration 등)는
   컷 "번호"에 매칭되는 것이지 어느 테스트냐와 무관해서, cuts prop이
   바뀌면 모든 테스트의 같은 번호 슬롯에 동시에 매칭한다. */

const SLOT_COUNT = 8;

interface SlotState {
  /** 1~8 고정 — storyboard 컷 번호와도 이 값으로 맞춘다. */
  index: number;
  prompt: string;
  /** true면 사용자가 프롬프트를 직접 고쳤다는 뜻 — storyboard가 나중에
   *  (다시) 도착해도 이 슬롯은 자동으로 덮어쓰지 않는다. */
  dirty: boolean;
  /** storyboard에서 온 컷이면 원본을 들고 있다가 생성 요청에 그대로
   *  실어 보낸다(narration/caption/dialogue 등 — 말풍선 합성용). 사용자가
   *  직접 채운 순수 프롬프트 슬롯이면 null. */
  sourceCut: WebtoonStoryboardCut | null;
  status: "idle" | "pending" | "done" | "error";
  imageUrl: string | null;
  /** 글자 없는 원본 그림(말풍선 편집이 이 위에 다시 합성). 이번 세션에서 생성한 컷만 있다(저장본 복원분엔 없음). */
  bgUrl?: string | null;
  /** 실제로 그려진 말풍선 위치(말풍선 편집 손잡이의 시작 위치) */
  layout?: BubbleLayout[] | null;
  error: string | null;
}

interface TestState {
  /** WS 요청("cut_image" payload의 test_id)·저장(imagePreview.testId) 둘
   *  다에 실려 서버 응답이 어느 테스트의 어느 컷인지 구분하는 키. */
  id: string;
  /** 2026-09-26 — 컷마다 따로 있던 모델 선택을 카드 하나당 하나로 합쳤다
   *  (사용자 지적: "이 모델을 프로덕션에 적용이 8개로 각각 있는데 이러면
   *  안될듯요... 일괄 적용으로 해야지" — 실제 발행도 8컷 전체가 모델
   *  하나를 공유하는데, 컷마다 다른 모델을 실험하게 해두면 "이 모델을
   *  프로덕션에 적용"이 8번 반복되고 어느 걸 눌러야 할지도 애매해진다.
   *  팟캐스트/영상처럼 카드 전체가 공유하는 값 하나 + "프로덕션에 적용"
   *  버튼 하나로 통일 — 여러 모델을 비교하고 싶으면 "+ 테스트 추가"로
   *  카드를 하나 더 만들어 그 카드는 다른 모델로 8컷을 돌리면 된다. */
  model: string;
  /** 말풍선 얼굴 회피(Rekognition) — 이 테스트 카드가 쓸 값. 새 테스트는 프로덕션 값으로 시작한다. */
  bubbleDetect: boolean;
  /** 웹툰식 말풍선(타원·얇은 선·위쪽 흰 여백) */
  bubbleStyle: boolean;
  slots: Record<number, SlotState>;
}

/* 2026-09-21, 사용자 요청 — "이미지들을 일괄적으로나 개별적으로나
   다운로드 가능한 버튼이라도 넣으면 좋을듯": 처음엔 <a download>으로
   트리거만 했다("크로스오리진이라도 대부분 브라우저가 download 속성을
   존중한다"고 가정) — 그런데 실측해보니 틀렸다: 이 버킷 CORS가 PUT만
   허용해서(업로드 전용) fetch()로 blob을 못 읽는 건 예상대로였지만,
   <a download> 속성 자체도 크로스오리진 URL에서는 대부분 브라우저가
   무시해서 그냥 새 탭에 이미지가 열리기만 했다(사용자 리포트: "다운로드
   버튼을 클릭하면 실제로 이미지가 다운로드가 되면 좋겠습니다").
   2026-09-26 — adminApi.getMediaDownloadUrl()이 발급하는 presigned GET
   URL로 바꿨다 — 그 URL 자체에 ResponseContentDisposition이 실려 있어서
   S3가 응답 헤더로 다운로드를 강제한다(CORS·<a download> 둘 다 필요
   없음, admin/backend/routes/media.py::handle_download_url 참고). */
async function downloadImage(url: string, filename: string) {
  try {
    const { download_url } = await adminApi.getMediaDownloadUrl(url, filename);
    const a = document.createElement("a");
    a.href = download_url;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("다운로드 URL 발급 실패", err);
  }
}

function _emptySlot(index: number): SlotState {
  return {
    index,
    prompt: "",
    dirty: false,
    sourceCut: null,
    status: "idle",
    imageUrl: null,
    error: null,
  };
}

function _emptySlots(cuts: WebtoonStoryboardCut[]): Record<number, SlotState> {
  const initial: Record<number, SlotState> = {};
  for (let i = 1; i <= SLOT_COUNT; i++) initial[i] = _emptySlot(i);
  for (const cut of cuts) {
    if (initial[cut.cut]) initial[cut.cut] = { ...initial[cut.cut], sourceCut: cut };
  }
  return initial;
}

function _newTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function _emptyTest(cuts: WebtoonStoryboardCut[], bubbleDetect = false, bubbleStyle = false): TestState {
  return { id: _newTestId(), model: IMAGE_MODELS[0].id, bubbleDetect, bubbleStyle, slots: _emptySlots(cuts) };
}

export function WebtoonCutGenerator({
  cuts,
  compact = false,
  stickyTop = 0,
  threadId = null,
  restoredImages,
  wsOpen,
  send,
  subscribe,
  onApplyModelToProduction,
  productionBubbleDetect = false,
  productionBubbleStyle = false,
  productionModel,
  serverVersion,
  promptHistory,
  testVersion,
  onTestVersionChange,
  onServerVersionChange,
  onPromptHistoryRefresh,
  category,
  name,
}: {
  cuts: WebtoonStoryboardCut[];
  /** true면 텍스트 페이지 우측 레일에 끼워 넣는 좁은 레이아웃(2열) —
   *  false(기본)면 넓은 화면 전체를 쓰는 그리드(별도 페이지/전체 화면용). */
  compact?: boolean;
  /** 2026-09-27 — 사용자 지적: "테스트 추가 부분.. 고정해야겠네.. 스크롤
   *  내리면 사라지네": "테스트" 경계 띠를 sticky로 고정하되, 그 위에
   *  이미 sticky인 프로덕션 카드(높이가 접힘/펼침·드래그로 계속 바뀜)와
   *  겹치지 않으려면 그 카드의 실측 높이만큼 아래로 내려서 붙여야 한다 —
   *  부모(PromptChatLab.tsx)가 ResizeObserver로 잰 값을 그대로 넘긴다. */
  stickyTop?: number;
  /** 2026-09-24 — 지금 열려있는 대화 스레드 id(부모가 useChatLabThread로
   *  들고 있는 값 그대로). 이게 바뀌면(다른 대화를 열거나 "새 대화") 이
   *  화면의 테스트 목록을 전부 리셋하고 restoredImages로 다시 채운다 —
   *  사용자 지적: "대화 하고 나갔다 오면... 웹툰 등... 사라지는데...
   *  나머지들도 다 남으면 좋지." threadId를 안 주면(다른 화면에서 재사용
   *  시) 리셋 로직 자체가 안 켜진다(기본값 null, prevThreadId와 항상
   *  같아서 effect가 안 도는 것과 동일 — 기존 동작 그대로 유지). */
  threadId?: number | null;
  /** 테스트 id → 컷 번호 → 이 대화에서 이미 생성해둔 이미지. openThread가
   *  저장된 imagePreview 메시지들을 testId별로 모아 내려준다(PromptChatLab.tsx
   *  참고). 2026-09-26 — 테스트가 여러 개로 늘어나면서 컷 번호 하나만으론
   *  키가 부족해졌다(테스트 여러 개가 같은 번호를 동시에 쓸 수 있음). */
  restoredImages?: Record<string, Record<number, { imageUrl: string; model?: string }>>;
  /** 소켓 연결 자체는 부모(PromptChatLab)가 useAdminChatSocket()으로 한 번만
   *  만들어 내려준다 — 2026-09-16 리팩토링 감사, 이 컴포넌트가 따로
   *  WebSocket을 열면 같은 화면에 소켓이 2개가 된다(그 훅 docstring 참고). */
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고...
   *  테스트 카드에서 적용할 수 있게": "테스트 N" 카드 레벨의 통합
   *  "프로덕션에 적용" 버튼이 부른다 — 값만 채우는 게 아니라 그 자리에서
   *  바로 이미지 모델을 발행까지 한다(WebtoonImageSettingsPanel.tsx::
   *  applyAndPublish). Promise를 돌려줘야 프롬프트 버전 활성화와 함께
   *  묶어 기다릴 수 있다. */
  onApplyModelToProduction?: (model: string, bubbleDetect: boolean, bubbleStyle: boolean) => Promise<void>;
  productionBubbleStyle?: boolean;
  /** 프로덕션에 발행돼 있는 말풍선 얼굴 회피 값 */
  productionBubbleDetect?: boolean;
  /** 2026-09-26(후속), 사용자 지적 — "테스트 카드도 마찬가지"(프로덕션
   *  카드에 이어): 지금 실제 발행된 이미지 모델 — 카드의 프롬프트 버전과
   *  모델이 둘 다 이미 이 값과 같으면 "프로덕션에 적용"이 no-op이라
   *  비활성화한다. 아직 안 불러왔으면(null) 판단을 보류하고 버튼을
   *  켜둔다(모른다고 임의로 막지 않음). */
  productionModel: string | null;
  /** 2026-09-26, 최종 형태 — VoicePreviewGenerator.tsx와 동일 원칙(카드마다
   *  독립된 프롬프트 편집 초안, PromptVersionReference.tsx 참고). */
  serverVersion: number | null;
  promptHistory: PromptHistoryEntry[];
  testVersion: number | null;
  onTestVersionChange: (version: number | null) => void;
  onServerVersionChange: (version: number) => void;
  onPromptHistoryRefresh: () => void;
  category: string;
  name: string;
}) {
  const [tests, setTests] = useState<TestState[]>(() => [_emptyTest(cuts)]);
  // 말풍선 편집 모달 대상(2026-10-02)
  const [editing, setEditing] = useState<{ testId: string; slotIndex: number } | null>(null);
  // 실제 화면 미리보기 모달 대상(테스트 카드 id)
  const [previewTestId, setPreviewTestId] = useState<string | null>(null);
  // 2026-09-26, 사용자 지적 — "테스트 카드에 해당 테스트에서 어떤 버전을
  // 활성화 했는지 미리보기처럼 있으면... 지금 테스트 1, 테스트 2 이런식
  // 으로만 되어있으니 정보가 부족": 각 카드의 PromptVersionReference가
  // 지금 로드해 둔 버전을 여기 모아, 토글을 펼치지 않아도 "테스트 N"
  // 헤더에서 바로 보이게 한다(카드별 독립 상태라 testId로 키를 잡는다).
  const [activeInfos, setActiveInfos] = useState<Record<string, { version: number; label: string | null } | null>>({});
  // 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
  // 이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고... 테스트
  // 카드에서 적용할 수 있게": 카드마다 PromptVersionReference의 활성화
  // 능력(activateIfNeeded)을 ref로 붙잡아뒀다가, 카드 레벨의 "프로덕션에
  // 적용" 버튼이 프롬프트 버전+이미지 모델을 한 번에 적용한다.
  const promptRefs = useRef<Record<string, PromptVersionReferenceHandle | null>>({});
  const handleApplyTestToProduction = async (t: TestState) => {
    await promptRefs.current[t.id]?.activateIfNeeded();
    await onApplyModelToProduction?.(t.model, t.bubbleDetect, t.bubbleStyle);
  };
  // 2026-09-26 — window.confirm 한 줄짜리 확인을 검토 모달로 교체(사용자
  // 요청: "현재 설정한 것들 최종적으로 검토를 하도록 하고, 해당 테스트에서
  // 출력된 결과도 같이 보면서 검토하도록"). id만 들고 있다가 tests에서
  // 매번 다시 찾아써서, 모달이 열려 있는 동안 컷이 마저 완성돼도 미리보기가
  // 최신 상태를 반영한다.
  const [reviewTestId, setReviewTestId] = useState<string | null>(null);
  const reviewingTest = tests.find((t) => t.id === reviewTestId) ?? null;

  // 2026-09-24 — 대화가 바뀌면(threadId 변경) 테스트 목록을 전부 리셋하고
  // 그 대화에 저장된 이미지(restoredImages)로 다시 채운다. cuts 동기화
  // 블록(바로 아래)보다 먼저 와야 한다 — 같은 렌더에서 cuts도 같이
  // 바뀌는 게 정상 케이스(대화를 열면 storyboard도 같이 갱신)인데,
  // setTests는 함수형 업데이트라 같은 배치 안에서 순서대로 이어지므로
  // 이 블록이 나중에 오면 방금 cuts 블록이 채운 sourceCut까지 지워버린다.
  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    setTests(() => {
      // "production" 키는 여기서 뺀다 — 그 산출물은 이제 이 컴포넌트가
      // 아니라 프로덕션 카드 자체(WebtoonProductionCutGrid, PromptChatLab.tsx
      // "이미지 설정" 탭 안)가 관리한다. 같은 restoredImages를 공유해서
      // 저장돼 있을 순 있지만, 여기 "테스트 N" 번호 매김에는 안 섞는다.
      const entries = (restoredImages ? Object.entries(restoredImages) : []).filter(([testId]) => testId !== "production");
      if (entries.length === 0) return [_emptyTest(cuts, productionBubbleDetect, productionBubbleStyle)];
      return entries.map(([testId, cutMap]) => {
        const slots = _emptySlots(cuts);
        for (let idx = 1; idx <= SLOT_COUNT; idx++) {
          const restored = cutMap[idx];
          if (restored) {
            slots[idx] = {
              ...slots[idx],
              status: "done",
              imageUrl: restored.imageUrl,
            };
          }
        }
        return { id: testId, model: IMAGE_MODELS[0].id, bubbleDetect: productionBubbleDetect, bubbleStyle: productionBubbleStyle, slots };
      });
    });
  }

  // storyboard(cuts prop)가 나중에 도착하거나 다시 바뀌면 모든 테스트의
  // 해당 번호 슬롯에 말풍선·캡션 메타데이터(sourceCut)만 조용히
  // 매칭한다 — 화면에 보이는 프롬프트 텍스트는 건드리지 않는다(사용자가
  // 직접 복붙, 위 모듈 docstring 3번 참고). 렌더 중 비교해서 반영한다
  // (useEffect 안에서 setState하면 캐스케이드 리렌더가 생겨 린트가
  // 막는다 — React의 "prop 바뀔 때 상태 맞추기" 패턴).
  //
  // 2026-09-20 — 예전엔 dirty(사용자가 손으로 고친 슬롯)나 status!=="idle"
  // (생성 중/완료/에러)인 슬롯은 매칭을 건너뛰었다. 의도는 "텍스트를
  // 덮어쓰지 않겠다"였는데, 실제로는 sourceCut 갱신이 텍스트를 전혀
  // 안 건드리는데도 메타데이터 자체가 영영 안 붙는 부작용이 있었다 —
  // 같은 세션에서 먼저 테스트해 dirty/done 상태가 된 슬롯에 새 기사의
  // 스크립트를 다시 생성하면, 그 슬롯만 조용히 narration이 안 붙는 채로
  // 남았다(사용자가 실제로 겪음: 8컷 중 4개만 자막이 안 나옴). sourceCut은
  // 매번 최신으로 갱신해도 안전하다 — 프롬프트 텍스트도, 이미 보낸 생성
  // 요청도 안 건드리기 때문이다(sendGenerate가 클릭 시점 sourceCut을
  // 그대로 페이로드에 복사해 보내므로, 이후 sourceCut이 바뀌어도 이미
  // 전송된 요청엔 영향 없다).
  const [prevCuts, setPrevCuts] = useState(cuts);
  if (cuts !== prevCuts) {
    setPrevCuts(cuts);
    setTests((prev) =>
      prev.map((t) => {
        const nextSlots = { ...t.slots };
        for (const cut of cuts) {
          const existing = nextSlots[cut.cut];
          if (!existing) continue;
          nextSlots[cut.cut] = { ...existing, sourceCut: cut };
        }
        return { ...t, slots: nextSlots };
      })
    );
  }

  // 2026-09-26, 사용자 요청 — "이미지 컷별로 하나하나 복붙해서 넣기가
  // 귀찮은데... 일괄적으로 붙여넣어지거나 채워지게 하면 좀 효율적일 것
  // 같아요": 원래(위 sourceCut 갱신 블록 주석 참고) 스토리보드가 도착해도
  // 프롬프트 텍스트 칸은 일부러 안 건드렸다(사용자 손 편집을 조용히
  // 덮어쓰지 않으려는 안전장치) — 그 원칙은 유지하되, 명시적으로 누르는
  // 버튼 하나를 추가해서 "아직 비어있는 칸만" 그 컷의 image_prompt로
  // 채운다(이미 뭔가 써둔 칸은 안 건드림 — 여러 번 눌러도 안전).
  const fillPromptsFromStoryboard = (testId: string) => {
    setTests((prev) =>
      prev.map((t) => {
        if (t.id !== testId) return t;
        const nextSlots = { ...t.slots };
        for (const idx of Object.keys(nextSlots).map(Number)) {
          const slot = nextSlots[idx];
          if (slot.prompt.trim() || !slot.sourceCut) continue;
          nextSlots[idx] = { ...slot, prompt: slot.sourceCut.image_prompt };
        }
        return { ...t, slots: nextSlots };
      })
    );
  };

  const addTest = () => setTests((prev) => [...prev, _emptyTest(cuts, productionBubbleDetect, productionBubbleStyle)]);
  const setTestBubbleStyle = (testId: string, on: boolean) =>
    setTests((prev) => prev.map((t) => (t.id === testId ? { ...t, bubbleStyle: on } : t)));
  const setTestBubbleDetect = (testId: string, on: boolean) =>
    setTests((prev) => prev.map((t) => (t.id === testId ? { ...t, bubbleDetect: on } : t)));
  const removeTest = (testId: string) =>
    setTests((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== testId) : prev));
  const setTestModel = (testId: string, model: string) =>
    setTests((prev) => prev.map((t) => (t.id === testId ? { ...t, model } : t)));

  const sendGenerate = (testId: string, slotIndex: number) => {
    setTests((prev) =>
      prev.map((t) => {
        if (t.id !== testId) return t;
        const s = t.slots[slotIndex];
        if (!s) return t;
        const base = s.sourceCut;
        const cutPayload = {
          cut: slotIndex,
          test_id: testId,
          narration: base?.narration ?? "",
          caption: base?.caption ?? "",
          dialogue: base?.dialogue ?? [],
          title: base?.title ?? "",
          title_keyword: base?.title_keyword ?? "",
          closing_caption: base?.closing_caption ?? "",
          camera: "",
          scene: s.prompt,
          bubble_detect: t.bubbleDetect,
          bubble_webtoon: t.bubbleStyle,
        };
        // send()가 소켓 상태 확인과 32KB 프레임 크기 가드를 둘 다 내부에서
        // 처리한다(useAdminChatSocket 참고) — 반환값을 확인 안 하면 슬롯이
        // "생성 중"에 영원히 멈춘다.
        const result = send("cut_image", { cut: cutPayload, model: t.model });
        if (!result.sent) {
          const error = result.tooLarge
            ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
            : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
          return { ...t, slots: { ...t.slots, [slotIndex]: { ...s, status: "error", error } } };
        }
        return { ...t, slots: { ...t.slots, [slotIndex]: { ...s, status: "pending", error: null } } };
      })
    );
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "cut_image") {
        const m = msg as unknown as { cut: number; test_id?: string; image_url: string; bg_url?: string; layout?: BubbleLayout[] };
        setTests((prev) =>
          prev.map((t) =>
            t.id === m.test_id && t.slots[m.cut]
              ? { ...t, slots: { ...t.slots, [m.cut]: { ...t.slots[m.cut], status: "done", imageUrl: m.image_url, bgUrl: m.bg_url ?? null, layout: m.layout ?? null, error: null } } }
              : t
          )
        );
      } else if (msg.type === "cut_image_error") {
        const m = msg as unknown as { cut: number; test_id?: string; error: string };
        setTests((prev) =>
          prev.map((t) =>
            t.id === m.test_id && t.slots[m.cut]
              ? { ...t, slots: { ...t.slots, [m.cut]: { ...t.slots[m.cut], status: "error", error: m.error } } }
              : t
          )
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTests는 함수형 갱신만 쓰므로 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const handleGenerate = (testId: string, slotIndex: number) => {
    const t = tests.find((x) => x.id === testId);
    const s = t?.slots[slotIndex];
    if (!s || !s.prompt.trim()) return;
    sendGenerate(testId, slotIndex);
  };

  // 전체 다운로드 — 컷 순서대로 이름을 붙여(컷1.png ~ 컷8.png) zip 하나로 받는다(2026-10-02, 낱장 8번 다운로드를 대체).
  const handleDownloadAll = async (t: TestState) => {
    const doneSlots = Object.values(t.slots)
      .filter((s) => s.status === "done" && s.imageUrl)
      .sort((a, b) => a.index - b.index);
    if (doneSlots.length === 0) return;
    const testNo = tests.findIndex((x) => x.id === t.id) + 1;
    try {
      const { download_url } = await adminApi.createMediaZip(
        doneSlots.map((s) => ({ url: s.imageUrl as string, name: `컷${s.index}.png` })),
        `웹툰_테스트${testNo}.zip`
      );
      const a = document.createElement("a");
      a.href = download_url;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("전체 다운로드 실패", err);
    }
  };

  /** 모델 선택 행 + 8컷 그리드 — "테스트 N" 카드마다 이 UI를 쓴다.
   *  WebtoonProductionCutGrid(아래, 프로덕션 카드 "이미지 설정" 탭 전용)도
   *  독립적으로 같은 모양을 그린다 — "프로덕션 카드랑 테스트 카드 형태를
   *  동일하게 하면 됨"(사용자 요청). 두 컴포넌트가 자기 state를 각자
   *  갖고 있어서(테스트는 배열, 프로덕션은 단일 슬롯 세트) 완전한 코드
   *  공유 대신 같은 마크업 패턴만 따로 유지한다 — 상태 모델이 달라 억지로
   *  합치면 오히려 두 군데 다 복잡해진다. */
  const renderModelAndGrid = (t: TestState) => (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2 pt-2">
        <span className="text-[10.5px] text-[var(--text-faint)]">모델</span>
        <CustomSelect
          value={t.model}
          onChange={(v) => setTestModel(t.id, v)}
          options={IMAGE_MODELS.map((m) => ({
            value: m.id,
            label: m.shortLabel ?? m.label,
            badge: m.badge,
            muted: m.notInUse,
          }))}
        />
        <button
          type="button"
          onClick={() => fillPromptsFromStoryboard(t.id)}
          disabled={cuts.length === 0}
          title="스토리보드가 만든 컷별 프롬프트를 빈 칸에 한 번에 채웁니다(이미 쓴 칸은 그대로 둠)"
          className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-40"
        >
          스토리보드에서 채우기
        </button>
        <label
          className="flex cursor-pointer items-center gap-1 text-[10.5px] text-[var(--text-secondary)]"
          title="켜면 AWS Rekognition으로 인물·얼굴 위치를 찾아 말풍선이 얼굴을 덮지 않게 놓고 꼬리를 화자 쪽으로 맞춥니다(컷당 약 $0.002)"
        >
          <input
            type="checkbox"
            checked={t.bubbleDetect}
            onChange={(e) => setTestBubbleDetect(t.id, e.target.checked)}
            className="cursor-pointer"
          />
          말풍선 얼굴 회피
        </label>
        <label
          className="flex cursor-pointer items-center gap-1 text-[10.5px] text-[var(--text-secondary)]"
          title="켜면 얇은 선의 타원 말풍선을 컷 위쪽 흰 여백에 놓습니다(네이버 웹툰 방식). 컷이 세로로 길어집니다"
        >
          <input
            type="checkbox"
            checked={t.bubbleStyle}
            onChange={(e) => setTestBubbleStyle(t.id, e.target.checked)}
            className="cursor-pointer"
          />
          웹툰식 말풍선
        </label>
      </div>
      <div className={`grid gap-3 px-3.5 pb-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"}`}>
        {Object.values(t.slots)
          .sort((a, b) => a.index - b.index)
          .map((s) => (
            <div key={s.index} className="ui-card flex flex-col gap-1.5 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--text-primary)]">컷 {s.index}</span>
                <div className="flex items-center gap-1.5">
                  {s.status === "pending" && <span className="text-[10px] text-[var(--text-muted)]">생성 중</span>}
                  {s.sourceCut && <span className="text-[10px] text-[var(--text-faint)]">스토리보드</span>}
                  {s.status === "done" && s.imageUrl && s.bgUrl && s.layout && s.layout.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditing({ testId: t.id, slotIndex: s.index })}
                      className="rounded px-1 py-0.5 text-[10px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-card)]"
                      title="말풍선 위치·대사·모양 편집(이미지 재생성 없음, 비용 없음)"
                    >
                      말풍선 편집
                    </button>
                  )}
                  {s.status === "done" && s.imageUrl && (
                    <button
                      type="button"
                      onClick={() => downloadImage(s.imageUrl as string, `cut-${s.index}.png`)}
                      className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                      title="이 컷 다운로드"
                      aria-label="이 컷 다운로드"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`aspect-[3/2] w-full overflow-hidden rounded-lg ${
                  s.status === "idle"
                    ? "border border-dashed border-[var(--border-hairline)] bg-[var(--surface-card)]"
                    : "bg-[var(--surface-sunken)]"
                }`}
              >
                {s.status === "done" && s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 동적 URL, next/image 도메인 등록 불필요한 실험 화면
                  <img src={s.imageUrl} alt={`컷 ${s.index}`} className="h-full w-full object-contain" />
                ) : s.status === "pending" ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="ui-spinner h-5 w-5" />
                  </div>
                ) : s.status === "error" ? (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-[var(--danger)]">
                    {s.error}
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-[var(--text-faint)]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    비어 있음
                  </div>
                )}
              </div>

              <textarea
                className="ui-input min-h-[56px] resize-y rounded-md text-[11px]"
                placeholder="왼쪽 장면 연출 텍스트를 복사해 붙여넣으세요"
                value={s.prompt}
                onChange={(e) => {
                  const value = e.target.value;
                  setTests((prev) =>
                    prev.map((tt) =>
                      tt.id === t.id
                        ? { ...tt, slots: { ...tt.slots, [s.index]: { ...tt.slots[s.index], prompt: value, dirty: true } } }
                        : tt
                    )
                  );
                }}
              />

              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={s.status === "pending" || !wsOpen || !s.prompt.trim()}
                onClick={() => handleGenerate(t.id, s.index)}
              >
                생성
              </button>
            </div>
          ))}
      </div>
    </>
  );

  return (
    <>
      {/* 2026-09-26 — "테스트" 묶음 토글 자체를 없앴다(VoicePreviewGenerator.tsx/
          VideoCardGenerator.tsx와 동일 이유·동일 결정, 그 파일 주석 참고). */}
      {/* 2026-09-27(후속) — 사용자 지적: "이렇게 펼치면.. 구분이 어려울 수
          있어서.. 테스트 추가 부분을 배경 색을 주면 구분이 좀 더 괜찮을지도":
          테두리 하나로는 내용이 길어져 펼쳤을 때(프로덕션·테스트 둘 다
          펼친 상태) 경계가 묻힌다 — 선 대신(혹은 겸해서) 옅은 회색 배경
          띠로 만들고, "테스트" 라벨을 왼쪽에 둬 이 지점부터 테스트
          섹션이라는 걸 명확히 한다. "+ 테스트 추가" 버튼도 이 띠 안에
          자연스럽게 속하니 "이게 프로덕션 건가 테스트 건가" 모호함도
          같이 없어진다. */}
      <div
        className="sticky z-10 flex items-center justify-between border-b px-2.5 py-1.5"
        style={{ top: stickyTop, background: "var(--surface-sunken)", borderColor: "var(--border-hairline)" }}
      >
        <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">테스트</span>
        <button
          type="button"
          onClick={addTest}
          className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          + 테스트 추가
        </button>
      </div>
      {/* 2026-09-27(후속) — "여백 틈 자체가 없는 디자인.. 카드처럼
          하지말구.. 그림자도 필요없고요": 간격을 줄이는 대신 아예
          없앴다. 각 테스트도 "떠있는 카드"가 아니라 border-b 헤어라인
          으로만 구분되는 섹션이다(PromptChatLab.tsx 프로덕션 카드와
          동일 원칙, 그 파일 주석 참고). */}
      <div>
        {tests.map((t, ti) => {
          const orderedSlots = Object.values(t.slots).sort((a, b) => a.index - b.index);
          const doneCount = orderedSlots.filter((s) => s.status === "done" && s.imageUrl).length;
          // 2026-09-26(후속), 사용자 지적 — "테스트 카드도 마찬가지": 이
          // 카드가 지금 프로덕션과 완전히 같은 상태(같은 프롬프트 버전 +
          // 같은 이미지 모델)면 "프로덕션에 적용"은 no-op이라 비활성화.
          const info = activeInfos[t.id];
          const unchanged =
            info != null &&
            serverVersion !== null &&
            info.version === serverVersion &&
            productionModel !== null &&
            t.model === productionModel &&
            t.bubbleDetect === productionBubbleDetect &&
            t.bubbleStyle === productionBubbleStyle;
          return (
            <div key={t.id} className="overflow-hidden border-b bg-[var(--surface-card)]" style={{ borderColor: "var(--border-hairline)" }}>
            <CollapsibleSection
              title={`테스트 ${ti + 1}`}
              titleExtra={
                activeInfos[t.id] ? (
                  <span
                    className="flex-none truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={
                      testVersion === activeInfos[t.id]!.version
                        ? { background: "var(--accent-soft)", color: "var(--accent)" }
                        : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                    }
                    title={testVersion === activeInfos[t.id]!.version ? "채팅에서 사용 중인 버전" : "이 카드에 로드된 버전"}
                  >
                    v{activeInfos[t.id]!.version}
                    {activeInfos[t.id]!.label ? ` · ${activeInfos[t.id]!.label}` : ""}
                  </span>
                ) : undefined
              }
              badge={
                <div className="flex items-center gap-1.5">
                  {/* 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도
                      프로덕션 적용, 이미지 생성 컷에서도 프로덕션 적용
                      이렇게 따로 있는게 아니고... 테스트 카드에서 적용할
                      수 있게, 테스트 1 카드에서 바로 보이게": 이 카드
                      전체(프롬프트 버전 + 이미지 모델)를 한 번에
                      프로덕션에 적용하는 유일한 버튼. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setReviewTestId(t.id);
                    }}
                    disabled={unchanged}
                    title={unchanged ? "이미 프로덕션과 같은 버전·모델입니다" : undefined}
                    className="ui-btn ui-btn-primary rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-50"
                  >
                    프로덕션에 적용
                  </button>
                  {doneCount > 0 && (
                    <span className="text-[10.5px] font-medium text-[var(--text-faint)]">완료 {doneCount}/{SLOT_COUNT}</span>
                  )}
                  {doneCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setPreviewTestId(t.id);
                      }}
                      className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[10.5px] font-semibold"
                      title="생성한 컷을 실제 서비스 화면처럼 이어서 보기"
                    >
                      미리보기
                    </button>
                  )}
                  {doneCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDownloadAll(t);
                      }}
                      className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[10.5px] font-semibold"
                    >
                      전체 다운로드
                    </button>
                  )}
                  {tests.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        removeTest(t.id);
                      }}
                      className="flex-none rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                      aria-label="테스트 삭제"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              }
            >
              <StepTabs
                steps={[
                  {
                    key: "prompt",
                    label: "생성 프롬프트",
                    content: (
                      <PromptVersionReference
                        ref={(el) => {
                          promptRefs.current[t.id] = el;
                        }}
                        category={category}
                        name={name}
                        serverVersion={serverVersion}
                        promptHistory={promptHistory}
                        testVersion={testVersion}
                        onTestVersionChange={onTestVersionChange}
                        onServerVersionChange={onServerVersionChange}
                        onPromptHistoryRefresh={onPromptHistoryRefresh}
                        onActiveInfoChange={(info) => setActiveInfos((prev) => ({ ...prev, [t.id]: info }))}
                        bare
                      />
                    ),
                  },
                  {
                    key: "image",
                    label: "이미지 생성",
                    content: renderModelAndGrid(t),
                  },
                ]}
              />
            </CollapsibleSection>
            </div>
          );
        })}
      </div>
      {reviewingTest && (
        <ApplyReviewModal
          category={category}
          name={name}
          channel="webtoon"
          urlPath="webtoon"
          onCancel={() => setReviewTestId(null)}
          onConfirm={async () => {
            await handleApplyTestToProduction(reviewingTest);
            setReviewTestId(null);
          }}
          settingsSummary={
            <div className="ui-card space-y-1.5 rounded-lg p-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">프롬프트 버전</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {activeInfos[reviewingTest.id]
                    ? `v${activeInfos[reviewingTest.id]!.version}${
                        activeInfos[reviewingTest.id]!.label ? ` · ${activeInfos[reviewingTest.id]!.label}` : ""
                      }`
                    : "미확인"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-faint)]">이미지 모델</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {IMAGE_MODELS.find((m) => m.id === reviewingTest.model)?.shortLabel ??
                    IMAGE_MODELS.find((m) => m.id === reviewingTest.model)?.label ??
                    reviewingTest.model}
                </span>
              </div>
            </div>
          }
          resultPreview={
            (() => {
              const doneSlots = Object.values(reviewingTest.slots)
                .filter((s) => s.status === "done" && s.imageUrl)
                .sort((a, b) => a.index - b.index);
              if (doneSlots.length === 0) {
                return (
                  <p className="text-[11px] text-[var(--text-faint)]">
                    아직 생성된 컷이 없습니다 — 결과 없이 적용하면 프롬프트 버전·이미지 모델 설정만 반영됩니다.
                  </p>
                );
              }
              return (
                <div className="grid grid-cols-4 gap-1.5">
                  {doneSlots.map((s) => (
                    <div key={s.index} className="aspect-[3/2] overflow-hidden rounded-md bg-[var(--surface-sunken)]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 동적 URL, next/image 도메인 등록 불필요한 실험 화면 */}
                      <img src={s.imageUrl as string} alt={`컷 ${s.index}`} className="h-full w-full object-contain" />
                    </div>
                  ))}
                </div>
              );
            })()
          }
        />
      )}
      {previewTestId && (() => {
        const t = tests.find((x) => x.id === previewTestId);
        if (!t) return null;
        const images = Object.values(t.slots)
          .filter((s) => s.status === "done" && s.imageUrl)
          .sort((a, b) => a.index - b.index)
          .map((s) => ({ index: s.index, url: s.imageUrl as string }));
        return <WebtoonPreviewModal title={`테스트 ${tests.indexOf(t) + 1}`} images={images} onClose={() => setPreviewTestId(null)} />;
      })()}
      {editing && (() => {
        const t = tests.find((x) => x.id === editing.testId);
        const s = t?.slots[editing.slotIndex];
        if (!t || !s || !s.imageUrl || !s.bgUrl || !s.layout) return null;
        const base = s.sourceCut;
        return (
          <BubbleEditorModal
            cutNumber={s.index}
            imageUrl={s.imageUrl}
            bgUrl={s.bgUrl}
            layout={s.layout}
            baseCut={{
              narration: base?.narration ?? "",
              caption: base?.caption ?? "",
              title: base?.title ?? "",
              title_keyword: base?.title_keyword ?? "",
              closing_caption: base?.closing_caption ?? "",
            }}
            dialogue={base?.dialogue ?? []}
            onClose={() => setEditing(null)}
            onApply={(url, layout, dialogue) =>
              setTests((prev) =>
                prev.map((x) =>
                  x.id !== editing.testId
                    ? x
                    : {
                        ...x,
                        slots: {
                          ...x.slots,
                          [editing.slotIndex]: {
                            ...x.slots[editing.slotIndex],
                            imageUrl: url,
                            layout,
                            sourceCut: x.slots[editing.slotIndex].sourceCut
                              ? { ...(x.slots[editing.slotIndex].sourceCut as WebtoonStoryboardCut), dialogue }
                              : null,
                          },
                        },
                      }
                )
              )
            }
          />
        );
      })()}
    </>
  );
}

/* 2026-09-27 — 사용자 요청: "프로덕션 카드에도, 테스트 카드와 동일하게,
   산출물 생성 가능하도록... A/B 테스트에 용이하겠더라고요" → 이어서 지적:
   "프로덕션 결과물이라는 거를 만드는게 아니고요... 이미지 설정 단계로
   가면 이미지 생성 하도록 되잖아? ... 프로덕션 결과물 섹션을 만들라는게
   아닙니다" — 별도 섹션이 아니라, 프로덕션 카드 자신의 "이미지 설정"
   탭(PromptChatLab.tsx의 StepTabs) 안에 이 그리드를 직접 심는다.
   WebtoonCutGenerator의 "테스트 N" 카드와 모양은 같지만(모델 선택+
   스토리보드에서 채우기+8컷 그리드), state 모델이 다르다(테스트는 여러
   개 배열, 이건 언제나 단 하나) — 별도 컴포넌트로 둔다.

   WS 프로토콜(cut_image/cut_image_error)은 그대로 재사용하되 test_id를
   고정값 "production"으로 쓴다 — PromptChatLab.tsx의 최상위 WS 구독이
   이미 test_id 상관없이 모든 cut_image를 그 대화에 저장하고 있어서
   (대화를 다시 열면 restoredImages로 복원), 이 컴포넌트는 새 저장
   로직이 전혀 필요 없다 — 그 문자열을 그대로 실어 보내기만 하면 기존
   파이프라인을 그대로 탄다(WebtoonCutGenerator.tsx의 threadId 리셋
   블록에서 "production" 키를 걸러내는 것도 이 때문 — 번호 매겨진
   테스트 목록에 프로덕션 몫이 섞여 들어가지 않게). */
export function WebtoonProductionCutGrid({
  cuts,
  wsOpen,
  send,
  subscribe,
  productionModel,
  bubbleDetectDraft,
  bubbleStyleDraft,
  restoredImages,
}: {
  cuts: WebtoonStoryboardCut[];
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
  productionModel: string | null;
  /** 이미지 설정 탭의 "말풍선 얼굴 회피" 체크 상태(발행 전 값 포함) — 컷 생성 요청에 실어 체크만 해도 바로 확인할 수 있게 한다 */
  bubbleDetectDraft?: boolean;
  /** "웹툰식 말풍선" 체크 상태(발행 전 값 포함) */
  bubbleStyleDraft?: boolean;
  /** PromptChatLab.tsx가 WebtoonCutGenerator에 넘기는 restoredImages를
   *  그대로 넘기면 된다 — 여기서는 "production" 키만 본다. 부모가
   *  `key={threadId}`로 이 컴포넌트를 마운트해 대화가 바뀔 때마다
   *  통째로 새로 시작하게 하므로, 복원은 이 초기값 한 번으로 충분하다. */
  restoredImages?: Record<string, Record<number, { imageUrl: string; model?: string }>>;
}) {
  const [model, setModel] = useState(productionModel ?? IMAGE_MODELS[0].id);
  const [slots, setSlots] = useState<Record<number, SlotState>>(() => {
    const initial = _emptySlots(cuts);
    const restored = restoredImages?.["production"];
    if (restored) {
      for (let idx = 1; idx <= SLOT_COUNT; idx++) {
        const r = restored[idx];
        if (r) initial[idx] = { ...initial[idx], status: "done", imageUrl: r.imageUrl };
      }
    }
    return initial;
  });

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "cut_image") {
        const m = msg as unknown as { cut: number; test_id?: string; image_url: string };
        if (m.test_id !== "production") return;
        setSlots((prev) => (prev[m.cut] ? { ...prev, [m.cut]: { ...prev[m.cut], status: "done", imageUrl: m.image_url, error: null } } : prev));
      } else if (msg.type === "cut_image_error") {
        const m = msg as unknown as { cut: number; test_id?: string; error: string };
        if (m.test_id !== "production") return;
        setSlots((prev) => (prev[m.cut] ? { ...prev, [m.cut]: { ...prev[m.cut], status: "error", error: m.error } } : prev));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSlots는 함수형 갱신만 쓰므로 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  // storyboard(cuts prop)가 나중에 도착/변경되면 말풍선 메타데이터만
  // 조용히 매칭한다 — WebtoonCutGenerator.tsx의 동일 블록과 같은 원칙.
  const [prevCuts, setPrevCuts] = useState(cuts);
  if (cuts !== prevCuts) {
    setPrevCuts(cuts);
    setSlots((prev) => {
      const next = { ...prev };
      for (const cut of cuts) {
        if (next[cut.cut]) next[cut.cut] = { ...next[cut.cut], sourceCut: cut };
      }
      return next;
    });
  }

  const fillPromptsFromStoryboard = () => {
    setSlots((prev) => {
      const next = { ...prev };
      for (const idx of Object.keys(next).map(Number)) {
        const slot = next[idx];
        if (slot.prompt.trim() || !slot.sourceCut) continue;
        next[idx] = { ...slot, prompt: slot.sourceCut.image_prompt };
      }
      return next;
    });
  };

  const handleGenerate = (slotIndex: number) => {
    const s = slots[slotIndex];
    if (!s || !s.prompt.trim()) return;
    const base = s.sourceCut;
    const cutPayload = {
      cut: slotIndex,
      test_id: "production",
      narration: base?.narration ?? "",
      caption: base?.caption ?? "",
      dialogue: base?.dialogue ?? [],
      title: base?.title ?? "",
      title_keyword: base?.title_keyword ?? "",
      closing_caption: base?.closing_caption ?? "",
      camera: "",
      scene: s.prompt,
      bubble_detect: bubbleDetectDraft,
      bubble_webtoon: bubbleStyleDraft,
    };
    const result = send("cut_image", { cut: cutPayload, model });
    if (!result.sent) {
      const error = result.tooLarge
        ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      setSlots((prev) => ({ ...prev, [slotIndex]: { ...s, status: "error", error } }));
      return;
    }
    setSlots((prev) => ({ ...prev, [slotIndex]: { ...s, status: "pending", error: null } }));
  };

  const orderedSlots = Object.values(slots).sort((a, b) => a.index - b.index);
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2 pt-2">
        <span className="text-[10.5px] text-[var(--text-faint)]">모델</span>
        <CustomSelect
          value={model}
          onChange={setModel}
          options={IMAGE_MODELS.map((m) => ({
            value: m.id,
            label: m.shortLabel ?? m.label,
            badge: m.badge,
            muted: m.notInUse,
          }))}
        />
        <button
          type="button"
          onClick={fillPromptsFromStoryboard}
          disabled={cuts.length === 0}
          title="스토리보드가 만든 컷별 프롬프트를 빈 칸에 한 번에 채웁니다(이미 쓴 칸은 그대로 둠)"
          className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[10.5px] font-semibold disabled:opacity-40"
        >
          스토리보드에서 채우기
        </button>
        {orderedSlots.some((s) => s.status === "done" && s.imageUrl) && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            title="생성한 컷을 실제 서비스 화면처럼 이어서 보기"
            className="ui-btn ui-btn-ghost rounded-lg px-2 py-1 text-[10.5px] font-semibold"
          >
            미리보기
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 pb-2">
        {orderedSlots.map((s) => (
          <div key={s.index} className="ui-card flex flex-col gap-1.5 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">컷 {s.index}</span>
              <div className="flex items-center gap-1.5">
                {s.status === "pending" && <span className="text-[10px] text-[var(--text-muted)]">생성 중</span>}
                {s.sourceCut && <span className="text-[10px] text-[var(--text-faint)]">스토리보드</span>}
                {s.status === "done" && s.imageUrl && (
                  <button
                    type="button"
                    onClick={() => downloadImage(s.imageUrl as string, `cut-${s.index}.png`)}
                    className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                    title="이 컷 다운로드"
                    aria-label="이 컷 다운로드"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div
              className={`aspect-[3/2] w-full overflow-hidden rounded-lg ${
                s.status === "idle"
                  ? "border border-dashed border-[var(--border-hairline)] bg-[var(--surface-card)]"
                  : "bg-[var(--surface-sunken)]"
              }`}
            >
              {s.status === "done" && s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 동적 URL, next/image 도메인 등록 불필요한 실험 화면
                <img src={s.imageUrl} alt={`컷 ${s.index}`} className="h-full w-full object-contain" />
              ) : s.status === "pending" ? (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="ui-spinner h-5 w-5" />
                </div>
              ) : s.status === "error" ? (
                <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-[var(--danger)]">
                  {s.error}
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-[var(--text-faint)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  비어 있음
                </div>
              )}
            </div>

            <textarea
              className="ui-input min-h-[56px] resize-y rounded-md text-[11px]"
              placeholder="왼쪽 장면 연출 텍스트를 복사해 붙여넣으세요"
              value={s.prompt}
              onChange={(e) => {
                const value = e.target.value;
                setSlots((prev) => ({ ...prev, [s.index]: { ...prev[s.index], prompt: value, dirty: true } }));
              }}
            />

            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={s.status === "pending" || !wsOpen || !s.prompt.trim()}
              onClick={() => handleGenerate(s.index)}
            >
              생성
            </button>
          </div>
        ))}
      </div>
      {previewOpen && (
        <WebtoonPreviewModal
          title="프로덕션"
          images={orderedSlots.filter((s) => s.status === "done" && s.imageUrl).map((s) => ({ index: s.index, url: s.imageUrl as string }))}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
