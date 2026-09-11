"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm } from "@/components/PostForm";
import { ErrorNote, FormSkeleton } from "@/components/Feedback";
import type { CmsPost, CmsPostInput } from "@/lib/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

const EMPTY: CmsPostInput = {
  headline: "",
  channels: ["video"],
  body_inline: { body: [], key_points: [], keywords: [], images: [], video_url: "" },
};

// 2026-08-09 — 영상 전용 편집 화면. webtoon/edit/page.tsx와 같은 패턴
// (표준 레이아웃, letters/edit 식 헤더). channels는 항상 ["video"] 고정.
// video_url/cover_image_url만 있으면 되는 가장 가벼운 폼이라 상세 페이지
// 링크는 없다(publicUrl.ts — video는 개별 URL이 없음).
export default function VideoEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">영상</h1>
          <div className="ui-spinner w-5 h-5 mt-4" />
        </div>
      }
    >
      <VideoEditPage />
    </Suspense>
  );
}

function VideoEditPage() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const isNew = !id;
  const toast = useToast();

  const [draft, setDraft] = useState<CmsPostInput>({ ...EMPTY, publish_date: todayKST() });
  const [saved, setSaved] = useState<CmsPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getPost(id, "video")
      .then(({ post }) => {
        if (cancelled) return;
        setSaved(post);
        setDraft({
          headline: post.headline,
          publish_date: post.publish_date,
          channels: post.channels,
          body_inline: post.body_inline,
          cover_image_url: post.cover_image_url || null,
        });
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!(draft.headline ?? "").trim()) {
      toast.show("제목을 입력하세요", "error");
      return;
    }
    if (!(draft.publish_date ?? "").trim()) {
      toast.show("발행일을 선택하세요", "error");
      return;
    }
    setBusy(true);
    const payload: CmsPostInput = {
      ...draft,
      channels: ["video"],
      body_inline: {
        body: [],
        key_points: [],
        keywords: [],
        images: [],
        video_url: draft.body_inline?.video_url ?? "",
      },
    };
    try {
      if (isNew) {
        const { post } = await adminApi.createPost(payload);
        toast.show("저장했습니다", "success");
        router.replace(`/video/edit?id=${encodeURIComponent(post.id)}`);
      } else {
        const { post } = await adminApi.updatePost(id, payload);
        setSaved(post);
        toast.show("저장했습니다", "success");
      }
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<{ post: CmsPost }>, msg: string) => {
    setBusy(true);
    try {
      const { post } = await fn();
      setSaved(post);
      toast.show(msg, "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`"${draft.headline || "이 영상"}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try {
      await adminApi.deletePost(id);
      toast.show("삭제했습니다", "success");
      router.back();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">영상</h1>
        <ErrorNote message={error} />
        <button type="button" onClick={() => router.back()} className="text-sm text-[var(--accent)] hover:underline cursor-pointer">
          ← 목록
        </button>
      </div>
    );
  }

  // 2026-09-11 — webtoon/edit/page.tsx와 같은 이유·같은 패턴(주석 참조).
  const isLensBundle = !!saved?.is_lens_bundle;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
            ← 목록
          </button>
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)] mt-1">
            {isNew ? "새 영상" : "영상 수정"}
          </h1>
          {saved && (
            <p className="mt-1 text-xs text-gray-500">
              {saved.status === "published" ? "발행됨" : "초안"} · {saved.slug}
            </p>
          )}
        </div>
        {!isLensBundle && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
              저장
            </button>
            {saved && saved.status !== "published" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => adminApi.publishPost(saved.id), "발행했습니다")}
                className="ui-btn ui-btn-ok-soft rounded-lg px-4 py-2 text-sm font-semibold"
              >
                발행
              </button>
            )}
            {saved && saved.status === "published" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => adminApi.unpublishPost(saved.id), "내렸습니다")}
                className="ui-btn ui-btn-warn-soft rounded-lg px-4 py-2 text-sm font-semibold"
              >
                내리기
              </button>
            )}
            {saved && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="ui-btn ui-btn-ghost ui-btn-danger rounded-lg px-4 py-2 text-sm font-semibold"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      {isLensBundle && (
        <div className="ui-card rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--warn, #f59e0b)", background: "var(--warn-soft, #fffbeb)" }}>
          이 영상은 자동 파이프라인이 만든 <strong>&ldquo;4가지 시선&rdquo;</strong> 글의 한
          포맷입니다 — 레터·웹툰·팟캐스트와 한 묶음이라 이 화면에서는 보기만
          가능하고 저장할 수 없어요. 수정하려면{" "}
          <a href={`/lens/edit?id=${encodeURIComponent(id)}`} className="text-[var(--accent)] hover:underline font-semibold">
            4가지 시선 편집 화면 ↗
          </a>
          에서 해주세요.
        </div>
      )}

      {(isNew || saved) ? (
        <div className="ui-enter">
          <PostForm value={draft} onChange={setDraft} mode="video" />
        </div>
      ) : (
        <FormSkeleton />
      )}
    </div>
  );
}
