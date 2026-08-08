import { useEffect, useState } from "react";

// 목록 → 글 수정/삭제 → "← 목록"(router.back()) 흐름에서, 페이지가 Next
// 라우터 캐시에 그대로 남아있어 재마운트가 안 되면 목록 fetch effect가
// 다시 안 돌아서 방금 수정·삭제한 글이 목록에 계속 보이는 문제(2026-08-08
// 리포트 — 백엔드는 정상 반영됐는데 목록만 stale). 탭/창이 다시 보이게 될
// 때마다(뒤로가기 포함, back navigation도 visibilitychange를 발생시킴) 반환된
// key를 올려서, 이 값을 fetch effect의 deps에 넣으면 최신 목록을 다시 받아온다.
export function useReloadOnVisible(): number {
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return reloadKey;
}
