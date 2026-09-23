"use client";

import { useEffect, useState } from "react";
import type { SendResult, WsPushBase } from "@/lib/useAdminChatSocket";

/* 팟캐스트 탭 우측 음성 생성 패널 — 2026-09-22 신설, 같은 날 재설계.
   1차로는 채팅 메시지마다 "음성으로 듣기" 버튼을 달았는데, 사용자가
   다시 요청: "이전 대화 쓰레드... 사용자가 입력한 말풍선은 안보이더라고.
   그리고, 바로 음성 출력하지말구... 음성 부분도, 웹툰처럼... 컷별로..
   있는것처럼.. 음성도.. 여러개를 리스트 형태로 만들면 어떤가요? 스크립트를
   넣고 생성을 누르면 음성이 생성되도록요... 왼쪽은 텍스트만, 우측은
   음성을 생성하는거죠." — WebtoonCutGenerator.tsx(웹툰 컷 이미지 패널)와
   똑같은 골격: 슬롯 목록 + 슬롯마다 직접 텍스트를 채워 넣고 "생성"을
   누르면 그 슬롯만 합성된다(자동 생성 없음, 웹툰 컷 슬롯도 "사용자가
   직접 복붙" 원칙과 동일). 웹툰은 슬롯이 8개 고정(발행 포맷이 8컷
   고정이라서)이지만 팟캐스트 대본엔 그런 고정 개수가 없어 "+추가"로
   늘어나는 목록으로 뒀다.

   소켓 연결은 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   만들어 내려준다 — WebtoonCutGenerator와 같은 이유(그 컴포넌트
   docstring 참고, useAdminChatSocket.ts도 마찬가지)로 이 컴포넌트가
   따로 소켓을 열면 같은 화면에 연결이 2개가 된다.

   slot_id 상관관계 — WebtoonCutGenerator가 "cut_image" 응답의 cut
   번호로 슬롯을 찾는 것과 같은 이유로, routes/chat_ws.py::
   _run_synthesize_audio_flow가 요청에 실어 보낸 slot_id를 그대로
   돌려준다(audio_ready/audio_error 둘 다) — 여러 슬롯을 동시에 생성
   중이어도 응답이 엇갈리지 않는다. */

interface SlotState {
  id: string;
  text: string;
  status: "idle" | "pending" | "done" | "error";
  audioUrl: string | null;
  error: string | null;
}

function newSlot(): SlotState {
  return {
    id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    status: "idle",
    audioUrl: null,
    error: null,
  };
}

export function PodcastAudioGenerator({
  wsOpen,
  send,
  subscribe,
}: {
  /** 소켓 연결 자체는 부모(PromptTextLab)가 useAdminChatSocket()으로 한 번만
   *  만들어 내려준다 — WebtoonCutGenerator.tsx와 동일 패턴. */
  wsOpen: boolean;
  send: (kind: string, data?: unknown) => SendResult;
  subscribe: (listener: (msg: WsPushBase) => void) => () => void;
}) {
  const [slots, setSlots] = useState<SlotState[]>(() => [newSlot()]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "audio_ready") {
        const m = msg as unknown as { slot_id: string; audio_url: string };
        setSlots((prev) =>
          prev.map((s) => (s.id === m.slot_id ? { ...s, status: "done", audioUrl: m.audio_url, error: null } : s))
        );
      } else if (msg.type === "audio_error") {
        const m = msg as unknown as { slot_id: string; message: string };
        setSlots((prev) => prev.map((s) => (s.id === m.slot_id ? { ...s, status: "error", error: m.message } : s)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSlots는 함수형 갱신만 써서 클로저가 오래돼도 안전, subscribe 자체는 마운트 시 한 번만
  }, []);

  const updateText = (id: string, text: string) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  };

  const handleGenerate = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (!s || !s.text.trim() || !wsOpen || s.status === "pending") return;
    // send()가 소켓 상태 확인과 32KB 프레임 크기 가드를 둘 다 내부에서
    // 처리한다(useAdminChatSocket 참고) — 반환값을 확인 안 하면 슬롯이
    // "생성 중"에 영원히 멈춘다.
    const result = send("synthesize_audio", { text: s.text, slot_id: id });
    if (!result.sent) {
      const error = result.tooLarge
        ? `요청이 너무 커서(${result.byteLength?.toLocaleString()}바이트) 보낼 수 없습니다 — 내용을 줄여서 다시 시도해 주세요.`
        : "연결이 끊어졌어요 — 자동으로 다시 연결 중입니다. 잠시 후 다시 시도해 주세요.";
      setSlots((prev) => prev.map((x) => (x.id === id ? { ...x, status: "error", error } : x)));
      return;
    }
    setSlots((prev) => prev.map((x) => (x.id === id ? { ...x, status: "pending", error: null } : x)));
  };

  const addSlot = () => setSlots((prev) => [...prev, newSlot()]);
  const removeSlot = (id: string) =>
    setSlots((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ui-divider flex items-center justify-between border-b px-3.5 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">음성 생성</p>
        <button
          type="button"
          onClick={addSlot}
          className="ui-btn ui-btn-ghost rounded-lg px-2.5 py-1 text-[11px] font-semibold"
        >
          + 추가
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {slots.map((s, i) => (
          <div key={s.id} className="ui-card flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">음성 {i + 1}</span>
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(s.id)}
                  className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-secondary)]"
                  aria-label="삭제"
                  title="삭제"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <textarea
              value={s.text}
              onChange={(e) => updateText(s.id, e.target.value)}
              placeholder="왼쪽 대본을 복사해 붙여넣으세요"
              rows={4}
              className="ui-input w-full resize-none rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
            />
            <button
              type="button"
              onClick={() => handleGenerate(s.id)}
              disabled={!s.text.trim() || !wsOpen || s.status === "pending"}
              className="ui-btn ui-btn-primary rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            >
              {s.status === "pending" ? "생성 중..." : "생성"}
            </button>
            {s.status === "done" && s.audioUrl && (
              <audio controls preload="none" src={s.audioUrl} className="h-9 w-full" />
            )}
            {s.status === "error" && s.error && <p className="text-[11px] text-[var(--danger)]">{s.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
