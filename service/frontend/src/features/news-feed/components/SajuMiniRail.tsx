'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { calculateSaju, CG_OH } from '@/entities/saju';
import { trackEvent } from '@/shared/lib/trackEvent';

// 사주 × 짝꿍 미리보기(2026-08-17) — SideRail.tsx의 같은 섹션을 홈 사이드바용으로
// 떼어냈다. 원본이 쓰던 토스 블루(#3182F6)는 아래 BRAND 상수 설명 참조해
// 실제 사주 서비스 톤으로 교체했다. 오행 5색 팔레트(ELEMENT_HEX)는 손 안
// 댔다 — 목/화/토/금/수 각각 고유 색이 필요한 의미 체계라 브랜드 색과는
// 별개(수=파랑은 색채 관습).
type Zodiac =
  | 'rat' | 'ox' | 'tiger' | 'rabbit' | 'dragon' | 'snake'
  | 'horse' | 'goat' | 'monkey' | 'rooster' | 'dog' | 'pig';

type Gender = 'male' | 'female';
type Element = '목' | '화' | '토' | '금' | '수';

// 톤앤매너를 AI LENS 보라(violet)에서 실제 사주 서비스 톤으로 바꿨다
// (2026-08-17, 사용자 피드백: "디자인이 너무 토스스러워서... 전통스러운
// 느낌... 사주 서비스 프론트 톤앤매너를 따오는건 어떄요"). 처음엔 sibling
// 레포(4_saju/dev/frontend)의 "점신 톤"(종이/잉크/오렌지) 토큰을 참고해
// 따뜻한 오렌지로 바꿨는데, 사용자가 실제 운영 중인 소스
// (2_ailens/dev2/saju/frontend/src/app/saju-globals.css) 스크린샷을 직접
// 보여줘 확인해보니 그 "점신 톤"은 그 파일 자체 주석에도 "죽은 기능"이라고
// 적혀 있는 미사용 토큰이었다 — 실제 라이브 화면은 민트/에메랄드
// (--color-primary: #34D399)가 메인이고, 카드마다 각자 다른 파스텔 아이콘
// 색(민트/초록/오렌지/보라/핑크/노랑)을 쓰는 구성이었다. 그래서 브랜드
// 색을 그 민트로 다시 맞췄다.
const BRAND = '#059669'; // --accent-blue-title(실제로는 초록) — 텍스트/작은 강조용, 흰 배경 대비 확보
const BRAND_SOFT = '#34D399'; // --color-primary — 버튼 등 큰 면적 채우기용(실제 "내 사주 보기" CTA와 동일)
const PAPER = '#F9FAFB'; // --v3-panel
const LINE = '#E5E8EB'; // --v3-line

const ZODIACS: { id: Zodiac; emoji: string; label: string; element: Element }[] = [
  { id: 'rat',     emoji: '🐭', label: '쥐',     element: '수' },
  { id: 'ox',      emoji: '🐮', label: '소',     element: '토' },
  { id: 'tiger',   emoji: '🐯', label: '호랑이', element: '목' },
  { id: 'rabbit',  emoji: '🐰', label: '토끼',   element: '목' },
  { id: 'dragon',  emoji: '🐲', label: '용',     element: '토' },
  { id: 'snake',   emoji: '🐍', label: '뱀',     element: '화' },
  { id: 'horse',   emoji: '🐴', label: '말',     element: '화' },
  { id: 'goat',    emoji: '🐑', label: '양',     element: '토' },
  { id: 'monkey',  emoji: '🐵', label: '원숭이', element: '금' },
  { id: 'rooster', emoji: '🐔', label: '닭',     element: '금' },
  { id: 'dog',     emoji: '🐶', label: '개',     element: '토' },
  { id: 'pig',     emoji: '🐷', label: '돼지',   element: '수' },
];

const ELEMENT_HEX: Record<Element, string> = {
  목: '#16a34a', 화: '#e11d48', 토: '#d97706', 금: '#64748b', 수: '#3182F6',
};

