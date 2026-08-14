'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ScrollText, Sun, Calendar, CalendarCheck, Heart, Sparkles,
  Search, BookOpen, Home, MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { JsonLd, faqSchema } from '@saju/shared/lib/jsonLd';
import { HeroBanner } from '@saju/widgets/HeroBanner';
import { PointsBadge, WeeklyCheckIn } from '@saju/features/points';

// 명조체 인라인 (한자/특수 강조용) — globals.css 안 건드림, 시스템 fallback chain
const SERIF = '"Noto Serif KR", "Nanum Myeongjo", "Apple SD Gothic Neo", serif';

// 한지 노이즈 (SVG turbulence, 인라인 data URL — 외부 요청 0)
const HANJI_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const LANDING_FAQ = [
  {
    q: '사주매칭은 어떤 서비스인가요?',
    a: '생년월일시만 입력하면 원국·십성·대운·오늘의 일진·재운·커리어·궁합까지 한 화면에서 풀어주는 데이터 기반 사주 서비스입니다. 궁통보감·삼명통회·자평진전 3대 고전과 KASI 만세력을 참고합니다.',
  },
  {
    q: '무료인가요?',
    a: '공개 프리뷰 기간 동안 모든 기능을 무료로 이용하실 수 있습니다. 별도 회원가입도 필요하지 않습니다.',
  },
  {
    q: '태어난 시간을 모르면 어떻게 하나요?',
    a: '시간 입력란의 "시간 모름" 옵션을 체크하시면 시주를 제외한 年·月·日 세 기둥으로 해석해드립니다.',
  },
];

// 점신 결 — 톤 통일. 메인 워밍 오렌지 + 4 보조톤만.
const C = {
  paper: '#FFFFFF',     // 페이지 배경 (흰색)
  card: '#FFFFFF',
  ink: '#1A1A1A',
  inkSub: '#A0A0A8',
  inkSoft: '#4F4F58',
  line: '#EFEAE3',
  warm: '#34D399',
  warmSoft: '#D1FAE5',
  warmDeep: '#059669',
  cream: '#D1FAE5',
  rose: '#FFE2DE',
  roseDeep: '#C8513F',
  lilac: '#EFE7FF',
  lilacDeep: '#7A5BE0',
  mint: '#DBF1E8',
  mintDeep: '#338A6A',
};

type Tile = {
  href: string;
  ko: string;
  en: string;
  subKo: string;
  subEn: string;
  Icon: LucideIcon;
  group: 'core' | 'fortune' | 'social';
  kanji: string;
};

// 6칸 2열×3행 — 핵심 카테고리만
const PRIMARY_GRID: Tile[] = [
  { href: '/today',         ko: '오늘의 운세',      en: "Today's Fortune",   subKo: '매일 새로운 하루 운세',   subEn: 'Fresh daily fortune',        Icon: Sun,           group: 'core',    kanji: '日' },
  { href: '/saju',          ko: '내 사주',          en: 'My Saju',           subKo: '천간·십성·대운 풀이',     subEn: 'Stems · Stars · Luck',       Icon: ScrollText,    group: 'core',    kanji: '命' },
  { href: '/tojeong',       ko: '토정비결',         en: 'Tojeong Fortune',   subKo: '올해 신수를 한눈에',      subEn: "This year's forecast",       Icon: Calendar,      group: 'fortune', kanji: '卜' },
  { href: '/pick-date',     ko: '지정일 운세',      en: 'Pick a Date',       subKo: '궁금한 날의 운세 보기',   subEn: 'Fortune for any date',       Icon: CalendarCheck, group: 'fortune', kanji: '擇' },
  { href: '/compatibility', ko: '궁합',            en: 'Compatibility',     subKo: '둘의 인연 점수',          subEn: 'Match score for two',        Icon: Heart,         group: 'social',  kanji: '合' },
  { href: '/concern',       ko: '행운의 부적만들기', en: 'Lucky Talisman',    subKo: '나만의 행운 부적',        subEn: 'Your personal talisman',     Icon: Sparkles,      group: 'social',  kanji: '符' },
];

