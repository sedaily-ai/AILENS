'use client';

import { useCallback } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { LENS_FORMATS, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LensFormatPanel } from '@/app/(economy)/_shared/components';
import { PERSONAS } from '../lib/personas';
import { eunneun, euro } from '../lib/korean';
import { ResultCarousel } from './ResultCarousel';
import { resultTitle, type Glance, type Moment, type Resolved } from '../lib/moments';
import { OnboardingHeader } from './OnboardingHeader';
import { LetterInline } from './LetterInline';

// 화면 2/2 — 내 유형 결과 + 그 자리에서 바로 체험. 버튼을 한 번 더 누르게 하지 않고, 오늘 지면 1면 첫 기사를 고른 포맷으로 곧장 보여 준다.
// 마음에 안 들면 위쪽 "다른 방식" 칩으로 포맷만 바꾼다. 구독·관심분야는 일부러 묻지 않는다(결과 직후엔 이른 요청).
export function MomentResult({
  moment,
  glance,
  resolved,
  formatIndex,
  lens,
  onChangeFormat,
  onBack,
  onLater,
}: {
  moment: Moment;
  glance: Glance;
  resolved: Resolved;
  formatIndex: number;
  lens: CmsLens | null;
  onChangeFormat: (index: number) => void;
  onBack: () => void;
  onLater: () => void;
}) {
  const p = lensPerspectiveAt(formatIndex);
  const persona = PERSONAS[moment.id][glance.id];
  const changed = formatIndex !== resolved.formatIndex;
  // 제목은 항상 "상황 + 눈이 먼저 가는 곳"(예: 퇴근길 그림 먼저파) — 유형·분포는 내가 고른 답에 대한 것이라 어떤 포맷을 보고 있든 그대로 보인다.
  // 포맷을 직접 바꿨을 때는 아래 한 줄만 "지금은 ○○로 보고 있어요"로 바뀐다.
  const title = resultTitle(moment, glance);
  const ro = `${p.short}${euro(p.short)}`;
  const line = changed
    ? `지금은 ${ro} 보고 있어요.`
    : resolved.reason
      ? `${glance.hook} 다만 ${resolved.reason} ${ro} 보여드릴게요.`
      : `${glance.hook} ${ro} 보여드릴게요.`;

  const l = lens?.lenses?.[formatIndex];
  const photo = lens ? pickLensPhoto(lens) : null;

  // 온보딩엔 형식 탭 스와이프가 없다(포맷은 위 칩으로 고른다) — no-op.
  const noop = useCallback(() => {}, []);

  // 아래 이전/다음 형식 버튼 — 기사 페이지 FormatStepNav와 같은 순서(레터·웹툰·팟캐스트·영상)·문구. 바꾼 뒤 맨 위로 올라가 새 형식을 처음부터 보게 한다.
  const HOOK = ['글로 차분히 다시 읽기', '만화로 가볍게 훑어보기', '귀로 듣고 핵심만 챙기기', '15초 영상으로 한눈에 보기'];
  const goFormat = (to: number, direction: 'prev' | 'next') => {
    trackEvent('format_step_click', { article_id: lens?.id, from_format: LENS_FORMATS[formatIndex], to_format: LENS_FORMATS[to], direction, source: 'onboarding' });
    onChangeFormat(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <OnboardingHeader hideProgress onBack={onBack} />

      <div style={{ padding: '14px 22px 0', maxWidth: 680, margin: '0 auto', width: '100%', textAlign: 'center' }}>
        <ResultCarousel moment={moment} glance={glance} persona={persona} title={title} line={line} />

        <p style={{ margin: '30px 0 0', fontSize: 13, fontWeight: 700, color: '#374151' }}>이 기사, 이렇게도 볼 수 있어요</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
          {LENS_FORMATS.map((_, i) => {
            const q = lensPerspectiveAt(i);
            const on = i === formatIndex;
            return (
              <button
                key={q.short}
                type="button"
                onClick={() => onChangeFormat(i)}
                aria-pressed={on}
                style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? '#5b8def' : '#e5e7eb'}`, background: on ? '#f4f7fe' : '#ffffff', color: on ? '#3d70de' : '#6b7280' }}
              >
                {q.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mm-panel" style={{ flex: 1, padding: '20px 22px 0', maxWidth: 680, margin: '0 auto', width: '100%' }}>
        {/* 기사 페이지의 형식 이어 보기 버튼(FormatStepNav)은 위쪽 형식 탭을 DOM으로 눌러 전환하는데, 온보딩엔 그 탭이 없어 동작하지 않는다.
            패널 안의 것은 숨기고 아래에 같은 모양의 이전/다음 버튼을 따로 둔다. */}
        <style>{`
          .mm-panel nav[aria-label="다른 형식으로 이어 보기"] { display: none; }
          .mm-fstep { flex: 1; display: flex; flex-direction: column; gap: 3px; padding: 14px 18px; border: 0; border-radius: 16px; background: #f2f3f5; color: #111827; cursor: pointer; transition: background .15s ease, transform .15s ease; font: inherit; }
          .mm-fstep:hover { background: #e9ebef; }
          .mm-fstep:active { transform: scale(.985); }
          .mm-fstep:focus-visible { outline: 2px solid #5b8def; outline-offset: 2px; }
        `}</style>
        {lens && l && formatIndex === 0 ? (
          <LetterInline
            paragraphs={l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : l.bullets.length > 0 ? l.bullets : l.question ? [l.question] : []}
            headline={lens.headline}
            keywords={l.keywords ?? []}
          />
        ) : lens && l ? (
          <LensFormatPanel key={formatIndex} lens={lens} l={l} i={formatIndex} active={formatIndex} photo={photo} dir={0} onPanelTouchStart={noop} onPanelTouchEnd={noop} noteDur={noop} />
        ) : (
          <p style={{ margin: '40px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>{lens ? '이 방식은 아직 준비 중이에요. 다른 방식을 눌러 보세요.' : '오늘의 1면을 불러오는 중이에요'}</p>
        )}
      </div>

      {lens && (
        <nav aria-label="다른 형식으로 이어 보기" style={{ maxWidth: 680, margin: '40px auto 0', padding: '0 22px', width: '100%' }}>
          <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>{p.short}{eunneun(p.short)} 어떠셨어요? 같은 이야기를 다른 방식으로도 만나보세요</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            {formatIndex > 0 ? (
              <button type="button" className="mm-fstep" style={{ alignItems: 'flex-start', textAlign: 'left' }} onClick={() => goFormat(formatIndex - 1, 'prev')} aria-label={`이전 형식, ${lensPerspectiveAt(formatIndex - 1).short}`}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>← {HOOK[formatIndex - 1]}</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{lensPerspectiveAt(formatIndex - 1).short}</span>
              </button>
            ) : (
              <span style={{ flex: 1 }} aria-hidden />
            )}
            {formatIndex < LENS_FORMATS.length - 1 ? (
              <button type="button" className="mm-fstep" style={{ alignItems: 'flex-end', textAlign: 'right' }} onClick={() => goFormat(formatIndex + 1, 'next')} aria-label={`다음 형식, ${lensPerspectiveAt(formatIndex + 1).short}`}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{HOOK[formatIndex + 1]} →</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{lensPerspectiveAt(formatIndex + 1).short}</span>
              </button>
            ) : (
              <span style={{ flex: 1 }} aria-hidden />
            )}
          </div>
        </nav>
      )}

      <div style={{ textAlign: 'center', padding: '24px 0 32px' }}>
        <button type="button" onClick={onLater} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#3d70de' }}>
          홈에서 더 보기 →
        </button>
      </div>
    </div>
  );
}
