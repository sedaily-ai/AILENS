'use client';

import { useState, useMemo } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { CheckCircle, XCircle, RotateCcw, Trophy } from 'lucide-react';

interface QuizQuestion {
  ko: string;
  en: string;
  answer: boolean;
  explanationKo: string;
  explanationEn: string;
  /** 해설에 표시할 일러스트 이모지 or 이미지 경로 */
  image: string;
}

const QUIZ_POOL: QuizQuestion[] = [
  {
    ko: '사주팔자의 "팔자"는 8개의 글자를 의미한다.',
    en: 'The "palza" in sajupalza refers to 8 characters.',
    answer: true,
    explanationKo: '맞아요! 년·월·일·시 각각 천간+지지 2글자씩, 총 8글자입니다.',
    explanationEn: 'Correct! Year, month, day, hour each have 2 characters (stem + branch), totaling 8.',
    image: '🀄',
  },
  {
    ko: '천간은 총 12개이다.',
    en: 'There are 12 heavenly stems (cheongan).',
    answer: false,
    explanationKo: '천간은 10개(갑을병정무기경신임계), 지지가 12개입니다.',
    explanationEn: 'Heavenly stems are 10. Earthly branches are 12.',
    image: '🔢',
  },
  {
    ko: '60갑자는 천간 10개와 지지 12개의 조합으로 만들어진다.',
    en: 'The 60 Gapja cycle is made from 10 stems and 12 branches.',
    answer: true,
    explanationKo: '맞습니다! 10과 12의 최소공배수인 60개의 조합이 나옵니다.',
    explanationEn: 'Correct! The LCM of 10 and 12 gives 60 unique combinations.',
    image: '🔄',
  },
  {
    ko: '오행(五行)은 금, 은, 동, 철, 목을 말한다.',
    en: 'The Five Elements are gold, silver, copper, iron, and wood.',
    answer: false,
    explanationKo: '오행은 목(木)·화(火)·토(土)·금(金)·수(水) 다섯 가지입니다.',
    explanationEn: 'The Five Elements are Wood, Fire, Earth, Metal, and Water.',
    image: '🌊',
  },
  {
    ko: '일주(日柱)는 태어난 날의 천간·지지 조합이다.',
    en: 'The day pillar (ilju) is the stem-branch combination of your birth day.',
    answer: true,
    explanationKo: '맞아요! 일주는 사주에서 "나 자신"을 대표하는 기둥입니다.',
    explanationEn: 'Correct! The day pillar represents "yourself" in your chart.',
    image: '🏛️',
  },
  {
    ko: '대운은 1년마다 바뀐다.',
    en: 'The great fortune (daeun) changes every year.',
    answer: false,
    explanationKo: '대운은 보통 10년마다 바뀝니다. 1년마다 바뀌는 건 세운(歲運)이에요.',
    explanationEn: 'Daeun changes every 10 years. Yearly changes are called "seun" (annual fortune).',
    image: '📅',
  },
  {
    ko: '지지(地支)의 "자(子)"는 쥐띠를 나타낸다.',
    en: 'The earthly branch "Ja (子)" represents the Rat.',
    answer: true,
    explanationKo: '맞습니다! 자(子)=쥐, 축(丑)=소, 인(寅)=호랑이 순서로 이어집니다.',
    explanationEn: 'Correct! Ja=Rat, Chuk=Ox, In=Tiger, and so on.',
    image: '🐀',
  },
  {
    ko: '사주에서 "식신"은 나쁜 의미만 가진다.',
    en: 'In saju, "Sikshin" (eating god) only has negative meanings.',
    answer: false,
    explanationKo: '식신은 먹을 복, 표현력, 재능을 뜻하는 긍정적 십성입니다.',
    explanationEn: 'Sikshin represents food fortune, expressiveness, and talent — mostly positive.',
    image: '🍽️',
  },
  {
    ko: '궁통보감은 사주 해석에 사용되는 고전 문헌이다.',
    en: 'Gungtongbogam is a classical text used for saju interpretation.',
    answer: true,
    explanationKo: '맞아요! 궁통보감은 월령(月令) 용신을 다루는 명리학 고전입니다.',
    explanationEn: 'Correct! It is a classic text dealing with monthly yongshin in myeongrihak.',
    image: '📜',
  },
  {
    ko: '십성(十星)은 총 5개이다.',
    en: 'There are 5 ten gods (sipseong) in total.',
    answer: false,
    explanationKo: '십성은 비겁·식상·재성·관성·인성 5쌍, 총 10개입니다.',
    explanationEn: 'Sipseong has 5 pairs (10 total): Bi-Geop, Sik-Sang, Jae, Gwan, In.',
    image: '⭐',
  },
  {
    ko: '2026년은 병오년(丙午年)으로 말띠 해이다.',
    en: '2026 is Byeong-O year, the year of the Horse.',
    answer: true,
    explanationKo: '맞습니다! 병(丙)은 화 천간, 오(午)는 말띠 지지입니다.',
    explanationEn: 'Correct! Byeong is a fire stem, O (午) is the Horse branch.',
    image: '🐎',
  },
  {
    ko: '사주에서 "편관"은 리더십과 관련이 있다.',
    en: 'In saju, "Pyeongwan" (indirect officer) is related to leadership.',
    answer: true,
    explanationKo: '맞아요! 편관은 강한 추진력, 리더십, 권위를 상징합니다.',
    explanationEn: 'Correct! Pyeongwan symbolizes strong drive, leadership, and authority.',
    image: '👑',
  },
];

