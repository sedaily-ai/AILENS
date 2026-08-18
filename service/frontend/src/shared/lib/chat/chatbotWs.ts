/**
 * 챗봇 WebSocket 클라이언트.
 *
 * 백엔드 sedaily-mbti-ws-* (Sonnet 4.6 inference profile) 와 토큰 단위 streaming.
 * - 연결: wss://.../dev?user_id=...
 * - 송신: {"action":"sendMessage","message":"...","conversation_history":[...]}
 * - 수신: {"type":"ai_start"|"ai_chunk"|"chat_end"|"error", ...}
 *
 * 단일 명의(AI LENS) 체계(2026-08-07) 이후로는 페르소나 그룹별 연결이 없다 —
 * 연결 하나를 계속 재사용한다. 백엔드도 mbti_group 쿼리 파라미터/필드를 더 이상
 * 요구하지 않고 실려 와도 무시한다 (service/backend/handlers/websocket/{connect,message}.py 참조).
 *
 * 한 번에 한 turn 만 보냄. 다음 turn 보낼 때는 같은 연결 재사용.
 */
import { WS_URL } from '@/shared/config/apiClient';

export type WsChatEvent =
  | { type: 'ai_start'; timestamp: string }
  | { type: 'ai_chunk'; chunk: string; chunk_index: number }
  | { type: 'chat_end'; total_chunks: number; response_length: number; timestamp: string }
  | { type: 'error'; message: string };

export interface SendMessageOptions {
  message: string;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: string, index: number) => void;
  onStart?: () => void;
  onEnd?: (info: { total_chunks: number; response_length: number }) => void;
  onError?: (message: string) => void;
}

class ChatbotWebSocket {
  private ws: WebSocket | null = null;
  private connectingPromise: Promise<WebSocket> | null = null;

  /** 연결이 이미 열려 있으면 재사용, 아니면 새로 연결. */
  private async ensureConnected(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = new Promise<WebSocket>((resolve, reject) => {
      const url = `${WS_URL}?user_id=anonymous`;
      const ws = new WebSocket(url);
      const timeout = window.setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error('WebSocket 연결 타임아웃 (15s)'));
      }, 15000);

      ws.onopen = () => {
        window.clearTimeout(timeout);
        this.ws = ws;
        this.connectingPromise = null;
        resolve(ws);
      };
      ws.onerror = (e) => {
        window.clearTimeout(timeout);
        this.connectingPromise = null;
        reject(e instanceof ErrorEvent ? new Error(e.message) : new Error('WebSocket 오류'));
      };
      ws.onclose = () => {
        // 자동 재연결은 안 함 — 다음 send 시 ensureConnected 가 다시 연결.
        if (this.ws === ws) {
          this.ws = null;
        }
      };
    });
    return this.connectingPromise;
  }

  async sendMessage(opts: SendMessageOptions): Promise<void> {
    const ws = await this.ensureConnected();

    return new Promise<void>((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        let parsed: WsChatEvent;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }

        if (parsed.type === 'ai_start') {
          opts.onStart?.();
        } else if (parsed.type === 'ai_chunk') {
          opts.onChunk(parsed.chunk, parsed.chunk_index);
        } else if (parsed.type === 'chat_end') {
          opts.onEnd?.({ total_chunks: parsed.total_chunks, response_length: parsed.response_length });
          ws.removeEventListener('message', onMessage);
          resolve();
        } else if (parsed.type === 'error') {
          opts.onError?.(parsed.message);
          ws.removeEventListener('message', onMessage);
          reject(new Error(parsed.message));
        }
      };
      ws.addEventListener('message', onMessage);

      const payload = {
        action: 'sendMessage',
        message: opts.message,
        conversation_history: opts.conversation_history ?? [],
      };
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        ws.removeEventListener('message', onMessage);
        reject(e);
      }
    });
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(1000, 'normal'); } catch {}
      this.ws = null;
    }
  }
}

export const chatbotWs = new ChatbotWebSocket();
