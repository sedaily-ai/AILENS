'use client';

import { useEffect, useState } from 'react';
import {
  CG_OH,
  REGION_OPTIONS,
  type Pillar,
  type DaeunEntry,
} from '@saju/features/fortune/lib/engine';
import { SajuInputPanel, type SajuCalcResult } from '@saju/features/fortune/components/SajuInputPanel';
import { SajuTable } from '@saju/features/fortune/components/SajuTable';
import { AvoidanceSection } from '@saju/features/avoidance';
import { useLang } from '@saju/shared/lib/LangContext';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';

interface CurrentSaju {
  year: number;
  month: number;
  day: number;
  gender: string;
  timeInput: string;
  region: string;
  pillars: Pillar[];
  ilgan: string;
  correctedTime?: { hour: number; minute: number };
  daeuns: DaeunEntry[];
}

const EL_BG: Record<string, string> = {
  '목': '#ECFDF5', '화': '#FEE2E2', '토': '#FEF9C3', '금': '#F5F5F5', '수': '#F3F4F6',
};
const EL_SOLID: Record<string, string> = {
  '목': '#34D399', '화': '#FD0002', '토': '#EDCE01', '금': '#EAEAEA', '수': '#000000',
};

/**
 * 빈 상태용 예시 Hero 카드 — 블러 처리 아래 보여줌
 */
function ExamplePreviewCard() {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-red-100 to-orange-50 dark:from-red-950/60 dark:to-orange-950/30 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-red-100 dark:border-red-900">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.14em] text-red-600 dark:text-red-400 uppercase mb-1">
              피해야 할 유형
            </div>
            <div className="text-[20px] font-extrabold text-gray-900 dark:text-gray-100 leading-[1.25]">
              단단한 강철형 금 기운의 사람이 당신과 가장 부딪혀요
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-center">
            <div className="text-[11px] font-semibold text-red-500">위험도</div>
            <div className="text-[28px] font-black text-red-600 leading-none mt-0.5">7.5</div>
            <div className="text-[10px] text-gray-400 mt-0.5">/ 10</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-11 h-11 rounded-[12px] flex items-center justify-center text-[18px] font-bold bg-red-600 text-white">
            庚
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-gray-500 font-medium">주의 일간</div>
            <div className="text-[13px] font-semibold text-gray-800">庚 · 금 기운</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-white/80 border border-red-200 text-[10.5px] font-medium text-red-700">#오행상극 +3</span>
          <span className="px-2 py-0.5 rounded-full bg-white/80 border border-red-200 text-[10.5px] font-medium text-red-700">#충 +4</span>
        </div>
      </div>
    </div>
  );
}

