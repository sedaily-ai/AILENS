'use client';

import { X } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from '@saju/shared/ui/sajuTokens';
import { WeeklyCheckIn } from './WeeklyCheckIn';

interface Props {
  dayCount: number;
  amount: number;
  onClose: () => void;
}

export function ClaimPopup({ dayCount, amount, onClose }: Props) {
  const { t } = useLang();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <div
        className="chat-bubble-in w-full max-w-[360px] rounded-[24px] bg-white p-6 text-center relative"
        style={{ boxShadow: '0 16px 48px rgba(20,16,12,0.24)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label={t('닫기', 'Close')}
        >
          <X size={20} />
        </button>

        <p className="text-[17px] font-black leading-snug mb-1" style={{ color: SAJU.ink, fontFamily: SERIF }}>
          {t(`${dayCount}일차 출석 성공으로`, `Day ${dayCount} check-in complete —`)}
        </p>
        <p className="text-[17px] font-black leading-snug mb-6" style={{ color: SAJU.warmDeep }}>
          {t(`포인트 ${amount}개를 받았어요!`, `you earned ${amount} points!`)}
        </p>

        <div className="rounded-[18px] py-4 px-2" style={{ background: '#F7F5F2' }}>
          <WeeklyCheckIn />
        </div>

        <p className="text-[12.5px] leading-relaxed mt-5" style={{ color: SAJU.inkSub }}>
          {t('남은 출석도 꾸준히 참여하다보면 행운이 모일거예요!', 'Keep checking in — the luck adds up.')}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 rounded-full py-3 text-[13.5px] font-bold text-white"
          style={{ background: SAJU.warmDeep }}
        >
          {t('확인', 'Got it')}
        </button>
      </div>
    </div>
  );
}
