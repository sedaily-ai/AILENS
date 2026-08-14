'use client';

import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { SajuInputPanel, type SajuCalcResult } from '@saju/features/fortune/components/SajuInputPanel';
import { ConcernCard, CATEGORIES, COUPLETS, CG_OH, readMyOh, type Oh } from '@saju/features/concern-card';

type Step = 'teaser' | 'category' | 'detail' | 'birth' | 'generating' | 'result';

interface ConcernCardFlowProps {
  startAtCategory?: boolean;
}

export function ConcernCardFlow({ startAtCategory = false }: ConcernCardFlowProps) {
  const { t, lang } = useLang();
  const [step, setStep] = useState<Step>(startAtCategory ? 'category' : 'teaser');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [oh, setOh] = useState<Oh | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step !== 'generating') return;
    const id = setTimeout(() => setStep('result'), 1400);
    return () => clearTimeout(id);
  }, [step]);

  const category = CATEGORIES.find(c => c.id === categoryId) ?? null;
  const couplet = category && oh ? COUPLETS[category.id][oh] : null;

  const chooseCategory = (id: string) => {
    setCategoryId(id);
    setStep('detail');
  };

  const proceedFromDetail = () => {
    const cachedOh = readMyOh();
    if (cachedOh) {
      setOh(cachedOh);
      setStep('generating');
    } else {
      setStep('birth');
    }
  };

  const handleBirthCalculated = (r: SajuCalcResult) => {
    setOh(CG_OH[r.ilgan] ?? '토');
    setStep('generating');
  };

  const reset = () => {
    setStep('teaser');
    setCategoryId(null);
    setDetail('');
    setOh(null);
  };

  const download = async () => {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement('a');
      link.download = `concern-card-${categoryId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('concern card export failed', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative z-10 mt-4 px-3">
      {step === 'teaser' && (
        <div
          className="rounded-[22px] px-5 py-5"
          style={{
            background: 'linear-gradient(135deg, #D1FAE5 0%, #ECFDF5 100%)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={16} strokeWidth={2.2} style={{ color: SAJU.warmDeep }} />
            <p className="text-[16px] font-black" style={{ color: SAJU.ink }}>
              {t('요즘 마음이 복잡하다면', 'When things feel complicated')}
            </p>
          </div>
          <p className="text-[12.5px] mb-4" style={{ color: SAJU.warmDeep }}>
            {t('진로·관계·돈·마음 — 무엇이든 괜찮아요', 'Career, relationships, money, mind — anything works')}
          </p>
          <button
            type="button"
            onClick={() => setStep('category')}
            className="w-full flex items-center justify-center gap-1.5 rounded-full py-3 text-[13.5px] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-[0.99]"
            style={{ background: '#34D399' }}
          >
            {t('내 부적 만들기', 'Make my talisman')}
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {step !== 'teaser' && (
        <div className="rounded-[22px] bg-white p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {step === 'category' && (
            <>
              <p className="text-[13.5px] font-bold mb-3" style={{ color: SAJU.ink }}>
                {t('요즘 어떤 쪽에 고민이 있으신가요?', "Which area's been on your mind?")}
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => chooseCategory(c.id)}
                    className="rounded-full px-4 py-2 text-[13px] font-semibold border transition-colors"
                    style={{ background: '#fff', color: SAJU.inkSoft, borderColor: SAJU.line }}
                  >
                    {t(c.ko, c.en)}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'detail' && category && (
            <>
              <p className="text-[13.5px] font-bold mb-1" style={{ color: SAJU.ink }}>
                {t(`${category.ko} 고민, 더 적어볼까요?`, `Want to say more about ${category.en.toLowerCase()}?`)}
              </p>
              <p className="text-[11.5px] mb-3" style={{ color: SAJU.inkSub }}>
                {t('적으면 더 자세하게, 안 적어도 괜찮아요.', 'Writing more helps — but skipping is fine too.')}
              </p>
              <textarea
                value={detail}
                onChange={e => setDetail(e.target.value)}
                placeholder={t('예: 지금 하는 일을 계속해도 될지 모르겠어요', "e.g. I'm not sure if I should stick with what I'm doing")}
                rows={3}
                className="w-full resize-none rounded-[14px] px-3.5 py-3 text-[13px] outline-none placeholder:text-gray-400"
                style={{ background: '#F7F5F2', color: SAJU.ink }}
              />
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={proceedFromDetail}
                  className="text-[12.5px] font-semibold py-2 px-1"
                  style={{ color: SAJU.inkSub }}
                >
                  {t('건너뛰기', 'Skip')}
                </button>
                <button
                  type="button"
                  onClick={proceedFromDetail}
                  className="flex-1 rounded-full py-2.5 text-[13px] font-bold text-white"
                  style={{ background: SAJU.warmDeep }}
                >
                  {t('다음', 'Next')}
                </button>
              </div>
            </>
          )}

          {step === 'birth' && (
            <>
              <p className="text-[13.5px] font-bold mb-1" style={{ color: SAJU.ink }}>
                {t('생년월일을 알려주세요', "What's your birth date?")}
              </p>
              <p className="text-[11.5px] mb-3" style={{ color: SAJU.inkSub }}>
                {t('오행을 확인해야 카드를 만들 수 있어요.', 'We need your element to make the card.')}
              </p>
              <SajuInputPanel
                onCalculated={handleBirthCalculated}
                submitLabel={t('카드 만들기', 'Make my card')}
                trackEventName="concern_card_calculate"
              />
            </>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: SAJU.warmDeep }} />
              <p className="text-[13px] font-semibold" style={{ color: SAJU.inkSoft }}>
                {t('카드를 만들고 있어요…', 'Making your card…')}
              </p>
            </div>
          )}

          {step === 'result' && category && couplet && oh && (
            <div>
              <div ref={cardRef} className="max-w-[260px] mx-auto">
                <ConcernCard
                  oh={oh}
                  categoryLabel={t(`고민 · ${category.ko}`, `Worry · ${category.en}`)}
                  lines={lang === 'en' ? couplet.en : couplet.ko}
                />
              </div>
              {detail.trim() && (
                <p className="mt-3 text-[11.5px] text-center leading-relaxed" style={{ color: SAJU.inkSub }}>
                  {t('적어주신 고민', 'Your note')}: “{detail.trim()}”
                </p>
              )}
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className="w-full mt-4 rounded-full py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                style={{ background: SAJU.warmDeep }}
              >
                {t('이미지로 저장', 'Save as image')}
              </button>
              <button
                type="button"
                onClick={reset}
                className="w-full mt-2 text-[12.5px] font-semibold py-1"
                style={{ color: SAJU.inkSub }}
              >
                {t('처음부터 다시', 'Start over')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
