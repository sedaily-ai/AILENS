"use client";

import { useEffect, useRef, useState } from "react";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";
import type { WebtoonGpuStatus, WebtoonStoryboardCut } from "@/lib/types";
import { IMAGE_MODELS } from "@/lib/webtoonImageModels";
import { CustomSelect } from "@/components/CustomSelect";

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

   그래서 슬롯은 항상 8개 고정이고 프롬프트는 항상 빈 채로 시작한다.
   storyboard(cuts prop)가 들어오면 narration/caption/dialogue 같은
   말풍선·캡션용 메타데이터만 컷 번호로 조용히 매칭해 들고 있다가
   생성 요청에 실어 보낸다(compose_text.py가 이걸로 말풍선을 그린다) —
   화면에 보이는 프롬프트 텍스트는 건드리지 않는다. storyboard와 매칭
   안 되는 슬롯(사용자가 순수하게 직접 채운 슬롯)은 그 메타데이터가
   비어 있어 배경 이미지만 나온다(대사가 없으니 당연한 동작 — 구글
   Flow처럼 순수 프롬프트→이미지 도구로 쓰는 셈).

   전송은 기존 WebSocket kind="cut_image"(routes/chat_ws.py::
   _run_cut_image_flow)를 그대로 재사용 — 새 백엔드 엔드포인트 없음.
   슬롯마다 완전히 독립된 요청이라 8컷을 한 Lambda invocation에
   몰아넣다 타임아웃 나던 문제(2026-09-16 실제로 겪음) 자체가 없다. */

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
  model: string;
  /** 2026-09-16, 사용자 요청 — "이미지(인물) 고정, 화풍 고정을 체크로
   *  껐다 켰다 할 수 있게": model이 "pipeline"일 때만 의미가 있다(GPU
   *  IP-Adapter 참조 얼굴 고정 적용 여부). 둘 다 기본 true(지금까지의
   *  동작 그대로) — 꺼면 "일반적인 사람"으로 생성된다. */
  applyCharacterLock: boolean;
  /** 위와 같은 요청 — Style Transfer(화풍 레퍼런스 이미지 적용) 여부.
   *  꺼면 화풍이 안 입혀진 사실적인 사진처럼 나온다(삽화가 아님) —
   *  ImageAssetField 쪽 문구와 같은 트레이드오프. */
  applyStyleTransfer: boolean;
  status: "idle" | "pending" | "done" | "error";
  imageUrl: string | null;
  error: string | null;
}

function _emptySlot(index: number): SlotState {
  return {
    index,
    prompt: "",
    dirty: false,
    sourceCut: null,
    model: IMAGE_MODELS[0].id,
    applyCharacterLock: true,
    applyStyleTransfer: true,
    status: "idle",
    imageUrl: null,
    error: null,
  };
}

