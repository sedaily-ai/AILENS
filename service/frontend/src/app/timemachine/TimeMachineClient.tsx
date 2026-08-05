'use client';

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getFamousBirthdays, type FamousPerson } from "@/shared/data/famousBirthdays";
import { getSnapshotByDate, CURRENT_SNAPSHOT } from "@/shared/data/economicSnapshots";
import { INVESTMENT_OPTIONS, calcInvestment, getParallelUniverses } from "@/shared/data/investmentScenarios";
import { fetchTimeMachineData } from "@/shared/api/timeMachineApi";
import { fetchLiveMarket, type LiveMarket } from "@/shared/lib/marketLive";
import type { DayNews, HistoricalEvent } from "@/shared/types/timeMachine";
import { Newspaper, Users, Camera, TrendingUp, ArrowLeft, Sparkles, Calendar, Home, Clock, Building, Landmark, Coins, PiggyBank, Car, Store, Bitcoin, Trophy, Award, BarChart2, Building2, Smartphone, Coffee, Crown, Mic2, Palette, Film, BookOpen, Globe, Briefcase, Music, Pen, Gamepad2, Medal, Rocket, type LucideIcon } from "lucide-react";

// 투자 옵션 아이콘 매핑
const INVESTMENT_ICONS: Record<string, LucideIcon> = {
  kospi: BarChart2,
  bitcoin: Bitcoin,
  cash: Landmark,
  gangnam: Building2,
  samsung: Smartphone,
  starbucks_coffee: Coffee,
};

// 분야별 아이콘 매핑
const FIELD_ICONS: Record<string, LucideIcon> = {
  "정치인": Crown,
  "정치": Crown,
  "가수": Mic2,
  "음악가": Music,
  "음악": Music,
  "배우": Film,
  "영화": Film,
  "감독": Film,
  "작가": Pen,
  "문학": BookOpen,
  "과학자": Rocket,
  "과학": Rocket,
  "사업가": Briefcase,
  "기업인": Briefcase,
  "경제": Briefcase,
  "예술가": Palette,
  "미술": Palette,
  "스포츠": Medal,
  "운동선수": Medal,
  "게임": Gamepad2,
  "국제": Globe,
};

type Step = "input" | "loading" | "result" | "invest-result";
type ResultTab = "news" | "celebs" | "photos" | "invest";

function getRandomDate(): string {
  const start = new Date("1990-01-01").getTime();
  const end = new Date(Date.now() - 86400000).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().split("T")[0];
}



