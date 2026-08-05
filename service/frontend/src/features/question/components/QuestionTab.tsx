'use client';

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { DailyQuestionItem } from "@/shared/types/question";

export const dailyQuestions = [{ id: "q1" }, { id: "q2" }];

interface Props {
  currentQuestionIndex: number;
  selectedAnswers: Record<string, string>;
  onSelectAnswer: (questionId: string, optionId: string, mbti?: MbtiGroupId) => void;
  onSkip: () => void;
  selectedGroup?: MbtiGroupId;
}

const editors: Record<MbtiGroupId, { name: string; avatar: string }> = {
  NT: { name: '민철', avatar: '/editors/intj.webp' },
  NF: { name: '하은', avatar: '/editors/infp.webp' },
  ST: { name: '준서', avatar: '/editors/istj.webp' },
  SF: { name: '소율', avatar: '/editors/esfp.webp' },
};

const greetings: Record<MbtiGroupId, string> = {
  NT: '오늘의 브리핑,\n핵심만 추렸습니다.',
  NF: '오늘 하루도\n좋은 이야기로 시작해요.',
  ST: '오늘 브리핑.\n3분이면 끝남.',
  SF: '좋은 아침이에요.\n오늘 뉴스 같이 봐요.',
};


const headlines: Record<MbtiGroupId, string[]> = {
  NT: [
    'IMF, 韓 부채비율 2030년 61.7% 전망 — 증가 속도가 핵심',
    'AI 반도체 재편: 엔비디아 32% 점유율로 1위 탈환',
    '미-이란 휴전 연장, 국제유가 3% 하락',
  ],
  NF: [
    'IMF 한국 부채 우려 — 다음 세대에 넘어갈 부담',
    'AI 반도체 경쟁 뒤에 숨겨진 삶의 변화',
    '미-이란 휴전, 작지만 의미 있는 한 걸음',
  ],
  ST: [
    'IMF 부채 경고: 54.4% → 61.7%, +7.3%p',
    'AI 반도체 1위 교체, 관련주 체크 필요',
    '미-이란 휴전으로 유가 하락, 수입물가 영향',
  ],
  SF: [
    '나라 빚이 늘고 있대요, 우리한테 어떤 영향?',
    'AI 반도체 전쟁이 시작됐어요, 기술 경쟁 뜨거워',
    '미-이란 휴전 소식, 분위기 좋아지고 있어요',
  ],
};

const quiz = {
  category: '경제',
  source: 'IMF 재정모니터 2026.04',
  question: '2030년 한국의 정부부채 비율은\nGDP 대비 몇 %로 전망될까?',
  options: [
    { id: 'a', text: '약 48%' },
    { id: 'b', text: '약 55%' },
    { id: 'c', text: '약 61%' },
    { id: 'd', text: '약 72%' },
  ],
  answer: 'c',
  explanation: 'IMF는 한국의 정부부채가 2030년 GDP 대비 61.7%에 이를 것으로 전망했습니다. "상당히 증가(significant)"라는 표현을 사용했어요.',
  editorComments: {
    NT: '비율 자체보다 증가 속도가 관건.',
    NF: '다음 세대 부담... 마음이 무겁네요.',
    ST: '54.4% → 61.7%. +7.3%p. 팩트.',
    SF: '61%면 높은 거 맞죠? 좀 걱정돼요.',
  } as Record<MbtiGroupId, string>,
  participation: {
    NT: { correct: 68, total: 142 },
    NF: { correct: 51, total: 128 },
    ST: { correct: 74, total: 98 },
    SF: { correct: 45, total: 156 },
  } as Record<MbtiGroupId, { correct: number; total: number }>,
};

const todayVideo = {
  title: '한국 부채 비율, 정말 걱정해야 할까?',
  channel: '서울경제TV',
  duration: '3:42',
  embedId: 'Ikc1xCg6y5E',
};

/* ── 스크롤 FadeIn ── */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDuration: '800ms', transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function NL({ text }: { text: string }) {
  return <>{text.split('\n').map((l, i, a) => <span key={i}>{l}{i < a.length - 1 && <br />}</span>)}</>;
}

