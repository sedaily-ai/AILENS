"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/* 프롬프트 실험(PromptLab) 전역 상태 — 2026-09-24 신설. 사용자 요청:
   "4개 유형에 대해서... 동시에 작업도 되는건가요?? ... 근본적으로..
   진짜 다 동시작업이 가능하도록 하고 싶은데... 대화 다른 곳에 머물러도..
   될 수 있게?" — 예전엔 4개 페이지(webtoon/podcast/video/posts)가 각자
   `<PromptLab open={..} onClose={..}/>`를 독립적으로 마운트했고,
   PromptLab 내부도 탭을 바꿀 때마다 `key={category}`로 이전 탭을 통째로
   언마운트했다 — 탭 전환은 물론 페이지 이동만 해도 웹소켓 연결·채팅
   상태·영상 렌더 카드가 전부 사라졌다.

   이 Provider를 레이아웃 레벨(app/(authenticated)/layout.tsx)에 한 번만
   마운트해서 PromptLab 자체를 SPA 전체에서 싱글턴으로 만든다. 상태의
   핵심은 `visited`(한 번이라도 연 적 있는 카테고리 Set) — PromptLab.tsx가
   이 Set에 들어있는 탭만 마운트하고, 마운트된 탭은 절대 언마운트하지
   않는다(비활성 탭은 CSS로 숨기기만 함). PromptChatLab.tsx/PromptTextLab.tsx
   는 각자 독립적으로 useAdminChatSocket()을 소유하므로(내부 수정 없음),
   "마운트 유지"만으로 웹소켓 연결·채팅 스트리밍·영상 카드 상태가 전부
   자동으로 살아있게 된다 — 탭을 바꾸거나 랩을 닫거나 다른 관리자
   페이지로 이동해도(레이아웃이 안 바뀌는 한) 그대로 이어진다.

   `open(category?)`를 인자 없이 부르면 지금 category를 유지한 채 그냥
   연다 — 4개 페이지의 "프롬프트 실험" 버튼은 전부 인자 없이 호출해서,
   2026-09-24에 확정한 "처음 진입은 항상 레터 탭 고정, 이후엔 마지막
   위치 유지" 동작을 그대로 보존한다.

   이 파일은 `PromptLab`을 직접 렌더하지 않는다(ToastProvider가
   `{children}`+자기 UI를 같이 렌더하는 것과 다른 점) — PromptLab.tsx가
   이 파일의 TABS/usePromptLab을 가져다 쓰는데, 여기서 PromptLab을
   import까지 해버리면 두 파일이 서로를 import하는 순환 참조가 된다.
   대신 `app/(authenticated)/layout.tsx`가 `<PromptLabProvider><PromptLab
   />{children}</PromptLabProvider>`처럼 둘을 나란히 조립한다. */

export const TABS = [
  { id: "letters", label: "레터" },
  { id: "webtoon", label: "웹툰" },
  { id: "podcast", label: "팟캐스트" },
  { id: "video", label: "영상" },
] as const;

export type PromptLabCategory = (typeof TABS)[number]["id"];

const DEFAULT_CATEGORY: PromptLabCategory = "letters";

interface PromptLabContextValue {
  isOpen: boolean;
  category: PromptLabCategory;
  /** 한 번이라도 활성화된 적 있는 탭 — PromptLab.tsx가 이 Set에 있는
   *  탭만 마운트한다(마운트되면 다시는 안 빠짐). */
  visited: Set<PromptLabCategory>;
  /** 인자 없이 부르면 지금 category 유지한 채 열기만 한다. */
  open: (category?: PromptLabCategory) => void;
  close: () => void;
  setCategory: (category: PromptLabCategory) => void;
}

const PromptLabContext = createContext<PromptLabContextValue | null>(null);

export function usePromptLab(): PromptLabContextValue {
  const ctx = useContext(PromptLabContext);
  if (!ctx) throw new Error("usePromptLab()은 PromptLabProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function PromptLabProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategoryState] = useState<PromptLabCategory>(DEFAULT_CATEGORY);
  const [visited, setVisited] = useState<Set<PromptLabCategory>>(() => new Set());
  // setState 안에서 "지금 category"를 즉시 읽어야 하는데(open()이 인자
  // 없이 호출될 때) 클로저가 stale해질 수 있어(useChatLabThread.ts의
  // threadIdRef와 같은 이유) ref로 최신값을 같이 들고 있는다.
  const categoryRef = useRef<PromptLabCategory>(DEFAULT_CATEGORY);

  const setCategory = useCallback((next: PromptLabCategory) => {
    categoryRef.current = next;
    setCategoryState(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, []);

  const open = useCallback(
    (next?: PromptLabCategory) => {
      setIsOpen(true);
      setCategory(next ?? categoryRef.current);
    },
    [setCategory]
  );

  const close = useCallback(() => setIsOpen(false), []);

  return (
    <PromptLabContext.Provider value={{ isOpen, category, visited, open, close, setCategory }}>
      {children}
    </PromptLabContext.Provider>
  );
}
