'use client';
import { LetterShelfStatus } from '../LetterShelfStatus';
import { LetterBookmarkIcon } from '../LetterBookmarkIcon';

import { useEffect, useRef, useState } from 'react';
import { SITE_URL } from '@/shared/constants/site';
import { issueLetterPath } from '@/shared/lib/api/issueLettersSeoApi';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { ShareOutcomeToast, useArticleShare } from '@/shared/ui/article/ArticleShareButton';
import { useLetterShelf } from '../../lib/useLetterShelf';

const SIZES = [15.5, 16.5, 18, 19.5] as const;
const SIZE_KEY = 'lens-letter-font';

/** 읽기 진행 막대와 제목 아래의 글자 크기·저장·공유 도구. 글자 크기는 이 레터의 읽는 내용에 적용한다. */
export function ReadingTools({ slug, title }: { slug: string; title: string }) {
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState(1);
  const tools = useRef<HTMLDivElement>(null);
  const shelf = useLetterShelf();
  // 공유는 기사 '공유'와 같은 규칙·안내를 쓴다(2026-10-20 기능 다이어트): 터치 기기는 기기 공유 창, 컴퓨터는 링크 복사.
  // 공유 창을 닫으면(취소) 아무것도 알리지 않고, 다른 이유로 실패하면 복사로 넘어간다. 결과는 화면 아래 안내로 알린다.
  const { share, busy: sharing, outcome: shareOutcome } = useArticleShare(title, `${SITE_URL}${issueLetterPath(slug)}`);

  useEffect(() => {
    // 저장된 글자 크기를 마운트 뒤에 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    try {
      const stored = localStorage.getItem(SIZE_KEY);
      const v = stored !== null && stored.trim() !== '' ? Number(stored) : NaN;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isInteger(v) && v >= 0 && v < SIZES.length) setSize(v);
    } catch { /* 저장 불가 환경은 기본 크기 */ }
  }, []);
  useEffect(() => {
    const scope = tools.current?.closest<HTMLElement>('.ld-wrap');
    scope?.style.setProperty('--ld-font', `${SIZES[size]}px`);
    return () => { scope?.style.removeProperty('--ld-font'); };
  }, [size]);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = document.documentElement;
        const max = el.scrollHeight - el.clientHeight;
        setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);

  const changeSize = (delta: number) => {
    const next = Math.max(0, Math.min(SIZES.length - 1, size + delta));
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* 무시 */ }
    trackEvent('letter_font_size', { letter: slug, size: SIZES[next] });
  };
  const onShare = () => {
    if (sharing) return;
    trackEvent('letter_share', { letter: slug });
    void share();
  };

  return (
    <>
      <div className="ld-progress" aria-hidden><i style={{ transform: `scaleX(${progress})` }} /></div>
      <div ref={tools} className="ld-tools" role="group" aria-label="읽기 도구">
        <button type="button" onClick={() => changeSize(-1)} disabled={size === 0} aria-label="글자 작게">가<small>-</small></button>
        <output className="ld-size" aria-label="현재 글자 크기">{Math.round(SIZES[size] / SIZES[1] * 100)}%</output>
        <button type="button" onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} aria-label="글자 크게">가<small>+</small></button>
        <button type="button" onClick={async () => { const saved = !shelf.isSaved(slug); if (await shelf.toggleSaved(slug)) trackEvent('letter_save', { letter: slug, saved }); }} disabled={!shelf.available || shelf.pending} aria-describedby={shelf.notice ? 'ld-save-note' : undefined} aria-pressed={shelf.isSaved(slug)} aria-label={shelf.isSaved(slug) ? '저장 해제' : '나중에 읽기 저장'}>
          <LetterBookmarkIcon saved={shelf.isSaved(slug)} />
        </button>
        {/* 처리 중에도 disabled 대신 aria-disabled로 막아 키보드 포커스가 튀지 않게 한다(기사 '공유'와 같다). */}
        <button type="button" onClick={onShare} aria-disabled={sharing} aria-busy={sharing}>공유</button>
      </div>
      <ShareOutcomeToast outcome={shareOutcome} />
      <LetterShelfStatus shelf={shelf} />{shelf.notice && <p id="ld-save-note" className="lt-save-note">
        {shelf.notice}
      </p>}
    </>
  );
}
