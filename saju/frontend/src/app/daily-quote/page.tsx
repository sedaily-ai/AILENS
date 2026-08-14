'use client';

import { useState } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { RotateCcw } from 'lucide-react';

interface FortuneCookie {
  ko: string;
  en: string;
}

const FORTUNE_POOL: FortuneCookie[] = [
  { ko: '오늘 작은 변화가 큰 흐름을 바꿔요.', en: 'A small change today shifts the big picture.' },
  { ko: '마음먹은 일은 오늘 시작이 정답이에요.', en: 'The best time to start is today.' },
  { ko: '멈춰도 괜찮아요. 쉬는 것도 운의 일부.', en: "It's okay to pause. Rest is part of luck." },
  { ko: '좋은 인연은 준비된 마음에 찾아와요.', en: 'Good connections find a prepared heart.' },
  { ko: '흐름을 믿으면 길이 보여요.', en: 'Trust the flow and the path appears.' },
  { ko: '작은 감사가 큰 복을 불러요.', en: 'Small gratitude invites great fortune.' },
  { ko: '오늘의 선택이 내일의 운을 만들어요.', en: "Today's choice shapes tomorrow's luck." },
  { ko: '기다림 끝에 빛나는 순간이 와요.', en: 'A shining moment comes after patience.' },
  { ko: '생각보다 가까운 곳에 답이 있어요.', en: 'The answer is closer than you think.' },
  { ko: '욕심을 내려놓으면 더 많이 들어와요.', en: 'Let go of greed and more flows in.' },
  { ko: '오늘 만나는 사람에게 행운이 숨어있어요.', en: 'Luck hides in the person you meet today.' },
  { ko: '직감을 믿어보세요. 오늘은 맞을 확률이 높아요.', en: 'Trust your instinct — odds are high today.' },
  { ko: '급한 마음을 내려놓으면 일이 풀려요.', en: 'Let go of urgency and things untangle.' },
  { ko: '누군가 당신을 좋게 떠올리고 있어요.', en: 'Someone is thinking warmly of you right now.' },
  { ko: '오늘 쓴 돈은 나중에 돌아와요.', en: 'What you spend today returns later.' },
  { ko: '예상 못 한 연락이 좋은 소식을 가져와요.', en: 'An unexpected message brings good news.' },
  { ko: '오늘은 말보다 표정이 더 많은 것을 전해요.', en: 'Today, your expression says more than words.' },
  { ko: '작은 루틴 하나가 운의 방향을 바꿔요.', en: 'One small routine changes the direction of luck.' },
  { ko: '지금 고민하는 것, 결국 잘 돼요.', en: "What you're worrying about — it works out." },
  { ko: '오늘의 피로는 내일의 성과로 쌓여요.', en: "Today's fatigue builds tomorrow's reward." },
  { ko: '하늘이 도우려면 먼저 한 발을 내디뎌야 해요.', en: 'Heaven helps those who take the first step.' },
];

function getDailyFortunes(): FortuneCookie[] {
  // 날짜 기반 시드로 매일 같은 3개가 나오되, 다음 날은 바뀜
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const shuffled = [...FORTUNE_POOL].sort((a, b) => {
    const ha = hashCode(a.ko + seed);
    const hb = hashCode(b.ko + seed);
    return ha - hb;
  });
  return shuffled.slice(0, 3);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

export default function DailyQuotePage() {
  const { t } = useLang();
  const [fortunes] = useState(() => getDailyFortunes());
  const [revealed, setRevealed] = useState<(boolean)[]>([false, false, false]);
  const [selected, setSelected] = useState<number | null>(null);

  const handleClick = (idx: number) => {
    if (selected !== null) return; // 하나만 선택 가능
    setRevealed(prev => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setSelected(idx);
  };

  const reset = () => {
    setRevealed([false, false, false]);
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[540px] min-h-screen px-3 pt-10 pb-24" style={{ background: '#ECFDF5' }}>

        {/* 헤더 */}
        <div className="flex flex-col items-center text-center pt-8 mb-10">
          <h1 className="text-[28px] font-black text-gray-900 tracking-tight">
            {t('오늘의 한마디', 'Daily Fortune')}
          </h1>
          <p className="mt-3 text-[15px] text-gray-500 leading-relaxed max-w-[300px] whitespace-pre-line">
            {t(
              '포춘 쿠키 하나를 골라보세요.\n\n오늘 하루를 위한 한마디가 숨어있어요.',
              'Pick a fortune cookie.\n\nA message for your day is hidden inside.'
            )}
          </p>
        </div>

        {/* 포춘 쿠키 3개 */}
        <div className="flex items-center justify-center gap-5">
          {fortunes.map((fortune, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleClick(idx)}
              disabled={selected !== null}
              className={`relative flex flex-col items-center gap-3 transition-all duration-300 ${
                selected !== null && selected !== idx ? 'opacity-40 scale-90' : ''
              } ${selected === idx ? 'scale-110' : 'hover:scale-105 active:scale-95'}`}
              style={{ cursor: selected !== null ? 'default' : 'pointer' }}
            >
              <div
                className={`w-[90px] h-[90px] rounded-[22px] flex items-center justify-center transition-all duration-500 ${
                  revealed[idx] ? 'bg-white shadow-lg' : 'bg-white/80 shadow-sm'
                }`}
                style={{
                  border: revealed[idx] ? '2px solid #34D399' : '2px solid transparent',
                }}
              >
                <span className={`text-[48px] transition-transform duration-500 ${revealed[idx] ? 'animate-bounce' : ''}`}>
                  🥠
                </span>
              </div>
              <span className="text-[12px] font-bold text-gray-400">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>

        {/* 결과 카드 */}
        {selected !== null && (
          <div className="mt-10 mx-2 animate-[fadeInUp_0.5s_ease-out]">
            <div className="bg-white rounded-[24px] p-6 shadow-sm text-center">
              <span className="text-[48px] block mb-4">✨</span>
              <p className="text-[18px] font-bold text-gray-900 leading-relaxed">
                {t(fortunes[selected].ko, fortunes[selected].en)}
              </p>
              <p className="mt-4 text-[12px] text-gray-400">
                {t('오늘 하루, 이 한마디를 마음에 담아보세요.', 'Keep this message in your heart today.')}
              </p>
            </div>

            {/* 다시 하기 */}
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                style={{ background: '#FFFFFF', color: '#059669', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
              >
                <RotateCcw size={14} strokeWidth={2.5} />
                {t('다시 고르기', 'Pick again')}
              </button>
            </div>
          </div>
        )}

        {/* 선택 전 안내 */}
        {selected === null && (
          <div className="mt-10 text-center">
            <p className="text-[13px] text-gray-400 animate-pulse">
              {t('↑ 쿠키를 하나 터치하세요', '↑ Tap a cookie above')}
            </p>
          </div>
        )}

        {/* fadeInUp 키프레임 */}
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
