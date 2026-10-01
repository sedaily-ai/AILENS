'use client';

import { useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { pickLensPhoto, lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LensFormatPanel } from '@/app/(economy)/_shared/components';
import { OnboardingHeader } from './OnboardingHeader';
import { LetterStoryCards } from './LetterStoryCards';

// STEP 3 — STEP 2에서 고른 포맷으로 오늘의 1면을 실제로 소비한다.
// LensViewClient.tsx의 형식 패널(LensFormatPanel)을 그대로 재사용하되,
// 온보딩에서는 4개 중 고른 1개만 마운트한다 — 나머지 3개를 hidden으로
// 같이 렌더하는 건 lens 상세 페이지의 SEO 요구사항(NewsArticle 구조화
// 데이터가 4개 시선을 전부 인용해야 함) 때문인데, 온보딩 화면은 색인
// 대상이 아니라 그 제약이 없다.
//
// 레터(formatIndex 0)만 예외(2026-09-03) — 웹툰/팟캐스트/영상은
// LensFormatPanel이 이미 실제 시각 매체(컷 이미지·오디오/영상 플레이어)를
// 보여줘서 문제가 없는데, 레터는 순수 텍스트 문단이 스크롤 없는 한
// 화면에 통째로 쏟아졌다(사용자 스크린샷 지적). LetterStoryCards로
// 대체 — 같은 CMS 문단을 문장 단위로 쪼개 스토리처럼 보여준다.
export function ConsumeStep({
  lens,
  formatIndex,
  onContinue,
  onBack,
}: {
  lens: CmsLens;
  formatIndex: number;
  onContinue: () => void;
  onBack?: () => void;
}) {
  const photo = pickLensPhoto(lens);
  const l = lens.lenses?.[formatIndex];

  // 온보딩엔 형식 탭 스와이프가 없다(포맷은 STEP 2에서 이미 확정) — no-op.
  const onPanelTouchStart = useCallback(() => {}, []);
  const onPanelTouchEnd = useCallback(() => {}, []);
  const noteDur = useCallback(() => {}, []);

  // 이 포맷 슬롯이 비어있는 기사(admin 미채움) — 다음으로 넘어가게 둔다.
  // 렌더 중에 부모 setState(onContinue)를 직접 부르면 안 되므로(React
  // "Cannot update a component while rendering a different component"),
  // effect로 미룬다 — FormatStep.tsx의 ref-during-render 수정과 같은 이유.
  useEffect(() => {
    if (!l) onContinue();
  }, [l, onContinue]);

  if (!l) {
    return null;
  }

  const isLetter = formatIndex === 0;
  const letterParagraphs = isLetter
    ? l.paragraphs && l.paragraphs.length > 0
      ? l.paragraphs
      : l.bullets.length > 0
        ? l.bullets
        : l.question
          ? [l.question]
          : []
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      {/* 2026-09-03 — 이 헤더엔 skip을 안 넘긴다. "건너뛰기"는 이제 전체
          온보딩 종료(홈으로)를 뜻하는데, 이 화면은 실제로 글을 읽는
          중이라 그 라벨을 여기 두면 "다음으로"인지 "그만 보기"인지
          헷갈린다(사용자 지적: "건너뛰기를 누르면 다음으로 이동하네").
          이 단계의 "다음"은 아래 "다 보셨다면" 버튼 하나로 충분하다. */}
      <OnboardingHeader currentStep={3} onBack={onBack} />

      <div style={{ flex: 1, padding: '8px 22px 0', maxWidth: isLetter ? 420 : 680, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: isLetter ? 'center' : undefined }}>
        {isLetter ? (
          <LetterStoryCards paragraphs={letterParagraphs} accentColor={lensPerspectiveAt(0).color} />
        ) : (
          <LensFormatPanel
            lens={lens}
            l={l}
            i={formatIndex}
            active={formatIndex}
            photo={photo}
            dir={0}
            onPanelTouchStart={onPanelTouchStart}
            onPanelTouchEnd={onPanelTouchEnd}
            noteDur={noteDur}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onContinue}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: '18px 0 26px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>다 보셨다면</span>
        <ChevronDown size={16} color="#cbd5e1" strokeWidth={2} />
      </button>
    </div>
  );
}
