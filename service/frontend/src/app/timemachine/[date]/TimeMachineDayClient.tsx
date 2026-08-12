'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { INVESTMENT_OPTIONS, calcInvestment, getParallelUniverses } from '@/shared/data/investmentScenarios';
import type { TimeMachineDay } from '../timemachine';
import { ArrowLeft, Coins, Bitcoin, Landmark, Building2, Smartphone, Coffee, BarChart2, type LucideIcon } from 'lucide-react';

// 결과 화면(챕터 Ⅰ~Ⅳ + 투자 시뮬레이션) — 예전엔 TimeMachineClient.tsx 안에
// step==="result"/"invest-result"로 있던 걸 그대로 옮겼다(2026-08-12, SSR 분리).
// 날짜별 데이터(news/events/birthdays/snapshot/liveMarket)는 이제 서버(page.tsx)가
// 미리 가져와 props로 준다 — 이 컴포넌트는 투자 시뮬레이션 선택·비교 같은 순수
// 클라이언트 인터랙션만 담당한다.
//
// 리팩토링하며 죽은 코드 정리: 탭 UI는 이미 "single-scroll 도록"으로 바뀌어
// activeTab/ResultTab/tabs 배열이 실제로 렌더되지 않고 있었고(FeedPage 탭과는
// 무관), FIELD_ICONS·CATEGORY_COLOR도 정의만 되고 아무 데서도 안 쓰이고
// 있었다 — 원본 확인 후 옮기지 않았다.

const INVESTMENT_ICONS: Record<string, LucideIcon> = {
  kospi: BarChart2,
  bitcoin: Bitcoin,
  cash: Landmark,
  gangnam: Building2,
  samsung: Smartphone,
  starbucks_coffee: Coffee,
};

function fmtValue(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억원`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만원`;
  return `${v.toLocaleString()}원`;
}
function fmtValueShort(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만원`;
  return `${v.toLocaleString()}원`;
}
function fmtRate(rate: number): string {
  if (rate >= 1000) return `+${(rate / 100).toFixed(0)}배`;
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(0)}%`;
}

// 스크롤 진입 시 fade+up. IntersectionObserver 기반, 한 번만 트리거.
function SectionReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 1000ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 1000ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// 챕터 마커 — 로마 숫자 + 영문 라벨 + 한국어 부제. 도록 페이지 헤더.
function ChapterMark({ roman, english, korean }: { roman: string; english: string; korean: string }) {
  return (
    <div className="text-center">
      <p className="text-stone-500 text-[12px] tracking-[0.4em]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
        {roman}
      </p>
      <div className="h-10 w-px bg-stone-400/50 mx-auto my-5" />
      <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-3">{english}</p>
      <h3
        className="text-stone-800 text-[22px] md:text-[26px] tracking-tight"
        style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 500, letterSpacing: '-0.025em' }}
      >
        {korean}
      </h3>
    </div>
  );
}

type Step = 'result' | 'invest-result';

