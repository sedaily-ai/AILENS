"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "./adminClient";
import { getToken } from "./auth";

// API Gateway WebSocket 프레임 하드 리밋(32,768바이트) 여유를 둔 안전선 —
// 이 값을 넘기는 메시지는 code 1009로 연결 자체가 끊기므로 아예 안 보낸다.
export const WS_FRAME_SAFE_BYTES = 30000;

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const PONG_TIMEOUT_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 2000;

/** 서버(routes/chat_ws.py) push 메시지의 최소 공통 모양 — kind별 나머지
 *  필드는 각 구독자가 직접 좁혀 쓴다. */
export interface WsPushBase {
  type: string;
  [key: string]: unknown;
}

export type SendResult = { sent: true } | { sent: false; tooLarge?: boolean; byteLength?: number };

/**
 * admin 프롬프트 챗랩의 단일 WebSocket 연결(routes/chat_ws.py) — 연결·
 * 하트비트(ping/pong, API Gateway 10분 유휴 타임아웃보다 짧은 주기)·자동
 * 재연결(최대 10회, 2초 간격) 로직을 한 곳에 모은다.
 *
 * 2026-09-16 리팩토링 감사 — PromptChatLab.tsx(채팅)와 WebtoonCutGenerator.tsx
 * (컷 생성)가 같은 화면에 항상 같이 떠 있으면서 각자 독립된 연결을 열고
 * 있었다(같은 WS_URL에 소켓 2개, 하트비트·재연결 로직도 그대로 복붙).
 * WebtoonCutGenerator는 부모(PromptChatLab)가 `inert`로 숨겨도(마운트는
 * 유지) 계속 연결돼 있었으므로, 채팅 쪽이 `open`에 따라 연결을 끊던 "절약"
 * 효과를 실제로는 못 누리고 있었다 — 하나로 합쳐도 최대 연결 수는 늘지
 * 않고 2에서 1로 줄어든다.
 *
 * 사용법: PromptChatLab(유일한 소유자)이 이 훅을 한 번 호출해 연결을
 * 만들고, WebtoonCutGenerator에는 send/wsOpen/subscribe를 prop으로 내려
 * 준다 — WebtoonCutGenerator가 이 훅을 따로 호출하면 소켓이 다시 2개가
 * 되므로 반드시 이 방식을 지킬 것.
 */
export function useAdminChatSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const listenersRef = useRef(new Set<(msg: WsPushBase) => void>());

  useEffect(() => {
    if (!WS_URL) return;
    let cancelled = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const clearHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
      heartbeatTimer = null;
      pongTimeoutTimer = null;
    };

    const connect = () => {
      const token = getToken();
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token ?? "")}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts = 0;
        setWsOpen(true);
        clearHeartbeat();
        heartbeatTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ action: "message", kind: "ping", data: {} }));
          pongTimeoutTimer = setTimeout(() => {
            ws.close(); // pong 무응답 — 죽어있는 연결로 간주하고 닫아서 재연결 유도
          }, PONG_TIMEOUT_MS);
        }, HEARTBEAT_INTERVAL_MS);
      };
      ws.onclose = (event: CloseEvent) => {
        setWsOpen(false);
        clearHeartbeat();
        // 32KB 프레임 초과(code 1009) 같은 비정상 종료를 devtools에서 바로
        // 보이게 남겨둔다 — 정상적인 재연결(유휴 타임아웃, pong 무응답 자체
        // close 등)도 이 핸들러를 타므로 화면에는 매번 안 띄운다.
        if (event.code !== 1000) {
          console.warn(`[admin-ws] closed code=${event.code} reason=${event.reason || "(none)"} wasClean=${event.wasClean}`);
        }
        if (cancelled || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => setWsOpen(false);
      ws.onmessage = (evt: MessageEvent<string>) => {
        let msg: WsPushBase;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (msg.type === "pong") {
          if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
          pongTimeoutTimer = null;
          return;
        }
        for (const listener of listenersRef.current) listener(msg);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearHeartbeat();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  /** kind+data 하나를 보낸다. 크기 초과(WS_FRAME_SAFE_BYTES)면 아예 시도하지
   *  않고 `tooLarge`로 알린다. 소켓이 OPEN이 아니면(WebSocket.send()는
   *  CLOSING/CLOSED에서 예외 없이 조용히 데이터를 버리므로 readyState를
   *  직접 확인해야 함) 아무것도 안 보내고 소켓을 닫아 재연결을 앞당긴 뒤
   *  `sent:false`를 돌려준다 — 호출부는 이 반환값을 반드시 확인해서 UI에
   *  실패를 반영해야 한다(안 그러면 상태가 "처리 중"에 영원히 멈춘다). */
  const send = useCallback((kind: string, data: unknown = {}): SendResult => {
    const serialized = JSON.stringify({ action: "message", kind, data });
    const byteLength = new TextEncoder().encode(serialized).length;
    if (byteLength > WS_FRAME_SAFE_BYTES) {
      return { sent: false, tooLarge: true, byteLength };
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setWsOpen(false);
      ws?.close();
      return { sent: false };
    }
    ws.send(serialized);
    return { sent: true };
  }, []);

  /** 수신 메시지 리스너 등록 — 여러 컴포넌트가 각자 자기 kind만 골라
   *  처리한다(pong은 이미 이 훅이 소비하므로 리스너엔 안 옴). 반환된
   *  cleanup 함수를 그대로 useEffect에서 리턴하면 된다. */
  const subscribe = useCallback((listener: (msg: WsPushBase) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { wsOpen, send, subscribe };
}