// 카드별 개별 색상
const TILE_TONE: Record<string, { bg: string; fg: string }> = {
  '/today':         { bg: '#ECFDF5', fg: '#059669' },
  '/saju':          { bg: '#ECFDF5', fg: '#059669' },
  '/tojeong':       { bg: '#ECFDF5', fg: '#059669' },
  '/pick-date':     { bg: '#ECFDF5', fg: '#059669' },
  '/compatibility': { bg: '#ECFDF5', fg: '#059669' },
  '/concern':       { bg: '#ECFDF5', fg: '#059669' },
};

const GROUP_TONE: Record<Tile['group'], { bg: string; fg: string }> = {
  core:    { bg: '#ECFDF5', fg: '#059669' },
  fortune: { bg: '#ECFDF5', fg: '#059669' },
  social:  { bg: '#ECFDF5', fg: '#059669' },
};



export default function LandingPage() {
  const { t, lang, localePath } = useLang();
  const [today, setToday] = useState<{ m: number; d: number; weekday: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const days = lang === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['일', '월', '화', '수', '목', '금', '토'];
    setToday({
      m: now.getMonth() + 1,
      d: now.getDate(),
      weekday: days[now.getDay()],
    });
  }, [lang]);

  return (
    <div
      style={{ background: C.paper, colorScheme: 'light' }}
      className="min-h-screen w-full relative overflow-hidden"
    >
      {/* 한지 노이즈 깔개 (다크 차단은 layout body level 에서 처리됨, phase-03) */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: HANJI_NOISE,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* keyframes — 배너 동심원·sparkle 미세 모션. globals.css 안 건드림 */}
      <style>{`
        @keyframes saju-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes saju-pulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.92; }
        }
        @keyframes saju-twinkle {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.18); }
        }
      `}</style>

      <JsonLd data={faqSchema(LANDING_FAQ)} />

      <main
        id="main-content"
        className="mx-auto w-full max-w-[540px] lg:max-w-[1080px] pb-32 lg:pb-10 lg:px-6 relative"
        style={{ color: C.ink }}
      >
        {/* 배경 한자 — 페이지 우상단에 옅게, 사주방 결 */}
        <div
          aria-hidden
          className="pointer-events-none select-none absolute top-[60px] right-[-20px] lg:right-[40px] z-[1] leading-none"
          style={{
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 240,
            color: C.ink,
            opacity: 0.045,
          }}
        >
          運
        </div>
        <div
          aria-hidden
          className="pointer-events-none select-none absolute top-[420px] left-[-10px] lg:left-[40px] z-[1] leading-none"
          style={{
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 180,
            color: C.ink,
            opacity: 0.035,
          }}
        >
          命
        </div>

        {/* Status bar (mini) — PC에서는 TopNav가 대체하므로 숨김 */}
        <div
          className="relative z-10 flex items-center justify-between px-5 pt-5 pb-1.5 text-[11.5px] lg:hidden"
          style={{ color: '#8C8579' }}
        >
          <div className="flex items-center gap-1.5 truncate">
            <span style={{ fontFamily: SERIF, fontWeight: 600, color: C.ink, opacity: 0.55 }}>占</span>
            <span className="truncate">{t('KASI 만세력 · 궁통보감 · 자평진전', 'KASI · classical texts')}</span>
          </div>
          {today && (
            <span
              className="shrink-0 tabular-nums tracking-tight"
              style={{ color: C.inkSoft, fontWeight: 600 }}
            >
              {today.m}.{today.d}
              <span style={{ color: '#C9C2B5', margin: '0 4px' }}>·</span>
              {today.weekday}
            </span>
          )}
        </div>

        {/* Title row — PC에서는 TopNav 브랜드가 대체 */}
        <header className="relative z-10 px-5 pt-3 pb-5 flex items-end justify-between lg:hidden">
          <div>
            <h1
              className="leading-none"
              style={{
                fontFamily: SERIF,
                fontWeight: 900,
                fontSize: 36,
                color: C.ink,
                letterSpacing: '-0.01em',
              }}
            >
              운<span style={{ color: C.warmDeep }}>세</span>
            </h1>
            <p
              className="text-[12.5px] mt-2.5"
              style={{ color: '#8C8579', letterSpacing: '-0.005em' }}
            >
              {t('사주매칭 · 생년월일 하나로', 'SajuMatch · just one birth date')}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t('검색', 'Search')}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-black/5 active:scale-95"
              style={{ color: C.ink }}
            >
              <Search size={19} strokeWidth={2.2} />
            </button>
            <Link
              href={localePath('/mypage')}
              aria-label={t('마이페이지', 'My Page')}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-black/5 active:scale-95"
              style={{ color: C.ink }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </div>
        </header>

        {/* Hero — 히어로 배너 */}
        <HeroBanner />

        {/* 고민 카드(부적 만들기) — 챗봇 바로 아래. "고민 있나요?"를 두 번 묻지 않도록 순서 조정 */}
        {/* 기능 카드 그리드 — 캐러셀 아래 4열 2행 */}
        <section className="relative z-10 mt-6 px-3">
          <div className="mb-4 flex items-baseline gap-2 px-2">
            <span
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                color: C.warmDeep,
                opacity: 0.55,
                fontSize: 13,
                letterSpacing: '-0.02em',
              }}
            >
              ▎
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-tight" style={{ color: C.inkSub }}>
                {t('소름 돋는 미래 예측', 'Spookily accurate')}
              </p>
              <h3
                className="mt-1"
                style={{
                  fontFamily: SERIF,
                  fontWeight: 900,
                  fontSize: 20,
                  letterSpacing: '-0.02em',
                  color: C.ink,
                }}
              >
                {t('가장 정확한 사주 풀이', 'The most precise Saju reading')}
              </h3>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-3">
            {PRIMARY_GRID.map(({ href, ko, en, subKo, subEn, Icon, group, kanji }) => {
              const tt = TILE_TONE[href] ?? GROUP_TONE[group];
              return (
                <li key={href}>
                  <Link
                    href={localePath(href)}
                    className="relative flex flex-col justify-between p-4 rounded-2xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[#ECFDF5] active:scale-[0.98] group h-[130px] overflow-hidden"
                  >
                    {/* 배경 한자 장식 */}
                    <span
                      aria-hidden
                      className="absolute bottom-[-8px] right-[-2px] pointer-events-none select-none leading-none"
                      style={{
                        fontFamily: SERIF,
                        fontWeight: 900,
                        fontSize: 64,
                        color: '#059669',
                        opacity: 0.06,
                      }}
                    >
                      {kanji}
                    </span>
                    {/* 상단: 아이콘 + 화살표 */}
                    <div className="flex items-start justify-between">
                      <span
                        className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center"
                        style={{ background: '#ECFDF5' }}
                      >
                        <Icon size={18} strokeWidth={2.2} style={{ color: '#059669' }} />
                      </span>
                      <span className="text-gray-300 text-[13px]" aria-hidden>↗</span>
                    </div>
                    {/* 하단: 타이틀 + 설명 */}
                    <div className="relative z-[1]">
                      <h4
                        className="text-[14px] font-bold leading-tight tracking-tight"
                        style={{ color: '#1a1a1a' }}
                      >
                        {t(ko, en)}
                      </h4>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 line-clamp-1">
                        {t(subKo, subEn)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 운세 이야기 — 가장 정확한 사주풀이와 동일 너비 */}
        <section className="relative z-10 mt-6 px-3">
          <div className="mb-4 flex items-baseline gap-2 px-2">
            <span
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                color: C.warmDeep,
                opacity: 0.55,
                fontSize: 13,
                letterSpacing: '-0.02em',
              }}
            >
              ▎
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-tight" style={{ color: C.inkSub }}>
                {t('운세 이야기', 'Fortune notes')}
              </p>
              <h3
                className="mt-1"
                style={{
                  fontFamily: SERIF,
                  fontWeight: 900,
                  fontSize: 20,
                  letterSpacing: '-0.02em',
                  color: C.ink,
                }}
              >
                {t('매일 새로 도착해요', 'Fresh every morning')}
              </h3>
            </div>
          </div>
          <ul className="grid grid-cols-3 gap-3">
            <li>
              <Link
                href={localePath('/blog')}
                className="relative flex flex-col justify-between p-4 rounded-2xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[#ECFDF5] active:scale-[0.98] group h-[130px] overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <span
                    className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center"
                    style={{ background: '#ECFDF5' }}
                  >
                    <BookOpen size={18} strokeWidth={2.2} style={{ color: '#059669' }} />
                  </span>
                  <span className="text-gray-300 text-[13px]" aria-hidden>↗</span>
                </div>
                <div>
                  <h4 className="text-[14px] font-bold leading-tight tracking-tight" style={{ color: '#1a1a1a' }}>
                    {t('블로그', 'Blog')}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 line-clamp-1">
                    {t('데일리 운세·명리 노트', 'Daily horoscope notes')}
                  </p>
                </div>
              </Link>
            </li>
            <li>
              <Link
                href={localePath('/quiz')}
                className="relative flex flex-col justify-between p-4 rounded-2xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[#ECFDF5] active:scale-[0.98] group h-[130px] overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <span
                    className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center"
                    style={{ background: '#ECFDF5' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </span>
                  <span className="text-gray-300 text-[13px]" aria-hidden>↗</span>
                </div>
                <div>
                  <h4 className="text-[14px] font-bold leading-tight tracking-tight" style={{ color: '#1a1a1a' }}>
                    {t('운세 퀴즈', 'Quiz')}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 line-clamp-1">
                    {t('재미로 풀어보는 사주', 'Fun fortune quiz')}
                  </p>
                </div>
              </Link>
            </li>
            <li>
              <DailyQuoteCard />
            </li>
          </ul>
        </section>

        {/* 출석 체크 — 오늘의 운세/주역점을 보면 포인트 적립 */}
        <section className="relative z-10 mt-4 px-3">
          <div className="rounded-[20px] bg-white p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[14px] font-black" style={{ color: C.ink, fontFamily: SERIF }}>
                  {t('이번 주 출석', "This week's check-in")}
                </p>
                <p className="text-[11.5px] mt-0.5" style={{ color: C.inkSub }}>
                  {t('오늘의 운세나 주역점을 보면 자동으로 포인트가 쌓여요', "View today's fortune or draw a trigram to earn points automatically")}
                </p>
              </div>
              <PointsBadge />
            </div>

            <div className="mt-4">
              <WeeklyCheckIn />
            </div>

            <div className="flex items-center justify-center gap-4 mt-3 text-[10.5px]" style={{ color: C.inkSub }}>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: C.warmDeep }} />
                {t('받음', 'Earned')}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#E5E7EB' }} />
                {t('놓침', 'Missed')}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${C.line}` }} />
                {t('예정', 'Upcoming')}
              </span>
            </div>

            <p className="text-[11px] text-center mt-3 pt-3" style={{ color: C.warmDeep, borderTop: `1px solid ${C.line}` }}>
              {t('꾸준히 모을수록 행운도 함께 쌓여요', 'The more you keep it up, the more luck builds up')}
            </p>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="px-5 pt-7 pb-2">
          <p className="text-[11px] leading-[1.65]" style={{ color: C.inkSub }}>
            {t(
              '이 사이트의 해석은 고전 명리학 문헌을 참고한 데이터 기반 콘텐츠로, 오락·참고 목적의 정보이며 어떠한 판단·결정의 근거로도 사용할 수 없습니다.',
              'Interpretations on this site are data-driven content based on classical Korean astrology literature. For entertainment and reference only.'
            )}
          </p>
        </section>
      </main>

      {/* 플로팅 채팅 버튼 */}
      <FloatingChatButton />

      {/* Bottom Nav — fixed, 모바일 전용 (PC에서는 TopNav) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
        style={{ background: C.paper }}
      >
        <div
          className="mx-auto w-full max-w-[540px]"
          style={{
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'saturate(180%) blur(14px)',
            WebkitBackdropFilter: 'saturate(180%) blur(14px)',
            borderTop: `1px solid ${C.line}`,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <nav className="flex items-center justify-around px-2 py-1.5">
            <BottomTab href={localePath('/')}             Icon={Home}        label={t('홈',     'Home')}   active />
            <BottomTab href={localePath('/today')}        Icon={Sun}         label={t('오늘',   'Today')}  />
            <BottomTab href={localePath('/saju')}         Icon={ScrollText}  label={t('사주',   'Saju')}   />
            <BottomTab href={localePath('/compatibility')} Icon={Heart}      label={t('궁합',   'Match')}  />
            <BottomTab href={localePath('/blog')}         Icon={BookOpen}    label={t('블로그', 'Blog')}   />
          </nav>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  eyebrow, title, children,
}: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section
      className="relative z-10 mt-3 mx-3 rounded-[24px] p-5 transition-shadow duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
      style={{ background: C.card, boxShadow: '0 1px 3px rgba(0,0,0,0.025)' }}
    >
      <div className="mb-4 flex items-baseline gap-2">
        <span
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            color: C.warmDeep,
            opacity: 0.55,
            fontSize: 13,
            letterSpacing: '-0.02em',
          }}
        >
          ▎
        </span>
        <div>
          <p className="text-[12px] font-semibold tracking-tight" style={{ color: C.inkSub }}>{eyebrow}</p>
          <h3
            className="mt-1"
            style={{
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: '-0.02em',
              color: C.ink,
            }}
          >
            {title}
          </h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function DailyQuoteCard() {
  const { t, localePath } = useLang();

  return (
    <Link
      href={localePath('/daily-quote')}
      className="relative flex flex-col justify-between p-4 rounded-2xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-[#ECFDF5] active:scale-[0.98] h-[130px] overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <span
          className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center"
          style={{ background: '#ECFDF5' }}
        >
          <span className="text-[18px]">🥠</span>
        </span>
        <span className="text-gray-300 text-[13px]" aria-hidden>↗</span>
      </div>
      <div>
        <h4 className="text-[14px] font-bold leading-tight tracking-tight" style={{ color: '#1a1a1a' }}>
          {t('오늘의 한마디', 'Daily quote')}
        </h4>
        <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400 line-clamp-1">
          {t('포춘쿠키 한 장 뽑기', 'Pick a fortune cookie')}
        </p>
      </div>
    </Link>
  );
}

function FloatingChatButton() {
  const { t, localePath } = useLang();
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(localePath('/chat'))}
      aria-label={t('고민 상담하기', 'Chat with us')}
      className="fixed right-4 bottom-[90px] lg:bottom-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
      style={{ background: '#34D399' }}
    >
      <MessageCircle size={24} strokeWidth={2.2} color="#FFFFFF" />
    </button>
  );
}

function BottomTab({
  href, Icon, label, active,
}: { href: string; Icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 py-2 px-2 flex-1 transition-all hover:opacity-80 active:scale-95"
      style={{ color: active ? C.warmDeep : C.inkSub }}
    >
      <Icon size={21} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[10.5px] font-bold tracking-tight">{label}</span>
    </Link>
  );
}


