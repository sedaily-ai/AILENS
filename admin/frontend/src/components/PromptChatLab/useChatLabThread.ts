"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { ChatThreadSummary, ChatThreadDetail, ChatThreadMessage } from "@/lib/types";

type MsgRole = "user" | "assistant";

/* 대화 스레드 상태 골격 — 메시지 목록·스레드 목록·현재 스레드 id·저장
   (appendMessage)·복원(openThread)·새 대화(startNewThread)·스레드 생성
   지연 처리(ensureThread)를 담당한다. 2026-09-24 — PromptChatLab.tsx(웹툰)
   와 PromptTextLab.tsx(레터/팟캐/영상)에 거의 그대로 복붙돼 있던 이 골격을
   여기로 뽑았다(사용자 지적: "공통으로 사용할 수 있는 로직은 공통으로
   빼면 좋을 것 같다").

   실시간 스트리밍 연출(liveText 누적, 웹툰의 requestAnimationFrame 기반
   글자 단위 타자기 리빌)은 포맷마다 복잡도 차이가 너무 커서(웹툰만
   storyboard JSON 파싱+스크롤 방향 추적까지 얽혀 있음) 일부러 이 훅에
   안 넣었다 — 각 컴포넌트에 그대로 남겨 공통화 리스크를 줄인다. */
