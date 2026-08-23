'use client';

import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';
import { lensPerspectiveAt, lensPanelId, lensTabId } from '@/shared/constants/lensPerspectives';
import type { CmsLensItem } from '@/shared/lib/api/cmsPostsApi';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해).
// ── 형식 선택 ──
// 밑줄 텍스트 탭에서 **타일**로 되돌렸다(2026-08-14).
// 이 페이지의 핵심 동작이 "어떤 형식으로 볼지 고르기"인데, 앞선
// 버전은 그 컨트롤을 회색 16px 텍스트로 낮춰서 화면에서 가장 약한
// 요소가 됐다(눈에 안 들어온다는 피드백). 게다가 선택하는 순간에
// 형식을 표시하는 요소가 없어서 "넷 중 고른다"는 것이 직관적으로
// 전달되지 않았다.
// 네 타일을 같은 크기로 나란히 놓으면 선택지가 넷이라는 사실과
// 각자가 무슨 형식인지가 한눈에 오고, 선택 상태는 색 채움 + 테두리 +
// 체크 3중으로 표시해 색만으로 구분하지 않는다.
export function FormatPicker({
  lenses,
  active,
  select,
  onTabKeyDown,
  tabRefs,
}: {
  lenses: CmsLensItem[];
  active: number;
  select: (i: number) => void;
  onTabKeyDown: (e: ReactKeyboardEvent, i: number) => void;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  return (
    <div role="tablist" aria-label="형식별 시선" className="picks">
      {lenses.map((_l, i) => {
        const p = lensPerspectiveAt(i);
        const on = i === active;
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
            className="pick"
            style={{
              // 선택 시 타일 전체를 tint로 채우던 걸 뺐다(2026-08-18,
              // "유형 누르면 뜨는 배경색 없애달라") — 테두리 색 +
              // 그림자 + 체크 배지 3중 표시로도 선택 상태는 충분히
              // 드러나고, 배경까지 채우면 특히 진한 색(로즈·앰버
              // 등)에서 과해 보였다.
              borderColor: on ? p.color : 'rgba(17,24,39,0.12)',
              background: '#fff',
              boxShadow: on ? `inset 0 0 0 1px ${p.color}` : 'none',
            }}
          >
            <span
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 48, height: 48, borderRadius: 999, background: '#fff', overflow: 'hidden' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
              <img
                src={p.illustration}
                alt=""
                width={48}
                height={48}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
              />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: on ? p.color : '#4b5563', letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
              {p.short}
            </span>
            {/* 이 시선이 무엇을 주는지 — 타일에 역할명만 있으면 무엇을
                고르는지 모르고 골라야 한다. tagline 을 여기로 올려서
                선택 전에 판단할 근거를 준다(선택 후 본문에서는 중복이라
                제거했다). */}
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: on ? p.color : '#6b7280',
                opacity: on ? 0.9 : 1,
                lineHeight: 1.45,
                textAlign: 'center',
                wordBreak: 'keep-all',
              }}
            >
              {p.tagline}
            </span>
            {/* 선택 표시 — 색 외에 형태 신호도 함께 준다. */}
            {on && (
              <span aria-hidden className="pick-on" style={{ background: p.color }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