const TOTAL_QUESTIONS = 5;

export default function QuizPage() {
  const { t } = useLang();
  const [step, setStep] = useState<'intro' | 'playing' | 'result'>('intro');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);

  const startQuiz = () => {
    const shuffled = [...QUIZ_POOL].sort(() => Math.random() - 0.5).slice(0, TOTAL_QUESTIONS);
    setQuestions(shuffled);
    setCurrentIdx(0);
    setScore(0);
    setAnswered(null);
    setSelectedAnswer(null);
    setStep('playing');
  };

  const handleAnswer = (userAnswer: boolean) => {
    if (answered !== null) return;
    setSelectedAnswer(userAnswer);
    const correct = userAnswer === questions[currentIdx].answer;
    if (correct) setScore(s => s + 1);
    setAnswered(correct);
  };

  const nextQuestion = () => {
    if (currentIdx + 1 >= TOTAL_QUESTIONS) {
      setStep('result');
    } else {
      setCurrentIdx(i => i + 1);
      setAnswered(null);
      setSelectedAnswer(null);
    }
  };

  const q = questions[currentIdx];

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-[540px] px-4 pt-10 pb-24 lg:rounded-[24px] lg:my-6" style={{ background: '#ECFDF5' }}>

        {/* 인트로 */}
        {step === 'intro' && (
          <div className="flex flex-col items-center text-center pt-16">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-sm">
              <span className="text-[36px]">🧠</span>
            </div>
            <h1 className="text-[28px] font-black text-gray-900 tracking-tight">
              {t('운세 퀴즈', 'Fortune Quiz')}
            </h1>
            <p className="mt-3 text-[15px] text-gray-500 leading-relaxed max-w-[320px]">
              {t(
                '사주·명리학에 대한 O/X 퀴즈 5문제!\n얼마나 알고 있는지 테스트해보세요.',
                '5 O/X questions about Saju!\nTest how much you know.'
              )}
            </p>
            <button
              type="button"
              onClick={startQuiz}
              className="mt-8 px-8 py-3.5 rounded-full text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #34D399 100%)' }}
            >
              {t('퀴즈 시작', 'Start Quiz')}
            </button>
          </div>
        )}

        {/* 퀴즈 플레이 */}
        {step === 'playing' && q && (
          <div>
            {/* 프로그레스 */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-[13px] font-bold text-gray-500">
                {currentIdx + 1} / {TOTAL_QUESTIONS}
              </span>
              <span className="text-[13px] font-bold" style={{ color: '#059669' }}>
                {t(`${score}점`, `${score} pts`)}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white mb-8">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${((currentIdx + 1) / TOTAL_QUESTIONS) * 100}%`,
                  background: 'linear-gradient(90deg, #059669, #34D399)',
                }}
              />
            </div>

            {/* 문제 카드 */}
            <div className="bg-white rounded-[24px] p-6 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#34D399' }}>
                {t('O/X 퀴즈', 'O/X Quiz')}
              </p>
              <h2 className="text-[18px] font-bold text-gray-900 leading-relaxed">
                {t(q.ko, q.en)}
              </h2>

              {/* O / X 버튼 */}
              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => handleAnswer(true)}
                  disabled={answered !== null}
                  className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl font-bold text-[16px] transition-all active:scale-[0.97] disabled:cursor-default"
                  style={{
                    background: answered !== null
                      ? (q.answer === true ? '#D1FAE5' : selectedAnswer === true ? '#FEE2E2' : '#F3F4F6')
                      : '#F3F4F6',
                    color: answered !== null
                      ? (q.answer === true ? '#059669' : selectedAnswer === true ? '#DC2626' : '#9CA3AF')
                      : '#374151',
                  }}
                >
                  <CheckCircle size={28} strokeWidth={2.2} />
                  O
                </button>
                <button
                  type="button"
                  onClick={() => handleAnswer(false)}
                  disabled={answered !== null}
                  className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl font-bold text-[16px] transition-all active:scale-[0.97] disabled:cursor-default"
                  style={{
                    background: answered !== null
                      ? (q.answer === false ? '#D1FAE5' : selectedAnswer === false ? '#FEE2E2' : '#F3F4F6')
                      : '#F3F4F6',
                    color: answered !== null
                      ? (q.answer === false ? '#059669' : selectedAnswer === false ? '#DC2626' : '#9CA3AF')
                      : '#374151',
                  }}
                >
                  <XCircle size={28} strokeWidth={2.2} />
                  X
                </button>
              </div>

              {/* 해설 */}
              {answered !== null && (
                <div className="mt-5 rounded-2xl p-4" style={{ background: answered ? '#ECFDF5' : '#FEF2F2' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-[40px] shrink-0 leading-none mt-0.5">{q.image}</span>
                    <div>
                      <p className="text-[13px] font-bold mb-1" style={{ color: answered ? '#059669' : '#DC2626' }}>
                        {answered ? t('정답! 🎉', 'Correct! 🎉') : t('오답 😅', 'Wrong 😅')}
                      </p>
                      <p className="text-[13px] leading-relaxed text-gray-600">
                        {t(q.explanationKo, q.explanationEn)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 다음 버튼 */}
              {answered !== null && (
                <button
                  type="button"
                  onClick={nextQuestion}
                  className="w-full mt-5 py-3 rounded-full text-[14px] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #34D399 100%)' }}
                >
                  {currentIdx + 1 >= TOTAL_QUESTIONS
                    ? t('결과 보기', 'See Results')
                    : t('다음 문제', 'Next Question')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 결과 */}
        {step === 'result' && (
          <div className="flex flex-col items-center text-center pt-12">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-6 shadow-sm">
              <Trophy size={36} strokeWidth={2} style={{ color: '#F59E0B' }} />
            </div>
            <h1 className="text-[28px] font-black text-gray-900 tracking-tight">
              {t('퀴즈 완료!', 'Quiz Complete!')}
            </h1>
            <p className="mt-3 text-[48px] font-black" style={{ color: '#059669' }}>
              {score} / {TOTAL_QUESTIONS}
            </p>
            <p className="mt-2 text-[15px] text-gray-500">
              {score === TOTAL_QUESTIONS
                ? t('완벽해요! 사주 고수시네요 🏆', 'Perfect! You are a saju master 🏆')
                : score >= 3
                  ? t('잘했어요! 꽤 알고 계시네요 👏', 'Nice! You know quite a bit 👏')
                  : t('아쉬워요! 다시 도전해보세요 💪', 'Try again next time 💪')}
            </p>
            <button
              type="button"
              onClick={startQuiz}
              className="mt-8 flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #34D399 100%)' }}
            >
              <RotateCcw size={16} strokeWidth={2.5} />
              {t('다시 도전', 'Try Again')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
