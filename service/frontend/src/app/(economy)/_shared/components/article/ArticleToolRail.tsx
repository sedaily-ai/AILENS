'use client';

import { useEffect, useState } from 'react';
import { SketchListen, SketchPrint, SketchShare, SketchTextMinus, SketchTextPlus } from '@/app/(economy)/_shared/components/icons/SketchIcons';
import { ShareOutcomeToast, useArticleShare } from '@/shared/ui/article/ArticleShareButton';

// 기사 왼쪽 고정 도구 레일 — 영문 사이트(en.sedaily.com) 상세의 "Listen / Size + / Size - / Share / Print" 구조. 항목마다 아이콘 + 라벨 한 세트이다.
// 공유는 버튼 하나가 바로 동작한다(터치 기기는 기기 공유 창, 컴퓨터는 링크 복사 — ArticleShareButton과 같은 동작).
// 글자 크기는 ArticleFontSizeControl과 같은 저장 키·단계(작게 0.9 / 보통 1 / 크게 1.15)를 써서 좁은 화면의 가로 도구 줄과 설정을 공유한다.

type FontSize = 'small' | 'medium' | 'large';
const SCALE: Record<FontSize, string> = { small: '0.9', medium: '1', large: '1.15' };
const ORDER: FontSize[] = ['small', 'medium', 'large'];

function ToolButton({
  label,
  onClick,
  children,
  disabled,
  pending,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  /** 더 누를 수 없는 상태(글자 크기 끝 단계). */
  disabled?: boolean;
  /** 처리 중 — 누름은 받지 않지만 키보드 포커스는 지킨다(disabled를 쓰면 포커스가 페이지 맨 위로 튄다). */
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={pending ? undefined : onClick}
      disabled={disabled}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      aria-label={label}
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
  const { share, busy: sharing, outcome: shareOutcome } = useArticleShare(title, url);

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
      <ToolButton label="공유" onClick={() => void share()} pending={sharing}>
        <SketchShare size={24} />
      </ToolButton>
      <ShareOutcomeToast outcome={shareOutcome} />
      <ToolButton label="인쇄" onClick={() => window.print()}>
        <SketchPrint size={24} />
      </ToolButton>
    </>
  );
}
