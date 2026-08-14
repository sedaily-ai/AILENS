'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';

interface Slide {
  eyebrowKo: string; eyebrowEn: string;
  titleKo: string; titleEn: string;
  subKo: string; subEn: string;
  ctaKo: string; ctaEn: string;
  href: string;
  visual: 'character' | 'match';
  tone: { gradient: string; accent: string; accentLight: string; visualBg: string; visualBorder: string };
}

const SLIDES: Slide[] = [
  {
    eyebrowKo: '공개 프리뷰', eyebrowEn: 'Public Preview',
    titleKo: '나는 60개 중\n어떤 캐릭터일까?', titleEn: 'Which of 60\ncharacters am I?',
    subKo: '생년월일 하나로 내 사주 원국과 캐릭터를 확인해요.', subEn: 'One birth date reveals your chart and your character.',
    ctaKo: '내 사주 보기', ctaEn: 'See my saju',
    href: '/saju/chart',
    visual: 'character',
    tone: { gradient: 'linear-gradient(to bottom, #ECFDF5 0%, #FFFFFF 100%)', accent: '#059669', accentLight: '#D1FAE5', visualBg: 'linear-gradient(135deg, #F0FDF9 0%, #E6F7F2 100%)', visualBorder: '#D1FAE5' },
  },
  {
    eyebrowKo: '이상형 역산', eyebrowEn: 'Ideal Match',
    titleKo: '나는 누구와\n잘 맞을까?', titleEn: 'Who am I\nreally compatible with?',
    subKo: '상대 없이도, 내 사주로 맞는 인연을 역산해드려요.', subEn: "No partner needed — we reverse-engineer your match from your chart.",
    ctaKo: '이상형 보기', ctaEn: 'Find my match',
    href: '/compatibility',
    visual: 'match',
    tone: { gradient: 'linear-gradient(to bottom, #FFF1F0 0%, #FFFFFF 100%)', accent: '#E11D48', accentLight: '#FECDD3', visualBg: 'linear-gradient(135deg, #FFF5F5 0%, #FEE2E2 100%)', visualBorder: '#FECDD3' },
  },
];

/**
 * HeroBanner — 랜딩 페이지 상단 히어로 섹션 (자동 슬라이드 2종)
 * 흰색 배경 + 민트 그라디언트 텍스트 + 글래스모피즘 스타일
 */
export function HeroBanner() {
  const { t, localePath } = useLang();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[idx];
  const go = (dir: -1 | 1) => setIdx(i => (i + dir + SLIDES.length) % SLIDES.length);

  return (
    <section className="relative z-10 px-3 mt-6">

      <div
        className="relative flex flex-col lg:flex-row lg:items-center lg:gap-8 p-6 lg:p-10 rounded-[24px] overflow-hidden"
        style={{
          background: '#ECFDF5',
          boxShadow: '0 4px 24px rgba(52, 211, 153, 0.12), 0 1px 4px rgba(0,0,0,0.04)',
          border: '1.5px solid rgba(110, 231, 183, 0.3)',
        }}
      >
        {/* 배경 데코 — 우측 상단 민트 블러 원 */}
        <div
          aria-hidden
          className="absolute -top-[60px] -right-[60px] w-[240px] h-[240px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(110,231,183,0.25) 0%, transparent 70%)' }}
        />
        {/* 배경 데코 — 좌측 하단 블러 원 */}
        <div
          aria-hidden
          className="absolute -bottom-[40px] -left-[40px] w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)' }}
        />

        {/* 좌우 이동 화살표 */}
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label={t('이전 슬라이드', 'Previous slide')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:shadow-md active:scale-90"
          style={{ background: 'rgba(236,253,245,0.8)', backdropFilter: 'blur(8px)' }}
        >
          <ChevronLeft size={18} strokeWidth={2.4} style={{ color: slide.tone.accent }} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label={t('다음 슬라이드', 'Next slide')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:shadow-md active:scale-90"
          style={{ background: 'rgba(236,253,245,0.8)', backdropFilter: 'blur(8px)' }}
        >
          <ChevronRight size={18} strokeWidth={2.4} style={{ color: slide.tone.accent }} />
        </button>

        {/* 좌: 텍스트 + CTA */}
        <div className="relative z-[2] flex-1 min-w-0">
          {/* 프리뷰 라벨 */}

          <span
            className="inline-block text-[13px] font-bold tracking-tight mb-3"
            style={{ color: '#34D399' }}
          >

            {t(slide.eyebrowKo, slide.eyebrowEn)}
          </span>

          {/* 메인 타이틀 — 진한 민트 단색 */}
          <h2
            className="text-[32px] lg:text-[40px] font-black leading-[1.25] tracking-[-0.02em] whitespace-pre-line"
            style={{ color: '#059669' }}
          >
            {t(slide.titleKo, slide.titleEn)}
          </h2>

          {/* 서브 텍스트 */}
          <p className="mt-4 text-[14px] lg:text-[15px] leading-relaxed" style={{ color: '#4B5563' }}>
            {t(slide.subKo, slide.subEn)}
          </p>

          {/* CTA 버튼 — 민트 그라디언트 */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={localePath(slide.href)}

              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[14px] font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #34D399 100%)' }}

            >
              {t(slide.ctaKo, slide.ctaEn)}
            </Link>
          </div>

          {/* 슬라이드 인디케이터 */}
          <div className="mt-6 flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`${t('슬라이드', 'Slide')} ${i + 1}`}
                className="block h-1.5 rounded-full transition-all"
                style={{ width: i === idx ? 20 : 8, background: i === idx ? '#34D399' : '#D1FAE5' }}
              />
            ))}
          </div>
        </div>

        {/* 우: 슬라이드별 비주얼 — 모바일에서는 배경, PC에서는 옆에 */}
        <div className="absolute inset-0 lg:relative lg:inset-auto z-[1] lg:z-[2] lg:mt-0 flex-shrink-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-full h-full lg:w-[260px] lg:h-[260px] flex items-center justify-center">
            {slide.visual === 'character' ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/saju/hero-character.png"
                alt={t('나의 사주 캐릭터', 'My saju character')}
                className="w-[85%] lg:w-[130%] h-auto object-contain opacity-20 lg:opacity-100 drop-shadow-[0_8px_24px_rgba(52,211,153,0.3)]"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src="/saju/hero-character.png"
                alt={t('이상형 역산', 'Ideal match')}
                className="w-[85%] lg:w-[130%] h-auto object-contain opacity-20 lg:opacity-100 drop-shadow-[0_8px_24px_rgba(52,211,153,0.3)]"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
