"use client";

/** 스트리밍 JSON 부드럽게 드러내기 — 서버 원문은 ref 에 쌓고 rAF 루프가 밀린 양에 비례한 속도로 드러내며 90ms 간격으로만 다시 그린다. PromptChatLab.tsx 에서 분리(리팩토링 7단계, 내용 불변). */
import { useRef, useState } from "react";
import { normalizeLiveParsed, tryParsePartialJson, JsonPath } from "./liveStoryboardJson";

export function useSmoothLiveJson() {
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
  return {
    liveParsed,
    setLiveParsed,
    appendLiveText,
    resetLiveBuffer,
  };
}
