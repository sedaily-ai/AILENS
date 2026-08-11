"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/Sidebar";

// 새 글 쓰기(/posts/edit)는 티스토리식 풀스크린 캔버스로 쓴다(2026-08-09) —
// 사이드바·본문 폭 제한을 이 경로에서만 건너뛴다. 상단 바·캔버스 폭은
// posts/edit/page.tsx와 PostFormShell.tsx가 각자 알아서 책임진다.
const FOCUS_MODE_PREFIXES = ["/posts/edit"];

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isFocusMode = FOCUS_MODE_PREFIXES.some((p) => pathname?.startsWith(p));

  if (isFocusMode) {
    // 순백 → 연회색(테두리 대신 색 대비로 경계 표현) → 다시 순백(2026-08-09,
    // "전부 다 화이트로, 외부 보이는 색상도" — 카드 경계를 색 대비로 살리는
    // 대신 노션처럼 아예 경계 없는 캔버스 하나로 가는 쪽을 최종 선택). 카드
    // (PostFormShell)의 둥근 모서리·최소높이 스타일은 남아있지만 배경이 같은
    // 흰색이라 시각적으로는 안 드러난다 — 그래도 무방하다.
    return (
      <AuthGuard>
        <div className="min-h-screen" style={{ background: "var(--surface-card)" }}>
          {children}
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      {/* 240px 고정 사이드바 + 본문. 모바일은 사이드바가 오버레이라 ml 이 없다.
          기준: 서울경제 영문 CMS (~/Desktop/ensedaily/cms/LayoutWrapper). */}
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 lg:ml-[240px]">
          <div className="max-w-6xl w-full mx-auto px-4 py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
