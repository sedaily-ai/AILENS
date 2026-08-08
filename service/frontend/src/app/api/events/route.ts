import { subscribe } from '@/shared/lib/sseHub';

// SSE — admin이 글을 쓰면(POST /api/revalidate) 이미 열려있는 브라우저 탭에
// "새로고침해라" 신호를 보낸다(2026-08-08, "클릭 즉시 이동 + CRUD 1초 반영"
// 요구 — 캐시를 평소엔 공격적으로 쓰고 쓰기 시점에만 정확히 깨는 구조의
// push 채널). CloudFront 오리진 타임아웃(30초)보다 짧은 15초 간격으로
// heartbeat를 보내 유휴 연결 종료를 막는다. force-dynamic 필수 — 이 라우트가
// 정적/캐시 대상으로 잘못 분류되면 스트림이 아니라 한 번 구운 응답이 나간다.
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };
      const unsubscribe = subscribe({ send });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, HEARTBEAT_MS);

      // 최초 연결 시 한 번 보내 EventSource의 onopen이 바로 뜨게 한다.
      send('connected');

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx가 이 응답을 버퍼링하지 않게(버퍼링되면 heartbeat/이벤트가
      // 실시간으로 안 나가고 뭉쳐서 나감).
      'X-Accel-Buffering': 'no',
    },
  });
}
