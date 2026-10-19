'use client';
import { LetterShelfStatus } from '../LetterShelfStatus';
import { LetterBookmarkIcon } from '../LetterBookmarkIcon';

import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { useLetterShelf } from '../../lib/useLetterShelf';

const SIZES = [15.5, 16.5, 18, 19.5] as const;
const SIZE_KEY = 'lens-letter-font';

/** 읽기 진행 막대와 제목 아래의 글자 크기·저장·공유 도구. 글자 크기는 이 레터의 읽는 내용에 적용한다. */
export function ReadingTools({ slug, title }: { slug: string; title: string }) {
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState(1);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared' | 'error'>('idle');
  const [sharing, setSharing] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shelf = useLetterShelf();

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

  // 70% 이상 읽으면 읽음으로 기록한다(열기만 한 레터는 읽은 것으로 보지 않는다).
  const { markRead } = shelf;
  useEffect(() => { if (progress >= 0.7) markRead(slug); }, [progress, slug, markRead]);

  const changeSize = (delta: number) => {
    const next = Math.max(0, Math.min(SIZES.length - 1, size + delta));
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch { /* 무시 */ }
    trackEvent('letter_font_size', { letter: slug, size: SIZES[next] });
  };
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);

  const showShareStatus = (status: 'copied' | 'shared' | 'error') => {
    if (shareTimer.current) clearTimeout(shareTimer.current);
    setShareStatus(status);
    shareTimer.current = setTimeout(() => setShareStatus('idle'), 2500);
  };
  const share = async () => {
    const url = `${window.location.origin}/letter/${encodeURIComponent(slug)}`;
    trackEvent('letter_share', { letter: slug });
    setSharing(true);
    try {
      if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ title, url }); showShareStatus('shared'); } catch { /* 공유 취소 시 복사하지 않는다. */ }
        return;
      }
      try { await navigator.clipboard.writeText(url); showShareStatus('copied'); }
      catch { showShareStatus('error'); }
    } finally { setSharing(false); }
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
        <button type="button" onClick={share} disabled={sharing} aria-label="링크 복사">{sharing ? '공유 중' : shareStatus === 'copied' ? 'URL 복사됨' : shareStatus === 'shared' ? '공유 완료' : shareStatus === 'error' ? '복사 실패' : '공유'}</button>
        <span className="sr-only" role="status">{shareStatus === 'copied' ? '레터 URL을 복사했어요.' : shareStatus === 'shared' ? '레터를 공유했어요.' : shareStatus === 'error' ? 'URL을 복사하지 못했어요. 브라우저의 복사 권한을 확인해주세요.' : ''}</span>
      </div>
      <LetterShelfStatus shelf={shelf} />{shelf.notice && <p id="ld-save-note" className="lt-save-note">
        {shelf.notice}
      </p>}
    </>
  );
}
