/**
 * SSE 연결 허브 — /api/events(구독)와 /api/revalidate(발행)가 공유하는
 * 모듈스코프 상태. PM2가 instances:1(fork 모드)로 뜨는 게 전제다 — 멀티
 * 프로세스(cluster)면 프로세스마다 이 Set이 따로 생겨서 무효화 신호가
 * 일부 클라이언트에만 전달된다(ecosystem.config.js 참조).
 */
type Client = { send: (data: string) => void };

const clients = new Set<Client>();

export function subscribe(client: Client): () => void {
  clients.add(client);
  return () => {
    clients.delete(client);
  };
}

export function broadcast(message: string): void {
  for (const client of clients) {
    try {
      client.send(message);
    } catch {
      // 끊긴 연결에 쓰기 실패 — 다음 heartbeat/재연결에서 자연히 정리됨.
    }
  }
}
