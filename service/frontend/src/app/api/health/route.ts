// ALB 헬스체크용 — 홈(/)을 렌더하지 않고 즉시 200만 돌려준다. 과부하로 렌더가 느려질 때 헬스체크가 실패해 유일한 태스크가 교체되는 일을 막는다.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
}
