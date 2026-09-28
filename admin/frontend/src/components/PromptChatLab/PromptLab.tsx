"use client";

import { PromptChatLab } from "./PromptChatLab";
import { PromptTextLab } from "./PromptTextLab";
import { TABS, usePromptLab } from "./PromptLabProvider";

/* 프롬프트 실험 — 4포맷 탭(2026-09-22 신설). 사용자 요청: "지금 웹툰은
   완성이 되어있는데... 웹툰 프롬프트쪽을 활용... 상단에 탭 4개를 만들면
   어떨까요? 탭별로 이동을 하고, 원하는 페이지로 가서 실험을 하고,
   파이프라인을 웹툰 환경처럼 개선할 수 있도록" — 지금까지 웹툰만
   PromptChatLab(챗 기반+버전 히스토리)을 썼고, 레터·팟캐스트·영상은
   PromptDrawer(textarea+비스트리밍 테스트)뿐이었다. 이 컴포넌트가 4개
   포맷 페이지(webtoon/letters/podcast/video) 각각의 "프롬프트 실험"
   버튼이 여는 화면을 하나로 통일한다 — 탭을 눌러도 페이지를 안 떠나고
   같은 전체화면 안에서 카테고리만 바뀐다.

   2026-09-24, 두 번째 개편 — 사용자 요청: "근본적으로... 진짜 다
   동시작업이 가능하도록 하고 싶은데... 대화 다른 곳에 머물러도... 될
   수 있게?" 예전엔 탭을 바꾸면 `key={category}`로 이전 탭을 통째로
   언마운트했다(대화 상태가 섞이지 않게 하려던 의도였는데, 그 대가로
   전환할 때마다 웹소켓 연결·진행 중이던 작업이 전부 날아갔다). 이제
   상태 소유권 자체가 PromptLabProvider.tsx(신설)로 옮겨갔고, 이
   컴포넌트는 그 Provider가 넘겨주는 `visited`(한 번이라도 연 적 있는
   탭) Set에 있는 탭만 마운트하되 — 한 번 마운트된 탭은 절대
   언마운트하지 않는다. 비활성 탭은 CSS `hidden`으로 화면에서만 숨긴다
   (컴포넌트는 살아있으니 PromptChatLab/PromptTextLab이 각자 들고 있는
   useAdminChatSocket() 연결·채팅 상태·영상 카드 상태가 그대로 유지됨).
   PromptChatLab.tsx/PromptTextLab.tsx 내부는 전혀 안 건드렸다 — 원래도
   그 둘이 요구하는 props(open/onClose/embedded/category)만 그대로 준다.

   `open`/`onClose`/`category` 등 상태는 이제 전부 Provider 소유라 이
   컴포넌트는 props를 받지 않는다 — `usePromptLab()`으로 직접 구독한다.
   TABS/PromptLabCategory도 Provider가 정본(카테고리 상태를 Provider가
   소유하니 그 타입의 원천도 거기로 옮겼다). */

export function PromptLab() {
  const { isOpen, category, visited, setCategory, close } = usePromptLab();

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-lab-title"
      inert={!isOpen}
      className={`fixed inset-0 z-50 flex h-full w-full flex-col bg-[var(--surface-card)] transition-opacity duration-200 ease-out ${
        isOpen ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="ui-divider flex flex-none items-center gap-1 border-b bg-[var(--surface-sunken)] px-3 py-2">
        <span id="prompt-lab-title" className="sr-only">
          프롬프트 실험
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCategory(t.id)}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={
              category === t.id
                ? { background: "var(--surface-card)", color: "var(--text-primary)" }
                : { color: "var(--text-muted)" }
            }
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={close}
          className="flex-none rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)]"
          aria-label="닫기"
          title="닫기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {visited.has("webtoon") && (
          <div className={category === "webtoon" ? "h-full" : "hidden"}>
            <PromptChatLab open={isOpen} onClose={close} embedded />
          </div>
        )}
        {(["letters", "podcast", "video"] as const).map(
          (id) =>
            visited.has(id) && (
              <div key={id} className={category === id ? "h-full" : "hidden"}>
                <PromptTextLab
                  open={isOpen}
                  onClose={close}
                  embedded
                  category={id}
                  categoryLabel={TABS.find((t) => t.id === id)!.label}
                />
              </div>
            )
        )}
      </div>
    </aside>
  );
}