export default function AvoidancePage() {
  const { t, lang } = useLang();
  const [saju, setSaju] = useState<CurrentSaju | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('saju_current');
      if (raw) setSaju(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  const handleCalculated = (r: SajuCalcResult) => {
    setSaju({
      year: r.year, month: r.month, day: r.day, gender: r.gender,
      timeInput: r.timeInput, region: r.region,
      pillars: r.pillars, ilgan: r.ilgan,
      correctedTime: r.correctedTime, daeuns: r.daeuns,
    });
    setFormOpen(false);
  };

  const initialForm = saju ? {
    birthdate: `${saju.year} / ${String(saju.month).padStart(2, '0')} / ${String(saju.day).padStart(2, '0')}`,
    timeInput: saju.timeInput,
    noTime: !saju.timeInput,
    gender: saju.gender as '남' | '여',
    region: saju.region,
  } : undefined;

  if (!loaded) return null;

  const ilgan = saju?.ilgan ?? '';
  const pillars = saju?.pillars ?? [];

  return (
    <PageShell hanjaRight="克" hanjaLeft="避">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[420px] -z-[1] pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, #FFFFFF 0%, rgba(255,255,255,0) 100%)' }}
      />

      <PageHeader
        title={t('상극인연', 'Avoidance')}
        titleAccent={t('인연', 'ce')}
        sub={t('충·형·파·상극으로 보는 피해야 할 사주 유형',
              'Clash · punishment · break · element opposition')}
        showSearch={false}
      />

      <div className="relative z-10 px-3 pt-2">
        {/* saju 없음: 예시 블러 카드 + 입력 폼 */}
        {!saju && (
          <>
            <div className="relative mb-5">
              <div aria-hidden="true" className="pointer-events-none select-none" style={{ filter: 'blur(6px)', opacity: 0.55 }}>
                <ExamplePreviewCard />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="bg-gray-900/85 dark:bg-gray-100/90 text-white dark:text-gray-900 px-4 py-2.5 rounded-full shadow-lg">
                  <div className="text-[12px] font-bold tracking-tight">
                    {t('생년월일을 입력하시면', 'Enter your birth date')}
                  </div>
                  <div className="text-[11px] font-medium opacity-80 -mt-0.5">
                    {t('피해야 할 유형이 열려요', 'to unlock your avoidance profile')}
                  </div>
                </div>
              </div>
            </div>

            <SajuInputPanel
              initial={initialForm}
              onCalculated={handleCalculated}
              submitLabel={t('상극 인연 보기', 'See Avoidance')}
              trackEventName="avoidance_calculate"
            />
          </>
        )}

        {/* saju 있음 + 폼 열림 */}
        {saju && formOpen && (
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="w-full mb-3 py-2.5 text-[13px] text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-none cursor-pointer"
            >
              {t('입력 취소하고 돌아가기', 'Cancel and go back')}
            </button>
            <SajuInputPanel
              initial={initialForm}
              onCalculated={handleCalculated}
              submitLabel={t('상극 인연 보기', 'See Avoidance')}
              trackEventName="avoidance_calculate"
            />
          </>
        )}

        {/* saju 있고 폼 닫힘: 프로필 요약 + 상극 섹션 */}
        {saju && !formOpen && (
          <>
            {(() => {
              const ilganOh = CG_OH[ilgan] || '';
              const dateLabel = lang === 'en'
                ? `${saju.year}-${String(saju.month).padStart(2, '0')}-${String(saju.day).padStart(2, '0')}`
                : `${saju.year}년 ${saju.month}월 ${saju.day}일`;
              const regionLabel = REGION_OPTIONS.find(r => r.value === saju.region)?.label || '';
              let offsetLabel = '';
              if (saju.correctedTime && saju.timeInput) {
                const raw = saju.timeInput.replace(/[^0-9]/g, '');
                if (raw.length === 4) {
                  const inMin = parseInt(raw.slice(0, 2)) * 60 + parseInt(raw.slice(2, 4));
                  const outMin = saju.correctedTime.hour * 60 + saju.correctedTime.minute;
                  const diff = outMin - inMin;
                  if (diff !== 0) offsetLabel = t(` (경도보정 ${diff > 0 ? '+' : ''}${diff}분)`, ` (longitude ${diff > 0 ? '+' : ''}${diff}m)`);
                }
              }
              const genderLabel = saju.gender === '남' ? t('남', 'Male') : saju.gender === '여' ? t('여', 'Female') : '';
              const subtitle = [genderLabel, regionLabel].filter(Boolean).join(' · ') + offsetLabel;

              return (
                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0"
                      style={{
                        background: EL_BG[ilganOh] || '#F2F4F7',
                        color: EL_SOLID[ilganOh] || '#6B7684',
                      }}
                    >
                      {ilgan || '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">
                        {dateLabel}{saju.timeInput && ` ${saju.timeInput}`}
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-300 truncate">{subtitle}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormOpen(true)}
                      className="shrink-0 border-none rounded-lg cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      {t('다시 입력', 'Re-enter')}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 사주팔자 차트 */}
            <SajuTable pillars={pillars} ilgan={ilgan} />

            <AvoidanceSection
              pillars={pillars}
              birthYear={saju.year}
            />
          </>
        )}
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}
