'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /api/events(SSE)를 구독해 admin이 글을 쓰면 현재 화면을 새로고침 없이
// 최신 데이터로 갱신한다(2026-08-08). onopen에서도 refresh를 한 번 호출하는
// 이유 — 최초 연결뿐 아니라 배포·네트워크 끊김 이후 재연결마다도 걸리는데,
// 그 사이(연결이 끊겨있던 동안) admin이 뭔가 발행했으면 그 신호를 놓쳤을 수
// 있으니 "재연결 = 혹시 몰라 한 번 새로고침"으로 보수적으로 커버한다.
// EventSource는 브라우저 내장 자동 재연결이라 별도 재시도 로직이 필요 없다.
export function LiveRevalidateListener() {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => router.refresh();
    es.onmessage = () => router.refresh();
    return () => es.close();
  }, [router]);

  return null;
}