const CATEGORY_COLOR: Record<string, string> = {
  경제: "bg-blue-100 text-blue-600", IT: "bg-violet-100 text-violet-600",
  사회: "bg-orange-100 text-orange-600", 역사: "bg-amber-100 text-amber-700",
  국제: "bg-emerald-100 text-emerald-600", 문화: "bg-pink-100 text-pink-600",
  스포츠: "bg-red-100 text-red-600",
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
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(0)}%`;
}


// 숫자 8자리 타이핑 → 'YYYY / MM / DD' 자동 포맷. 모바일에서 numpad 띄움.
// 내부에 raw digits 상태 유지 — 타이핑 중간엔 ISO 가 비고, 8자리 완성 시에만 부모에 ISO 전달.
function DatePicker({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-DD or '' (부모가 가진 확정 ISO)
  todayIso: string;
  onChange: (iso: string) => void;
}) {
  const initialRaw = value.replace(/-/g, '');
  const [raw, setRaw] = useState(initialRaw);

  // 외부에서 value 가 바뀌면(예: "아무 날이나") 내부 raw 도 동기화
  useEffect(() => {
    setRaw(value.replace(/-/g, ''));
  }, [value]);

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

function TimeMachineContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("input");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [news, setNews] = useState<DayNews[]>([]);
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [birthdays, setBirthdays] = useState<FamousPerson[]>([]);
  const [snapshot, setSnapshot] = useState<ReturnType<typeof getSnapshotByDate> | null>(null);
  const [selectedInvestment, setSelectedInvestment] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("news");
  // 실시간 시장 지표 — 영문사이트 dashboard API. 실패 시 null → 하드코딩 CURRENT_SNAPSHOT 폴백.
  const [liveMarket, setLiveMarket] = useState<LiveMarket | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchLiveMarket().then((data) => {
      if (!cancelled) setLiveMarket(data);
    });
    return () => { cancelled = true; };
  }, []);
  const [isBirthdayMode, setIsBirthdayMode] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  const tabs: { id: ResultTab; label: string; subtitle: string; icon: typeof Newspaper }[] = [
    { id: "news", label: "그날의 뉴스", subtitle: "무슨 일이 있었나", icon: Newspaper },
    { id: "celebs", label: "같은 날 태어난", subtitle: "운명을 공유한 사람들", icon: Users },
    { id: "photos", label: "기록된 순간", subtitle: "사진으로 보는 역사", icon: Camera },
    { id: "invest", label: "만약 그때", subtitle: "투자했더라면", icon: TrendingUp },
  ];

  // URL 파라미터로 날짜가 전달되면 자동 로드
  useEffect(() => {
    const dateParam = searchParams.get("date");
    const modeParam = searchParams.get("mode");

    if (dateParam && dateParam < today) {
      setTargetDate(dateParam);
      setIsBirthdayMode(modeParam === "birthday");

      // 자동으로 데이터 로드
      const loadData = async () => {
        setStep("loading");
        const [data] = await Promise.all([
          fetchTimeMachineData(dateParam),
          new Promise((r) => setTimeout(r, 2800)),
        ]);
        setNews(data.news);
        setEvents(data.historicalEvents);
        setBirthdays(getFamousBirthdays(dateParam));
        setSnapshot(getSnapshotByDate(dateParam));
        setStep("result");
      };

      loadData();
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate) { setError("날짜를 선택해주세요."); return; }
    if (targetDate >= today) { setError("오늘 이전 날짜를 선택해주세요."); return; }
    setError("");
    setStep("loading");
    const [data] = await Promise.all([
      fetchTimeMachineData(targetDate),
      new Promise((r) => setTimeout(r, 2800)),
    ]);
    setNews(data.news);
    setEvents(data.historicalEvents);
    setBirthdays(getFamousBirthdays(targetDate));
    setSnapshot(getSnapshotByDate(targetDate));
    setSelectedInvestment(null);
    setShowComparison(false);
    setStep("result");
  };

  const d = targetDate ? new Date(targetDate) : null;
  const formatted = d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : "";
  const resetAll = () => { setStep("input"); setTargetDate(""); setNews([]); setEvents([]); setBirthdays([]); setSnapshot(null); setSelectedInvestment(null); setShowComparison(false); setActiveTab("news"); };

  return (
    <div className={`relative min-h-screen bg-[#e8e4dc] flex flex-col items-center px-4 py-16 ${step === "input" || step === "loading" ? "justify-center" : ""}`}>
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
                  todayIso={today}
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

        {step === "invest-result" && selectedInvestment && (() => {
          const year = new Date(targetDate).getFullYear();
          const opt = INVESTMENT_OPTIONS.find((o) => o.id === selectedInvestment)!;
          const liveCurrent = { kospi: liveMarket?.kospi };
          const result = calcInvestment(selectedInvestment, year, liveCurrent);
          const isProfit = result.returnRate >= 0;
          const allResults = INVESTMENT_OPTIONS.map((o) => ({ opt: o, result: calcInvestment(o.id, year, liveCurrent) }));
          const maxValue = Math.max(...allResults.map((r) => r.result.currentValue));
          const parallelUniverses = getParallelUniverses(selectedInvestment, year, liveCurrent);
          const bestAlternative = parallelUniverses[0];
          const regretGap = bestAlternative.result.currentValue - result.currentValue;
          const SelectedIcon = INVESTMENT_ICONS[opt.id] || Coins;
          const elapsed = new Date().getFullYear() - year;

          return (
            <div>
              {/* 헤더 — 메인 도록 톤 통일 */}
              <header className="relative text-center pt-2 pb-12">
                <button
                  onClick={() => { setStep("result"); setShowComparison(false); }}
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
                  그날부터 {elapsed}년이 흘렀어요
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
                    “{result.tagline}”
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
                <button
                  onClick={resetAll}
                  className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[11px] tracking-[0.32em] uppercase"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>다른 날짜로</span>
                </button>
              </div>
            </div>
          );
        })()}

        {step === "result" && (
          <div>
            {/* 헤더 — 도입부. 인생 한 시점에 사용자를 끼워 넣는 hero. */}
            <header className="relative text-center pt-2 pb-12">
              <button
                type="button"
                onClick={() => {
                  // 이전 페이지로 돌아가기 — 직접 URL 진입 시엔 홈으로 fallback.
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.location.href = '/';
                  }
                }}
                className="absolute left-0 top-0 inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[12px]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>돌아가기</span>
              </button>

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
                {d && d.getFullYear()}
              </h1>
              <p className="text-stone-600 text-[15px] tracking-[0.04em]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {d && `${d.getMonth() + 1} . ${d.getDate()}`}
              </p>

              {/* 인생 위치 — 생일 모드: 살아온 아침 수. 일반: 흘러온 시간. */}
              {d && (() => {
                const now = new Date();
                const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
                const years = now.getFullYear() - d.getFullYear();
                return (
                  <p className="text-stone-500 text-[12px] tracking-[0.2em] uppercase mt-8" style={{ fontFamily: 'Georgia, serif' }}>
                    {isBirthdayMode
                      ? <>당신이 살아온 <span className="text-stone-800 text-[14px]" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>{days.toLocaleString()}</span> 번째 아침까지</>
                      : <>오늘로부터 <span className="text-stone-800 text-[14px]" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>{years}</span> 년 전, 같은 달력의 하루</>}
                  </p>
                );
              })()}

              {/* 가는 수직 룰 */}
              <div className="h-12 w-px bg-stone-400/50 mx-auto mt-8" />

              <p className="text-stone-600 text-[14px] mt-6 italic leading-[1.9] max-w-[400px] mx-auto" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                {isBirthdayMode
                  ? '오늘의 당신을 만든 그날의 결을 천천히 펼쳐봅니다'
                  : '시간을 거슬러 잠시 머무는, 같은 달력의 한 페이지'}
              </p>
            </header>

            {/* 탭 제거 — single-scroll 도록. 챕터 마커가 섹션 진입을 알림. */}

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
                {new Date(targetDate).getFullYear() < 1995 ? (
                  <div className="py-20 text-center">
                    <p className="text-stone-500 text-[14px] leading-[1.9]" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                      1995년 이전의 기록은<br/>아직 디지털로 옮겨지지 않았어요
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
                  // 가짜 스톡사진(달러·차트 등) 폴백 제거 — 의미 없는 이미지보다 아예 없는 게 낫다.
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
                  // 원본 < 800px 인 옛 사진은 Wikipedia 가 400 반환 → onError 핸들러로 raw URL 폴백.
                  const upscaleWikiImg = (url: string): string =>
                    url.replace(/\/(\d{2,4})px-/, '/800px-');
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
                          onClick={() => { setSelectedInvestment(opt.id); setShowComparison(false); setStep("invest-result"); }}
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
                  {isBirthdayMode
                    ? '한 페이지의 시간을 함께 펼쳐주셔서 고마워요.'
                    : '한 페이지의 시간을 함께 펼쳐주셔서 고마워요.'}
                </p>
                <p className="text-stone-500 text-[13.5px] italic leading-[1.95] max-w-[420px] mx-auto mb-10" style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}>
                  {isBirthdayMode
                    ? '이제 다시, 오늘의 당신으로 천천히 돌아갑니다.'
                    : '이제 다시, 오늘의 결로 돌아갈게요.'}
                </p>

                {/* 사주 연결 — 생일 모드: 본인의 결. 일반 모드: 그날 태어난 이의 결. */}
                {targetDate && (
                  <Link
                    href={`/fortune?birthdate=${targetDate}`}
                    className="inline-block mb-8 group"
                  >
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
                )}

                <div className="pt-2">
                  <button
                    onClick={resetAll}
                    className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors text-[11px] tracking-[0.24em] uppercase"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>다른 날짜로</span>
                  </button>
                </div>
              </section>
            </SectionReveal>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimeMachineClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-400"></div></div>}>
      <TimeMachineContent />
    </Suspense>
  );
}
