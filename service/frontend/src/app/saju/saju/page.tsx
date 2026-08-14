'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { PageShell } from '@saju/shared/ui/PageShell';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { SAJU, SERIF } from '@saju/shared/ui/sajuTokens';
import { useLang } from '@saju/shared/lib/LangContext';
import { getGapja, CG_OH, OH_HJ } from '@saju/features/fortune/lib/engine';

/* ────────────────────────────────────────────────────────────
 * /saju 메인 — 와이어프레임 기반 리디자인 (2026-07-16)
 *
 * 섹션 구성:
 *   1) 히어로 — 오늘의 기운 요약
 *   2) 나의 사주 — 원국 + 오늘의 흐름 + 올해의 운세 (풀와이드 연속)
 *   3) 인연 — 천생인연 + 상극인연 + 궁합
 *   4) 재물 · 커리어 — 2열 그리드
 *   5) 가볍게 보는 오늘 — 주역점 카드
 * ──────────────────────────────────────────────────────────── */

export default function SajuStandalonePage() {
  const { t, localePath } = useLang();
  const [today, setToday] = useState<{ m: number; d: number; weekday: string; oh: string; ohHanja: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const gapja = getGapja(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const dayCg = gapja.dayPillarHanja[0];
    const oh = CG_OH[dayCg] || '목';
    const ohHanja = OH_HJ[oh] || '木';
    setToday({ m: now.getMonth() + 1, d: now.getDate(), weekday: days[now.getDay()], oh, ohHanja });
  }, []);

  return (
    <PageShell hanjaRight="易" hanjaLeft="命">
      {/* ─── 히어로: 오늘의 기운 요약 ─── */}
      <section className="relative z-10 px-5 pt-5 pb-6">
        {/* 상단 미니바 */}
        <div className="flex items-center justify-between text-[11.5px] mb-5" style={{ color: SAJU.inkMute }}>
          <div className="flex items-center gap-1.5">
            <span style={{ fontFamily: SERIF, fontWeight: 600, color: SAJU.ink, opacity: 0.55 }}>占</span>
            <span>{t('KASI 만세력 · 궁통보감 · 자평진전', 'KASI · classical texts')}</span>
          </div>
          {today && (
            <span className="tabular-nums font-semibold" style={{ color: SAJU.inkSoft }}>
              {today.m}.{today.d} {today.weekday}
            </span>
          )}
        </div>

        {/* 메인 카피 */}
        <h1
          className="text-[22px] leading-[1.45] font-black"
          style={{ fontFamily: SERIF, color: SAJU.ink, letterSpacing: '-0.01em' }}
        >
          {today
            ? t(
                `오늘은 ${today.oh}(${today.ohHanja})의 기운이\n흐르는 날이에요`,
                `Today flows with the energy\nof ${today.oh === '목' ? 'Wood' : today.oh === '화' ? 'Fire' : today.oh === '토' ? 'Earth' : today.oh === '금' ? 'Metal' : 'Water'}(${today.ohHanja})`,
              )
            : t(
                '오늘의 기운을 읽어드립니다',
                'Reading today\'s energy',
              )}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
          {t(
            '궁통보감·삼명통회·자평진전 3대 고전과 KASI 만세력을 결합해 오늘의 흐름을 읽어드립니다.',
            'We combine 3 classical texts with the KASI ephemeris to read today\'s flow.',
          )}
        </p>
      </section>

      {/* ─── 나의 사주 ─── */}
      <SectionDivider label={t('나의 사주', 'My Saju')} />

      <div className="relative z-10 px-3 mt-2 flex flex-col gap-2.5">
        {/* 나의 사주 원국 카드 */}
        <Link
          href={localePath('/saju/chart')}
          className="flex gap-4 items-start rounded-[20px] bg-white p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="shrink-0 w-[100px] h-[100px] rounded-[14px] overflow-hidden relative">
            <Image
              src="/saju/saju/my-saju.png"
              alt={t('사주 원국 이미지', 'Saju chart image')}
              fill
              className="object-cover"
              sizes="100px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                {t('사주 총운', 'Full Reading')}
              </span>
              <p className="text-[11px] font-semibold" style={{ color: SAJU.inkMute }}>
                {t('원국 · 십성 · 대운을 한 장으로', 'Chart · Ten Gods · Luck Cycle')}
              </p>
            </div>
            <h3 className="text-[15px] font-bold leading-snug" style={{ color: SAJU.ink }}>
              {t('나는 원래 어떤 사람일까?', 'Who am I, really?')}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
              {t(
                '태어난 순간에 새겨진 여덟 글자, 그 안에 담긴 나의 기본 성정과 평생의 흐름을 확인해 보세요.',
                'Eight characters carved at birth — discover your core nature and lifelong flow.',
              )}
            </p>
            <span
              className="inline-flex items-center gap-1 mt-3 text-[12px] font-bold"
              style={{ color: SAJU.warmDeep }}
            >
              {t('내 총운 보기', 'See full reading')} <ArrowRight size={13} strokeWidth={2.5} />
            </span>
          </div>
        </Link>

        {/* 오늘의 흐름 카드 */}
        <Link
          href={localePath('/today')}
          className="flex gap-4 items-start rounded-[20px] bg-white p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="shrink-0 w-[100px] h-[100px] rounded-[14px] overflow-hidden relative">
            <Image
              src="/saju/saju/today.png"
              alt={t('오늘의 운세 이미지', "Today's fortune image")}
              fill
              className="object-cover"
              sizes="100px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold mb-1" style={{ color: SAJU.inkMute }}>
              {t('오늘의 운세 · 실시간 업데이트', "Today's fortune · Live update")}
            </p>
            <h3 className="text-[15px] font-bold leading-snug" style={{ color: SAJU.ink }}>
              {t('오늘 나에게는 어떤 하루가 기다리고 있을까?', 'What kind of day awaits you?')}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
              {t(
                '재물보다 사람이 기회를 가져오는 하루예요. 오후 3시 이후 제안·연락에 좋은 흐름이 있어요.',
                'People bring opportunities today. Good flow for proposals after 3 PM.',
              )}
            </p>
            <span
              className="inline-flex items-center gap-1 mt-3 text-[12px] font-bold"
              style={{ color: SAJU.warmDeep }}
            >
              {t('오늘 운세 자세히 보기', 'See full forecast')} <ArrowRight size={13} strokeWidth={2.5} />
            </span>
          </div>
        </Link>

        {/* 올해의 운세 카드 */}
        <Link
          href={localePath('/yearly')}
          className="flex gap-4 items-start rounded-[20px] bg-white p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="shrink-0 w-[100px] h-[100px] rounded-[14px] overflow-hidden relative">
            <Image
              src="/saju/saju/yearly.png"
              alt={t('올해 운세 이미지', "This year's fortune image")}
              fill
              className="object-cover"
              sizes="100px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#B45309' }}>
                {t('2026년', '2026')}
              </span>
              <p className="text-[11px] font-semibold" style={{ color: SAJU.inkMute }}>
                {t('병오년 · 대운 흐름 분석', 'Year of Byeong-o · Luck cycle')}
              </p>
            </div>
            <h3 className="text-[15px] font-bold leading-snug" style={{ color: SAJU.ink }}>
              {t('올해 나에게 어떤 기회가 올까?', 'What opportunities await this year?')}
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
              {t(
                '올해의 세운과 대운이 내 사주와 어떻게 만나는지, 월별 흐름까지 한눈에 확인하세요.',
                'See how this year\'s energy meets your chart — month-by-month outlook included.',
              )}
            </p>
            <span
              className="inline-flex items-center gap-1 mt-3 text-[12px] font-bold"
              style={{ color: SAJU.warmDeep }}
            >
              {t('올해 운세 보기', "See this year's fortune")} <ArrowRight size={13} strokeWidth={2.5} />
            </span>
          </div>
        </Link>
      </div>

      {/* ─── 인연 ─── */}
      <SectionDivider label={t('인연', 'Connections')} />

      <div className="relative z-10 px-3 mt-2 grid grid-cols-2 md:grid-cols-3 gap-2.5 max-w-[900px]">
        {/* 천생인연 카드 */}
        <Link
          href={localePath('/compatibility')}
          className="rounded-[18px] bg-white p-4 flex flex-col transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="relative w-full aspect-[3/2] rounded-[12px] mb-3 overflow-hidden">
            <Image
              src="/saju/saju/compatibility.png"
              alt={t('천생인연 이미지', 'Destined match image')}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 280px"
            />
            <span
              className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ background: '#E11D48' }}
            >
              NEW
            </span>
          </div>
          <h4 className="text-[13px] font-bold mb-1.5" style={{ color: SAJU.ink }}>
            {t('천생 인연', 'Destined Match')}
          </h4>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: SAJU.ink }}>
            {t('나는 어떤 사람이랑 잘 맞을까?', 'Who am I compatible with?')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
            {t(
              '사주로 보는 나에게 잘 맞는 사람의 성향',
              'Traits that match your chart',
            )}
          </p>
        </Link>

        {/* 상극 인연 카드 */}
        <Link
          href={localePath('/avoidance')}
          className="rounded-[18px] bg-white p-4 flex flex-col transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="relative w-full aspect-[3/2] rounded-[12px] mb-3 overflow-hidden">
            <Image
              src="/saju/saju/avoidance.png"
              alt={t('상극인연 이미지', 'Avoidance image')}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 280px"
            />
            <span
              className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
              style={{ background: '#DC2626' }}
            >
              {t('주의', 'Caution')}
            </span>
          </div>
          <h4 className="text-[13px] font-bold mb-1.5" style={{ color: SAJU.ink }}>
            {t('상극 인연', 'Avoidance')}
          </h4>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: SAJU.ink }}>
            {t('내가 피해야 할 사람은 누구일까?', 'Who should I avoid?')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
            {t(
              '충·형·파로 보는 나와 부딪히는 사주 유형',
              'Chart types that clash with yours',
            )}
          </p>
        </Link>

        {/* 궁합 카드 */}
        <Link
          href={localePath('/couple')}
          className="rounded-[18px] bg-white p-4 flex flex-col transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="relative w-full aspect-[3/2] rounded-[12px] mb-3 overflow-hidden">
            <Image
              src="/saju/saju/couple.png"
              alt={t('궁합 이미지', 'Couple compatibility image')}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 200px"
            />
          </div>
          <h4 className="text-[13px] font-bold mb-1.5" style={{ color: SAJU.ink }}>
            {t('궁합', 'Compatibility')}
          </h4>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: SAJU.ink }}>
            {t('이 사람과 나는 잘 맞을까?', 'Are we a good match?')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
            {t(
              '생년월일만 입력하면 60갑자 기반 궁합 분석',
              'Enter birthday for 60-cycle reading',
            )}
          </p>
        </Link>
      </div>

      {/* ─── 재물 · 커리어 ─── */}
      <SectionDivider label={t('재물 · 커리어', 'Wealth · Career')} />

      <div className="relative z-10 px-3 mt-2 grid grid-cols-2 gap-2.5 max-w-[600px]">
        {/* 재운 카드 */}
        <Link
          href={localePath('/chaeun')}
          className="rounded-[18px] bg-white p-4 flex flex-col transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="relative w-full aspect-[3/2] rounded-[12px] mb-3 overflow-hidden">
            <Image
              src="/saju/saju/wealth.png"
              alt={t('재운 이미지', 'Wealth image')}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 280px"
            />
          </div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <h4 className="text-[13px] font-bold" style={{ color: SAJU.ink }}>
              {t('재운', 'Wealth')}
            </h4>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#059669' }}>
              {t('상승세', 'Rising')}
            </span>
          </div>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: SAJU.ink }}>
            {t('내가 부자가 될 상인가?', 'Am I destined for wealth?')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
            {t(
              '재물운 72점 · 지출보단 투자에 유리한 흐름',
              'Wealth score 72 · Investment over spending',
            )}
          </p>
        </Link>

        {/* 커리어 카드 */}
        <Link
          href={localePath('/career')}
          className="rounded-[18px] bg-white p-4 flex flex-col transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          <div className="relative w-full aspect-[3/2] rounded-[12px] mb-3 overflow-hidden">
            <Image
              src="/saju/saju/career.png"
              alt={t('커리어 이미지', 'Career image')}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 280px"
            />
          </div>
          <h4 className="text-[13px] font-bold mb-1.5" style={{ color: SAJU.ink }}>
            {t('커리어', 'Career')}
          </h4>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: SAJU.ink }}>
            {t('지금이 도전할 타이밍일까?', 'Is now the time to take a leap?')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed line-clamp-2" style={{ color: SAJU.inkSoft }}>
            {t(
              '7월 넷째 주, 새로운 제안이 들어올 가능성',
              'New proposals likely in the 4th week of July',
            )}
          </p>
        </Link>
      </div>

      {/* ─── 가볍게 보는 오늘 ─── */}
      <SectionDivider label={t('가볍게 보는 오늘', 'Quick Reads')} />

      <div className="relative z-10 px-3 mt-2 mb-6">
        <Link
          href={localePath('/jeomsin')}
          className="flex gap-4 items-center rounded-[20px] bg-white p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
        >
          {/* 좌측 이미지 */}
          <div className="shrink-0 w-[64px] h-[64px] rounded-[12px] overflow-hidden relative">
            <Image
              src="/saju/saju/jeomsin.png"
              alt={t('주역점 이미지', 'I Ching image')}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
          {/* 텍스트 */}
          <div className="flex-1 min-w-0">
            <h4 className="text-[14px] font-bold mb-1" style={{ color: SAJU.ink }}>
              {t('주역점', 'I Ching')}
            </h4>
            <p className="text-[12px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
              {t(
                '지금 이 고민, 답은 이미 정해져 있을까? 궁금한 것 하나를 떠올리면, 64괘 중 하나로 답을 얻어보세요.',
                'Is the answer already decided? Think of one question and get an answer from 64 hexagrams.',
              )}
            </p>
          </div>
          {/* 우측 CTA */}
          <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold" style={{ color: SAJU.warmDeep }}>
            <span>{t('1분 소요', '1 min')}</span>
            <ArrowRight size={13} strokeWidth={2.5} />
          </div>
        </Link>
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}

/* ─── 섹션 구분선 컴포넌트 ─── */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="relative z-10 px-5 mt-8 mb-1 flex items-center gap-2.5">
      <span
        className="text-[13px] font-bold tracking-tight"
        style={{ fontFamily: SERIF, color: SAJU.ink }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: SAJU.line }} />
    </div>
  );
}
