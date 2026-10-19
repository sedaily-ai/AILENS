'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark } from 'lucide-react';
import { useArticleBookmark } from '@/entities/user';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';
import { BottomToast } from '@/shared/ui/feedback/BottomToast';

// 기사 저장(2026-10-20) — 기사마다 '저장' 버튼 하나를 도구 영역에 둔다(좁은 화면 도구 줄 / 넓은 화면 왼쪽 레일).
// 어느 형식 탭에서 눌러도 같은 기사 하나로 계정에 저장되고, 나의 LENS 내 서랍의 '저장한 기사'에 모인다.
// 로그인하지 않았으면 로그인 화면으로 보내고, 로그인 뒤 이 기사로 돌아온다.
// 상태 확인 요청이 두 번 가지 않도록 LensViewClient가 useArticleSaveAction을 한 번만 부르고, 두 버튼과 안내에 같은 값을 넘긴다.

const MESSAGE = {
  saved: '기사를 저장했어요. 나의 LENS 내 서랍에서 다시 볼 수 있어요.',
  removed: '기사 저장을 해제했어요.',
  saveFailed: '기사를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
  removeFailed: '저장을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.',
} as const;

/** 저장 동작과 결과 안내. */
export function useArticleSaveAction(slug: string) {
  const router = useRouter();
  const bookmark = useArticleBookmark(slug);
  const [notice, setNotice] = useState<{ message: string; alert: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = (message: string, alert: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice({ message, alert });
    timer.current = setTimeout(() => setNotice(null), alert ? 5000 : 3000);
  };
  const { saved, toggle } = bookmark;
  const onClick = useCallback(async () => {
    const wasSaved = saved;
    const outcome = await toggle();
    if (outcome === null) return;
    if (outcome === 'login') {
      rememberReturnTo(window.location.pathname + window.location.search + window.location.hash);
      router.push('/login');
      return;
    }
    if (outcome === 'saved') show(MESSAGE.saved, false);
    else if (outcome === 'removed') show(MESSAGE.removed, false);
    else show(wasSaved ? MESSAGE.removeFailed : MESSAGE.saveFailed, true);
  }, [saved, toggle, router]);
  const caption = saved ? '저장됨' : '저장';
  return {
    ...bookmark,
    onClick,
    caption,
    // 화면 읽기 이름에 눈에 보이는 글자(저장/저장됨)를 그대로 넣고, 켜짐 여부는 aria-pressed로 알린다.
    label: `기사 ${caption}`,
    hint: bookmark.signedIn ? `기사 ${caption}` : '로그인하고 기사 저장',
    // 처리 중이거나 로그인 확인 중에는 누름을 받지 않는다. disabled 대신 aria-disabled로 두어 키보드 포커스를 잃지 않게 한다.
    pending: bookmark.busy || bookmark.authLoading,
    notice,
  };
}

export type ArticleSaveAction = ReturnType<typeof useArticleSaveAction>;

/** 좁은 화면 기사 도구 줄의 '저장' 버튼. 저장할 수 없는 기사면 그리지 않는다. */
export function ArticleSaveButton({ save }: { save: ArticleSaveAction }) {
  if (!save.available) return null;
  return (
    <button
      type="button"
      onClick={() => void save.onClick()}
      aria-disabled={save.pending}
      aria-busy={save.busy}
      aria-pressed={save.saved}
      aria-label={save.label}
      title={save.hint}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:opacity-60"
      style={save.saved ? { color: '#1d4ed8' } : undefined}
    >
      <Bookmark className="h-4 w-4" aria-hidden fill={save.saved ? 'currentColor' : 'none'} />
      <span className="text-[13px]">{save.caption}</span>
    </button>
  );
}

/** 저장 결과 안내(화면 아래 가운데). 기사 화면에 하나만 둔다. */
export function ArticleSaveToast({ save }: { save: ArticleSaveAction }) {
  return <BottomToast message={save.notice?.message ?? null} alert={save.notice?.alert} />;
}
