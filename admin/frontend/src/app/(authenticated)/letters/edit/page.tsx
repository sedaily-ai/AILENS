"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm, cleanPostBody, cleanClosingLine } from "@/components/PostForm";
import { ErrorNote, FormSkeleton } from "@/components/Feedback";
import { PodcastUploadField } from "@/components/PodcastUploadField";
import { publicLetterUrl } from "@/lib/publicUrl";
import type { AiLetter, CmsPostInput } from "@/lib/types";

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function LetterEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">
            AI 레터
          </h1>
          <div className="ui-spinner w-5 h-5 mt-4" />
        </div>
      }
    >
      <LetterEditPage />
    </Suspense>
  );
}

function LetterEditPage() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const toast = useToast();

  const [letter, setLetter] = useState<AiLetter | null>(null);
  const [draft, setDraft] = useState<CmsPostInput>({});
  const [podcastAudioUrl, setPodcastAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getLetter(id)
      .then(({ letter: l }) => {
        if (cancelled) return;
        setLetter(l);
        setPodcastAudioUrl(l.podcast_audio_url ?? null);
        // 레터의 keywords 는 최상위 컬럼이지만, PostForm 은 body_inline 안에서
        // 다룬다 — 저장할 때 다시 분리한다.
        setDraft({
          headline: l.headline,
          subtitle: l.subtitle ?? "",
          closing_line: l.closing_line ?? "",
          body_inline: {
            body: l.body_inline?.body ?? [],
            key_points: l.body_inline?.key_points ?? [],
            keywords: l.keywords ?? [],
            images: [],
          },
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
    setBusy(true);
    try {
      const b = draft.body_inline ? cleanPostBody(draft.body_inline) : undefined;
      const { letter: l } = await adminApi.updateLetter(id, {
        headline: draft.headline,
        subtitle: draft.subtitle,
        closing_line: draft.closing_line ? cleanClosingLine(draft.closing_line) : draft.closing_line,
        body_inline: { body: b?.body ?? [], key_points: b?.key_points ?? [] },
        keywords: b?.keywords ?? [],
        podcast_audio_url: podcastAudioUrl,
      });
      setLetter(l);
      toast.show("저장했습니다", "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.deleteLetter(id);
      toast.show("사용자 화면에서 내렸습니다", "success");
      router.back();
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)]">AI 레터</h1>
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
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            ← 목록
          </button>
          <h1 className="font-display text-[26px] font-bold text-[var(--text-primary)] mt-1">
            AI 레터 수정
          </h1>
          {letter && (
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-2">
              <span>{letter.letter_date}</span>
              <a
                href={publicLetterUrl(letter.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline font-medium"
              >
                발행 보기 ↗
              </a>
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
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="ui-btn ui-btn-ghost ui-btn-danger rounded-lg px-4 py-2 text-sm font-semibold"
          >
            내리기
          </button>
        </div>
      </div>

      {letter ? (
        <div className="ui-enter space-y-6">
          <PodcastUploadField value={podcastAudioUrl} onChange={setPodcastAudioUrl} />
          <PostForm value={draft} onChange={setDraft} mode="letter" />
        </div>
      ) : (
        <FormSkeleton />
      )}
    </div>
  );
}
