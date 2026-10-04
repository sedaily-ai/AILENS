'use client';

import { useEffect, useRef, useState } from 'react';
import { SketchListen, SketchPrint, SketchShare, SketchTextMinus, SketchTextPlus } from './SketchIcons';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';

// 기사 왼쪽 고정 도구 레일(2026-10-01) — 영문 사이트(en.sedaily.com) 상세의 "Listen / Size + /
// Size - / Share / Print" 구조. 항목마다 아이콘 + 라벨 한 세트로, 공유는 아이콘 6개를 펼치지
// 않고 버튼 하나가 작은 팝오버를 연다.
//
// 글자 크기는 ArticleFontSizeControl과 같은 저장 키·단계(작게 0.9 / 보통 1 / 크게 1.15)를
// 쓴다 — 좁은 화면에서 쓰는 가로 도구 줄과 설정이 공유된다.

type FontSize = 'small' | 'medium' | 'large';
const SCALE: Record<FontSize, string> = { small: '0.9', medium: '1', large: '1.15' };
const ORDER: FontSize[] = ['small', 'medium', 'large'];

function ToolButton({
  label,
  onClick,
  children,
  disabled,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      className="rail-btn"
    >
      <span className="rail-ico">{children}</span>
      <span className="rail-cap">{label}</span>
    </button>
  );
}

export function ArticleToolRail({
  title,
  url,
  cssVar,
  storageKey,
  onListen,
}: {
  title: string;
  url: string;
  cssVar: string;
  storageKey: string;
  /** 팟캐스트 시선이 있을 때만 전달 — 누르면 그 탭으로 이동. 없으면 "듣기" 항목을 숨긴다. */
  onListen?: () => void;
}) {
  const [size, setSize] = useState<FontSize>('medium');
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as FontSize | null;
      if (saved && saved in SCALE) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 SSR에서 못 읽는다(마운트 후 복원)
        setSize(saved);
        document.documentElement.style.setProperty(cssVar, SCALE[saved]);
      }
    } catch {
      // localStorage 접근 불가 — 기본값 유지.
    }
  }, [cssVar, storageKey]);

  useEffect(() => {
    if (!shareOpen) return;
    const onDown = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareOpen]);

  const step = (delta: 1 | -1) => {
    const idx = ORDER.indexOf(size);
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, idx + delta))];
    if (next === size) return;
    setSize(next);
    document.documentElement.style.setProperty(cssVar, SCALE[next]);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // 저장 실패는 이번 방문 중 동작에 영향 없음.
    }
  };

  return (
    <>
      {onListen && (
        <ToolButton label="듣기" onClick={onListen}>
          <SketchListen size={24} />
        </ToolButton>
      )}
      <ToolButton label="글자 +" onClick={() => step(1)} disabled={size === 'large'}>
        <SketchTextPlus size={24} />
      </ToolButton>
      <ToolButton label="글자 −" onClick={() => step(-1)} disabled={size === 'small'}>
        <SketchTextMinus size={24} />
      </ToolButton>
      <div ref={shareRef} style={{ position: 'relative' }}>
        <ToolButton label="공유" onClick={() => setShareOpen((v) => !v)} expanded={shareOpen}>
          <SketchShare size={24} />
        </ToolButton>
        {shareOpen && (
          <div role="dialog" aria-label="공유" className="rail-pop">
            <ArticleShareButtons title={title} url={url} />
          </div>
        )}
      </div>
      <ToolButton label="인쇄" onClick={() => window.print()}>
        <SketchPrint size={24} />
      </ToolButton>
    </>
  );
}
