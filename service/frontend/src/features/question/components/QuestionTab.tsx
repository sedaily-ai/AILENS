'use client';

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { DailyQuestionItem } from "@/shared/types/question";

export const dailyQuestions = [{ id: "q1" }, { id: "q2" }];

interface Props {
  currentQuestionIndex: number;
  selectedAnswers: Record<string, string>;
  // mbti 는 단일 명의(AI LENS) 체계(2026-08-07) 이후 더 이상 의미가 없다 —
  // 호출부(FeedPage.tsx, 이 파일 범위 밖)가 여전히 MbtiGroupId 를 넘길 수 있어
  // 타입만 유지하고 내부에서는 쓰지 않는다.
  onSelectAnswer: (questionId: string, optionId: string, mbti?: MbtiGroupId) => void;
  onSkip: () => void;
  // 호출부가 여전히 넘길 수 있어 optional prop 은 유지하되(FeedPage.tsx, 이 파일
  // 범위 밖), 이 컴포넌트 내부에서는 더 이상 그룹별로 분기하지 않는다 — 화면은
  // 항상 단일 명의(AI LENS) 톤 하나로 렌더된다.
  selectedGroup?: MbtiGroupId;
}

// 단일 명의 — 4 페르소나 에디터(민철/하은/준서/소율) 대신 하나의 브랜드 목소리로.
const EDITOR = { name: 'AI LENS', avatar: '/icon-512.png' };

const GREETING = '오늘의 브리핑,\n핵심만 추렸습니다.';

const HEADLINES = [
  'IMF, 韓 부채비율 2030년 61.7% 전망 — 증가 속도가 핵심',
  'AI 반도체 재편: 엔비디아 32% 점유율로 1위 탈환',
  '미-이란 휴전 연장, 국제유가 3% 하락',
];

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
  // 전체 참여자 집계 — 예전엔 페르소나 4개로 쪼개 보여줬다(참여율 비교
  // 카드). 단일 명의 체계 이후로는 나눌 대상이 없어 합산 하나만 보여준다.
  participation: { correct: 238, total: 524 },
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

export function QuestionTab({ onSkip }: Props) {
  const [quizPick, setQuizPick] = useState<string | null>(null);
  const [quizDone, setQuizDone] = useState(false);
  const [videoOn, setVideoOn] = useState(false);

  const dateStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const totalP = quiz.participation.total;
  const correctRate = Math.round((quiz.participation.correct / quiz.participation.total) * 100);
  const correct = quizPick === quiz.answer;

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
              <NL text={GREETING} />
            </h1>
          </Reveal>

          <Reveal delay={250}>
            <div className="flex items-center gap-3 mt-8">
              <img loading="lazy" src={EDITOR.avatar} alt={EDITOR.name} className="w-10 h-10 rounded-full object-cover shadow-lg" />
              <div>
                <p className="text-[14px] font-medium text-gray-800">{EDITOR.name}</p>
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
            {HEADLINES.map((line, i) => (
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

                {/* 참여자 정답률 — 예전엔 페르소나 4개로 쪼갠 카드였다. 단일
                    명의 체계 이후로는 나눌 대상이 없어 합산 하나만 보여준다. */}
                <div className="flex items-center gap-3 mt-8 bg-gray-50 rounded-2xl py-3.5 px-5">
                  <p className="text-[16px] font-bold tabular-nums text-gray-900">{correctRate}%</p>
                  <p className="text-[12px] text-gray-500">정답률 · {totalP.toLocaleString()}명 참여</p>
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
              {EDITOR.name}이(가) 본 오늘의 운세는...
            </h3>
          </Reveal>
          <Reveal delay={100}>
            <Link
              href="/saju"
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
                      <span className="font-semibold text-gray-800">{EDITOR.name}</span>의 톤으로 풀어드려요
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
            <img loading="lazy" src={EDITOR.avatar} alt={EDITOR.name} className="w-20 h-20 rounded-full object-cover shadow-2xl mb-6" />
          </Reveal>
          <Reveal delay={100}>
            <p className="text-[14px] text-gray-400 mb-8">{EDITOR.name}이(가) 준비한 뉴스피드로 이동해요.</p>
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