export function TimeMachineDayClient({
  date,
  isBirthdayMode,
  daysSince,
  yearsSince,
  day,
}: {
  date: string;
  isBirthdayMode: boolean;
  daysSince: number;
  yearsSince: number;
  day: TimeMachineDay;
}) {
  const [step, setStep] = useState<Step>('result');
  const [selectedInvestment, setSelectedInvestment] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const { news, events, birthdays, snapshot, liveMarket } = day;

  const [dy, dm, dd] = date.split('-').map((s) => parseInt(s, 10));
  const formatted = `${dy}년 ${dm}월 ${dd}일`;

  return (
    <div className="relative min-h-screen bg-[#e8e4dc] flex flex-col items-center px-4 py-16">
      {/* 갤러리 벽면 텍스처 - 고급스러운 리넨/캔버스 느낌 */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")
        `,
          opacity: 0.04,
        }}
      />
      {/* 미세한 그라데이션 빛 효과 */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-white/10 via-transparent to-black/5" />

      <div className="w-full max-w-2xl">
        {step === 'invest-result' && selectedInvestment && (() => {
          const opt = INVESTMENT_OPTIONS.find((o) => o.id === selectedInvestment)!;
          const liveCurrent = { kospi: liveMarket?.kospi };
          const result = calcInvestment(selectedInvestment, dy, liveCurrent);
          const isProfit = result.returnRate >= 0;
          const allResults = INVESTMENT_OPTIONS.map((o) => ({ opt: o, result: calcInvestment(o.id, dy, liveCurrent) }));
          const maxValue = Math.max(...allResults.map((r) => r.result.currentValue));
          const parallelUniverses = getParallelUniverses(selectedInvestment, dy, liveCurrent);
          const bestAlternative = parallelUniverses[0];
          const regretGap = bestAlternative.result.currentValue - result.currentValue;
          const SelectedIcon = INVESTMENT_ICONS[opt.id] || Coins;

          return (
            <div>
              {/* 헤더 — 메인 도록 톤 통일 */}
              <header className="relative text-center pt-2 pb-12">
                <button
                  onClick={() => { setStep('result'); setShowComparison(false); }}
                  className="absolute left-0 top-0 inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[12px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>돌아가기</span>
                </button>

                <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-8 mt-2">
                  A Parallel Path
                </p>
                <p className="text-stone-500 text-[12px] tracking-[0.1em] mb-5" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  {formatted}
                </p>
                <SelectedIcon className="mx-auto text-stone-700 mb-4" style={{ width: 28, height: 28 }} strokeWidth={1.3} />
                <h2
                  className="text-stone-800 leading-tight"
                  style={{
                    fontFamily: 'Noto Serif KR, Georgia, serif',
                    fontWeight: 500,
                    fontSize: 'clamp(34px, 6.5vw, 46px)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {opt.label}
                </h2>
                <p className="text-stone-500 text-[12.5px] mt-3 italic" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                  그날부터 {yearsSince}년이 흘렀어요
                </p>
              </header>

              {!showComparison && (
                <div>
                  {/* 핵심 숫자 3열 — 헤어라인 */}
                  <div className="border-t border-b border-stone-400/40 py-8 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] tracking-[0.22em] text-stone-500 uppercase mb-3">Then</p>
                      <p className="text-stone-700 text-[15px] sm:text-[17px]" style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>
                        1억원
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] tracking-[0.22em] text-stone-500 uppercase mb-3">Today</p>
                      <p
                        className={`text-[20px] sm:text-[26px] ${isProfit ? 'text-stone-900' : 'text-rose-700'}`}
                        style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.02em' }}
                      >
                        {fmtValue(result.currentValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] tracking-[0.22em] text-stone-500 uppercase mb-3">
                        {result.totalSpent !== undefined ? 'Spent' : 'Return'}
                      </p>
                      {result.totalSpent !== undefined ? (
                        <p className="text-amber-700 text-[15px] sm:text-[17px]" style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          -{result.totalSpent >= 10_000 ? `${(result.totalSpent / 10_000).toFixed(0)}만` : `${result.totalSpent.toLocaleString()}원`}
                        </p>
                      ) : (
                        <p
                          className={`text-[15px] sm:text-[17px] ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}
                          style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
                        >
                          {fmtRate(result.returnRate)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 스토리 */}
                  {result.story && (
                    <p
                      className="text-stone-700 text-[16px] leading-[1.95] max-w-[540px] mx-auto text-center mt-12"
                      style={{ fontFamily: 'Noto Serif KR, Georgia, serif', letterSpacing: '-0.01em' }}
                    >
                      {result.story}
                    </p>
                  )}

                  {/* 한 줄 결론 — italic */}
                  <p
                    className="text-stone-500 text-[14px] italic text-center mt-8 mb-4"
                    style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}
                  >
                    &ldquo;{result.tagline}&rdquo;
                  </p>
                  {/* 출처 라벨 + 면책 */}
                  <p className="text-[10px] tracking-[0.04em] text-stone-400 text-center mb-16 leading-[1.7]" style={{ fontFamily: 'Georgia, serif' }}>
                    {result.isLive ? `Live · Naver Finance · ${opt.sourceLabel.replace(/^참고용 추정 · /, '')}` : opt.sourceLabel}
                    <span className="block mt-1" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      실제 수익률 아니에요. 시뮬레이션 결과예요.
                    </span>
                  </p>

                  {/* 다른 우주 한 줄 */}
                  <div className="text-center border-t border-stone-400/40 pt-12 pb-8">
                    <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-5">
                      {regretGap > 0 ? 'In Another Universe' : 'The Best Choice'}
                    </p>
                    {regretGap > 0 ? (
                      <p
                        className="text-stone-700 text-[16.5px] leading-[1.95] max-w-[480px] mx-auto"
                        style={{ fontFamily: 'Noto Serif KR, Georgia, serif', letterSpacing: '-0.01em' }}
                      >
                        같은 1억으로 <span className="text-stone-900" style={{ fontWeight: 600 }}>{bestAlternative.option.label}</span>을 골랐다면,<br />
                        지금쯤 <span className="text-stone-900" style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtValue(regretGap)}</span>이<br />
                        더 손에 쥐어졌을 거예요.
                      </p>
                    ) : (
                      <p
                        className="text-stone-700 text-[16.5px] leading-[1.95] max-w-[480px] mx-auto"
                        style={{ fontFamily: 'Noto Serif KR, Georgia, serif', letterSpacing: '-0.01em' }}
                      >
                        모든 평행우주 가운데 가장 잘 골라낸 길이었어요.
                      </p>
                    )}
                  </div>

                  {/* 평행우주 보기 — 텍스트 링크 */}
                  <div className="text-center mt-4">
                    <button
                      onClick={() => setShowComparison(true)}
                      className="inline-flex items-center gap-2.5 text-stone-600 hover:text-stone-900 transition-colors text-[11px] tracking-[0.32em] uppercase"
                    >
                      모든 평행우주 보기 <span style={{ fontFamily: 'Georgia, serif' }}>→</span>
                    </button>
                  </div>
                </div>
              )}

              {showComparison && (
                <div>
                  <div className="text-center mb-6">
                    <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-3">Parallel Universes</p>
                    <h3
                      className="text-stone-800 text-[22px] md:text-[26px] tracking-tight"
                      style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 500, letterSpacing: '-0.025em' }}
                    >
                      여섯 갈래의 인생, 한 자리에
                    </h3>
                    <p className="text-stone-500 text-[13px] mt-2.5 italic" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      {formatted}에 1억원을 두었더라면
                    </p>
                  </div>
                  {/* 면책 — 데이터 신뢰도 명시. KOSPI 만 실시간, 나머지는 추정. */}
                  <p className="text-[10px] tracking-[0.04em] text-stone-400 text-center mb-10 leading-[1.75] px-4" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    참고용 시뮬레이션이에요. KOSPI 만 실시간 시세 기반(최대 30분 시차),<br className="hidden sm:block" />
                    나머지는 과거 평균치로 추정한 값이라 실제 수익률과는 달라요.
                  </p>

                  <ol className="border-t border-stone-400/40">
                    {allResults
                      .sort((a, b) => b.result.currentValue - a.result.currentValue)
                      .map(({ opt: o, result: r }, rank) => {
                        const barWidth = maxValue > 0 ? Math.max(4, (r.currentValue / maxValue) * 100) : 4;
                        const profit = r.returnRate >= 0;
                        const isSelected = o.id === selectedInvestment;
                        const OptionIcon = INVESTMENT_ICONS[o.id] || Coins;
                        return (
                          <li key={o.id} className="border-b border-stone-400/40 py-7">
                            <div className="flex items-baseline gap-3 mb-3 flex-wrap">
                              <span
                                className="text-stone-400 text-[13px]"
                                style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}
                              >
                                {String(rank + 1).padStart(2, '0')}
                              </span>
                              <OptionIcon className="text-stone-600 mt-0.5" style={{ width: 18, height: 18 }} strokeWidth={1.4} />
                              <h4
                                className={isSelected ? 'text-stone-900' : 'text-stone-800'}
                                style={{
                                  fontFamily: 'Noto Serif KR, Georgia, serif',
                                  fontWeight: isSelected ? 600 : 500,
                                  fontSize: '19px',
                                  letterSpacing: '-0.02em',
                                }}
                              >
                                {o.label}
                              </h4>
                              {isSelected && (
                                <span className="text-[9px] tracking-[0.24em] text-stone-500 uppercase">your choice</span>
                              )}
                              <span
                                className={`ml-auto text-[18px] ${profit ? 'text-stone-900' : 'text-rose-700'}`}
                                style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.01em' }}
                              >
                                {fmtValueShort(r.currentValue)}
                              </span>
                              <span
                                className={`text-[11px] ${profit ? 'text-stone-500' : 'text-rose-500'}`}
                                style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums' }}
                              >
                                {fmtRate(r.returnRate)}
                              </span>
                            </div>

                            {/* 얇은 비교 바 — 모노톤 */}
                            <div className="w-full h-px bg-stone-200/80 mb-3 mt-1">
                              <div
                                className={`h-px transition-all duration-700 ${isSelected ? 'bg-stone-900' : 'bg-stone-500'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>

                            {r.story && (
                              <p
                                className="text-stone-500 text-[13.5px] leading-[1.85]"
                                style={{ letterSpacing: '-0.005em' }}
                              >
                                {r.story}
                              </p>
                            )}
                            {/* 출처 라벨 — 라이브 / 추정 명시 */}
                            <p className="text-[10px] tracking-[0.04em] text-stone-400 mt-2.5" style={{ fontFamily: 'Georgia, serif' }}>
                              {r.isLive ? `Live · Naver Finance · ${o.sourceLabel.replace(/^참고용 추정 · /, '')}` : o.sourceLabel}
                            </p>
                          </li>
                        );
                      })}
                  </ol>

                  {/* 다른 선택 미니 갤러리 — 텍스트 리스트 */}
                  <div className="mt-14">
                    <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase text-center mb-6">Try Another Path</p>
                    <div className="flex flex-wrap justify-center gap-x-7 gap-y-4">
                      {INVESTMENT_OPTIONS.filter((o) => o.id !== selectedInvestment).map((o) => {
                        const AltIcon = INVESTMENT_ICONS[o.id] || Coins;
                        return (
                          <button
                            key={o.id}
                            onClick={() => { setSelectedInvestment(o.id); setShowComparison(false); }}
                            className="inline-flex items-center gap-2 text-stone-600 hover:text-stone-900 transition-colors"
                          >
                            <AltIcon className="text-stone-500" style={{ width: 14, height: 14 }} strokeWidth={1.4} />
                            <span
                              className="text-[14px]"
                              style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 500, letterSpacing: '-0.015em' }}
                            >
                              {o.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-center mt-12">
                    <button
                      onClick={() => setShowComparison(false)}
                      className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[11px] tracking-[0.32em] uppercase"
                    >
                      <span style={{ fontFamily: 'Georgia, serif' }}>←</span> 내 결과만 보기
                    </button>
                  </div>
                </div>
              )}

              {/* 끝맺음 — 다른 날짜 */}
              <div className="text-center mt-20 pt-10 border-t border-stone-400/30">
                <Link
                  href="/timemachine"
                  className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[11px] tracking-[0.32em] uppercase"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>다른 날짜로</span>
                </Link>
              </div>
            </div>
          );
        })()}

        {step === 'result' && (
          <div>
            {/* 헤더 — 도입부. 인생 한 시점에 사용자를 끼워 넣는 hero. */}
            <header className="relative text-center pt-2 pb-12">
              <Link
                href="/timemachine"
                className="absolute left-0 top-0 inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[12px]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>돌아가기</span>
              </Link>

              <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-10 mt-2">
                {isBirthdayMode ? 'Where You Began' : 'A Day, Slowed Down'}
              </p>

              {/* 거대 연도 */}
              <h1
                className="text-stone-800 leading-[0.9] mb-3"
                style={{
                  fontFamily: 'Georgia, serif',
                  fontWeight: 400,
                  fontSize: 'clamp(96px, 18vw, 200px)',
                  letterSpacing: '-0.04em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {dy}
              </h1>
              <p className="text-stone-600 text-[15px] tracking-[0.04em]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {dm} . {dd}
              </p>

              {/* 인생 위치 — 생일 모드: 살아온 아침 수. 일반: 흘러온 시간. */}
              <p className="text-stone-500 text-[12px] tracking-[0.2em] uppercase mt-8" style={{ fontFamily: 'Georgia, serif' }}>
                {isBirthdayMode
                  ? <>당신이 살아온 <span className="text-stone-800 text-[14px]" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>{daysSince.toLocaleString()}</span> 번째 아침까지</>
                  : <>오늘로부터 <span className="text-stone-800 text-[14px]" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>{yearsSince}</span> 년 전, 같은 달력의 하루</>}
              </p>

              {/* 가는 수직 룰 */}
              <div className="h-12 w-px bg-stone-400/50 mx-auto mt-8" />

              <p className="text-stone-600 text-[14px] mt-6 italic leading-[1.9] max-w-[400px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                {isBirthdayMode
                  ? '오늘의 당신을 만든 그날의 결을 천천히 펼쳐봅니다'
                  : '시간을 거슬러 잠시 머무는, 같은 달력의 한 페이지'}
              </p>
            </header>

            {/* 챕터 Ⅰ — 그날의 활자 */}
            <SectionReveal>
              <section className="py-20 md:py-24">
                <div className="mb-12">
                  <ChapterMark
                    roman="Ⅰ"
                    english="Headlines"
                    korean={isBirthdayMode ? '당신이 처음 호흡한 그날의 활자' : '그 하루를 지키던 활자들'}
                  />
                  <p className="text-stone-500 text-[14px] mt-5 italic text-center leading-[1.9] max-w-[440px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    {isBirthdayMode
                      ? '신문 한 면에는 그 시대의 호흡이 담겨 있어요. 당신이 도착한 세상이 어떤 결이었는지, 천천히 펼쳐봅니다.'
                      : '제목 한 줄에도 그 시절의 결이 묻어 있어요. 잉크 냄새가 나는 듯한 활자를 따라가 봅니다.'}
                  </p>
                </div>
                {dy < 1995 ? (
                  <div className="py-20 text-center">
                    <p className="text-stone-500 text-[14px] leading-[1.9]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      1995년 이전의 기록은<br />아직 디지털로 옮겨지지 않았어요
                    </p>
                  </div>
                ) : news.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-stone-500 text-[14px]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      그날의 뉴스를 찾지 못했어요
                    </p>
                  </div>
                ) : (
                  <ol className="border-t border-stone-400/40">
                    {news.map((item, i) => {
                      const inner = (
                        <>
                          <p className="text-[10px] tracking-[0.24em] text-stone-500 uppercase mb-2.5">{item.category}</p>
                          <h4
                            className="text-stone-900 text-[20px] md:text-[23px] leading-[1.4] mb-2.5"
                            style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 600, letterSpacing: '-0.025em' }}
                          >
                            {item.title}
                          </h4>
                          {item.summary && (
                            <p className="text-stone-600 text-[14px] leading-[1.8]" style={{ letterSpacing: '-0.005em' }}>
                              {item.summary}
                            </p>
                          )}
                          {item.url && (
                            <span className="inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.22em] text-stone-500 uppercase mt-4 group-hover:text-stone-800 transition-colors">
                              원문 읽기 <ArrowLeft className="w-3 h-3 rotate-180" />
                            </span>
                          )}
                        </>
                      );
                      return (
                        <li key={i} className="border-b border-stone-400/40">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block py-8 px-1 -mx-1 hover:bg-stone-100/40 transition-colors cursor-pointer"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div className="py-8 px-1">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}

                {/* 같은 날, 다른 해 */}
                {events.length > 0 && (
                  <div className="mt-20 pt-14 border-t border-stone-400/40">
                    <div className="text-center mb-12">
                      <p className="text-[10px] tracking-[0.34em] text-stone-500 uppercase mb-3">On This Day</p>
                      <h3 className="text-stone-800 text-[19px] md:text-[21px] tracking-tight" style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 500, letterSpacing: '-0.02em' }}>
                        같은 날, 다른 해의 기록
                      </h3>
                      <p className="text-stone-500 text-[13px] mt-2.5" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                        달력은 같지만 세상은 매년 달랐어요
                      </p>
                    </div>
                    <ol>
                      {events.map((ev, i) => (
                        <li key={i} className="py-7 border-b border-stone-400/40 last:border-b-0">
                          <div className="flex items-baseline gap-4 mb-2">
                            <span className="text-stone-800 text-[24px]" style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}>
                              {ev.year}
                            </span>
                            <span className="text-[10px] tracking-[0.24em] text-stone-500 uppercase">{ev.category}</span>
                          </div>
                          <p className="text-stone-800 text-[17px] leading-[1.6]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif', letterSpacing: '-0.015em', fontWeight: 500 }}>
                            {ev.title}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            </SectionReveal>

            {/* 챕터 Ⅱ — 같은 호흡으로 시작한 이들 */}
            <SectionReveal>
              <section className="py-20 md:py-24 border-t border-stone-400/30">
                <div className="mb-12">
                  <ChapterMark
                    roman="Ⅱ"
                    english="Companions in Time"
                    korean={isBirthdayMode ? '당신과 같은 호흡으로 시작한 이들' : '그 날을 함께 연 이름들'}
                  />
                  <p className="text-stone-500 text-[14px] mt-5 italic text-center leading-[1.9] max-w-[440px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    {isBirthdayMode
                      ? '어딘가에서 같은 날, 누군가도 첫 숨을 쉬었어요. 같은 출발선에서 시작해 다른 길을 걸어간 이름들이에요.'
                      : '달력의 한 점에서 시작된 이야기들. 그날부터 각자의 길을 그려간 이름들이에요.'}
                  </p>
                </div>

                {birthdays.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-stone-500 text-[14px]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      해당 날짜의 유명인 기록이 아직 없어요
                    </p>
                  </div>
                ) : (
                  <ol className="border-t border-stone-400/40">
                    {birthdays.map((person, i) => (
                      <li key={i} className="border-b border-stone-400/40 py-8 px-1">
                        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                          <h4
                            className="text-stone-900 text-[21px] md:text-[23px]"
                            style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 600, letterSpacing: '-0.025em' }}
                          >
                            {person.name}
                          </h4>
                          <span className="text-[10px] tracking-[0.24em] text-stone-500 uppercase">
                            {person.field}
                          </span>
                          <span className="text-[12px] text-stone-500 ml-auto" style={{ fontFamily: 'Georgia, serif' }}>
                            b. {person.birthYear}
                          </span>
                        </div>
                        <p className="text-stone-600 text-[14px] leading-[1.85]" style={{ letterSpacing: '-0.005em' }}>
                          {person.description}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </SectionReveal>

            {/* 챕터 Ⅲ — 그 시절의 빛과 그림자 */}
            <SectionReveal>
              <section className="py-20 md:py-24 border-t border-stone-400/30">
                <div className="mb-12">
                  <ChapterMark
                    roman="Ⅲ"
                    english="Frames of Then"
                    korean="그 시절의 빛과 그림자"
                  />
                  <p className="text-stone-500 text-[14px] mt-5 italic text-center leading-[1.9] max-w-[440px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    누군가 셔터를 눌러둔 덕에 남은 장면들. 사진 한 장이 백 마디 활자보다 한 시대를 잘 말하기도 해요.
                  </p>
                </div>

                {(() => {
                  // 실제 아카이브 이미지(ev.images 또는 ev.image)가 있는 항목만 사진 섹션에 노출.
                  const withImages = events.filter((ev) => (ev.images?.[0] ?? ev.image));
                  if (withImages.length === 0) {
                    return (
                      <div className="py-20 text-center">
                        <p className="text-stone-500 text-[14px] italic leading-[1.9]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                          이 날의 사진 기록은<br />아직 발견되지 않았어요
                        </p>
                      </div>
                    );
                  }
                  // Wikipedia thumbnail URL 의 /NNNpx-/ 부분을 /800px-/ 로 치환해 고해상도 받기.
                  const upscaleWikiImg = (url: string): string => url.replace(/\/(\d{2,4})px-/, '/800px-');
                  return (
                    <div className="space-y-16">
                      {withImages.map((ev, i) => {
                        const raw = ev.images?.[0] ?? ev.image!;
                        const displayImage = upscaleWikiImg(raw);
                        return (
                          <figure key={i}>
                            <img
                              src={displayImage}
                              alt={ev.title}
                              loading="lazy"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src !== raw) img.src = raw;
                              }}
                              className="w-full h-auto object-cover"
                              style={{ aspectRatio: '4 / 3', filter: 'contrast(0.96) saturate(0.92)' }}
                            />
                            <figcaption className="mt-5 px-1">
                              <div className="flex items-baseline gap-4 mb-2">
                                <span className="text-stone-800 text-[24px]" style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}>
                                  {ev.year}
                                </span>
                                <span className="text-[10px] tracking-[0.24em] text-stone-500 uppercase">{ev.category}</span>
                              </div>
                              <p className="text-stone-800 text-[17px] leading-[1.6]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif', letterSpacing: '-0.015em', fontWeight: 500 }}>
                                {ev.title}
                              </p>
                            </figcaption>
                          </figure>
                        );
                      })}
                      <div className="pt-8 text-center">
                        <p className="text-[10px] tracking-[0.34em] text-stone-500 uppercase">
                          {withImages.length} photographs · from the archives
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </section>
            </SectionReveal>

            {/* 챕터 Ⅳ — 세상의 부피, 그때와 지금 */}
            <SectionReveal>
              <section className="py-20 md:py-24 border-t border-stone-400/30">
                <div className="mb-12">
                  <ChapterMark
                    roman="Ⅳ"
                    english="Then &amp; Now"
                    korean={isBirthdayMode ? '당신이 자라는 동안, 세상의 값' : '그날의 숫자, 오늘의 숫자'}
                  />
                  <p className="text-stone-500 text-[14px] mt-5 italic text-center leading-[1.9] max-w-[440px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    {isBirthdayMode
                      ? '당신이 자라는 동안 세상의 부피는 어떻게 변했을까요. 지표 하나가 한 시대의 무게를 가만히 들려줍니다.'
                      : '지표 하나가 한 시대의 무게를 들려주기도 해요. 그날과 오늘 사이의 거리를 숫자로 가늠해 봅니다.'}
                  </p>
                </div>

                {/* Then vs Now — Now 쪽은 영문사이트 라이브 API. 라이브 가능한 KOSPI / USD/KRW 만 노출 */}
                {snapshot && (() => {
                  const nowKospi = liveMarket?.kospi ?? null;
                  const nowUsdKrw = liveMarket?.usdKrw ?? null;
                  const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
                  type Item = { label: string; then: string; now: string; unit: string };
                  const items: Item[] = [];
                  if (nowKospi != null) items.push({ label: 'KOSPI', then: fmt(snapshot.kospi), now: fmt(nowKospi), unit: '' });
                  if (nowUsdKrw != null) items.push({ label: 'USD/KRW', then: fmt(snapshot.usdKrw), now: fmt(nowUsdKrw), unit: '' });
                  if (items.length === 0) return null;
                  return (
                    <div className="border-t border-b border-stone-400/40 py-7 mb-4">
                      <p className="text-[10px] tracking-[0.34em] text-stone-500 uppercase text-center mb-6">
                        Then &nbsp;·&nbsp; Now
                      </p>
                      <div className={`grid gap-3 text-center ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {items.map((item) => (
                          <div key={item.label}>
                            <p className="text-[10px] tracking-[0.18em] text-stone-500 mb-3 uppercase">{item.label}</p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3" style={{ fontFamily: 'Georgia, serif', fontVariantNumeric: 'tabular-nums' }}>
                              <span className="text-stone-500 text-[14px] sm:text-[15px]">{item.then}{item.unit}</span>
                              <span className="text-stone-400 text-[11px]">—</span>
                              <span className="text-stone-900 text-[16px] sm:text-[18px]" style={{ fontWeight: 600 }}>{item.now}{item.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* 면책 — 출처·갱신 주기·정확성 한계 명시 */}
                {liveMarket && (
                  <p className="text-[10px] tracking-[0.04em] text-stone-400 text-center mb-12 mt-1 leading-[1.7] px-4" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    Now · KOSPI 종가는 Naver Finance, USD/KRW는 한국은행 ECOS 기준이에요.<br className="hidden sm:block" />
                    실시간 시세와는 최대 30분까지 차이가 날 수 있고, &lsquo;Then&rsquo; 은 연평균 추정치예요.
                  </p>
                )}

                {/* 평행우주 — 1억원의 다른 길 */}
                <div className="mt-2 mb-8 text-center">
                  <p className="text-stone-600 text-[14px] italic leading-[1.9] max-w-[440px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                    그날 1억원을 어디에 두었다면 — 가지 않은 길을 잠시 따라가 봅니다
                  </p>
                </div>

                <ol className="border-t border-stone-400/40">
                  {INVESTMENT_OPTIONS.map((opt) => {
                    const Icon = INVESTMENT_ICONS[opt.id] || Coins;
                    return (
                      <li key={opt.id} className="border-b border-stone-400/40">
                        <button
                          onClick={() => { setSelectedInvestment(opt.id); setShowComparison(false); setStep('invest-result'); }}
                          className="group w-full text-left py-7 px-1 flex items-start gap-5 hover:bg-stone-100/40 transition-colors"
                        >
                          <Icon className="w-[22px] h-[22px] text-stone-700 shrink-0 mt-1.5" strokeWidth={1.5} />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-stone-900 text-[19px] md:text-[21px] mb-1.5" style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 600, letterSpacing: '-0.025em' }}>
                              {opt.label}
                            </h4>
                            <p className="text-stone-600 text-[13.5px] leading-[1.8]" style={{ letterSpacing: '-0.005em' }}>
                              {opt.description}
                            </p>
                          </div>
                          <span className="text-stone-400 text-[18px] mt-1 shrink-0 group-hover:text-stone-700 transition-colors" style={{ fontFamily: 'Georgia, serif' }}>→</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <div className="mt-10 text-center">
                  <p className="text-[10px] tracking-[0.22em] text-stone-500">
                    과거 데이터 기반 시뮬레이션 · 결과는 한 갈래의 가능성일 뿐이에요
                  </p>
                </div>
              </section>
            </SectionReveal>

            {/* 끝맺음 — 닫는 시. 생일 모드일 때 사주 연결 CTA 추가. */}
            <SectionReveal>
              <section className="py-24 text-center border-t border-stone-400/30">
                <p className="text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-6">
                  {isBirthdayMode ? 'Back to Today' : 'End of Day'}
                </p>
                <p className="text-stone-700 text-[15.5px] italic leading-[1.95] max-w-[420px] mx-auto mb-2" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                  한 페이지의 시간을 함께 펼쳐주셔서 고마워요.
                </p>
                <p className="text-stone-500 text-[13.5px] italic leading-[1.95] max-w-[420px] mx-auto mb-10" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                  {isBirthdayMode
                    ? '이제 다시, 오늘의 당신으로 천천히 돌아갑니다.'
                    : '이제 다시, 오늘의 결로 돌아갈게요.'}
                </p>

                {/* 사주 연결 — 생일 모드: 본인의 결. 일반 모드: 그날 태어난 이의 결. */}
                <Link href={`/fortune?birthdate=${date}`} className="inline-block mb-8 group">
                  <span className="block text-[10px] tracking-[0.4em] text-stone-500 uppercase mb-2 group-hover:text-stone-800 transition-colors">
                    Continue
                  </span>
                  <span
                    className="block text-stone-800 text-[18px] md:text-[20px] underline decoration-stone-400/60 underline-offset-[6px] decoration-[0.5px]"
                    style={{ fontFamily: 'Noto Serif KR, Georgia, serif', fontWeight: 500, letterSpacing: '-0.02em' }}
                  >
                    {isBirthdayMode
                      ? '당신의 결을 더 깊이 — 사주로 풀어보기'
                      : '그날 태어난 이의 사주를 풀어보기'}
                  </span>
                </Link>

                <div className="pt-2">
                  <Link
                    href="/timemachine"
                    className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[11px] tracking-[0.24em] uppercase"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>다른 날짜로</span>
                  </Link>
                </div>
              </section>
            </SectionReveal>
          </div>
        )}
      </div>
    </div>
  );
}
