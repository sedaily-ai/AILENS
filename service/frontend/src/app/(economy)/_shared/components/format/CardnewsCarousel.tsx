'use client';

import { useCallback, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import Image from 'next/image';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW } from '@/shared/constants/lensPerspectives';
import type { LucideIcon } from 'lucide-react';

/**
 * 카드뉴스 목업 — 인스타 카드뉴스처럼 한 장씩 크게 보여주고 화살표(또는 스와이프)로 넘긴다.
 * 카드마다 자기 useState가 필요해 별도 컴포넌트로 분리했다. 시선 패널은 하나만 보이므로(다른 시선은 hidden) 사실상 한 인스턴스만 활성 상태이다.
 */
export function CardnewsCarousel({
  photo,
  coverHeadline,
  formatName,
  cards,
  color,
  tint,
  Icon,
}: {
  photo: string | null;
  coverHeadline: string;
  /** 형식 이름("웹툰") — 페이지 다른 곳의 이름과 통일한다. 서수는 선택기가 위치를 보여 주므로 표지에 쓰지 않는다. */
  formatName: string;
  cards: { hook: string | null; caption: string }[];
  color: string;
  tint: string;
  Icon: LucideIcon;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const total = cards.length + 1;
  const onPhoto = index === 0;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
    },
    [total],
  );

  // ⚠️ stopPropagation 필수 — 패널 전체의 가로 스와이프(이전/다음 기사 이동, ArticleNeighborNav)가 컷 넘김 스와이프와 겹친다.
  // 컨테이너의 data-own-swipe(아래)와 함께 두 겹으로 막는다.
  const onTouchStart = (e: ReactTouchEvent) => {
    e.stopPropagation();
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    e.stopPropagation();
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 32) return;
    go(dx < 0 ? 1 : -1);
  };

  return (
    <div data-own-swipe style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 화살표는 44×44(.fmt-arrow) — 터치 타겟 최소치를 맞춘다. 흰 배경 대비 1.1:1 테두리는 "누를 수 있는 것"으로 보이지 않는다. */}
        <button
          type="button"
          aria-label="이전 컷"
          disabled={index === 0}
          onClick={() => go(-1)}
          className="fmt-arrow"
          style={{ marginRight: 8 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'relative',
            width: 240,
            aspectRatio: '4/5',
            borderRadius: 14,
            overflow: 'hidden',
            flexShrink: 0,
            background: onPhoto ? (photo ? '#111827' : tint) : '#fff',
            border: onPhoto ? undefined : LENS_CARD_BORDER,
            boxShadow: LENS_CARD_SHADOW,
            boxSizing: 'border-box',
            padding: onPhoto ? 0 : 18,
          }}
        >
          {/* 상단 진행바 — 사진 배경 위에서는 흰 톤, 흰 카드 위에서는 persona 색 톤으로 대비를 맞춘다(스토리 세그먼트 관습). */}
          <div
            style={{
              position: onPhoto ? 'absolute' : 'static',
              top: onPhoto ? 14 : undefined,
              left: onPhoto ? 14 : undefined,
              right: onPhoto ? 14 : undefined,
              display: 'flex',
              gap: 5,
            }}
          >
            {Array.from({ length: total }).map((_, si) => (
              <div
                key={si}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 999,
                  background: onPhoto
                    ? si <= index
                      ? 'rgba(255,255,255,0.92)'
                      : 'rgba(255,255,255,0.32)'
                    : si <= index
                      ? color
                      : 'rgba(17,24,39,0.10)',
                }}
              />
            ))}
          </div>

          {index === 0 ? (
            <>
              {photo && (
                <>
                  <Image src={photo} alt="" fill sizes="240px" style={{ objectFit: 'cover' }} />
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 45%, transparent 78%)',
                    }}
                  />
                </>
              )}
              <span
                style={{
                  position: 'absolute',
                  top: 26,
                  left: 14,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: photo ? 'rgba(255,255,255,0.78)' : 'rgba(17,24,39,0.5)',
                }}
              >
                AI LENS
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* 13px, 흰 글자 불투명도 0.86 — 사진 위 작은 글자는 읽기 어려우므로 최소 캡션 크기(13px)를 지킨다. 인물명 대신 형식 이름을 써 페이지 다른 곳과 통일한다. */}
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: photo ? 'rgba(255,255,255,0.86)' : '#6b7280' }}>
                  {formatName}
                </span>
                <span
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 20,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    letterSpacing: '-0.01em',
                    color: photo ? '#fff' : '#111827',
                    wordBreak: 'keep-all',
                  }}
                >
                  {coverHeadline || '표지'}
                </span>
              </div>
            </>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <span
                aria-hidden
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 32, height: 32, borderRadius: 999, background: tint, color, marginTop: 14 }}
              >
                <Icon size={15} />
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                {cards[index - 1]?.hook && (
                  <p
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 20,
                      fontWeight: 700,
                      color: '#111827',
                      lineHeight: 1.4,
                      letterSpacing: '-0.01em',
                      wordBreak: 'keep-all',
                      margin: 0,
                    }}
                  >
                    {cards[index - 1]?.hook}
                  </p>
                )}
                <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.65, wordBreak: 'keep-all', margin: 0 }}>{cards[index - 1]?.caption}</p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="다음 컷"
          disabled={index === total - 1}
          onClick={() => go(1)}
          className="fmt-arrow"
          style={{ marginLeft: 8 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      {/* #6b7280(4.87:1) — 진행 위치는 보조 정보라도 읽혀야 한다. */}
      <p style={{ fontSize: 14, color: '#4b5563', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
        {index + 1} / {total}
      </p>
    </div>
  );
}
