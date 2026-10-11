/** 채팅 말풍선·타자기·스토리보드 카드 등 표시 컴포넌트 — PromptChatLab.tsx 에서 분리(리팩토링 7단계, 내용 불변). */
import { useEffect, useState, type ReactNode } from "react";
import { WebtoonStoryboardCut } from "@/lib/types";
import { JsonPath, pathsEqual } from "./liveStoryboardJson";
import type { ChatMessage } from "./chatTypes";

export function ChatBubble({
  msg,
  copiedId,
  onCopy,
}: {
  msg: ChatMessage;
  copiedId: string | null;
  onCopy: (m: ChatMessage) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={isUser ? "max-w-[78%]" : "w-full max-w-[92%]"}>
        {isUser ? (
          <div
            className="whitespace-pre-wrap rounded-2xl rounded-tr-sm px-4 py-2.5 text-[13px] leading-relaxed"
            style={{ background: "var(--accent-soft, #eef2ff)", color: "var(--text-primary)" }}
          >
            {msg.text}
          </div>
        ) : (
          <div className="space-y-2.5">
            {msg.text && <TypewriterText text={msg.text} animate={!!msg.animate} />}
            {msg.storyboard && <StoryboardCard data={msg.storyboard} />}
            {/* 2026-09-27, 사용자 요청 — "복사버튼 있으면 좋을것같고요..
                nova 서비스처럼": PromptTextLab.tsx와 동일한 위치·모양
                (답변 아래, 아이콘+라벨). storyboard(JSON 카드)만 있고
                text가 없는 메시지엔 복사할 평문이 없어 안 보여준다. */}
            {msg.id !== "greeting" && msg.text && (
              <button
                type="button"
                onClick={() => onCopy(msg)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
              >
                {copiedId === msg.id ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copiedId === msg.id ? "복사됨" : "복사"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* 2026-09-18, 사용자 요청 — "이미지 프롬프트 같은거는.. 코드블럭에.. 감싸서
   출력해도 좋겠네": key가 "image_prompt"류면 값을 코드블럭(모노스페이스
   +테두리 박스)으로, 그 외는 "key: value" 한 줄로 보여준다. 스트리밍 중
   미리보기(tryParsePartialJson 결과)와 완성 후 최종 카드 둘 다 이
   컴포넌트 하나로 그린다 — 완성 전후로 디자인이 갈리지 않는다.

   inProgressPath(기본 null — 완성된 메시지 카드는 항상 null)가 주어지면,
   지금 그 경로와 같은 필드만 "아직 쓰는 중"으로 보고 코드블럭 박스를
   미룬다(위 tryParsePartialJson 주석 참고) — 그 필드를 지나 다음 필드로
   넘어간 순간 바로 코드블럭으로 확정된다, 응답 전체가 끝나길 기다리지
   않는다. */
export function DumpNode({
  value,
  depth = 0,
  path = [],
  inProgressPath = null,
}: {
  value: unknown;
  depth?: number;
  path?: JsonPath;
  inProgressPath?: JsonPath | null;
}): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[var(--text-faint)]">(없음)</span>;
    return (
      <div className="space-y-3">
        {value.map((v, i) => (
          <div
            key={i}
            className={depth === 0 ? "border-t border-[var(--border-hairline)] pt-3 first:border-t-0 first:pt-0" : ""}
          >
            <DumpNode value={v} depth={depth + 1} path={[...path, i]} inProgressPath={inProgressPath} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => {
          const childPath = [...path, k];
          const isCodeField = /image_prompt|animation_prompt/i.test(k);
          const isInProgress = !!inProgressPath && pathsEqual(childPath, inProgressPath);
          if (v && typeof v === "object") {
            return (
              <div key={k}>
                <span className="font-semibold text-[var(--text-muted)]">{k}:</span>
                <div className="pl-3">
                  <DumpNode value={v} depth={depth + 1} path={childPath} inProgressPath={inProgressPath} />
                </div>
              </div>
            );
          }
          // 2026-09-20, 사용자 요청 — "코드블럭 때문에 복잡해지네.. 대신
          // 선을 두거나 해서 구분하는 좀 더 간편한 방식으로": 배경+테두리
          // 박스(border-radius·padding·surface-sunken 배경)가 스트리밍 중
          // 필드 하나가 "미완성(평문)"에서 "완성(박스)"으로 바뀌는 순간
          // 박스가 갑자기 나타나며 레이아웃이 흔들리는 게 거슬렸다 — 박스
          // 대신 왼쪽 세로선 하나로만 코드 필드임을 표시한다(배경·둘레
          // 테두리·둥근 모서리 없음, 등장할 때 튀는 느낌이 훨씬 적다).
          // 모노스페이스 폰트는 코드 필드라는 걸 구분하는 용도로 유지.
          if (isCodeField && !isInProgress) {
            return (
              <div key={k}>
                <span className="font-semibold text-[var(--text-muted)]">{k}:</span>
                <pre
                  className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-2.5 font-mono text-[11px] leading-relaxed"
                  style={{ borderColor: "var(--border-hairline)" }}
                >
                  {String(v ?? "")}
                </pre>
              </div>
            );
          }
          return (
            <p key={k}>
              <span className="font-semibold text-[var(--text-muted)]">{k}: </span>
              <span>{String(v ?? "")}</span>
            </p>
          );
        })}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

/* 기사 반응 문구(진짜 토큰 스트리밍, liveText 참고)를 뺀 나머지 어시스턴트
   텍스트 — "GPU를 켜는 중입니다" 같은 상태 메시지, 오류 메시지 — 는
   완성된 문자열이 웹소켓으로 한 번에 온다(스토리보드 JSON·컷 이미지처럼
   "다 돼야 의미 있는" 데이터라 토큰 단위로 쪼갤 이유가 없다, 위 모듈
   docstring·routes/chat_ws.py 참고). 그래도 채팅 톤을 맞추려고 여기서
   타자 치듯 풀어내는 연출을 입힌다. */
/** 타자 치듯 문자열을 점진적으로 드러낸다 — 이미 문자열 하나짜리 값이
 *  필요한 자리(다른 요소 안에 끼워 넣을 때)에 쓴다. 자체 마크업을 갖는
 *  텍스트 블록은 아래 TypewriterText를 쓴다. */
export function useTypewriter(text: string, animate: boolean): string {
  const [shown, setShown] = useState(animate ? "" : text);
  useEffect(() => {
    if (!animate) return; // 초기 state가 이미 text 전체 — 애니메이션 없이 그대로 둔다
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i = Math.min(i + 2, text.length);
      setShown(text.slice(0, i));
      if (i < text.length) timer = setTimeout(step, 12);
    };
    timer = setTimeout(step, 12);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- text/animate는 메시지 생성 시점에 고정, 재생 중 바뀌지 않음
  }, []);
  return shown;
}

export function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const shown = useTypewriter(text, animate);
  return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">{shown}</p>;
}

/* 박스·카드 없이 대화 텍스트처럼 바로 흘러나오게(2026-09-15, 사용자 요청
   — "박스 같은거 만들 필요없이 날것으로 빠르게 대화 답변 출력"). 구분은
   테두리·배경이 아니라 타이포그래피(굵기·크기)와 컷 번호만으로 준다. */
/** 2026-09-18, 사용자 요청 — "정리해서 카드처럼 나오는 작업 없애주시고, 날것으로
 *  모든 출력결과 다 출력해주세요"(예: 대사(dialogue)가 title+scene 요약 카드에선
 *  안 보였음). 컷마다 2단계 산출물 전체(narration/caption/dialogue/camera/scene/
 *  title/title_keyword/closing_caption)를 필드 그대로 나열한다 — 골라서 보여주지
 *  않는다. */
/* 2026-09-20, 사용자 요청 — "답변 출력을 모두 마무리하고 깔끔한 디자인으로
   렌더링 하는 과정이 있는데 이 과정을 없애고 싶어요.. 처음 출력한 거
   그대로 가도록": 이 카드는 스트리밍이 끝난 뒤(storyboard 메시지 도착
   시점) 붙는 "완성본" 카드다. 1차로 컷마다 순차 fade-up 애니메이션
   (animationDelay: i*70ms)을 없앴는데도, 사용자가 스크린샷으로 "아직도
   디자인 입혀서 나온다"고 재지적 — "컷 N"이라는 라벨을 accent 색상
   굵은 글씨로 별도로 얹고 있던 게 남아있었다(실시간 스트리밍 중엔
   DumpNode가 배열을 그냥 나열만 하지 "컷 N" 헤더를 안 만든다 — 이
   컴포넌트가 완성 후에만 그 헤더를 "입혀서" 보여준 것). 이제 스트리밍
   중 보던 것과 완전히 같은 렌더러(DumpNode)에 같은 값을 그대로 넘긴다
   — 이 컴포넌트에 남는 건 DumpNode 호출 하나뿐이다. */
export function StoryboardCard({ data }: { data: { coreQuestion: string; cuts: WebtoonStoryboardCut[]; testedVersion?: number | null } }) {
  return (
    <div className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
      {/* 2026-09-21 — 과거 버전으로 시험 발화한 결과인지 배지로 구분(A/B
          테스트 느낌, 사용자 요청). 채팅 기록을 스크롤해서 보면 어느 결과가
          최신 기준이고 어느 게 과거 버전 테스트였는지 헷갈릴 수 있어서. */}
      {data.testedVersion != null && (
        <span
          className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          v{data.testedVersion}로 시험 발화
        </span>
      )}
      <DumpNode value={data} />
    </div>
  );
}

/* "생각 중" 표시 — 요청 보내고 첫 응답 오기 전까지(2026-09-15, 사용자
   요청 — "출력할 때 기다리는 동안 심심하니까"). 점 세 개가 순서대로
   튀어 오르는 흔한 채팅 UI 패턴, Tailwind 기본 animate-bounce 재사용. */
export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" role="status" aria-label="응답 준비 중">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full"
          style={{ background: "var(--text-faint)", animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
