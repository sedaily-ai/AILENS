'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import { browserShareEnv, shareLink, SHARE_MESSAGE, type ShareOutcome } from '@/shared/lib/share/shareLink';
import { BottomToast } from '@/shared/ui/feedback/BottomToast';

// 기사 공유 — 기사마다 '공유' 버튼 하나만 둔다(2026-10-19 기능 다이어트: SNS별 버튼 묶음이 위·아래·도구 레일에 반복됐다).
// 터치 기기는 기기 공유 창(카카오톡·메시지 등), 컴퓨터는 링크 복사. 결과는 화면 아래 안내로 알리고, 취소는 알리지 않는다.

/** 공유 실행과 결과 안내 상태. 좁은 화면 도구 줄의 버튼과 넓은 화면 왼쪽 레일 버튼이 함께 쓴다. */
export function useArticleShare(title: string, url: string) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    setOutcome(null);
    try {
      const result = await shareLink({ title, url }, browserShareEnv());
      if (result === 'cancelled') return;
      setOutcome(result);
      // 실패 안내는 직접 복사할 시간을 주려고 더 오래 둔다.
      timer.current = setTimeout(() => setOutcome(null), result === 'failed' ? 6000 : 2500);
    } finally {
      setBusy(false);
    }
  }, [busy, title, url]);
  return { share, busy, outcome };
}

/** 공유 결과 안내(화면 아래 가운데). 성공은 status, 실패는 alert로 읽힌다. */
export function ShareOutcomeToast({ outcome }: { outcome: ShareOutcome | null }) {
  if (!outcome || outcome === 'cancelled') return null;
  return <BottomToast message={SHARE_MESSAGE[outcome]} alert={outcome === 'failed'} />;
}

/** 좁은 화면 기사 도구 줄의 '공유' 버튼(넓은 화면은 ArticleToolRail의 '공유'가 같은 동작을 한다). */
export function ArticleShareButton({ title, url }: { title: string; url: string }) {
  const { share, busy, outcome } = useArticleShare(title, url);
  return (
    <>
      <button
        type="button"
        onClick={() => void share()}
        aria-disabled={busy}
        aria-busy={busy}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-disabled:opacity-60"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        <span className="text-[13px]">공유</span>
      </button>
      <ShareOutcomeToast outcome={outcome} />
    </>
  );
}
