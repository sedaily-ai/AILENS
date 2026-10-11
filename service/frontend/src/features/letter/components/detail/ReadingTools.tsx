'use client';

import { useEffect, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { useLetterShelf } from '../../lib/useLetterShelf';

const SIZES = [15.5, 16.5, 18, 19.5] as const;
const SIZE_KEY = 'lens-letter-font';

/** 위쪽 읽기 진행 막대(제일 가는 선) + 오른쪽 아래 떠 있는 도구(글자 크기 · 링크 복사). 모바일에서는 막대만 보이고 도구는 하단에 나온다. */
export function ReadingTools({ slug, title }: { slug: string; title: string }) {
  const [progress, setProgress] = useState(0);
  const [size, setSize] = useState(1);
  const [copied, setCopied] = useState(false);
  const shelf = useLetterShelf();

  useEffect(() => {
    // 저장된 글자 크기를 마운트 뒤에 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    try {
      const v = Number(localStorage.getItem(SIZE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isInteger(v) && v >= 0 && v < SIZES.length) setSize(v);
    } catch { /* 저장 불가 환경은 기본 크기 */ }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--ld-font', `${SIZES[size]}px`);
    return () => { document.documentElement.style.removeProperty('--ld-font'); };
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
  const share = async () => {
    const url = `${window.location.origin}/letter/${encodeURIComponent(slug)}`;
    trackEvent('letter_share', { letter: slug });
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, url }); return; } catch { /* 취소하면 복사로 넘어가지 않고 끝낸다 */ return; }
    }
    try { await navigator.clipboard.writeText(url); } catch { /* 일부 브라우저는 복사 권한이 없다 */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <div className="ld-progress" aria-hidden><i style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="ld-tools" role="group" aria-label="읽기 도구">
        <button type="button" onClick={() => changeSize(-1)} disabled={size === 0} aria-label="글자 작게">가<small>-</small></button>
        <button type="button" onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} aria-label="글자 크게">가<small>+</small></button>
        <button type="button" onClick={() => { trackEvent('letter_save', { letter: slug, saved: !shelf.isSaved(slug) }); shelf.toggleSaved(slug); }} aria-pressed={shelf.isSaved(slug)} aria-label={shelf.isSaved(slug) ? '저장 해제' : '나중에 읽기 저장'}>{shelf.isSaved(slug) ? '저장됨' : '저장'}</button>
        <button type="button" onClick={share} aria-label="링크 복사">{copied ? '복사됨' : '공유'}</button>
      </div>
    </>
  );
}