const ELEMENT_PAIR: Record<Element, {
  recommendElement: Element;
  recommendHint: string;
  editor: { name: string; archetype: string; avatar: string; accent: string; soft: string; line: string };
}> = {
  목: {
    recommendElement: '화', recommendHint: '환한 태양형 화 기운',
    editor: { name: '소율', archetype: '공감 캐스터', avatar: '/editors/esfp.webp', accent: '#d97706', soft: '#fffbeb', line: '뻗어나가는 결 — 가볍게 닿는 소율과 어울려요.' },
  },
  화: {
    recommendElement: '토', recommendHint: '실리에 단단한 토 기운',
    editor: { name: '준서', archetype: '실용 큐레이터', avatar: '/editors/istj.webp', accent: '#059669', soft: '#ecfdf5', line: '화려한 결 — 단단한 준서가 균형을 잡아줘요.' },
  },
  토: {
    recommendElement: '금', recommendHint: '단단한 금 기운',
    editor: { name: '민철', archetype: '구조 분석가', avatar: '/editors/intj.webp', accent: '#7c3aed', soft: '#f5f3ff', line: '두툼한 결 — 구조부터 짚는 민철과 결이 맞아요.' },
  },
  금: {
    recommendElement: '수', recommendHint: '잔잔한 수 기운',
    editor: { name: '하은', archetype: '가치 탐색가', avatar: '/editors/infp.webp', accent: '#e11d48', soft: '#fff1f2', line: '날카로운 결 — 깊이로 흐르는 하은과 어울려요.' },
  },
  수: {
    recommendElement: '목', recommendHint: '곧게 자라는 목 기운',
    editor: { name: '하은', archetype: '가치 탐색가', avatar: '/editors/infp.webp', accent: '#e11d48', soft: '#fff1f2', line: '깊은 결 — 의미를 좇는 하은과 결이 맞아요.' },
  },
};

function computePreviewScore(zodiac: Zodiac, gender: Gender): number {
  const idx = ZODIACS.findIndex((z) => z.id === zodiac);
  const base = 60 + ((idx * 7 + (gender === 'female' ? 3 : 0)) % 18);
  return base / 10;
}

function buildReasons(element: Element, _gender: Gender): { label: string; weight: string }[] {
  const r1 = { label: `부족한 ${ELEMENT_PAIR[element].recommendElement} 기운 채움`, weight: '+2' };
  const r2 = { label: _gender === 'male' ? '배우자 자리 (재성) 일치' : '배우자 자리 (관성) 일치', weight: '+3' };
  return [r1, r2];
}

const MODULE_PREVIEW: Record<Element, { face: string; trait: string; zodiacs: string[]; months: string[] }> = {
  목: { face: '곧게 자란 키, 청량한 눈매와 또렷한 눈썹', trait: '성장과 새 시도를 즐기는 결', zodiacs: ['호랑이', '토끼'], months: ['1월', '2월'] },
  화: { face: '환한 인상, 또렷한 이목구비, 화사한 눈빛', trait: '솔직하고 표현이 분명한 결', zodiacs: ['뱀', '말'], months: ['4월', '5월'] },
  토: { face: '단단한 골격, 후덕하고 안정감 있는 인상', trait: '꾸준하고 신뢰가 두꺼운 결', zodiacs: ['소', '양'], months: ['환절기 (3·6·9·12월)'] },
  금: { face: '또렷한 윤곽, 단정하고 차분한 분위기', trait: '결단이 또렷하고 원칙이 단단한 결', zodiacs: ['원숭이', '닭'], months: ['7월', '8월'] },
  수: { face: '부드러운 눈매, 깊고 사려깊은 인상', trait: '깊이 생각하고 안목이 차분한 결', zodiacs: ['쥐', '돼지'], months: ['11월', '12월'] },
};

