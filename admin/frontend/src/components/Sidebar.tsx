"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth } from "@/lib/auth";

/* 아이콘은 인라인 SVG. admin/CLAUDE.md 의 zero-new-dependency 정책 때문에
   lucide-react 를 넣지 않는다 (레퍼런스 CMS 는 lucide 를 쓴다).
   전부 24x24 stroke 아이콘 — currentColor 로 상태 색을 상속받는다. */
type IconProps = { className?: string };

const svg = (path: React.ReactNode) =>
  function Icon({ className = "w-4 h-4" }: IconProps) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };

const IconGauge = svg(
  <>
    <path d="M12 20v-8" />
    <path d="M4.9 19a8 8 0 1 1 14.2 0" />
  </>
);
const IconPen = svg(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>
);
const IconSend = svg(
  <>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </>
);
const IconMusic = svg(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>
);
const IconWebtoon = svg(
  <>
    <rect x="4" y="3" width="13" height="13" rx="2" />
    <path d="M8 21h13a2 2 0 0 0 2-2V8" />
  </>
);
const IconVideo = svg(
  <>
    <rect x="2" y="5" width="14" height="14" rx="2" />
    <path d="m22 8-6 4 6 4Z" />
  </>
);
const IconLens = svg(
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21" />
  </>
);
const IconQuiz = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9a2.8 2.8 0 1 1 3.8 2.6c-.7.3-1 .9-1 1.6" />
    <path d="M12 17v.01" strokeWidth={2.6} />
  </>
);
const IconCoin = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" />
  </>
);
const IconSliders = svg(
  <>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </>
);
const IconCog = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.4.66.73.86" />
  </>
);
const IconLogout = svg(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>
);
const IconChevron = svg(<path d="m6 9 6 6 6-6" />);
const IconMenu = svg(<path d="M3 6h18M3 12h18M3 18h18" />);
const IconClose = svg(<path d="M18 6 6 18M6 6l12 12" />);

interface MenuItem {
  label: string;
  href: string;
  Icon: (p: IconProps) => React.ReactElement;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    title: "콘텐츠",
    items: [
      { label: "글 관리", href: "/posts", Icon: IconPen },
      // "이슈 톡톡"은 독립 메뉴가 아니다(2026-08-12, 재작업) — 한때 별도
      // 채널(issue_talk) + 독립 사이드바 메뉴로 뺐었는데 "채널을 새로
      // 만들지 말고 분류 쪽에 넣어달라, 탭도 없애라"는 요청으로 되돌렸다.
      // "글 관리" 안에서 분류=이슈 톡톡으로 쓰고 채널 필터로 걸러본다
      // (posts/page.tsx, PostMode.tsx 참조) — 딥다이브·인사이트와 동일 패턴.
      // 웹툰·영상은 2026-08-09에 이 메뉴(글 관리)로 합쳤다가 같은 날 다시
      // 뺐다 — 합쳐두니 "새 글 쓰기"를 누를 때마다 종류를 또 골라야 해서
      // 오히려 불편하다는 지적("독립성을 주고 따로 빼라, 새 글 쓰기는
      // 바로바로 들어가게"). 각자 자기 목록·자기 "새 글 쓰기"를 갖는 원래
      // 구조로 되돌렸다 — 컷 목록·URL 하나짜리 가벼운 콘텐츠라 긴 글쓰기용
      // 캔버스에 끼워둘 이유도 없었다(2026-08-09 최초 분리 때의 이유).
      { label: "웹툰", href: "/webtoon", Icon: IconWebtoon },
      { label: "영상", href: "/video", Icon: IconVideo },
      // "오늘의 이슈, 4가지 시선"(2026-08-12) — Instagram @ailens 카드뉴스
      // 포맷을 웹으로. 웹툰/영상과 같은 이유로 독립 메뉴.
      { label: "4가지 시선", href: "/lens", Icon: IconLens },
      // 홈 화면 "오늘의 단어 퀴즈" CMS 직접 출제(2026-08-09) — 별도 독립
      // 콘텐츠 타입(term/explain만, CmsPost 아님).
      { label: "퀴즈", href: "/quiz", Icon: IconQuiz },
      { label: "뉴스레터", href: "/newsletter", Icon: IconSend },
      // 홈 화면 하단 플레이 카드가 재생할 배경 음악(유튜브 링크) 전용 관리
      // 화면(2026-08-16) — 레터 안의 "팟캐스트"(레터 상세 페이지 mp3 업로드,
      // PodcastUploadField)와는 다른 기능이라 별도 탭으로 분리.
      { label: "홈 플레이어", href: "/home-player", Icon: IconMusic },
    ],
  },
  {
    title: "운영",
    items: [
      { label: "대시보드", href: "/", Icon: IconGauge },
      { label: "비용", href: "/cost", Icon: IconCoin },
      { label: "스케줄·플래그", href: "/drivers", Icon: IconSliders },
      // "프롬프트" 독립 탭은 2026-08-09에 없앴다 — 콘텐츠 목록 화면
      // (글 관리/웹툰/영상) 각각에 "프롬프트" 버튼을 두고 모달로 바로
      // 열게 바꾸면서, 어느 프롬프트가 어느 화면 거인지 안 갈리던 별도
      // 목록 탭이 더 필요 없어졌다. 페이지 자체(/prompts, /prompts/edit)는
      // 아직 지우지 않았다 — 다른 화면들과 같은 이유(라우트는 남기고
      // 진입만 없애는 쪽이 되돌리기 쉽다).
    ],
  },
  {
    title: "설정",
    items: [{ label: "설정", href: "/settings", Icon: IconCog }],
  },
];

