"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm, splitRichBody } from "@/components/PostForm";
import { ErrorNote } from "@/components/Feedback";
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
  closing_line: "",
  channels: ["letters"],
  editor_id: null,
  body_inline: { body: [""], key_points: [], keywords: [], images: [] },
};

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function PostEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">글</h1>
          <div className="ui-spinner w-5 h-5 mt-4" />
        </div>
      }
    >
      <PostEditPage />
    </Suspense>
  );
}

function PostEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const isNew = !id;
  const toast = useToast();

  const [draft, setDraft] = useState<CmsPostInput>({
    ...EMPTY,
    publish_date: todayKST(),
  });
  const [saved, setSaved] = useState<CmsPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 새 글일 때만 고를 수 있다 — 저장된 글의 종류를 나중에 바꾸면 이미 발행된
  // 카드/레터가 엉뚱한 채널로 옮겨간다. 기존 글은 draft.channels 로 그대로 추론.
  const [newKind, setNewKind] = useState<"letters" | "trend_card" | "webtoon" | "video">("letters");
  const kind: "letters" | "trend_card" | "webtoon" | "video" = isNew
    ? newKind
    : draft.channels?.includes("trend_card")
      ? "trend_card"
      : draft.channels?.includes("webtoon")
        ? "webtoon"
        : draft.channels?.includes("video")
          ? "video"
          : "letters";

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
          closing_line: post.closing_line ?? "",
          publish_date: post.publish_date,
          channels: post.channels,
          editor_id: post.editor_id,
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

  const guard = (): string | null => {
    if (!(draft.headline ?? "").trim()) return "제목을 입력하세요";
    if (!(draft.publish_date ?? "").trim()) return "발행일을 선택하세요";
    return null;
  };

  const save = async () => {
    const bad = guard();
    if (bad) {
      toast.show(bad, "error");
      return;
    }
    setBusy(true);
    // trend_card 는 리치텍스트가 없는 가벼운 카드라 splitRichBody 를 안 거친다.
    // channels 는 여기서 결정 — "오늘의 1면"/"기사 피드"(paper/feed)는 프론트가
    // 아직 안 읽어서(2026-08-04 확인) 빠지고, letters/trend_card 만 실제로 쓰인다.
    const payload: CmsPostInput =
      kind === "trend_card"
        ? {
            ...draft,
            channels: ["trend_card"],
            body_inline: {
              body: [],
              key_points: [],
              keywords: [],
              images: [],
              section: draft.body_inline?.section ?? "trend",
              category: draft.body_inline?.category ?? "",
            },
          }
        : kind === "webtoon"
        ? {
            ...draft,
            channels: ["webtoon"],
            body_inline: {
              body: [],
              key_points: [],
              keywords: [],
              images: draft.body_inline?.images ?? [],
            },
          }
        : kind === "video"
        ? {
            ...draft,
            channels: ["video"],
            body_inline: {
              body: [],
              key_points: [],
              keywords: [],
              images: [],
              video_url: draft.body_inline?.video_url ?? "",
            },
          }
        : (() => {
            // "핵심 정리"/"키워드"/"닫는 줄" 소제목으로 나눠 쓴 본문을 여기서
            // 실제 필드로 갈라낸다 — PostForm 은 mode="post" 일 때 리치텍스트
            // 캔버스 하나만 보여주고, 이 분리는 저장하는 순간에만 일어난다.
            const split = splitRichBody(draft.body_inline?.body_html ?? "");
            return {
              ...draft,
              channels: ["letters"],
              body_inline: {
                body: [],
                body_html: split.body_html,
                key_points: split.key_points,
                keywords: split.keywords,
                images: draft.body_inline?.images ?? [],
                // /letters 아카이브 필터 태그(트렌드/인기 칼럼) — trend_card 채널
                // 전용이 아니라 일반 레터도 달 수 있다(PostForm mode="post").
                section: draft.body_inline?.section,
              },
              closing_line: split.closing_line || draft.closing_line,
            };
          })();
    try {
      if (isNew) {
        const { post } = await adminApi.createPost(payload);
        toast.show("저장했습니다", "success");
        router.replace(`/posts/edit?id=${encodeURIComponent(post.id)}`);
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
    setBusy(true);
    try {
      await adminApi.deletePost(id);
      toast.show("삭제했습니다", "success");
      router.push("/posts");
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">글</h1>
        <ErrorNote message={error} />
        <Link href="/posts" className="text-sm text-blue-700 hover:underline">
          ← 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <Link href="/posts" className="text-sm text-gray-600 hover:text-gray-900">
            ← 목록
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-1">
            {isNew ? "새 글" : "글 수정"}
          </h1>
          {saved && (
            <p className="mt-1 text-xs text-gray-500">
              {saved.status === "published" ? "발행됨" : "초안"} · {saved.slug}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="ui-btn ui-btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            저장
          </button>
          {saved && saved.status !== "published" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => adminApi.publishPost(saved.id), "발행했습니다")}
              className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold text-white bg-[var(--ok)] hover:brightness-110"
            >
              발행
            </button>
          )}
          {saved && saved.status === "published" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => adminApi.unpublishPost(saved.id), "내렸습니다")}
              className="ui-btn rounded-lg px-4 py-2 text-sm font-semibold text-white bg-[var(--warn)] hover:brightness-110"
            >
              내리기
            </button>
          )}
          {saved && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 ring-1 ring-gray-300 hover:text-red-600 hover:ring-red-300 disabled:opacity-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 새 글만 종류를 고른다 — 저장된 글의 채널을 나중에 바꾸면 이미
          발행된 카드/레터가 엉뚱한 채널로 옮겨간다. */}
      {isNew && (
        <div className="flex gap-1">
          {(
            [
              { key: "letters", label: "레터 글" },
              { key: "trend_card", label: "트렌드·칼럼 카드" },
              { key: "webtoon", label: "웹툰 (파일럿)" },
              { key: "video", label: "영상" },
            ] as const
          ).map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setNewKind(k.key)}
              className={`text-[13px] font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                newKind === k.key ? "font-semibold" : "hover:bg-[var(--surface-sunken)]"
              }`}
              style={{
                background: newKind === k.key ? "var(--accent-soft)" : undefined,
                color: newKind === k.key ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}

      {/* 새 글은 즉시 폼을 띄운다. 기존 글은 불러오는 동안 아무것도 안 그린다 —
          스켈레톤이 전환을 오히려 느리게 느껴지게 한다는 피드백으로 제거.
          빈 폼을 보여줬다가 값이 뒤늦게 채워지면 사용자가 이미 타이핑을
          시작했을 수 있어 그냥 비워둔다(값 도착하면 바로 폼 등장). */}
      {(isNew || saved) && (
        <div className="ui-enter">
          <PostForm
            value={draft}
            onChange={setDraft}
            mode={kind === "trend_card" || kind === "webtoon" || kind === "video" ? kind : "post"}
          />
        </div>
      )}
    </div>
  );
}