function IconFace({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3c4 0 7 3 7 7v3a7 7 0 0 1-14 0v-3c0-4 3-7 7-7z" />
      <path d="M9 12h.01M15 12h.01" />
      <path d="M10.5 16c.7.5 2.3.5 3 0" />
    </svg>
  );
}
function IconBrush({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 18c0-2 2-3 4-3s4 1 4 3-2 2-4 2-4 0-4-2z" />
      <path d="M14 15l5-9 2 1-5 9" />
    </svg>
  );
}
function IconZodiac({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" />
    </svg>
  );
}
function IconCalendar({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
      <circle cx="8" cy="14" r="0.8" fill={color} stroke="none" />
      <circle cx="12" cy="14" r="0.8" fill={color} stroke="none" />
      <circle cx="16" cy="14" r="0.8" fill={color} stroke="none" />
    </svg>
  );
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }} aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

interface DemoSample {
  birth: string;
  ilgan: string; ilganHg: string; ilganOh: Element;
  zodiacEmoji: string; zodiacLabel: string;
  score: string;
  recommend: Element; recommendHint: string;
  reasonLabel: string; reasonWeight: string;
  faceLine: string;
  matchZodiacs: string;
  monthLine: string;
}
const DEMO_SAMPLES: DemoSample[] = [
  {
    birth: '1990 / 01 / 15',
    ilgan: '갑', ilganHg: '甲', ilganOh: '목', zodiacEmoji: '🐴', zodiacLabel: '말띠',
    score: '7.1', recommend: '화', recommendHint: '환한 태양형 화 기운',
    reasonLabel: '부족한 화 기운 채움', reasonWeight: '+2',
    faceLine: '환한 인상, 또렷한 이목구비',
    matchZodiacs: '뱀·말띠와 결이 맞아요',
    monthLine: '4월 · 5월',
  },
  {
    birth: '1995 / 07 / 03',
    ilgan: '병', ilganHg: '丙', ilganOh: '화', zodiacEmoji: '🐷', zodiacLabel: '돼지띠',
    score: '6.4', recommend: '토', recommendHint: '실리에 단단한 토 기운',
    reasonLabel: '배우자 자리 (재성) 일치', reasonWeight: '+3',
    faceLine: '단단한 골격, 안정감 있는 인상',
    matchZodiacs: '소·양띠와 결이 맞아요',
    monthLine: '환절기 (3·6·9·12월)',
  },
  {
    birth: '1999 / 11 / 17',
    ilgan: '계', ilganHg: '癸', ilganOh: '수', zodiacEmoji: '🐰', zodiacLabel: '토끼띠',
    score: '6.8', recommend: '목', recommendHint: '곧게 자라는 목 기운',
    reasonLabel: '부족한 목 기운 채움', reasonWeight: '+2',
    faceLine: '곧게 자란 키, 청량한 눈매',
    matchZodiacs: '호랑이·토끼띠와 결이 맞아요',
    monthLine: '1월 · 2월',
  },
  {
    birth: '2002 / 05 / 20',
    ilgan: '경', ilganHg: '庚', ilganOh: '금', zodiacEmoji: '🐴', zodiacLabel: '말띠',
    score: '6.2', recommend: '수', recommendHint: '잔잔한 수 기운',
    reasonLabel: '배우자 자리 (관성) 일치', reasonWeight: '+3',
    faceLine: '부드러운 눈매, 사려깊은 인상',
    matchZodiacs: '쥐·돼지띠와 결이 맞아요',
    monthLine: '11월 · 12월',
  },
];

