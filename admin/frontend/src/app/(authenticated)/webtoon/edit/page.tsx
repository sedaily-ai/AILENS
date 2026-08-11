"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm } from "@/components/PostForm";
import { ErrorNote, FormSkeleton } from "@/components/Feedback";
import { publicPostUrl } from "@/lib/publicUrl";
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
  subtitle: "",
  channels: ["webtoon"],
  body_inline: { body: [], key_points: [], keywords: [], images: [] },
};

// 2026-08-09 — 웹툰 전용 편집 화면. /posts/edit(레터, 풀스크린 캔버스)과
// 달리 표준 레이아웃(사이드바 보임) 안에서 letters/edit/page.tsx와 같은
// 단순한 헤더+액션 패턴을 쓴다 — 컷 목록 하나짜리 폼이라 그 이상의 크롬이
// 필요 없다. channels는 항상 ["webtoon"] 고정, 종류 선택 없음.
export default function WebtoonEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">웹툰</h1>
          <div className="ui-spinner w-5 h-5 mt-4" />
        </div>
      }
    >
      <WebtoonEditPage />
    </Suspense>
  );
}

function WebtoonEditPage() {
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
      .getPost(id)
      .then(({ post }) => {
        if (cancelled) return;
        setSaved(post);
        setDraft({
          headline: post.headline,
          subtitle: post.subtitle ?? "",
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
      channels: ["webtoon"],
      body_inline: {
        body: [],
        key_points: [],
        keywords: [],
        images: draft.body_inline?.images ?? [],
      },
    };
    try {
      if (isNew) {
        const { post } = await adminApi.createPost(payload);
        toast.show("저장했습니다", "success");
        router.replace(`/webtoon/edit?id=${encodeURIComponent(post.id)}`);
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
    if (!window.confirm(`"${draft.headline || "이 웹툰"}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
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
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">웹툰</h1>
        <ErrorNote message={error} />
        <button type="button" onClick={() => router.back()} className="text-sm text-[var(--accent)] hover:underline cursor-pointer">
          ← 목록
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
            ← 목록
          </button>
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)] mt-1">
            {isNew ? "새 웹툰" : "웹툰 수정"}
          </h1>
          {saved && (
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-2">
              <span>{saved.status === "published" ? "발행됨" : "초안"} · {saved.slug}</span>
              {saved.status === "published" && publicPostUrl(saved) && (
                <a
                  href={publicPostUrl(saved)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline font-medium"
                >
                  발행 보기 ↗
                </a>
              )}
            </p>
          )}
        </div>
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
      </div>

      {(isNew || saved) ? (
        <div className="ui-enter">
          <PostForm value={draft} onChange={setDraft} mode="webtoon" />
        </div>
      ) : (
        <FormSkeleton />
      )}
    </div>
  );
}