export function WebtoonCutGenerator({
  cuts,
  title,
  compact = false,
  wsOpen,
  send,
  subscribe,
}: {
  cuts: WebtoonStoryboardCut[];
  title?: string;
  /** true면 텍스트 페이지 우측 레일에 끼워 넣는 좁은 레이아웃(2열) —
   *  false(기본)면 넓은 화면 전체를 쓰는 그리드(별도 페이지/전체 화면용). */
  compact?: boolean;
  /** 소켓 연결 자체는 부모(PromptChatLab)가 useAdminChatSocket()으로 한 번만
   *  만들어 내려준다 — 2026-09-16 리팩토링 감사, 이 컴포넌트가 따로
   *  WebSocket을 열면 같은 화면에 소켓이 2개가 된다(그 훅 docstring 참고). */
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
}) {
  const [slots, setSlots] = useState<Record<number, SlotState>>(() => {
    const initial: Record<number, SlotState> = {};
    for (let i = 1; i <= SLOT_COUNT; i++) initial[i] = _emptySlot(i);
    return initial;
  });
  // storyboard(cuts prop)가 나중에 도착하거나 다시 바뀌면 해당 번호 슬롯에
  // 말풍선·캡션 메타데이터(sourceCut)만 조용히 매칭한다 — 화면에 보이는
  // 프롬프트 텍스트는 건드리지 않는다(사용자가 직접 복붙, 위 모듈
  // docstring 3번 참고). 렌더 중 비교해서 반영한다(useEffect 안에서
  // setState하면 캐스케이드 리렌더가 생겨 린트가 막는다 — React의
  // "prop 바뀔 때 상태 맞추기" 패턴).
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
    setSlots((prev) => {
      const next = { ...prev };
      for (const cut of cuts) {
        const existing = next[cut.cut];
        if (!existing) continue;
        next[cut.cut] = { ...existing, sourceCut: cut };
      }
      return next;
    });
  }

  const [gpuState, setGpuState] = useState<WebtoonGpuStatus["state"] | "unknown">("unknown");
  const gpuStartingRef = useRef(false);
  // GPU 기동 대기 중 눌러둔 "기동되면 생성할 슬롯 번호들" — 여러 카드를
  // 연달아 눌러도 전부 기억했다가 gpu_status:running이 오면 순서대로 보낸다.
  const pendingAfterGpuRef = useRef<number[]>([]);

  const sendGenerate = (slotIndex: number) => {
    setSlots((prev) => {
      const s = prev[slotIndex];
      if (!s) return prev;
      const base = s.sourceCut;
      const cutPayload = {
        cut: slotIndex,
        narration: base?.narration ?? "",
        caption: base?.caption ?? "",
        dialogue: base?.dialogue ?? [],
        title: base?.title ?? "",
        title_keyword: base?.title_keyword ?? "",
        closing_caption: base?.closing_caption ?? "",
        camera: "",
        scene: s.prompt,
        apply_character_lock: s.applyCharacterLock,
        apply_style_transfer: s.applyStyleTransfer,
      };
      // send()가 소켓 상태 확인과 32KB 프레임 크기 가드를 둘 다 내부에서
      // 처리한다(useAdminChatSocket 참고) — 반환값을 확인 안 하면 슬롯이
      // "생성 중"에 영원히 멈춘다.
      const result = send("cut_image", { cut: cutPayload, model: s.model });
      if (!result.sent) {
        const error = result.tooLarge
          ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
          : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
        return { ...prev, [slotIndex]: { ...s, status: "error", error } };
      }
      return { ...prev, [slotIndex]: { ...s, status: "pending", error: null } };
    });
  };

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "cut_image") {
        const m = msg as unknown as { cut: number; image_url: string };
        setSlots((prev) =>
          prev[m.cut] ? { ...prev, [m.cut]: { ...prev[m.cut], status: "done", imageUrl: m.image_url, error: null } } : prev
        );
      } else if (msg.type === "cut_image_error") {
        const m = msg as unknown as { cut: number; error: string };
        setSlots((prev) => (prev[m.cut] ? { ...prev, [m.cut]: { ...prev[m.cut], status: "error", error: m.error } } : prev));
      } else if (msg.type === "gpu_status") {
        const m = msg as unknown as { state: WebtoonGpuStatus["state"] };
        setGpuState(m.state);
        gpuStartingRef.current = false;
        if (m.state === "running" && pendingAfterGpuRef.current.length > 0) {
          const toSend = pendingAfterGpuRef.current;
          pendingAfterGpuRef.current = [];
          for (const idx of toSend) sendGenerate(idx);
        }
      } else if (msg.type === "gpu_error") {
        gpuStartingRef.current = false;
        pendingAfterGpuRef.current = [];
        setGpuState("unknown");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendGenerate/setSlots는 ref·함수형 갱신만 쓰므로 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const requestGpuStart = () => {
    if (gpuStartingRef.current) return;
    gpuStartingRef.current = true;
    send("gpu_start", {});
  };

  const handleGenerate = (slotIndex: number) => {
    const s = slots[slotIndex];
    if (!s || !s.prompt.trim()) return;
    if (s.model === "pipeline" && gpuState !== "running") {
      if (!pendingAfterGpuRef.current.includes(slotIndex)) pendingAfterGpuRef.current.push(slotIndex);
      requestGpuStart();
      setSlots((prev) => ({ ...prev, [slotIndex]: { ...prev[slotIndex], status: "pending", error: null } }));
      return;
    }
    sendGenerate(slotIndex);
  };

  const handleStopGpu = () => send("gpu_stop", {});

  const orderedSlots = Object.values(slots).sort((a, b) => a.index - b.index);

  return (
    <div className={compact ? "px-3 py-3" : "mx-auto max-w-[1400px] px-6 py-6"}>
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 ${compact ? "" : "gap-3"}`}>
        {!compact && (
          <div>
            <h1 className="font-serif text-xl text-[var(--text-primary)]">{title || "컷 이미지 생성"}</h1>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              슬롯마다 프롬프트를 직접 쓰거나, 왼쪽에서 만든 장면 지문을 그대로 써서 생성하세요.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`ui-badge ${wsOpen ? "ui-badge-published" : ""}`}>{wsOpen ? "연결됨" : "연결 중..."}</span>
          <span className="ui-badge">GPU {gpuState === "running" ? "켜짐" : gpuState === "unknown" ? "확인 중" : gpuState}</span>
          {gpuState === "running" && (
            <button type="button" className="ui-btn ui-btn-ghost" onClick={handleStopGpu}>
              GPU 끄기
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"}`}>
        {orderedSlots.map((s) => (
          <div key={s.index} className="ui-card flex flex-col gap-1.5 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">컷 {s.index}</span>
              {s.status === "pending" && <span className="text-[10px] text-[var(--text-muted)]">생성 중</span>}
              {s.sourceCut && <span className="text-[10px] text-[var(--text-faint)]">스토리보드</span>}
            </div>

            {/* 2026-09-16 — 4:5 세로 비율(README 근거 없이 잘못 적혀있던 값)에서
                3:2 가로 비율로 수정. 실제 발행 파이프라인(pipelines/webtoon/
                pipeline.py, IMAGE_PROVIDER="bedrock-style-transfer")이 쓰는
                webtoon_image.py의 BEDROCK_ASPECT_RATIO가 "3:2"(1536×1024)로
                고정돼 있고, stitch.py도 원본 비율 그대로 이어붙일 뿐 따로
                자르지 않는다 — 4:5 박스에 object-cover로 넣으면 양옆이
                거의 반 가까이 잘려 보였다(사용자 지적). object-contain으로
                바꿔 모델별로 실제 출력 비율이 달라도(Nova Canvas 512×512
                등) 잘리지 않고 레터박스로만 보이게 한다. */}
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
                // 2026-09-16, UI 디테일 정리(Phase 8, 사용자 선택 — "점선 테두리
                // + 아이콘") — 진한 회색 사각형 대신 "아직 안 채운 자리"라는
                // 느낌을 점선 테두리+흰 배경+아이콘으로 표현.
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
              onChange={(e) =>
                setSlots((prev) => ({ ...prev, [s.index]: { ...prev[s.index], prompt: e.target.value, dirty: true } }))
              }
            />

            {/* 2026-09-20, 사용자 요청 — "사용하지 않기로 한 모델이랑
                사용하는거랑 구분을 좀 해주시고 커스텀 디자인좀 해주시죠":
                네이티브 <select>는 옵션별로 색을 못 입혀서(OS가 팝업을
                그림) CustomSelect(이미 다른 화면에서 쓰던 공용 드롭다운)
                로 교체 — 상태 배지(badge)·흐린 색(muted)을 옵션별로
                보여줄 수 있다. */}
            <CustomSelect
              value={s.model}
              onChange={(v) => setSlots((prev) => ({ ...prev, [s.index]: { ...prev[s.index], model: v } }))}
              options={IMAGE_MODELS.map((m) => ({
                value: m.id,
                label: m.shortLabel ?? m.label,
                badge: m.badge,
                muted: m.notInUse,
              }))}
            />

            {/* 2026-09-16, 사용자 요청 — "이미지(인물) 고정, 화풍 고정을 체크로
                풀었다 체크했다 할 수 있도록... 꼭 해당 고정을 적용 안 하고
                싶을 수도 있으니": "SD1.5 IP-Adapter + Stable Style Transfer"
                모델일 때만 의미가 있는 토글이라 다른 모델에서는 숨긴다.
                2026-09-18, 사용자 요청 — "1·2단계도 쪼개서 선택할 수 있게":
                두 단계가 서로 다른 모델(GPU의 SD1.5 IP-Adapter / Bedrock
                Stable Style Transfer)이라는 걸 라벨에서 바로 알 수 있게
                모델명을 붙인다. */}
            {s.model === "pipeline" && (
              <div className="flex flex-col gap-0.5">
                <label
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]"
                  title="1단계 · GPU에서 SD1.5+IP-Adapter로 참조 얼굴을 고정해 사진을 만듭니다. 꺼면 참조 얼굴 고정 없이 '일반적인 사람'으로 생성됩니다."
                >
                  <input
                    type="checkbox"
                    checked={s.applyCharacterLock}
                    onChange={(e) =>
                      setSlots((prev) => ({
                        ...prev,
                        [s.index]: { ...prev[s.index], applyCharacterLock: e.target.checked },
                      }))
                    }
                  />
                  1단계 · SD1.5 IP-Adapter (인물 고정)
                </label>
                <label
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]"
                  title="2단계 · Bedrock Stable Style Transfer로 웹툰 화풍을 입힙니다. 꺼면 이 단계를 건너뛰고 1단계의 사실적인 사진을 그대로 씁니다 — 삽화가 아닙니다."
                >
                  <input
                    type="checkbox"
                    checked={s.applyStyleTransfer}
                    onChange={(e) =>
                      setSlots((prev) => ({
                        ...prev,
                        [s.index]: { ...prev[s.index], applyStyleTransfer: e.target.checked },
                      }))
                    }
                  />
                  2단계 · Stable Style Transfer (화풍 적용)
                </label>
              </div>
            )}

            {/* 2026-09-18, 양진희 피드백 — "OpenAI 모델은 인물고정/화풍고정이
                안 되는 건가요?": 체크박스가 그냥 사라지기만 해서 이유를
                알기 어려웠다. pipeline이 아닌 모델을 고르면 왜 안 되는지
                한 줄로 안내한다(admin/backend/routes/webtoon_lab.py의
                _generate_once 주석과 같은 사실 — 다른 모델은 이 두
                메커니즘 자체가 없다). */}
            {s.model !== "pipeline" && (
              <p className="text-[10px] text-amber-600">
                이 모델은 인물·화풍 고정을 지원하지 않습니다 — 고정하려면 모델을
                &ldquo;{IMAGE_MODELS.find((m) => m.id === "pipeline")?.shortLabel}&rdquo;로 바꿔주세요.
              </p>
            )}

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
    </div>
  );
}