export function useChatLabThread<TMessage extends { id: string; role: MsgRole }>(opts: {
  category: string;
  promptName: string;
  /** 보통 다이얼로그의 open 상태 — 닫혀 있을 때는 스레드 목록을 안 불러온다(기존 동작 그대로). */
  enabled: boolean;
  makeGreeting: () => TMessage;
  /** null을 반환하면 그 메시지는 복원된 messages 배열에서 빠진다(2026-09-26
   *  추가) — persistArtifact로 저장된 "말풍선엔 안 보이는" 결과물(웹툰
   *  컷 이미지 등)이 openThread에서 다시 빈 말풍선으로 되살아나는 걸
   *  막는다. 사용자 지적: "이미지 부분이 채팅 부분에도 출력이 되는데,
   *  출력할 필요 없고요" — 저장 시점(persistArtifact)엔 이미 안 보이게
   *  했는데, 복원 시점(openThread)엔 서버가 돌려주는 메시지를 전부
   *  그대로 messages에 넣고 있어서 다시 보이는 문제였다. */
  mapSavedMessage: (raw: ChatThreadMessage) => TMessage | null;
  /** 저장 직전 메시지에 기본값을 덧씌운다(예: 웹툰의 `animate: role==="assistant"` 기본값).
   *  반환값이 최종적으로 messages 배열에 들어간다. */
  decorateMessage?: (msg: Omit<TMessage, "id">) => Omit<TMessage, "id">;
  /** 스레드에 저장할 payload를 직접 구성한다 — 생략하면 `{ ...persistExtra, text }`만 보낸다. */
  buildPersistPayload?: (msg: Omit<TMessage, "id">, persistExtra?: Record<string, unknown>) => Record<string, unknown>;
}) {
  const { category, promptName, enabled, makeGreeting, mapSavedMessage, decorateMessage, buildPersistPayload } = opts;

  const [messages, setMessages] = useState<TMessage[]>(() => [makeGreeting()]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadId, setThreadIdState] = useState<number | null>(null);
  const threadIdRef = useRef<number | null>(null);

  const setThreadId = (id: number | null) => {
    threadIdRef.current = id;
    setThreadIdState(id);
  };

  const refreshThreads = () => {
    adminApi
      .listChatThreads(category, promptName)
      .then((r) => setThreads(r.threads))
      .catch((err) => console.error("대화 목록 불러오기 실패", err));
  };

  useEffect(() => {
    if (!enabled) return;
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- category별 독립 스레드 목록이라 category도 키에 포함
  }, [enabled, category]);

  const appendMessage = (msg: Omit<TMessage, "id">, persistExtra?: Record<string, unknown>) => {
    const decorated = decorateMessage ? decorateMessage(msg) : msg;
    const id = `${decorated.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const full = { ...decorated, id } as TMessage;
    setMessages((prev) => [...prev, full]);
    if (threadIdRef.current !== null) {
      const payload = buildPersistPayload
        ? buildPersistPayload(decorated, persistExtra)
        : { ...persistExtra, text: (decorated as { text?: string }).text };
      adminApi
        .appendChatMessage(threadIdRef.current, decorated.role, payload)
        .then(() => refreshThreads()) // updated_at 갱신 -> 최신 대화가 목록 맨 위로
        .catch((err) => console.error("메시지 저장 실패", err));
    }
    return full;
  };

  /** 사이드바 "새 대화" — 서버에 빈 스레드를 미리 만들진 않는다, 첫
   *  메시지를 보낼 때(ensureThread) 만든다(아무것도 안 치고 나가도 빈
   *  스레드가 목록에 안 쌓이게). */
  const startNewThread = () => {
    setThreadId(null);
    setMessages([makeGreeting()]);
  };

  /** 사이드바에서 기존 스레드 클릭 — 저장된 메시지를 그대로 복원한다.
   *  호출부가 반환된 detail로 자기만의 추가 상태(웹툰의 storyboard 등)를
   *  복원할 수 있게 detail을 그대로 돌려준다. */
  const openThread = (id: number): Promise<ChatThreadDetail | null> => {
    return adminApi
      .getChatThread(id)
      .then((detail) => {
        setThreadId(id);
        const loaded = detail.messages
          .map(mapSavedMessage)
          .filter((m): m is TMessage => m !== null);
        setMessages(loaded.length ? loaded : [makeGreeting()]);
        return detail;
      })
      .catch((err) => {
        console.error("대화 불러오기 실패", err);
        return null;
      });
  };

  /** send() 진입점에서 호출 — 스레드가 없으면 백그라운드로 생성하고,
   *  생성이 끝나는 즉시 이미 화면에 띄운 첫 사용자 메시지를 뒤늦게
   *  저장한다(2026-09-22 버그 수정 — 스레드 생성 HTTP 왕복을 기다리지
   *  않고 먼저 응답 요청을 보내되, 그 사이 threadIdRef가 아직 null이라
   *  저장이 스킵됐던 첫 메시지도 결국은 저장되게 한다). */
  const ensureThread = (firstUserText: string) => {
    if (threadIdRef.current !== null) return;
    adminApi
      .createChatThread(category, promptName, firstUserText.slice(0, 60))
      .then((thread) => {
        setThreadId(thread.id);
        adminApi
          .appendChatMessage(thread.id, "user", { text: firstUserText })
          .then(() => refreshThreads())
          .catch((err) => console.error("첫 메시지 저장 실패", err));
      })
      .catch((err) => console.error("대화 스레드 생성 실패", err));
  };

  /** 채팅 말풍선에는 안 보이는 "사이드 패널 결과물" 저장 — 2026-09-24,
   *  사용자 지적: "대화 하고 나갔다 오면... 음성, 영상, 웹툰 등...
   *  사라지는데... 대화들은 살아있는데, 나머지들도 다 남으면 좋지."
   *  팟캐스트 음성 카드·영상 카드처럼 메시지 리스트가 아니라 별도 패널에
   *  그리는 산출물을 이 대화에 묶어서 저장한다 — 웹툰의 컷 이미지가
   *  이미 하고 있는 것과 같은 패턴(appendMessage로 즉시 저장)이지만,
   *  로컬 `messages`(채팅 화면)는 안 건드린다 — 결과물마다 텍스트
   *  말풍선이 끼어드는 걸 피하려고 일부러 appendMessage를 안 쓰고
   *  서버에만 직접 append한다.
   *
   *  targetThreadId(같은 날 후속, 사용자 지적 — "음성 생성중에... 새
   *  대화창을 열고... 다시 돌아오면... 작업이 중단되어있는데... 다른
   *  탭으로 이동하더라도 작업 큐가 돌고 있어야 하는 것 아닌가요?"):
   *  생략하면(기존 동작) 호출 시점의 threadIdRef.current를 쓰지만, 카드
   *  생성이 오래 걸려 그 사이 사용자가 다른 대화로 넘어가버리면
   *  threadIdRef.current는 이미 "지금 보고 있는" 다른 대화를 가리킨다 —
   *  그러면 결과가 엉뚱한 대화에 저장된다. 생성 시작 시점에 캡처해둔
   *  "이 카드가 속한" threadId를 명시적으로 넘기면 그 대화에 정확히
   *  저장된다(VoicePreviewGenerator.tsx/VideoCardGenerator.tsx의
   *  ownerThreadId 참고). */
  const persistArtifact = (payload: Record<string, unknown>, targetThreadId?: number | null) => {
    const id = targetThreadId === undefined ? threadIdRef.current : targetThreadId;
    if (id === null) return;
    adminApi
      .appendChatMessage(id, "assistant", payload)
      .then(() => refreshThreads())
      .catch((err) => console.error("결과물 저장 실패", err));
  };

  /* 2026-09-26, 사용자 요청 — "좌측 대화 사이드바에도 이름 변경, 대화
   *  삭제 할 수 있도록... 일괄삭제나 그런거 가능하게". 백엔드(PUT/DELETE
   *  /admin/chat-threads/{id})와 프론트 API 클라이언트(adminClient.ts::
   *  updateChatThreadTitle/deleteChatThread)는 이미 다 있었다 — UI에서만
   *  안 쓰고 있었다. 웹툰(PromptChatLab.tsx)·레터/팟캐/영상(PromptTextLab.tsx)
   *  둘 다 이 훅을 쓰므로 여기 한 번만 추가하면 양쪽 다 얻는다. */
  const renameThread = (id: number, title: string) => {
    return adminApi
      .updateChatThreadTitle(id, title)
      .then(() => refreshThreads());
  };

  /** 2026-09-26 신설 — 이모지 태그 설정/해제(레퍼런스 프로젝트 1_ai_link/nova
   *  ConversationItem.jsx 참고). 같은 이모지를 다시 누르면 tag=null로
   *  해제하는 토글은 호출부(ChatThreadSidebar.tsx)가 결정한다. */
  const setThreadTag = (id: number, tag: string | null) => {
    return adminApi.setChatThreadTag(id, tag).then(() => refreshThreads());
  };

  /** 지금 열려 있는 대화를 지우면 "새 대화" 상태로 되돌린다(빈 스레드를
   *  계속 보고 있게 두지 않음) — 그 외엔 목록만 새로고침. */
  const deleteThread = (id: number) => {
    return adminApi.deleteChatThread(id).then(() => {
      if (threadIdRef.current === id) startNewThread();
      refreshThreads();
    });
  };

  /** 일괄 삭제 — 레퍼런스 프로젝트(1_ai_link/nova ConversationGroup 패턴)와
   *  동일하게 개별 DELETE를 병렬로 쏘고 성공한 것만 반영한다(Promise.allSettled
   *  — 하나 실패해도 나머지는 지워지게). */
  const bulkDeleteThreads = async (ids: number[]) => {
    const results = await Promise.allSettled(ids.map((id) => adminApi.deleteChatThread(id)));
    const deletedIds = ids.filter((_, i) => results[i].status === "fulfilled");
    if (threadIdRef.current !== null && deletedIds.includes(threadIdRef.current)) {
      startNewThread();
    }
    refreshThreads();
    return { deletedCount: deletedIds.length, failedCount: ids.length - deletedIds.length };
  };

  return {
    messages,
    setMessages,
    threads,
    threadId,
    threadIdRef,
    setThreadId,
    refreshThreads,
    appendMessage,
    startNewThread,
    openThread,
    ensureThread,
    persistArtifact,
    renameThread,
    setThreadTag,
    deleteThread,
    bulkDeleteThreads,
  };
}
