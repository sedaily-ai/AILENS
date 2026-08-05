'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { trackEvent } from '@/shared/lib/trackEvent';
import { useLang } from '@/shared/lib/LangContext';
import type { IdealMatch } from '../types';
import type { MatchMode } from '../lib/matchEngine';

const OH_EN: Record<string, string> = {
  '목': 'Wood', '화': 'Fire', '토': 'Earth', '금': 'Metal', '수': 'Water',
};
const ZODIAC_EN: Record<string, string> = {
  '쥐': 'Rat', '소': 'Ox', '호랑이': 'Tiger', '토끼': 'Rabbit',
  '용': 'Dragon', '뱀': 'Snake', '말': 'Horse', '양': 'Goat',
  '원숭이': 'Monkey', '닭': 'Rooster', '개': 'Dog', '돼지': 'Pig',
};

interface Props {
  match: IdealMatch;
  mode: MatchMode;
  primaryStem: string;
  primaryOh: string;
  onClose: () => void;
}

const EL_BG: Record<string, string> = {
  '목': 'linear-gradient(160deg, #d9f5cc 0%, #ecf9e3 55%, #f7fdf2 100%)',
  '화': 'linear-gradient(160deg, #fcd9d0 0%, #fde8df 55%, #fff5f0 100%)',
  '토': 'linear-gradient(160deg, #fae6b8 0%, #fcedc9 55%, #fff7e3 100%)',
  '금': 'linear-gradient(160deg, #e4e7ec 0%, #eef0f3 55%, #f7f8fa 100%)',
  '수': 'linear-gradient(160deg, #cfe3fa 0%, #dfeafc 55%, #f1f6ff 100%)',
};

const EL_BADGE: Record<string, string> = {
  '목': '#1a5c0f',
  '화': '#9a2a15',
  '토': '#7a5900',
  '금': '#374151',
  '수': '#1e4ea8',
};

export function ShareCard({ match, mode, primaryStem, primaryOh, onClose }: Props) {
  const { lang, t } = useLang();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const primaryOhLabel = lang === 'en' ? OH_EN[primaryOh] ?? primaryOh : primaryOh;

  const yearsByZodiac = (() => {
    const g = new Map<string, number[]>();
    for (const it of match.idealYears) {
      const arr = g.get(it.zodiac) || [];
      arr.push(it.year);
      g.set(it.zodiac, arr);
    }
    return Array.from(g.entries());
  })();

  const download = async () => {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `ideal-match-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      trackEvent('ideal_match_share_download', { mode });
    } catch (err) {
      console.error('share card export failed', err);
      alert(t('이미지 저장에 실패했어요. 잠시 후 다시 시도해주세요.', 'Failed to save the image. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const shareNative = async () => {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'ideal-match.png', { type: 'image/png' });
      const canShare = typeof navigator !== 'undefined' && 'share' in navigator
        && 'canShare' in navigator
        && (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare({ files: [file] });
      if (canShare) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          files: [file],
          title: t('나의 이상형 사주', 'My Ideal Match'),
          text: lang === 'en'
            ? `My ideal match score: ${match.score.toFixed(1)}/10 | Saju Matching`
            : `${match.summary} | 사주매칭`,
        });
        trackEvent('ideal_match_share_native', { mode });
      } else {
        await download();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('native share failed', err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[360px] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 캡처 대상 카드 (9:16) */}
        <div
          ref={cardRef}
          style={{
            aspectRatio: '9 / 16',
            background: EL_BG[primaryOh] ?? EL_BG['금'],
            borderRadius: 20,
            padding: '32px 26px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            color: '#111827',
          }}
        >
          {/* 상단 브랜드 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#4b5563', textTransform: 'uppercase' }}>
              Ideal Match
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>
              saju.sedaily.ai
            </div>
          </div>

          {/* 점수 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>
              {t('이상형 적합도', 'Ideal match fit')}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <div style={{ fontSize: 56, fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {match.score.toFixed(1)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#9ca3af' }}>/ 10</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginTop: 6 }}>
              {mode === 'spouse'
                ? t('현실 궁합 기준', 'Based on real-life fit')
                : t('오행 보완 기준', 'Based on element balance')}
            </div>
          </div>

          {/* 일간 배지 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: EL_BADGE[primaryOh] ?? '#374151',
                color: '#ffffff',
                fontSize: 26, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {primaryStem}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                {t('추천 일간', 'Day Stem')}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {primaryStem} · {lang === 'en' ? `${primaryOhLabel} energy` : `${primaryOh} 기운`}
              </div>
            </div>
          </div>

          {/* 한 줄 요약 */}
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              lineHeight: 1.4,
              color: '#111827',
              letterSpacing: '-0.015em',
              marginBottom: 22,
            }}
          >
            {lang === 'en'
              ? `A partner with ${primaryOhLabel} energy fits you well.`
              : match.summary}
          </div>

          {/* 추천 생년 */}
          {yearsByZodiac.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', marginBottom: 6 }}>
                ♡ {t('이런 사람을 찾아보세요', 'Look for someone like this')}
              </div>
              {yearsByZodiac.slice(0, 2).map(([zodiac, years]) => (
                <div key={zodiac} style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 700 }}>
                    {years.slice(0, 3).map(y => lang === 'en' ? `born ${y}` : `${y}년생`).join(' · ')}
                  </span>
                  <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                    {lang === 'en' ? (ZODIAC_EN[zodiac] ?? zodiac) : zodiac}
                  </span>
                </div>
              ))}
              {match.idealMonths.length > 0 && (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {t('추천 생월', 'Birth month')} · {match.idealMonths.map(m => lang === 'en' ? `${m}` : `${m}월`).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* 추천 띠 */}
          {match.idealZodiacs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {match.idealZodiacs.map((z, i) => (
                <span
                  key={i}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: '#fce7f3',
                    color: '#be185d',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {lang === 'en' ? (ZODIAC_EN[z] ?? z) : z}
                </span>
              ))}
            </div>
          )}

          {/* 여백 채우기 */}
          <div style={{ flex: 1 }} />

          {/* 풋터 */}
          <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.5, fontWeight: 500 }}>
            {lang === 'en'
              ? 'Data-driven Korean astrology · for entertainment only'
              : '고전 명리학 데이터 기반 해석 · 재미로 참고해주세요'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginTop: 4, letterSpacing: '-0.01em' }}>
            {lang === 'en' ? 'Saju Matching · saju.sedaily.ai' : '사주매칭 · saju.sedaily.ai'}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={shareNative}
            disabled={busy}
            className="flex-1 h-11 rounded-full bg-white text-gray-900 text-[13px] font-bold border-none cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {busy ? t('생성 중…', 'Generating…') : t('공유하기', 'Share')}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="flex-1 h-11 rounded-full bg-gray-900 text-white text-[13px] font-bold border-none cursor-pointer hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {t('이미지 저장', 'Save image')}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white text-gray-700 text-[14px] font-bold border-none cursor-pointer hover:bg-gray-100 shadow-md"
          aria-label={t('닫기', 'Close')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
