"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { CardSkeleton, EmptyState, ErrorNote } from "@/components/Feedback";
import { CustomSelect } from "@/components/CustomSelect";
import { ECON_CATEGORIES, type CmsPost } from "@/lib/types";

// 카테고리 선택지(2026-08-21) — 홈 오디오 섹션 카드가 "팟캐스트"/"영상"
// (미디어 형식)만 보여주고 실제 내용 분류가 없다는 지적으로 추가. lens/
// letters와 같은 저장 위치(body_inline.category)를 재사용한다 —
// LensMode.tsx의 카테고리 선택 패턴과 동일.
const CATEGORY_OPTIONS = [{ value: "", label: "미분류" }, ...ECON_CATEGORIES.map((c) => ({ value: c, label: c }))];

// 홈 메인 화면 하단 플레이 카드("오늘의 핵심 뉴스")의 재생목록 전용 관리
// 화면(2026-08-16). 기사(letters)와 무관하게 관리자가 직접 "제목 + 유튜브
// 링크"로 항목을 만든다 — 레터 안의 "팟캐스트"(PodcastUploadField, 레터
// 상세 페이지 mp3 업로드)와는 완전히 다른 기능이라 이름을 분리했다.
//
// cms_posts 테이블을 그대로 쓰되 channels:["home_player"]로 고정해서 새
// 테이블·새 Lambda·새 API 라우트 없이 기존 admin/posts, 공개
// /api/v2/posts?channel=home_player 인프라를 재사용한다(posts_repo.py의
// _UPDATABLE에 media_embed_url/display_order, cms_posts_public.py에
// home_player 채널 shaper 추가로 끝 — service/backend/handlers/today_letters.py
// 나 daily_letters 테이블과는 무관).
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

function nextOrder(posts: CmsPost[]): number {
  return posts.reduce((max, p) => Math.max(max, p.display_order ?? 0), 0) + 1;
}

function NewItemForm({ nextDefaultOrder, onCreated }: { nextDefaultOrder: number; onCreated: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  // nextDefaultOrder가 바뀌면(항목 추가로 카운터가 오른 경우 등) order를
  // 리셋한다 — drivers/page.tsx의 ThresholdRow와 같은 "seed 추적 후 렌더
  // 중 동기 재설정" 패턴으로 useEffect+setState 없이 처리(2026-08-23,
  // set-state-in-effect 린트 정리 — CLAUDE.md가 새 예외 추가 전 근본
  // 수정을 먼저 시도하라고 명시).
  const [orderSeed, setOrderSeed] = useState(nextDefaultOrder);
  const [order, setOrder] = useState(nextDefaultOrder);
  if (orderSeed !== nextDefaultOrder) {
    setOrderSeed(nextDefaultOrder);
    setOrder(nextDefaultOrder);
  }
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!title.trim() || !url.trim()) {
      toast.show("제목과 링크를 모두 입력하세요", "error");
      return;
    }
    setBusy(true);
    try {
      const { post } = await adminApi.createPost({
        headline: title.trim(),
        channels: ["home_player"],
        publish_date: todayKST(),
        media_embed_url: url.trim(),
        display_order: order,
        body_inline: category ? { body: [], key_points: [], keywords: [], images: [], category } : undefined,
      });
      // 새로 만든 항목은 바로 홈에 나가도록 즉시 발행 — 이 화면의 용도 자체가
      // "링크 붙이면 바로 재생목록에 반영"이라 별도 초안 단계를 안 둔다.
      await adminApi.publishPost(post.id);
      toast.show("추가했습니다", "success");
      setTitle("");
      setUrl("");
      setCategory("");
      onCreated();
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-card space-y-3 rounded-xl p-4">
      <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">새 항목 추가</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="ui-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-[13px]"
          style={{ maxWidth: 260 }}
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="ui-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-[13px]"
          style={{ maxWidth: 360 }}
        />
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          title="재생 순서 (작을수록 먼저 재생)"
          className="ui-input w-20 rounded-lg px-2 py-1.5 text-[13px]"
        />
        <CustomSelect value={category} options={CATEGORY_OPTIONS} onChange={setCategory} placeholder="카테고리" />
        <button
          type="button"
          disabled={busy}
          onClick={add}
          className="ui-btn ui-btn-primary shrink-0 rounded-lg px-4 py-1.5 text-[13px] font-semibold"
        >
          추가
        </button>
      </div>
    </div>
  );
}