function DemoPreview() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % DEMO_SAMPLES.length), 2400);
    return () => window.clearInterval(t);
  }, []);
  const s = DEMO_SAMPLES[idx];

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: 16,
        background: `linear-gradient(180deg, #ffffff 0%, ${PAPER} 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        {/* "(예시)"를 덧붙이고 화살표를 추가했다(2026-08-17, 사용자 피드백:
            "이게 실제 내 결과인지 예시인지 헷갈린다" + "화살표로 움직인다
            거나... 뭐라도 주면 좋겠는데" — 자동 순환 2.4초 간격만으로는
            직접 넘겨보고 싶어도 방법이 없었다). */}
        <div className="flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND, animation: 'demo-pulse 1.6s ease-in-out infinite' }} aria-hidden />
          <span style={{ fontSize: 10, color: BRAND, fontWeight: 700, letterSpacing: '0.1em' }}>
            이렇게 나와요 (예시)
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 4 }}>
          <button
            type="button"
            aria-label="이전 예시"
            onClick={() => setIdx((i) => (i - 1 + DEMO_SAMPLES.length) % DEMO_SAMPLES.length)}
            style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span style={{ fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{idx + 1}/{DEMO_SAMPLES.length}</span>
          <button
            type="button"
            aria-label="다음 예시"
            onClick={() => setIdx((i) => (i + 1) % DEMO_SAMPLES.length)}
            style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 13,
          color: '#374151',
          marginBottom: 10,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.005em',
        }}
      >
        <span key={`b-${idx}`} style={{ animation: 'demo-fade 2.4s ease-in-out infinite' }}>
          {s.birth}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2.5">
        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em' }}>내 결</span>
        <span
          key={`me-${idx}`}
          style={{
            fontSize: 11.5, fontWeight: 800, color: '#fff',
            background: ELEMENT_HEX[s.ilganOh],
            padding: '3px 8px', borderRadius: 999,
            fontFamily: '"Noto Serif KR", serif',
            animation: 'demo-fade 2.4s ease-in-out infinite',
          }}
        >
          {s.ilganHg}·{s.ilganOh}
        </span>
        <span key={`z-${idx}`} style={{ fontSize: 11, color: '#6b7280', animation: 'demo-fade 2.4s ease-in-out infinite' }}>
          {s.zodiacEmoji} {s.zodiacLabel}
        </span>
      </div>

      <div
        style={{
          background: '#FDFAF5',
          border: `1px solid ${LINE}`,
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 8,
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>적합도</span>
          <span
            key={`sc-${idx}`}
            style={{
              fontSize: 17, fontWeight: 800, color: BRAND,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              animation: 'demo-rise 2.4s ease-in-out infinite',
            }}
          >
            {s.score}<span style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 500 }}> /10</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            key={`r-${idx}`}
            style={{
              width: 20, height: 20, borderRadius: 5,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 800, color: '#fff',
              background: ELEMENT_HEX[s.recommend],
              animation: 'demo-fade 2.4s ease-in-out infinite',
            }}
          >
            {s.recommend}
          </span>
          <span
            key={`rh-${idx}`}
            style={{ fontSize: 11, color: '#374151', fontWeight: 500, animation: 'demo-fade 2.4s ease-in-out infinite', wordBreak: 'keep-all' }}
          >
            추천 일간 · {s.recommendHint}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 5 }}>
          끌리는 결
        </p>
        <span
          key={`reason-${idx}`}
          style={{
            fontSize: 11, color: '#4b5563', fontWeight: 500,
            background: '#fff', border: '1px solid #e5e7eb',
            padding: '3px 9px', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            animation: 'demo-fade 2.4s ease-in-out infinite',
          }}
        >
          {s.reasonLabel}
          <span style={{ color: BRAND, fontWeight: 700 }}>{s.reasonWeight}</span>
        </span>
      </div>

      <div className="flex flex-col gap-1 mb-2" style={{ paddingTop: 6, borderTop: '1px solid #f1f3f5' }}>
        {[
          { icon: <IconFace color={BRAND} />, label: '외모', value: s.faceLine },
          { icon: <IconZodiac color={BRAND} />, label: '추천 띠', value: s.matchZodiacs },
          { icon: <IconCalendar color={BRAND} />, label: '추천 생월', value: s.monthLine },
        ].map((m) => (
          <div
            key={`${m.label}-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 10.5,
              color: '#6b7280',
              animation: 'demo-fade 2.4s ease-in-out infinite',
              wordBreak: 'keep-all',
            }}
          >
            <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.8 }} aria-hidden>{m.icon}</span>
            <span style={{ fontWeight: 700, color: '#374151', flexShrink: 0 }}>{m.label}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
        위에 <strong style={{ color: BRAND }}>내 생일</strong>을 넣으면<br />진짜 내 결과를 풀어드려요
      </p>

      <style>{`
        @keyframes demo-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes demo-fade {
          0%, 100% { opacity: 0; transform: translateY(2px); }
          18%, 82% { opacity: 1; transform: translateY(0); }
        }
        @keyframes demo-rise {
          0% { opacity: 0; transform: translateY(4px); }
          18%, 82% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function yearToZodiac(year: number): Zodiac | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2050) return null;
  const idx = ((year - 4) % 12 + 12) % 12;
  return ZODIACS[idx].id;
}

export function SajuMiniRail() {
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  // 기본으로 하나 펼쳐두던 걸(첫 로드부터 '외모' 상세가 열려 있었음) 다 닫힌
  // 상태로 바꿨다(2026-08-17, 사용자 피드백: "사주 부분 결과값이 너무
  // 길어서 사이드바 아닌 곳 하단까지 내려가야 보인다" — 사이드바가 sticky
  // 라 본문 칼럼보다 길어지면 그만큼 페이지 아래로 삐져나온다. 펼침 카드
  // 하나가 꽤 큰 비중을 차지해 기본을 접어두는 것만으로 눈에 띄게 짧아짐).
  const [openModule, setOpenModule] = useState<'face' | 'trait' | 'zodiac' | null>(null);

  const birthYear = birth.length >= 4 ? parseInt(birth.slice(0, 4)) : NaN;
  const birthMonth = birth.length >= 6 ? parseInt(birth.slice(4, 6)) : NaN;
  const birthDay = birth.length >= 8 ? parseInt(birth.slice(6, 8)) : NaN;
  const hasYear = !Number.isNaN(birthYear) && birthYear >= 1900 && birthYear <= 2050;
  const hasFullDate =
    hasYear &&
    !Number.isNaN(birthMonth) && birthMonth >= 1 && birthMonth <= 12 &&
    !Number.isNaN(birthDay) && birthDay >= 1 && birthDay <= 31;

  const zodiacFromYear: Zodiac | null = hasYear ? yearToZodiac(birthYear) : null;
  const fullSaju = useMemo(() => {
    if (!hasFullDate) return null;
    try {
      const s = calculateSaju(birthYear, birthMonth, birthDay, undefined, 0, {});
      const ilgan = (s.dayPillarHanja ?? '').charAt(0);
      const ilganHg = (s.dayPillar ?? '').charAt(0);
      const ilganOh = (CG_OH[ilgan] ?? '금') as Element;
      return { ilganHg, ilgan, ilganOh };
    } catch {
      return null;
    }
  }, [hasFullDate, birthYear, birthMonth, birthDay]);

  const baseElement: Element | null =
    fullSaju?.ilganOh ?? (zodiacFromYear ? ZODIACS.find((z) => z.id === zodiacFromYear)?.element ?? null : null);

  const zMeta = zodiacFromYear ? ZODIACS.find((z) => z.id === zodiacFromYear) : null;
  const pair = baseElement ? ELEMENT_PAIR[baseElement] : null;
  const score = zodiacFromYear ? computePreviewScore(zodiacFromYear, gender).toFixed(1) : '—';
  const reasons = baseElement ? buildReasons(baseElement, gender) : null;

  const handleBirthChange = (val: string) => {
    const next = val.replace(/[^0-9]/g, '').slice(0, 8);
    setBirth(next);
    if (next.length === 8 && birth.length !== 8) {
      trackEvent('compat_input', { surface: 'sidebar', gender });
    }
  };
  const birthFormatted =
    birth.length >= 5
      ? `${birth.slice(0, 4)} / ${birth.slice(4, 6)}${birth.length >= 7 ? ` / ${birth.slice(6)}` : ''}`
      : birth;

  return (
    <section>
      <header className="mb-1 flex items-center" style={{ gap: 8 }}>
        {/* 실제 사주 서비스(2_ailens/dev2/saju/frontend/public/saju_mascot.png)
            마스코트 일러스트를 그대로 재사용(2026-08-17, 사용자 요청: "이미지나
            그런것들이나... 재활용 하거나 할수 없나") — 폰트(Pretendard)는 이미
            두 서비스가 같은 걸 쓰고 있어 손댈 게 없었고, 컴포넌트는 완전히
            분리된 별개 Next.js 앱(레포)이라 진짜 재사용은 불가능해 색만
            맞춰 다시 구현했지만, 이 마스코트 이미지 한 장은 정적 에셋이라
            그대로 복사해 브랜드 연속성을 준다. */}
        <Image src="/saju-mascot.png" alt="" width={28} height={28} style={{ flexShrink: 0 }} />
        <h3
          className="font-medium text-gray-900"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, letterSpacing: '-0.015em' }}
        >
          나의 이상형, 사주로 풀어보면
        </h3>
      </header>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, lineHeight: 1.6 }}>
        생일을 넣으면 내 결과 잘 맞는 결이 보여요.
      </p>

      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          inputMode="numeric"
          value={birthFormatted}
          onChange={(e) => handleBirthChange(e.target.value)}
          placeholder="1990 / 01 / 15"
          className="w-full focus:outline-none transition-colors"
          style={{
            fontSize: 14,
            padding: '10px 12px',
            border: `1px solid ${LINE}`,
            borderRadius: 10,
            background: '#fff',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.005em',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = BRAND; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([['male', '남자'], ['female', '여자']] as const).map(([key, label]) => {
          const on = key === gender;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setGender(key)}
              style={{
                flex: 1,
                appearance: 'none',
                cursor: 'pointer',
                padding: '8px 0',
                fontSize: 12.5,
                fontWeight: on ? 700 : 500,
                color: on ? '#fff' : '#6b7280',
                background: on ? BRAND_SOFT : '#f4f4f5',
                border: 'none',
                borderRadius: 8,
                transition: 'background .15s, color .15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {!hasYear || !pair ? (
        <DemoPreview />
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, background: PAPER }}>
          <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
            내 결
          </p>
          <div className="flex items-center gap-2 mb-4">
            {fullSaju && (
              <span
                style={{
                  fontSize: 13, fontWeight: 800, color: '#fff',
                  background: ELEMENT_HEX[fullSaju.ilganOh],
                  padding: '4px 10px', borderRadius: 999,
                  fontFamily: '"Noto Serif KR", serif',
                }}
                title={`일간 ${fullSaju.ilganHg}(${fullSaju.ilgan})`}
              >
                {fullSaju.ilgan} · {fullSaju.ilganOh}
              </span>
            )}
            {zMeta && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                {zMeta.emoji} {zMeta.label}띠
              </span>
            )}
            {!hasFullDate && hasYear && (
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                월·일 더 넣으면 일간까지
              </span>
            )}
          </div>

          <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
            잘 맞는 결
          </p>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, background: '#FDFAF5' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 11.5, color: '#374151', fontWeight: 600 }}>적합도</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: BRAND, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {score}<span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}> /10</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff',
                  background: ELEMENT_HEX[pair.recommendElement],
                }}
              >
                {pair.recommendElement}
              </span>
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                추천 일간 · {pair.recommendHint}
              </span>
            </div>
          </div>

          {reasons && (
            <>
              <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
                끌리는 결
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                <span
                  style={{
                    fontSize: 11.5, color: '#4b5563', fontWeight: 500,
                    background: '#fff', border: '1px solid #e5e7eb',
                    padding: '4px 10px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {reasons[0].label}
                  <span style={{ color: BRAND, fontWeight: 700 }}>{reasons[0].weight}</span>
                </span>
                <span
                  style={{
                    fontSize: 11.5, color: '#9ca3af', fontWeight: 500,
                    background: '#f7f8f9', border: '1px dashed #e5e7eb',
                    padding: '4px 10px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                  {reasons[1].label}
                </span>
              </div>
            </>
          )}

          <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
            풀이 미리보기
          </p>
          {/* 4개 → 3개로 줄였다("추천 생월" 제거) — 사이드바가 sticky라
              본문 칼럼보다 세로로 길어지면 페이지 아래로 삐져나온다는
              피드백(2026-08-17, "결과값이 너무 길어서 사이드바 아닌 곳
              하단까지 내려가야 보인다")에 대응한 두 번째 트림. 남은
              3개(외모·성향·추천 띠)가 궁합 미리보기의 핵심에 더 가깝다고
              판단. */}
          <div className="flex flex-col gap-1.5 mb-5">
            {(() => {
              const preview = MODULE_PREVIEW[pair.recommendElement];
              const ink = BRAND;
              const modules: { id: 'face' | 'trait' | 'zodiac'; label: string; preview: string; detail: string; Icon: ({ color }: { color: string }) => React.ReactElement }[] = [
                { id: 'face', label: '외모·분위기', preview: preview.face, detail: '첫인상의 결, 눈빛과 이목구비의 흐름, 자세 톤까지 짚어드려요.', Icon: IconFace },
                { id: 'trait', label: '성향·언어', preview: preview.trait, detail: '말투의 결, 갈등을 풀어가는 방식, 함께 있을 때의 호흡까지 짚어드려요.', Icon: IconBrush },
                { id: 'zodiac', label: '추천 띠', preview: `${preview.zodiacs.join('·')}띠와 결이 맞아요`, detail: '삼합·육합·반합 — 띠 차원의 궁합 구조를 짚어드려요.', Icon: IconZodiac },
              ];
              return modules.map((m) => {
                const open = openModule === m.id;
                return (
                  <div
                    key={m.id}
                    style={{ border: '1px solid #ececec', borderRadius: 12, background: open ? '#FDFAF5' : '#fff', overflow: 'hidden', transition: 'background .15s' }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenModule(open ? null : m.id)}
                      className="w-full text-left"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                      aria-expanded={open}
                    >
                      <span
                        style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${ink}14`, flexShrink: 0 }}
                        aria-hidden
                      >
                        <m.Icon color={ink} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{m.label}</p>
                        <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.45, marginTop: 2, wordBreak: 'keep-all' }}>
                          {m.preview}
                        </p>
                      </div>
                      <IconChevron open={open} />
                    </button>
                    {open && (
                      <div
                        style={{ margin: '0 12px 12px', padding: '10px 12px', background: '#fff', border: '1px solid #ececec', borderRadius: 10, fontSize: 12, color: '#4b5563', lineHeight: 1.65, letterSpacing: '-0.005em', wordBreak: 'keep-all' }}
                      >
                        <p style={{ margin: 0 }}>{m.detail}</p>
                        <a
                          href="/saju/compatibility"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11.5, fontWeight: 700, color: ink, textDecoration: 'none' }}
                        >
                          풀이에서 자세히
                          <span aria-hidden>→</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          <a
            href="/saju/compatibility"
            style={{
              display: 'block',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              textDecoration: 'none',
              background: BRAND_SOFT,
              padding: '11px 0',
              borderRadius: 999,
              boxShadow: '0 8px 24px -10px rgba(5,150,105,0.45)',
            }}
          >
            내 짝꿍 풀어보기 →
          </a>
        </div>
      )}

      {/* 짝꿍 궁합 말고도 오늘의 운세·총운도 궁금할 수 있다는 피드백
          (2026-08-17, "총운.. 오늘의 운세.. 그런것도 볼 수 있을텐데") —
          각각을 이 사이드바 안에서 다시 계산해 보여주진 않는다(별도 앱의
          엔진을 가져와야 해서 범위가 커진다). 대신 실제 서비스의 해당
          페이지로 바로 가는 링크만 가볍게 추가. 처음엔 실제 결과(생일
          입력 후) 카드 안에만 넣었는데, 그러면 아직 생일을 안 넣어 데모
          미리보기만 보고 있는 사람 눈에는 이 링크가 아예 안 보였다 —
          위 ternary 밖으로 빼서 데모/실제 결과 어느 쪽이든 항상 보이게
          했다. */}
      <div className="flex items-center justify-center" style={{ gap: 14, marginTop: 12 }}>
        <a href="/saju/today" style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', textDecoration: 'none' }}>
          오늘의 운세
        </a>
        <span style={{ width: 1, height: 10, background: '#e5e7eb' }} aria-hidden />
        <a href="/saju/chaeun" style={{ fontSize: 11.5, fontWeight: 600, color: '#9ca3af', textDecoration: 'none' }}>
          총운 보기
        </a>
      </div>
    </section>
  );
}
