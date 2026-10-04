'use client';

import { useEffect, useState } from 'react';

/**
 * 서버가 HTML에 심어 보낸 목록(initial)을 처음 값으로 쓰고, 비어 있을 때만 마운트 후 한 번 직접 불러온다.
 *
 * 서버가 이미 목록을 줬는데 브라우저가 같은 목록(수백 KB)을 다시 받아 갈아 끼우면 화면이 한 번 더 그려지고
 * 네트워크만 쓴다(2026-10-03). 새 글은 발행 때 서버가 캐시를 무효화(revalidate)해 HTML에 반영된다.
 *
 * @param empty initial이 없을 때의 값(로딩 중 표시 구분용 null 또는 [])
 * @param accept 불러온 값을 반영할지 판단 — 빈 응답으로 서버 값을 덮지 않을 때 등
 */
export function useServerSeededList<T extends unknown[], E>(
  initial: T | undefined,
  empty: E,
  load: () => Promise<T>,
  accept: (data: T) => boolean = () => true,
): T | E {
  const [list, setList] = useState<T | E>(initial ?? empty);

  useEffect(() => {
    if (initial && initial.length > 0) return;
    let cancelled = false;
    load().then((data) => {
      if (!cancelled && accept(data)) setList(data);
    });
    return () => {
      cancelled = true;
    };
    // 마운트 때 한 번만 — initial·load·accept는 첫 렌더 값이면 충분하다(서버 값은 이후 바뀌지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return list;
}