function Row({ post, onChanged }: { post: CmsPost; onChanged: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(post.headline);
  const [url, setUrl] = useState(post.media_embed_url ?? "");
  const [order, setOrder] = useState(post.display_order ?? 0);
  const [category, setCategory] = useState(post.body_inline?.category ?? "");
  const [busy, setBusy] = useState(false);
  const dirty =
    title !== post.headline ||
    url !== (post.media_embed_url ?? "") ||
    order !== (post.display_order ?? 0) ||
    category !== (post.body_inline?.category ?? "");
  const published = post.status === "published";

  const save = async () => {
    setBusy(true);
    try {
      // is_lens_bundle이면 channel="home_player"를 실어 보낸다 —
      // webtoon/edit·video/edit와 같은 이유(2026-09-11,
      // _update_lens_bundle_slice) — 레터·웹툰·영상은 그대로 두고 이
      // 항목의 media_url/transcript만 스코프해서 바뀐다.
      await adminApi.updatePost(
        post.id,
        {
          headline: title.trim(),
          media_embed_url: url.trim() || null,
          display_order: order,
          body_inline: { ...post.body_inline, category: category || undefined },
        },
        post.is_lens_bundle ? "home_player" : undefined
      );
      toast.show("저장했습니다", "success");
      onChanged();
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async () => {
    setBusy(true);
    try {
      if (published) await adminApi.unpublishPost(post.id);
      else await adminApi.publishPost(post.id);
      onChanged();
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`"${post.headline}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await adminApi.deletePost(post.id);
      toast.show("삭제했습니다", "success");
      onChanged();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <div className="ui-card ui-enter flex flex-wrap items-center gap-2 rounded-xl p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="ui-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium"
        style={{ maxWidth: 260 }}
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        className="ui-input min-w-0 flex-1 rounded-lg px-3 py-1.5 text-[13px]"
        style={{ maxWidth: 360 }}
      />
      <input
        type="number"
        value={order}
        onChange={(e) => setOrder(Number(e.target.value))}
        title="재생 순서 (작을수록 먼저 재생)"
        className="ui-input w-20 rounded-lg px-2 py-1.5 text-[13px]"
      />
      <CustomSelect value={category} options={CATEGORY_OPTIONS} onChange={setCategory} placeholder="카테고리" />
      {/* 2026-09-11 — is_lens_bundle이면 save()가 channel="home_player"를
          실어 보내 admin_extra.body_inline.lenses[]의 이 항목(팟캐스트)만
          스코프해서 바꾼다(레터·웹툰·영상은 그대로) — 처음엔 통째 덮어쓰기
          위험 때문에 저장을 아예 막았는데, "웹툰도 따로 완성해서 저장할
          수 있어야 한다"는 사용자 요청으로 스코프 저장으로 바꿨다. */}
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={save}
        className="ui-btn ui-btn-primary shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold"
      >
        저장
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={togglePublish}
        className={`ui-btn shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${published ? "ui-btn-warn-soft" : "ui-btn-ok-soft"}`}
      >
        {published ? "비공개로" : "공개로"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className="ui-btn ui-btn-ghost ui-btn-danger shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold"
      >
        삭제
      </button>
    </div>
  );
}

export default function HomePlayerPage() {
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listPosts({ channel: "home_player", limit: 200 })
      .then((r) => {
        if (cancelled) return;
        const sorted = [...r.posts].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        setPosts(sorted);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">홈 플레이어</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          홈 화면 하단 플레이 카드(&quot;오늘의 핵심 뉴스&quot;)의 재생목록입니다. 기사와 무관하게 제목·유튜브 링크로 항목을 직접 만들고, 순서(오름차순)로 재생됩니다. &quot;공개&quot;인 항목만 홈에 나갑니다.
        </p>
      </div>

      {error && <ErrorNote message={error} />}
      {!posts && !error && <CardSkeleton count={2} />}

      {posts && <NewItemForm nextDefaultOrder={nextOrder(posts)} onCreated={reload} />}

      {posts && posts.length === 0 && (
        <EmptyState title="아직 등록된 항목이 없습니다" hint="위에서 제목과 유튜브 링크를 넣고 추가하세요." />
      )}

      {posts && posts.length > 0 && (
        <div className="space-y-2.5">
          {posts.map((p) => (
            <Row key={p.id} post={p} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
