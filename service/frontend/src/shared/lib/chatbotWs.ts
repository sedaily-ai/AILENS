/**
 * MBTI 챗봇 WebSocket 클라이언트.
 *
 * 백엔드 sedaily-mbti-ws-* (Sonnet 4.6 inference profile) 와 토큰 단위 streaming.
 * - 연결: wss://.../dev?mbti_group=NT&user_id=...
 * - 송신: {"action":"sendMessage","message":"...","mbti_group":"NT","conversation_history":[...]}
 * - 수신: {"type":"ai_start"|"ai_chunk"|"chat_end"|"error", ...}
 *
 * 한 번에 한 turn 만 보냄. 다음 turn 보낼 때는 같은 연결 재사용.
 */
import { WS_URL } from '@/shared/config/api';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

export type WsChatEvent =
  | { type: 'ai_start'; mbti_group: MbtiGroupId; timestamp: string }
  | { type: 'ai_chunk'; chunk: string; chunk_index: number }
  | { type: 'chat_end'; mbti_group: MbtiGroupId; total_chunks: number; response_length: number; timestamp: string }
  | { type: 'error'; message: string };

export interface SendMessageOptions {
  message: string;
  mbti_group: MbtiGroupId;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: string, index: number) => void;
  onStart?: () => void;
  onEnd?: (info: { total_chunks: number; response_length: number }) => void;
  onError?: (message: string) => void;
}

class ChatbotWebSocket {
  private ws: WebSocket | null = null;
  private connectingPromise: Promise<WebSocket> | null = null;
  private currentMbtiGroup: MbtiGroupId | null = null;

  /** 페르소나 그룹 별로 연결. 이미 같은 그룹으로 연결돼 있으면 재사용. */
  private async ensureConnected(mbti_group: MbtiGroupId): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentMbtiGroup === mbti_group) {
      return this.ws;
    }
    // 그룹이 바뀌면 기존 연결 닫고 새 연결
    if (this.ws && this.currentMbtiGroup !== mbti_group) {
      this.disconnect();
    }
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = new Promise<WebSocket>((resolve, reject) => {
      const url = `${WS_URL}?mbti_group=${mbti_group}&user_id=anonymous`;
      const ws = new WebSocket(url);
      const timeout = window.setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error('WebSocket 연결 타임아웃 (15s)'));
      }, 15000);

      ws.onopen = () => {
        window.clearTimeout(timeout);
        this.ws = ws;
        this.currentMbtiGroup = mbti_group;
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
          this.currentMbtiGroup = null;
        }
      };
    });
    return this.connectingPromise;
  }

  async sendMessage(opts: SendMessageOptions): Promise<void> {
    const ws = await this.ensureConnected(opts.mbti_group);

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
        mbti_group: opts.mbti_group,
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
      this.currentMbtiGroup = null;
    }
  }
}

export const chatbotWs = new ChatbotWebSocket();
