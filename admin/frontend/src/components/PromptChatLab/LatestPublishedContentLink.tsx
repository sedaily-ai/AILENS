"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { CmsChannel, CmsPost } from "@/lib/types";

/* 2026-09-27 — 사용자 요청: "프로덕션 적용하고 나서, 발행된 레터가 있다면..
   정상적으로 체크하기 위해서.. 링크 같은거.. 나오게 되면 좋지 않을까요?"
   레터 전용으로 먼저 만들었다가(PromptTextLab.tsx의 옛 LatestPublishedLetterLink),
   "4개 유형 모두 된건가요?" 재질문으로 웹툰·영상까지 일반화했다 — channel/
   urlPath만 다르고 로직은 완전히 같아서 공용 컴포넌트로 뺐다(웹툰은
   PromptChatLab.tsx, 레터·영상은 PromptTextLab.tsx — 서로 다른 파일이라
   여기 공용 파일로).

   프롬프트를 프로덕션에 적용해도 실제 콘텐츠가 그 자리에서 바로 새로
   발행되는 건 아니다(자동 파이프라인이 정해진 시각에 그 설정으로
   발행하는 방식) — 그래서 "적용 직후"가 아니라 "언제 봐도 지금 실제로
   발행돼 있는 최신 걸 바로 확인할 수 있게" 프로덕션 카드에 상시 둔다.
   새로고침 버튼으로 방금 자동 발행된 게 있으면 다시 확인할 수 있다.

   팟캐스트는 이 컴포넌트를 그대로 못 쓴다 — CmsChannel에 "podcast" 자체가
   없다(admin/(authenticated)/podcast/page.tsx가 스스로 "아직 팟캐스트
   생성 파이프라인이 연결되지 않았습니다"라고 밝히는 상태). 가장 가까운
   실제 발행물은 channel="home_player"(/listen/{slug}, 관리자가 수동으로
   등록하는 홈 오디오 플레이어 항목)라 호출부에서 그걸 쓰되, 라벨은
   "팟캐스트 발행"이 아니라 "홈 오디오 플레이어"라고 정직하게 적는다 —
   프롬프트 랩의 팟캐스트 설정과 직접 연결된 게 전혀 아니기 때문이다. */
export function LatestPublishedContentLink({
  channel,
  urlPath,
  label,
  caveat,
}: {
  channel: CmsChannel;
  /** SITE_URL 뒤에 붙는 경로 세그먼트 — 예: "webtoon"/"video"/"letters"/"listen"
   *  (service/frontend/src/app/(content)/{urlPath}/[slug] 라우트와 맞춰야 한다). */
  urlPath: string;
  /** 링크 앞에 붙는 설명 — 채널마다 다른 뉘앙스가 필요해서(특히 팟캐스트
   *  대체용 home_player) 호출부가 정한다. */
  label: string;
  /** 2026-09-27, 실측으로 확인한 한계 — 사용자가 "쿼리나 그런거 잘
   *  연결되는건가?" 확인 요청, 실제로 admin/posts API를 직접 호출해
   *  검증해보니: 웹툰·레터는 목록 매칭=실제 발행 페이지 존재가 100%
   *  일치했지만(라이브 URL까지 200 확인), video/home_player(팟캐스트
   *  대체)는 admin API의 느슨한 "렌디션 존재 여부" 매칭이 실제로는 그
   *  포맷 콘텐츠가 비어있는 글도 "매칭됨"으로 잡을 수 있고(video_url이
   *  빈 문자열인 채로 매칭된 실제 사례 확인, 그 글의 /video/{slug}는
   *  404), 목록 응답 자체가 media_embed_url 같은 포맷별 필드를 상세
   *  조회와 다르게(항상 비어있게) 내려줘서 여기서 클라이언트가 미리
   *  걸러낼 방법도 마땅치 않다 — 그래서 숨기는 대신 눈에 보이는
   *  캐비앗으로 정직하게 알린다. */
  caveat?: string;
}) {
  const [post, setPost] = useState<CmsPost | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const fetchLatest = () => {
    setPost(undefined);
    setError(false);
    adminApi
      .listPosts({ status: "published", channel, limit: 1 })
      .then((r) => setPost(r.posts[0] ?? null))
      .catch((err) => {
        console.error("최근 발행 콘텐츠 조회 실패", err);
        setError(true);
      });
  };

  useEffect(() => {
    // 마운트 시 초기 비동기 fetch — admin/frontend/CLAUDE.md의
    // set-state-in-effect 예외 패턴(drivers/newsletter 페이지와 동일).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel은 이 컴포넌트 생애주기 동안 안 바뀐다(호출부가 매번 다른 channel로 새 인스턴스를 마운트)
  }, []);

  return (
    <div className="mt-2 border-t px-3.5 pb-1.5 pt-2" style={{ borderColor: "var(--border-hairline)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-[11px]">
          {error ? (
            <span style={{ color: "var(--danger)" }}>최근 발행 콘텐츠 조회 실패</span>
          ) : post === undefined ? (
            <span style={{ color: "var(--text-faint)" }}>{label} 확인 중...</span>
          ) : post === null ? (
            <span style={{ color: "var(--text-faint)" }}>아직 발행된 콘텐츠가 없습니다</span>
          ) : (
            <a
              href={`https://ailens.sedaily.ai/${urlPath}/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-semibold text-[var(--accent)] hover:underline"
              title={post.headline}
            >
              {label} · {post.publish_date} · {post.headline}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={fetchLatest}
          title="새로고침"
          className="flex-none rounded p-1 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          </svg>
        </button>
      </div>
      {caveat && (
        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--warn)" }}>
          ⚠ {caveat}
        </p>
      )}
    </div>
  );
}