/* Sidebar 렌더 함수 밖에 둔다 — 안에 정의하면 매 렌더마다 새 컴포넌트 타입이
   생겨 하위 트리가 리마운트되고 메뉴 접힘 상태가 초기화된다. */
function SidebarContent({
  withClose = false,
  pathname,
  open,
  setOpen,
  onNavigate,
  onClose,
  onLogout,
}: {
  withClose?: boolean;
  pathname: string;
  open: Record<string, boolean>;
  setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onNavigate: (href: string) => void;
  onClose: () => void;
  onLogout: () => void;
}) {
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-black/5"
            style={{ background: "var(--accent)", boxShadow: "var(--shadow-sm)" }}
          >
            <span className="font-display text-white text-[13px] font-bold leading-none">
              AL
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[15px] font-bold leading-tight truncate"
                style={{ color: "var(--text-primary)" }}>
              AI LENS
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.14em] uppercase"
               style={{ color: "var(--text-faint)" }}>
              Newsroom CMS
            </p>
          </div>
          {withClose && (
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--surface-sunken)] rounded-lg transition-colors cursor-pointer"
              title="메뉴 닫기"
            >
              <IconClose className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      <div className="mx-5 border-t border-[var(--border-hairline)] mb-3" />

      <nav className="flex-1 overflow-y-auto px-3 py-1 space-y-4">
        {MENU_GROUPS.map((group) => (
          <div key={group.title}>
            <button
              onClick={() =>
                setOpen((p) => ({ ...p, [group.title]: !p[group.title] }))
              }
              className="w-full px-2.5 py-1.5 flex items-center justify-between rounded-lg transition-colors cursor-pointer hover:bg-[var(--surface-sunken)]"
              style={{ color: "var(--text-faint)" }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                {group.title}
              </span>
              <IconChevron
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  open[group.title] ? "" : "-rotate-90"
                }`}
              />
            </button>

            {open[group.title] && (
              <div className="mt-1 space-y-0.5">
                {group.items.map(({ label, href, Icon }) => {
                  const active = isActive(href);
                  return (
                    <button
                      key={href}
                      onClick={() => onNavigate(href)}
                      aria-current={active ? "page" : undefined}
                      className={`group/nav relative w-full pl-3.5 pr-2.5 py-2 flex items-center gap-2.5 text-[13px] rounded-lg cursor-pointer transition-colors duration-150 ${
                        active ? "font-semibold" : "hover:bg-[var(--surface-sunken)]"
                      }`}
                      style={{
                        background: active ? "var(--accent-soft)" : undefined,
                        color: active
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      <span
                        className="flex-shrink-0 transition-transform duration-150 group-hover/nav:translate-x-[1px]"
                        style={{
                          color: active ? "var(--accent)" : "var(--text-faint)",
                        }}
                      >
                        <Icon />
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 pt-2">
        <div className="mx-2 border-t border-[var(--border-hairline)] mb-3" />
        <button
          onClick={onLogout}
          className="w-full px-3.5 py-2 flex items-center gap-2.5 text-[13px] rounded-lg cursor-pointer transition-colors duration-150 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
          style={{ color: "var(--text-muted)" }}
        >
          <IconLogout />
          <span>로그아웃</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(MENU_GROUPS.map((g) => [g.title, true]))
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const shared = {
    pathname,
    open,
    setOpen,
    onNavigate: (href: string) => {
      router.push(href);
      setMobileOpen(false);
    },
    onClose: () => setMobileOpen(false),
    onLogout: () => {
      clearAuth();
      router.replace("/login");
    },
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl transition-colors cursor-pointer"
        style={{
          background: "var(--surface-card)",
          color: "var(--text-secondary)",
          boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border-hairline)",
        }}
        aria-label="메뉴"
      >
        {mobileOpen ? (
          <IconClose className="w-5 h-5" />
        ) : (
          <IconMenu className="w-5 h-5" />
        )}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/25 backdrop-blur-[2px] z-40 animate-[ui-fade-up_180ms_ease-out]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className="hidden lg:flex flex-col w-[var(--sidebar-w)] border-r h-screen flex-shrink-0 fixed left-0 top-0 z-30"
        style={{ background: "var(--surface-sidebar)", borderColor: "var(--border-hairline)" }}
      >
        <SidebarContent {...shared} />
      </aside>

      <aside
        className={`lg:hidden fixed left-0 top-0 h-full w-[var(--sidebar-w)] z-50 transform transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--surface-sidebar)", boxShadow: "var(--shadow-md)" }}
      >
        <SidebarContent withClose {...shared} />
      </aside>
    </>
  );
}
