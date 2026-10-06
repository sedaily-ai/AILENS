'use client';

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';
import { lensFormatAt, lensPerspectiveAt, lensPanelId, lensTabId } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { FormatIcon } from '@/app/(economy)/_shared/components/icons/LensIcons';
import { formatAmount } from './lensSamples';

// 형식 선택기 — sticky 세그먼트 탭.
//  1. sticky로 고정한다. 이 페이지에서 유일하게 항상 닿아야 하는 컨트롤이다.
//  2. 아이콘은 형식을 뜻하는 것(BookOpen/Image/Headphones/Video)을 쓴다.
//  3. 태그라인은 선택기에서 빼고, 고른 형식의 설명은 탭 직후 토스트(LensViewClient의 #lens-desc)로 보여준다.
//  4. 분량을 탭 안에 표시한다. formatAmount()가 이 기사를 그 형식으로 보면 얼마나 되는지 보여준다(약 2분 / 8컷 / 3:24 / 준비 중).
//  5. 슬라이딩 인디케이터(.fmt-thumb)가 옆으로 미끄러져 형식 간 인접 관계를 나타낸다.
//  6. 방향성 전환(dir)으로 인디케이터와 본문 진입 방향을 맞춘다.
export function FormatPicker({
  lens,
  lenses,
  active,
  mediaDur,
  select,
  onTabKeyDown,
  tabRefs,
}: {
  lens: CmsLens;
  lenses: CmsLens['lenses'];
  active: number;
  /** 실제 오디오·영상 길이(초). loadedmetadata에서만 채운다. */
  mediaDur: Record<number, number>;
  select: (i: number) => void;
  onTabKeyDown: (e: ReactKeyboardEvent, i: number) => void;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  const count = lenses?.length ?? 0;
  const activeP = lensPerspectiveAt(active);

  return (
    <div className="fmt-bar">
      <div
        role="tablist"
        aria-label="이 뉴스를 볼 형식"
        aria-orientation="horizontal"
        className="fmt-row"
        style={
          {
            '--n': count,
            '--ai': active,
            '--c': activeP.color,
            '--t': activeP.tint,
          } as CSSProperties
        }
      >
        {/* 슬라이딩 인디케이터 — 탭 뒤에서 형식 색으로 물들며 움직여 이동 거리와 현재 형식을 함께 나타낸다.
            정보는 이름·분량 텍스트가 전달하고 이건 관계만 나타내므로 aria에서 감춘다. */}
        <span className="fmt-thumb" aria-hidden />
        {(lenses ?? []).map((l, i) => {
          const p = lensPerspectiveAt(i);
          const on = i === active;
          const amt = formatAmount(lens, i, mediaDur[i]);
          return (
            <button
              key={i}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={lensTabId(i)}
              aria-selected={on}
              aria-controls={lensPanelId(i)}
              tabIndex={on ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className="fmt"
              // 분량 텍스트가 "⋯"이나 "8컷"처럼 짧은 기호·단위라 그대로 읽으면 뜻이 통하지 않는다. 이름과 분량을 붙여 한 문장으로 읽어준다.
              aria-label={`${p.short}, ${amt.spoken}`}
            >
              <span className="fmt-name">{p.short}</span>
              {/* 분량 — 아이콘을 이 줄에 둔다. 1행에 아이콘+이름을 넣으면 375px 칸(69.75px)에 "팟캐스트"(56px)+아이콘(18)+간격이 들어가지 않는다.
                  아이콘이 "약 2분"이 읽는 시간인지 듣는 시간인지도 구분해 준다. */}
              <span className="fmt-amt">
                <span aria-hidden className="fmt-art">
                  <FormatIcon format={lensFormatAt(i)} size={18} />
                </span>
                {amt.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
