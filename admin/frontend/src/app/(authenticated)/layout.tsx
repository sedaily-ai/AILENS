"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/Sidebar";
import { PromptLabProvider, PromptLab } from "@/components/PromptChatLab";

// 새 글 쓰기(/posts/edit)는 티스토리식 풀스크린 캔버스로 쓴다(2026-08-09) —
// 사이드바·본문 폭 제한을 이 경로에서만 건너뛴다. 상단 바·캔버스 폭은
// posts/edit/page.tsx와 PostFormShell.tsx가 각자 알아서 책임진다.
// (한때 /issue-talk/edit도 있었지만 "이슈 톡톡"이 독립 채널에서 글 관리의
// 분류로 되돌아가며 2026-08-12에 제거됨.)
const FOCUS_MODE_PREFIXES = ["/posts/edit"];

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isFocusMode = FOCUS_MODE_PREFIXES.some((p) => pathname?.startsWith(p));

  // 2026-09-24 — PromptLabProvider를 포커스 모드/일반 모드 두 분기 밖(이
  // 공통 지점)에 둔다. 사용자 요청: "근본적으로... 진짜 다 동시작업이
  // 가능하도록... 대화 다른 곳에 머물러도 될 수 있게?" — 예전엔 이 두
  // 분기가 각자 다른 <AuthGuard>로 감싼 별개의 트리를 반환해서, PromptLab
  // 이 어느 한쪽에만 있으면 /posts/edit으로 이동하는 순간(다른 분기로
  // 전환) 전부 사라졌다. 이제 AuthGuard 하나 → PromptLabProvider 하나가
  // 두 분기를 전부 감싸서, 어느 관리자 페이지로 이동해도(포커스 모드
  // 포함) 프롬프트 실험 상태가 유지된다. AuthGuard 안에 두는 이유는
  // 로그인 전엔 웹소켓 연결을 시도할 이유가 없어서다.
  return (
    <AuthGuard>
      <PromptLabProvider>
        <PromptLab />
        {isFocusMode ? (
          // 순백 → 연회색(테두리 대신 색 대비로 경계 표현) → 다시
          // 순백(2026-08-09, "전부 다 화이트로, 외부 보이는 색상도" —
          // 카드 경계를 색 대비로 살리는 대신 노션처럼 아예 경계 없는
          // 캔버스 하나로 가는 쪽을 최종 선택). 카드(PostFormShell)의
          // 둥근 모서리·최소높이 스타일은 남아있지만 배경이 같은 흰색이라
          // 시각적으로는 안 드러난다 — 그래도 무방하다.
          <div className="min-h-screen" style={{ background: "var(--surface-card)" }}>
            {children}
          </div>
        ) : (
          // 240px 고정 사이드바 + 본문. 모바일은 사이드바가 오버레이라
          // ml 이 없다. 기준: 서울경제 영문 CMS
          // (~/Desktop/ensedaily/cms/LayoutWrapper).
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 lg:ml-[240px]">
              <div className="max-w-6xl w-full mx-auto px-4 py-8 lg:px-8">
                {children}
              </div>
            </main>
          </div>
        )}
      </PromptLabProvider>
    </AuthGuard>
  );
}
