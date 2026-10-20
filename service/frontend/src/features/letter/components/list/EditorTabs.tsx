'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid } from 'lucide-react';
import { EDITORS, type LetterEditor } from '../../data/editors';
import { EditorAvatar } from '../EditorAvatar';

/** 프로필 아래에 역할 이름을 표시하는 선택줄. 에디터는 최신 목록에 글이 있든 없든 모두 보인다. 주소 진입과 폭 변경에서도 선택된 에디터가 보이게 한다. */
export function EditorTabs({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [preview, setPreview] = useState<{ editor: LetterEditor; left: number; top: number; arrowLeft: number; above: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepPreview = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const closePreview = () => {
    keepPreview();
    setPreview(null);
  };
  // 탭과 툴팁 사이의 간격을 지나갈 때는 유지해 내용을 가리키며 읽을 수 있게 한다.
  const scheduleClose = () => {
    keepPreview();
    closeTimer.current = setTimeout(() => setPreview(null), 150);
  };
  const showPreview = (button: HTMLButtonElement, editor: LetterEditor) => {
    keepPreview();
    const rect = button.getBoundingClientRect();
    const label = button.querySelector('.lt-etab-text')?.getBoundingClientRect() ?? rect;
    const width = Math.min(280, window.innerWidth - 24);
    const center = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(center - width / 2, window.innerWidth - width - 12));
    const above = window.innerHeight - label.bottom < 150;
    setPreview({
      editor,
      left,
      top: above ? rect.top - 10 : label.bottom + 10,
      arrowLeft: Math.max(18, Math.min(center - left, width - 18)),
      above,
    });
  };
  useEffect(() => {
    const dismiss = () => setPreview(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', escape);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const reveal = () => {
      const item = el.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!item) return;
      const left = item.offsetLeft;
      if (left < el.scrollLeft || left + item.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: Math.max(0, left - (el.clientWidth - item.offsetWidth) / 2), behavior: 'instant' });
      }
    };
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [selected]);

  return (
    <>
      <div ref={container} className="lt-etabs" role="group" aria-label="에디터">
        <button type="button" className="lt-etab lt-etab-all" aria-pressed={selected === null} onPointerEnter={closePreview} onFocus={closePreview} onClick={() => { closePreview(); onSelect(null); }}>
          <span className="lt-etab-ring"><LayoutGrid size={23} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="lt-etab-text"><strong>전체</strong></span>
        </button>
        {EDITORS.map((e) => (
          <button key={e.id} type="button" className="lt-etab" aria-pressed={selected === e.id} aria-label={e.name}
            aria-describedby={preview?.editor.id === e.id ? tooltipId : undefined}
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') showPreview(event.currentTarget, e); }}
            onPointerLeave={scheduleClose}
            onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) showPreview(event.currentTarget, e); }}
            onBlur={closePreview}
            onClick={() => { closePreview(); onSelect(e.id); }}>
            <span className="lt-etab-ring"><EditorAvatar editor={e} size={48} fill /></span>
            <span className="lt-etab-text"><strong>{e.name.split(' ').map((word, i) => <span key={i}>{i > 0 ? ' ' : ''}<span className="lt-etab-word">{word}</span></span>)}</strong></span>
          </button>
        ))}
      </div>
      {/* 가로 스크롤 컨테이너의 overflow에 소개가 잘리지 않도록 body에 표시한다. */}
      {preview && createPortal(
        <div id={tooltipId} role="tooltip" className="lt-editor-tooltip" data-side={preview.above ? 'above' : 'below'}
          style={{ left: preview.left, top: preview.top, transform: preview.above ? 'translateY(-100%)' : undefined }}
          onPointerEnter={keepPreview} onPointerLeave={scheduleClose}>
          <span className="lt-editor-tooltip-arrow" style={{ left: preview.arrowLeft }} aria-hidden="true" />
          <strong>{preview.editor.name}</strong>
          <p>{preview.editor.summary}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
