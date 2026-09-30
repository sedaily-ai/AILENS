'use client';

import { useCallback, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import Image from 'next/image';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW } from '@/shared/constants/lensPerspectives';
import type { LucideIcon } from 'lucide-react';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해).
/**
 * 카드뉴스 목업 — 인스타 카드뉴스처럼 한 장씩 크게 보여주고 화살표(또는
 * 스와이프)로 넘긴다(2026-08-18, "가로 스크롤 필름스트립은 촌스럽다,
 * 인스타처럼 화살표 누르면 안 되냐" 지적 — 실제로 /design 캔버스로 방향을
 * 먼저 스케치해서 승인받은 뒤 반영). 카드마다 자기 useState가 필요해서
 * 별도 컴포넌트로 뺐다 — 시선 패널은 하나만 보이므로(다른 시선은 hidden)
 * 이 컴포넌트도 사실상 한 인스턴스만 활성 상태로 존재한다.
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
  /** 형식 이름("웹툰") — 예전엔 인물 설명(full, "그림으로 가볍게 보고 싶은
   *  사람")과 서수(②)를 표지에 박았는데, 같은 것을 페이지 다른 곳에서는
   *  "웹툰"이라고 불러서 이름이 둘로 갈렸다. 서수는 이제 화면 어디에도
   *  안 쓰므로(선택기가 위치를 보여준다) 여기서도 뺐다(2026-08-21). */
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

  // ⚠️ stopPropagation 필수 — 2026-08-21에 패널 전체에도 가로 스와이프(형식
  // 전환)가 붙었다. 여기서 막지 않으면 컷을 넘기려는 스와이프가 형식 전환까지
  // 같이 발동해 웹툰에서 팟캐스트로 튄다. 컨테이너에 data-own-swipe도 달아
  // 두었으니(아래) 두 겹으로 막힌다.
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
        {/* 36×36 → 44×44(.fmt-arrow). 터치 타겟 최소치를 못 넘겼고, 테두리도
            흰 배경 대비 1.1:1(rgba(0,0,0,0.06))이라 "누를 수 있는 것"으로
            보이지 않았다. 2026-08-21. */}
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
          {/* 상단 진행바 — 사진 배경 위에서는 흰 톤, 흰 카드 위에서는 persona
              색 톤으로 대비를 맞춘다(스토리 세그먼트 관습). */}
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
                {/* 10.5 → 13px, 흰 글자 불투명도 0.7 → 0.86. 사진 위 작은
                    글자는 원래도 읽기 어려운 조건인데 최소 캡션 크기(13px)
                    아래였다. 인물명(full) 대신 형식 이름을 쓴다 — 페이지의
                    다른 곳과 이름을 하나로 통일했다. */}
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
      {/* #9ca3af(2.54:1) → #6b7280(4.87:1). 진행 위치는 보조 정보라도
          읽혀야 하는 정보다. */}
      <p style={{ fontSize: 14, color: '#4b5563', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
        {index + 1} / {total}
      </p>
    </div>
  );
}