export function QuestionTab({ onSkip, selectedGroup = 'NT' }: Props) {
  const [quizPick, setQuizPick] = useState<string | null>(null);
  const [quizDone, setQuizDone] = useState(false);
  const [videoOn, setVideoOn] = useState(false);

  const ed = editors[selectedGroup];
  const dateStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const totalP = Object.values(quiz.participation).reduce((s, p) => s + p.total, 0);
  const correct = quizPick === quiz.answer;
  const edOrder: MbtiGroupId[] = [selectedGroup, ...(["NT", "NF", "ST", "SF"] as const).filter(t => t !== selectedGroup)];

  const pickQuiz = (id: string) => {
    if (quizDone) return;
    setQuizPick(id);
    setTimeout(() => setQuizDone(true), 500);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[640px] mx-auto px-6">

        {/* ── 히어로: 인사 ── */}
        <section className="min-h-[85vh] flex flex-col justify-center relative">
          <Reveal>
            <p className="text-[12px] text-gray-400 tracking-wider">{dateStr}</p>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="mt-4 text-[34px] md:text-[44px] font-black text-gray-900 leading-[1.15] tracking-tight">
              <NL text={greetings[selectedGroup]} />
            </h1>
          </Reveal>

          <Reveal delay={250}>
            <div className="flex items-center gap-3 mt-8">
              <img src={ed.avatar} alt={ed.name} className="w-10 h-10 rounded-full object-cover shadow-lg" />
              <div>
                <p className="text-[14px] font-medium text-gray-800">{ed.name}</p>
                <p className="text-[12px] text-gray-400">오늘의 브리핑</p>
              </div>
            </div>
          </Reveal>


          {/* 스크롤 힌트 */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 animate-bounce">
            <p className="text-[10px] text-gray-300 tracking-widest uppercase">Scroll</p>
            <svg className="w-3 h-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7-7-7" />
            </svg>
          </div>
        </section>

        {/* ── 헤드라인 ── */}
        <section className="py-20">
          <Reveal>
            <p className="text-[11px] text-gray-400 font-semibold tracking-[0.2em] uppercase mb-10">Today&apos;s Briefing</p>
          </Reveal>

          <div className="space-y-8">
            {headlines[selectedGroup].map((line, i) => (
              <Reveal key={i} delay={i * 120}>
                <div className="flex items-start gap-5">
                  <span className="text-[32px] font-black text-gray-200 tabular-nums leading-none mt-0.5 select-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[17px] md:text-[19px] font-medium text-gray-800 leading-relaxed flex-1">
                    {line}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── 퀴즈 ── */}
        <section className="py-20">
          <Reveal>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-gray-900 rounded-full text-[10px] font-bold text-white tracking-wider">QUIZ</span>
              <span className="text-[12px] text-gray-400">{quiz.category} · {totalP.toLocaleString()}명 참여</span>
            </div>
            <p className="text-[12px] text-gray-400 mb-6">{quiz.source}</p>
          </Reveal>

          <Reveal delay={100}>
            <h2 className="text-[24px] md:text-[28px] font-bold text-gray-900 leading-snug mb-10">
              <NL text={quiz.question} />
            </h2>
          </Reveal>

          <Reveal delay={200}>
            <div className="space-y-3">
              {quiz.options.map((opt) => {
                const mine = quizPick === opt.id;
                const ans = opt.id === quiz.answer;
                let bg = 'bg-gray-50 hover:bg-gray-100 active:scale-[0.98]';
                if (quizDone) {
                  if (ans) bg = 'bg-emerald-50';
                  else if (mine) bg = 'bg-rose-50';
                  else bg = 'bg-gray-50 opacity-40';
                } else if (mine) bg = 'bg-gray-900';

                return (
                  <button
                    key={opt.id}
                    onClick={() => pickQuiz(opt.id)}
                    disabled={quizDone}
                    className={`w-full text-left rounded-2xl px-5 py-4 transition-all duration-300 ${bg}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
                        quizDone && ans ? 'bg-emerald-500 text-white' :
                        quizDone && mine && !ans ? 'bg-rose-400 text-white' :
                        mine ? 'bg-white text-gray-900' : 'bg-white text-gray-500'
                      }`}>
                        {quizDone && ans ? '✓' : quizDone && mine && !ans ? '✗' : opt.id.toUpperCase()}
                      </span>
                      <span className={`text-[15px] font-medium ${
                        quizDone && ans ? 'text-emerald-800' :
                        quizDone && mine && !ans ? 'text-rose-700' :
                        mine ? 'text-white' : 'text-gray-800'
                      }`}>{opt.text}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Reveal>

          {quizDone && (
            <Reveal>
              <div className="mt-10">
                <p className="text-[16px] font-bold text-gray-900 mb-3">{correct ? '정답입니다.' : '아쉽지만, 오답이에요.'}</p>
                <p className="text-[14px] text-gray-600 leading-[1.85]">{quiz.explanation}</p>

                <div className="flex gap-2 mt-8">
                  {edOrder.map((type) => {
                    const e = editors[type];
                    const rate = Math.round((quiz.participation[type].correct / quiz.participation[type].total) * 100);
                    const isMine = type === selectedGroup;
                    return (
                      <div key={type} className={`flex-1 text-center py-3.5 rounded-2xl ${isMine ? 'bg-gray-900' : 'bg-gray-50'}`}>
                        <img src={e.avatar} alt={e.name} className="w-7 h-7 rounded-full object-cover mx-auto mb-1.5" />
                        <p className={`text-[11px] font-medium ${isMine ? 'text-gray-400' : 'text-gray-500'}`}>{e.name}</p>
                        <p className={`text-[16px] font-bold tabular-nums ${isMine ? 'text-white' : 'text-gray-800'}`}>{rate}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>
          )}
        </section>

        {/* ── 영상 ── */}
        <section className="py-16">
          <Reveal>
            <p className="text-[11px] text-gray-400 font-semibold tracking-[0.2em] uppercase mb-6">Today&apos;s Video</p>
          </Reveal>

          <Reveal delay={100}>
            {!videoOn ? (
              <button onClick={() => setVideoOn(true)} className="relative w-full aspect-video bg-gray-900 rounded-3xl overflow-hidden group">
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform duration-500 ease-out">
                    <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-900 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </div>
                  <p className="mt-5 text-white text-[17px] font-semibold text-center px-8">{todayVideo.title}</p>
                  <p className="mt-1.5 text-white/40 text-[13px]">{todayVideo.channel} · {todayVideo.duration}</p>
                </div>
              </button>
            ) : (
              <div className="w-full aspect-video rounded-3xl overflow-hidden">
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${todayVideo.embedId}?autoplay=1`}
                  title={todayVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </Reveal>
        </section>

        {/* ── 오늘의 운세 티저 ── */}
        <section className="py-12">
          <Reveal>
            <p className="text-center text-[11px] font-bold text-gray-400 tracking-[0.12em] uppercase mb-3">
              Today&apos;s Fortune
            </p>
            <h3 className="text-center text-[22px] md:text-[26px] font-black text-gray-900 mb-8 tracking-tight">
              {ed.name}이(가) 본 오늘의 운세는...
            </h3>
          </Reveal>
          <Reveal delay={100}>
            <Link
              href="/fortune"
              className="block max-w-[520px] mx-auto group"
            >
              <div className="relative overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-6 md:p-7 transition-all hover:shadow-[0_12px_40px_rgba(139,92,246,0.15)] hover:-translate-y-1">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center">
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" fill="url(#fortune-grad-home)" />
                      <defs>
                        <linearGradient id="fortune-grad-home" x1="0" y1="0" x2="24" y2="24">
                          <stop offset="0%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#f59e0b" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-500 mb-1.5 leading-relaxed">
                      생년월일만 입력하면 오늘의 사주를<br />
                      <span className="font-semibold text-gray-800">{ed.name}</span>의 톤으로 풀어드려요
                    </p>
                    <span className="inline-flex items-center gap-1 text-[13px] font-bold text-violet-700 group-hover:text-violet-900 transition-colors">
                      운세 확인하기
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </Reveal>
        </section>

        {/* ── CTA ── */}
        <section className="py-20 flex flex-col items-center">
          <Reveal>
            <img src={ed.avatar} alt={ed.name} className="w-20 h-20 rounded-full object-cover shadow-2xl mb-6" />
          </Reveal>
          <Reveal delay={100}>
            <p className="text-[14px] text-gray-400 mb-8">{ed.name}이(가) 준비한 뉴스피드로 이동해요.</p>
          </Reveal>
          <Reveal delay={200}>
            <button
              onClick={onSkip}
              className="px-10 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-full text-[15px] font-semibold shadow-2xl shadow-gray-900/20 hover:shadow-gray-900/40 hover:-translate-y-1 active:scale-[0.97] transition-all duration-300"
            >
              뉴스피드 시작하기 →
            </button>
          </Reveal>
        </section>

        <div className="h-8" />
      </div>
    </div>
  );
}
