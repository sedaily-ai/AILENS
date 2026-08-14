'use client';

import { useEffect, useState } from 'react';
import { SajuInputPanel, type SajuCalcResult } from '@saju/features/fortune/components/SajuInputPanel';
import { CoupleMatchSection, type PersonInput } from '@saju/features/couple-match';
import { useLang } from '@saju/shared/lib/LangContext';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';

type Step = 'me' | 'partner' | 'result';

export default function CouplePage() {
  const { t, lang } = useLang();
  const [step, setStep] = useState<Step>('me');
  const [me, setMe] = useState<PersonInput | null>(null);
  const [partner, setPartner] = useState<PersonInput | null>(null);

  // 초기 진입 시 /saju 에서 이미 계산한 내 사주가 localStorage 에 있으면 프리필
  useEffect(() => {
    try {
      const raw = localStorage.getItem('saju_current');
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.pillars && s?.year) {
          setMe({
            pillars: s.pillars,
            gender: s.gender ?? '',
            birthYear: s.year,
            label: t('나', 'Me'),
          });
          setStep('partner');
        }
      }
    } catch {}
  }, [t]);

  const fromResult = (r: SajuCalcResult, label: string): PersonInput => ({
    pillars: r.pillars,
    gender: (r.gender as '남' | '여' | '') ?? '',
    birthYear: r.year,
    label,
  });

  const handleMeCalculated = (r: SajuCalcResult) => {
    setMe(fromResult(r, t('나', 'Me')));
    setStep('partner');
  };

  // 파트너 계산 — SajuInputPanel 이 'saju_current' 를 덮어쓰기 때문에,
  // 계산 직후 원래 '나' 사주를 다시 복원해서 다른 페이지 동작을 해치지 않는다.
  const handlePartnerCalculated = (r: SajuCalcResult) => {
    try {
      if (me) {
        localStorage.setItem('saju_current', JSON.stringify({
          year: me.birthYear,
          month: 0, day: 0, // 최소 필드 (다른 페이지에서 읽어 쓰는 코드가 year 만 필수)
          gender: me.gender,
          timeInput: '',
          region: '',
          pillars: me.pillars,
          ilgan: me.pillars[1]?.c ?? '',
          correctedTime: undefined,
          daeuns: [],
        }));
      }
    } catch {}
    setPartner(fromResult(r, t('상대', 'Partner')));
    setStep('result');
  };

  const reset = () => {
    setPartner(null);
    setStep(me ? 'partner' : 'me');
  };
  const resetAll = () => {
    setMe(null);
    setPartner(null);
    setStep('me');
  };

  return (
    <PageShell hanjaRight="緣" hanjaLeft="合">
      <PageHeader
        title={t('커플 궁합', 'Couple Match')}
        titleAccent={t('합', 'ch')}
        sub={t('두 사람 생년월일시로 보는 실제 궁합 · 합·충·오행 보완',
              'Real compatibility from both charts · harmony/clash/element')}
      />

      {/* Step indicator */}
      <div className="relative z-10 px-5 mt-1 mb-3 flex items-center gap-1.5">
        <StepDot active={step === 'me'} done={step !== 'me'} label={t('나', '1')} />
        <div className="flex-1 h-px" style={{ background: '#EFEAE3' }} />
        <StepDot active={step === 'partner'} done={step === 'result'} label={t('상대', '2')} />
        <div className="flex-1 h-px" style={{ background: '#EFEAE3' }} />
        <StepDot active={step === 'result'} done={false} label={t('결과', '3')} />
      </div>

      <div className="relative z-10 px-3 pt-2">
        {step === 'me' && (
          <>
            <p className="mb-3 text-center text-[13px] text-gray-500 dark:text-gray-300 leading-relaxed">
              {t('먼저 내 생년월일을 입력해주세요.', 'First, enter your birth date.')}
            </p>
            <SajuInputPanel
              onCalculated={handleMeCalculated}
              submitLabel={t('다음 단계로', 'Continue')}
              trackEventName="couple_me_submit"
            />
          </>
        )}

        {step === 'partner' && (
          <>
            {me && (
              <div className="mb-3 bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center text-[13px] font-bold">
                  {me.pillars[1]?.c ?? '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400">{t('나', 'Me')}</div>
                  <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    {me.birthYear}년 · {me.gender === '남' ? t('남', 'Male') : me.gender === '여' ? t('여', 'Female') : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-[11.5px] font-semibold text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {t('변경', 'Change')}
                </button>
              </div>
            )}
            <p className="mb-3 text-center text-[13px] text-gray-500 dark:text-gray-300 leading-relaxed">
              {t('이제 상대의 생년월일을 입력해주세요.', 'Now enter your partner’s birth date.')}
            </p>
            <SajuInputPanel
              onCalculated={handlePartnerCalculated}
              submitLabel={t('궁합 보기', 'See match')}
              trackEventName="couple_partner_submit"
            />
          </>
        )}

        {step === 'result' && me && partner && (
          <CoupleMatchSection a={me} b={partner} onReset={reset} />
        )}
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className="flex items-center justify-center h-6 min-w-[28px] px-2 rounded-full text-[10.5px] font-bold transition-colors"
      style={{
        background: active ? '#D9651E' : done ? '#FFE2DE' : '#F0E9DC',
        color: active ? '#FFFFFF' : done ? '#C8513F' : '#A0A0A8',
      }}
    >
      {label}
    </div>
  );
}
