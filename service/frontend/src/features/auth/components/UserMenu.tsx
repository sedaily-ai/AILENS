
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/entities/user";

export function UserMenu() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return <div className="w-8 h-8" />;
  }

  // Not logged in - show login button
  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-gray-600 hover:text-gray-900 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>로그인</span>
      </button>
    );
  }

  // Logged in - show user menu
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {user.picture ? (
          <Image src={user.picture} alt="" width={32} height={32} className="rounded-full border border-gray-200" />
        ) : (
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-[12px] font-medium text-gray-600">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-[100]">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[14px] font-medium text-gray-900 truncate">
              {user.name || "사용자"}
            </p>
            <p className="text-[12px] text-gray-500 truncate">
              {user.email}
            </p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                // router.push는 이미 "/"에 있을 때(홈에서 이 버튼을 누르는
                // 흔한 경우) 쿼리스트링만 바뀌는 소프트 네비게이션이라 아무
                // 효과가 없었다 — FeedPage.tsx의 URL→탭 동기화 effect가
                // 하이드레이션 불일치 방지 때문에 마운트 시 1회만 읽도록
                // 의도적으로 설계돼 있어(정적 export 대응), 페이지 안에
                // 머문 채로는 재실행되지 않는다(2026-08-24, 사용자가 "눌러도
                // 아무것도 안 나온다"고 지적). 하드 네비게이션으로 항상 새
                // 마운트를 강제한다.
                window.location.href = "/?tab=archive";
              }}
              className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-3"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              내 서랍
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full px-4 py-2 text-left text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-3"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
