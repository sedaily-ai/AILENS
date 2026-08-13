'use client';

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, Sparkles, ArrowLeft } from "lucide-react";

/**
 * 타임머신 입력 화면 — 날짜를 고르면 신문 되감기 모션이 재생되고
 * `/timemachine/{date}`로 이동한다. 결과(그날 뉴스·같은 날 태어난 사람들·
 * 투자 시뮬레이션)는 그 페이지가 서버에서 미리 가져와 렌더한다(2026-08-12,
 * SSR 분리 — /timeline의 NewsTimeMachine.tsx와 같은 이유: 예전엔 이 컴포넌트가
 * 되감기 애니메이션이 끝난 뒤 자기 안에서 곧장 결과를 fetch+렌더했다. 크롤러가
 * 보는 첫 페인트는 항상 입력 폼뿐이었고, 결과는 날짜별 URL도 없었다).
 */

type Step = "input" | "loading";

function getRandomDate(): string {
  const start = new Date("1990-01-01").getTime();
  const end = new Date(Date.now() - 86400000).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().split("T")[0];
}

// 숫자 8자리 타이핑 → 'YYYY / MM / DD' 자동 포맷. 모바일에서 numpad 띄움.
// 내부에 raw digits 상태 유지 — 타이핑 중간엔 ISO 가 비고, 8자리 완성 시에만 부모에 ISO 전달.
function DatePicker({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-DD or '' (부모가 가진 확정 ISO)
  onChange: (iso: string) => void;
}) {
  const [raw, setRaw] = useState(value.replace(/-/g, ''));

  // 외부에서 value 가 바뀌면(예: "아무 날이나") 내부 raw 도 동기화 — 렌더 중
  // 동기 조정(React 공식 패턴, "Adjusting state when a prop changes")으로
  // effect 대신 처리한다. eslint react-hooks/set-state-in-effect가 effect 안
  // setState를 금지해서(불필요한 리렌더 캐스케이드 방지) 여기로 옮겼다.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setRaw(value.replace(/-/g, ''));
  }

  const formatted = (() => {
    if (!raw) return '';
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return [y, m, d].filter(Boolean).join(' / ');
  })();

  const handleChange = (input: string) => {
    const digits = input.replace(/[^0-9]/g, '').slice(0, 8);
    setRaw(digits);
    if (digits.length === 8) {
      onChange(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className="mb-8">
      <p className="text-stone-400 text-xs mb-3 tracking-wide">찾아갈 날짜</p>
      <input
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="1990 / 05 / 25"
        className="w-full bg-white/50 border border-stone-200 rounded-lg px-4 py-3.5 text-stone-700 text-lg text-center focus:outline-none focus:border-stone-500 transition-colors"
        style={{
          fontFamily: 'Georgia, serif',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em',
        }}
        autoComplete="off"
      />
      <p className="text-stone-300 text-[11px] mt-2 text-center tracking-wide">
        숫자 8자리 입력 — 예: 19900525
      </p>
    </div>
  );
}

function TimeMachineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("input");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [isBirthdayMode, setIsBirthdayMode] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  function goTo(date: string, birthdayMode: boolean) {
    router.push(`/timemachine/${date}${birthdayMode ? '?mode=birthday' : ''}`);
  }

  // URL 파라미터로 날짜가 전달되면 자동으로 되감기 시작 (홈 티저 등에서 진입)
  useEffect(() => {
    const dateParam = searchParams.get("date");
    const modeParam = searchParams.get("mode");
    if (dateParam && dateParam < today) {
      setTargetDate(dateParam);
      setIsBirthdayMode(modeParam === "birthday");
      setStep("loading");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, [searchParams]);

  // 되감기 애니메이션 — 고정 시간 재생 후 날짜별 결과 페이지로 이동.
  useEffect(() => {
    if (step !== "loading" || !targetDate) return;
    const t = setTimeout(() => goTo(targetDate, isBirthdayMode), 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetDate/isBirthdayMode 확정 시 1회만
  }, [step, targetDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate) { setError("날짜를 선택해주세요."); return; }
    if (targetDate >= today) { setError("오늘 이전 날짜를 선택해주세요."); return; }
    setError("");
    setStep("loading");
  };

  const d = targetDate ? new Date(targetDate) : null;

  return (
    <div className="relative min-h-screen bg-[#e8e4dc] flex flex-col items-center justify-center px-4 py-16">
      {/* 갤러리 벽면 텍스처 - 고급스러운 리넨/캔버스 느낌 */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `
          url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")
        `,
        opacity: 0.04
      }} />
      {/* 미세한 그라데이션 빛 효과 */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-white/10 via-transparent to-black/5" />

      {step === "input" && (
        <Link
          href="/"
          className="absolute top-6 left-6 inline-flex items-center gap-2 text-[13px] font-semibold text-stone-700 hover:text-stone-900 hover:bg-white transition-colors z-10 tracking-tight px-3 py-2 rounded-full bg-white/80 backdrop-blur-sm shadow-[0_2px_8px_-4px_rgba(0,0,0,0.12)]"
        >
          <Home className="w-4 h-4" />
          <span>돌아가기</span>
        </Link>
      )}
      <div className="w-full max-w-2xl">

        {step === "input" && (
          <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
            {/* 공책/일기장 스타일 컨테이너 */}
            <div className="relative bg-[#faf8f3] rounded-lg shadow-xl overflow-hidden">
              {/* 종이 질감 */}
              <div className="absolute inset-0 opacity-[0.02]" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
              }} />

              {/* 노트 라인 배경 */}
              <div className="absolute inset-0 opacity-[0.08]" style={{
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #94a3b8 31px, #94a3b8 32px)',
                backgroundPosition: '0 20px'
              }} />

              {/* 왼쪽 여백선 (노트 느낌) */}
              <div className="absolute left-12 top-0 bottom-0 w-px bg-rose-200/40" />

              <div className="relative p-10 pl-16">
                {/* 날짜 표시 - 손글씨 느낌 */}
                <div className="text-right text-stone-400 text-sm mb-12" style={{ fontFamily: 'Georgia, serif' }}>
                  {new Date().getFullYear()}년의 어느 날
                </div>

                {/* 제목 */}
                <h1 className="text-3xl text-stone-700 mb-4 leading-relaxed" style={{ fontFamily: 'Georgia, serif' }}>
                  그날로<br/>돌아간다면,
                </h1>

                <p className="text-stone-500 text-[15px] leading-relaxed mb-10" style={{ fontFamily: 'Georgia, serif' }}>
                  무엇이 달라졌을까요?
                </p>

                {/* 날짜 입력 — 모바일 친화적인 년/월/일 분리 셀렉터 */}
                <DatePicker
                  value={targetDate}
                  onChange={setTargetDate}
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTargetDate(getRandomDate())}
                    className="text-[12px] text-stone-400 hover:text-stone-600 transition-colors flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    아무 날이나
                  </button>

                  <button
                    type="submit"
                    className="bg-[#3182F6] hover:bg-[#1f6feb] text-white px-6 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
                  >
                    <span>페이지 넘기기</span>
                    <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>

                {error && <p className="text-rose-500 text-[13px] mt-4">{error}</p>}

                {/* 하단 - 책 페이지 번호 느낌 */}
                <div className="text-center mt-16 pt-6 border-t border-stone-200/50">
                  <p className="text-stone-300 text-[10px] tracking-[0.2em]">
                    1990 — {new Date().getFullYear()}
                  </p>
                </div>
              </div>
            </div>
          </form>
        )}

        {step === "loading" && (
          <div className="w-full max-w-md mx-auto">
            <style>{`
              @keyframes turnPageReverse {
                0% { transform: rotateY(0deg); }
                25% { transform: rotateY(20deg); }
                100% { transform: rotateY(180deg); }
              }
              @keyframes showContent {
                0% { opacity: 0; transform: scale(0.98); }
                100% { opacity: 1; transform: scale(1); }
              }
              @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
              }
              @keyframes shimmer {
                0% { opacity: 0.5; }
                50% { opacity: 0.8; }
                100% { opacity: 0.5; }
              }
            `}</style>

            {/* 펼쳐진 신문 */}
            <div
              className="relative rounded-sm overflow-hidden"
              style={{
                height: '360px',
                perspective: '1500px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)'
              }}
            >
              {/* 종이 질감 배경 */}
              <div className="absolute inset-0 bg-[#f9f7f3]" />
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
              }} />

              {/* 왼쪽 - 넘어가는 페이지들 (과거로 돌아가는 느낌) */}
              <div className="absolute left-0 top-0 bottom-0 w-1/2" style={{ transformStyle: 'preserve-3d' }}>

                {/* 넘어가는 신문 페이지들 - 좌→우로 넘어감 */}
                {Array.from({ length: 12 }, (_, i) => {
                  const year = 2024 - i * 2;
                  return (
                    <div
                      key={i}
                      className="absolute inset-0 bg-[#fdfcf9] p-4"
                      style={{
                        animation: `turnPageReverse 0.55s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.18}s forwards`,
                        transformOrigin: 'right center',
                        backfaceVisibility: 'hidden',
                        zIndex: 20 - i,
                        boxShadow: '4px 0 15px rgba(0,0,0,0.08)'
                      }}
                    >
                      <div className="border-b border-stone-200 pb-1 mb-3">
                        <p className="text-[8px] text-stone-400 font-medium text-right">{year}년</p>
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2 bg-stone-200 rounded-sm w-full" />
                        <div className="h-2 bg-stone-200 rounded-sm w-2/3" />
                        <div className="h-10 bg-stone-100 rounded-sm w-full mt-2" />
                        <div className="h-1.5 bg-stone-100 rounded-sm w-full" />
                        <div className="h-1.5 bg-stone-100 rounded-sm w-4/5" />
                      </div>
                    </div>
                  );
                })}

                {/* 최종 페이지 (왼쪽) */}
                <div
                  className="absolute inset-0 bg-gradient-to-bl from-[#fdfcf9] to-[#f8f6f1] flex flex-col items-center justify-center"
                  style={{ animation: 'showContent 0.6s ease-out 2.4s both', zIndex: 0 }}
                >
                  {d && (
                    <div className="text-center" style={{ animation: 'float 2.5s ease-in-out infinite 3s' }}>
                      <div className="w-10 h-px bg-stone-300 mx-auto mb-3" />
                      <p className="text-[9px] tracking-[0.3em] text-stone-400 uppercase mb-2">Arrived</p>
                      <p className="text-5xl font-extralight text-stone-800 leading-none" style={{ fontFamily: 'Georgia, serif' }}>{d.getFullYear()}</p>
                      <p className="text-stone-500 text-sm mt-2 font-light">{d.getMonth() + 1}월 {d.getDate()}일</p>
                      <div className="w-10 h-px bg-stone-300 mx-auto mt-3" />
                    </div>
                  )}
                </div>
              </div>

              {/* 오른쪽 페이지 - 고정 (현재) */}
              <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-[#fdfcf9] p-5">
                {/* 신문 헤더 */}
                <div className="border-b-2 border-stone-800 pb-2 mb-4">
                  <div className="flex justify-between items-center text-[7px] text-stone-400 mb-1">
                    <span>TIME MACHINE</span>
                    <span>2025</span>
                  </div>
                  <p className="text-xl font-black text-stone-800 text-center tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>서울경제</p>
                  <p className="text-[8px] text-stone-400 text-center mt-1">THE SEOUL ECONOMIC DAILY</p>
                </div>
                {/* 가짜 기사 라인들 */}
                <div className="space-y-2">
                  <div className="h-2.5 bg-stone-800 rounded-sm w-full" />
                  <div className="h-2 bg-stone-300 rounded-sm w-4/5" />
                  <div className="flex gap-2 mt-3">
                    <div className="w-16 h-12 bg-stone-100 rounded-sm" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-1.5 bg-stone-200 rounded-sm w-full" />
                      <div className="h-1.5 bg-stone-200 rounded-sm w-5/6" />
                      <div className="h-1.5 bg-stone-200 rounded-sm w-full" />
                    </div>
                  </div>
                  <div className="h-px bg-stone-200 my-2" />
                  <div className="h-1.5 bg-stone-100 rounded-sm w-full" />
                  <div className="h-1.5 bg-stone-100 rounded-sm w-3/4" />
                </div>
              </div>

              {/* 중앙 접힘선 + 그림자 */}
              <div className="absolute left-1/2 top-0 bottom-0 w-[3px] bg-gradient-to-r from-stone-300 via-stone-200 to-stone-300" style={{ transform: 'translateX(-1.5px)' }} />
              <div className="absolute left-1/2 top-0 bottom-0 w-4 bg-gradient-to-l from-black/5 to-transparent" style={{ transform: 'translateX(-2px)' }} />

            </div>

            {/* 하단 텍스트 */}
            <div className="text-center mt-5">
              <p className="text-stone-500 text-xs">
                {d ? `${new Date().getFullYear() - d.getFullYear()}년의 시간을 거슬러...` : '...'}
              </p>
              <div className="flex justify-center gap-1 mt-2">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1 h-1 rounded-full bg-stone-400" style={{ animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimeMachineClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50" />}>
      <TimeMachineContent />
    </Suspense>
  );
}
