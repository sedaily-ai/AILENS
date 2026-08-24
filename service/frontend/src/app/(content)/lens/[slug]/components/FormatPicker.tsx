'use client';

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';
import { lensFormatAt, lensPerspectiveAt, lensPanelId, lensTabId } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LensFormatArt } from '@/shared/ui/icons/LensFormatArt';
import { formatAmount } from './lensSamples';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해).
//
// ── 형식 선택기 — 2026-08-21 재설계(웹툰 릴론치 PR #10 반영) ──
// 직전 버전은 인물 일러스트가 들어간 148px 타일 2×2(모바일)였다. 첫
// 사용자가 이 페이지를 이해하지 못하는 원인이 대부분 이 컨트롤에 있었다:
//
//  1. 선택기가 스크롤과 함께 사라졌다. sticky로 고정한다 — 이 페이지에서
//     유일하게 항상 닿아야 하는 컨트롤이다.
//  2. 일러스트가 형식을 설명하지 않았다. 형식을 뜻하는 아이콘(BookOpen/
//     Image/Headphones/Video)으로 바꿨다.
//  3. 타일이 세로로 320px을 먹었다. 태그라인은 선택기에서 빼고, 고른
//     형식의 설명은 탭 직후 잠깐 뜨는 토스트(LensViewClient의 #lens-desc)로
//     보여준다.
//
// 2차 개선("너무 일차원적" 피드백):
//  a. 분량을 탭 안으로 — formatAmount()가 이 기사를 그 형식으로 보면
//     얼마나 되는지 보여준다(약 2분 / 8컷 / 3:24 / 준비 중).
//  b. 슬라이딩 인디케이터(.fmt-thumb) — 알약 배경 on/off 대신 하나가
//     옆으로 미끄러져 형식 간 인접 관계를 나른다.
//  c. 가로 스와이프(부모의 onPanelTouchStart/End) + 방향성 전환.
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
        {/* 슬라이딩 인디케이터 — 탭 뒤에서 움직인다. 형식 색으로 물들며
            옮겨가므로 "몇 칸 옆으로 갔는지"와 "지금 무슨 형식인지"를
            한 요소가 같이 말한다. 정보는 이름·분량 텍스트가 나르고
            이건 관계만 나르므로 aria에서 감춘다. */}
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
              // 분량 텍스트가 "⋯"이나 "8컷"처럼 짧은 기호·단위라
              // 그대로 읽히면 뜻이 안 통한다. 이름과 분량을 붙여 한
              // 문장으로 읽어준다.
              aria-label={`${p.short}, ${amt.spoken}`}
            >
              <span className="fmt-name">{p.short}</span>
              {/* 분량 — 아이콘을 이 줄에 붙였다. 1행에 아이콘+이름을
                  같이 넣으면 375px 칸(69.75px)에 "팟캐스트"(56px) +
                  아이콘(18) + 간격이 안 들어간다. 아이콘이 분량 옆에
                  오면 "약 2분"이 읽는 시간인지 듣는 시간인지도
                  아이콘이 구분해준다. */}
              <span className="fmt-amt">
                <span aria-hidden className="fmt-art">
                  <LensFormatArt format={lensFormatAt(i)} size={22} />
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
