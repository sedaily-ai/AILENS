'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LensFormatPanel } from '@/app/(content)/lens/[slug]/components';

// STEP 3 — STEP 2에서 고른 포맷으로 오늘의 1면을 실제로 소비한다.
// LensViewClient.tsx의 형식 패널(LensFormatPanel)을 그대로 재사용하되,
// 온보딩에서는 4개 중 고른 1개만 마운트한다 — 나머지 3개를 hidden으로
// 같이 렌더하는 건 lens 상세 페이지의 SEO 요구사항(NewsArticle 구조화
// 데이터가 4개 시선을 전부 인용해야 함) 때문인데, 온보딩 화면은 색인
// 대상이 아니라 그 제약이 없다.
export function ConsumeStep({
  lens,
  formatIndex,
  onContinue,
}: {
  lens: CmsLens;
  formatIndex: number;
  onContinue: () => void;
}) {
  const [showScript, setShowScript] = useState(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 22px 0' }}>
        <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          AI LENS
        </span>
        <button
          type="button"
          onClick={onContinue}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}
        >
          건너뛰기 →
        </button>
      </div>

      <div style={{ flex: 1, padding: '8px 22px 0', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <LensFormatPanel
          lens={lens}
          l={l}
          i={formatIndex}
          active={formatIndex}
          photo={photo}
          dir={0}
          onPanelTouchStart={onPanelTouchStart}
          onPanelTouchEnd={onPanelTouchEnd}
          showScript={showScript}
          setShowScript={setShowScript}
          noteDur={noteDur}
        />
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
