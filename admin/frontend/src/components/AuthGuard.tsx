"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

// Client-side-only auth gate. SSR/SSG 단계에서는 hydrated=false → loading 반환,
// 마운트 후 localStorage 검사 → 미인증 시 /login replace, 인증 시 children render.
// 모든 (authenticated) 그룹 페이지가 이 가드를 통과한다.
//
// React 19 의 set-state-in-effect 규칙을 피하기 위해 hydrated flag 만 effect 에서
// flip 하고 (한 번 mount 시그널), auth 검사 결과는 매 render 시 derive — useState
// 로 보관하지 않음. authed 가 false 면 redirect effect 가 한 번만 실행.

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Legit mount-detection pattern for SSG → CSR handoff. The whole purpose
    // of this effect is to flip a render-only flag once hydrated; deriving
    // `hydrated` from props/state isn't possible in a static-export context
    // where localStorage isn't available at build time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  const authed = hydrated && isAuthenticated();

  useEffect(() => {
    if (hydrated && !authed) {
      router.replace("/login");
    }
  }, [hydrated, authed, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-700">
        확인 중...
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-700">
        /login 으로 이동...
      </div>
    );
  }

  return <>{children}</>;
}
