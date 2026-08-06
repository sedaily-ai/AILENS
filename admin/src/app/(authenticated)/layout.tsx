import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/Sidebar";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
