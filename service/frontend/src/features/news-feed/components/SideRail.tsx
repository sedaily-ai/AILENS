'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { calculateSaju, CG_OH } from '@/entities/saju';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

// 사주 × 짝꿍 미리보기 — 띠 × 성별 조합으로 살짝만 보여주고 진짜 풀이는 /saju/compatibility
// (진짜 사주 서비스, CloudFront /saju* 마운트)로 유도. 자체 미니 페이지였던
// /saju-match는 2026-08-09 제거 — 딱 같은 기능(상대 없이 내게 맞는 사주)을
// 실제 서비스가 이미 갖고 있어서 그쪽으로 넘긴다.
// 실제 풀이는 사용자 사주 기반 — 여기는 띠 오행 + 성별로 4명 에디터 중 매칭 + 점수 generate.
type Zodiac =
  | 'rat' | 'ox' | 'tiger' | 'rabbit' | 'dragon' | 'snake'
  | 'horse' | 'goat' | 'monkey' | 'rooster' | 'dog' | 'pig';

type Gender = 'male' | 'female';
type Element = '목' | '화' | '토' | '금' | '수';

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

// 오행 → 보완/추천 짝꿍 일간 + 매칭 에디터
// 사주 풀이 톤을 따르되 정밀하지 않은 미리보기(진짜 풀이는 사주 입력 필요)
const ELEMENT_PAIR: Record<Element, {
  recommendElement: Element;
  recommendHint: string;          // "환한 태양형 화 기운"
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

// 띠 + 성별 → 결정적(deterministic) 점수 산출
// 6.0~7.7 범위. 실제 매칭 엔진 결과처럼 차이는 있지만 미리보기라 정밀하지 않다는 점 사용자 안내.
function computePreviewScore(zodiac: Zodiac, gender: Gender): number {
  const idx = ZODIACS.findIndex((z) => z.id === zodiac);
  const base = 60 + ((idx * 7 + (gender === 'female' ? 3 : 0)) % 18);
  return base / 10;
}

// 띠 + 성별 → 사유 칩 (2개)
function buildReasons(element: Element, _gender: Gender): { label: string; weight: string }[] {
  const r1 = { label: `부족한 ${ELEMENT_PAIR[element].recommendElement} 기운 채움`, weight: '+2' };
  const r2 = { label: _gender === 'male' ? '배우자 자리 (재성) 일치' : '배우자 자리 (관성) 일치', weight: '+3' };
  return [r1, r2];
}

// 모듈별 미리보기 — 한 줄씩 살짝 보여주고 본 풀이에서 깊이 있게.
const MODULE_PREVIEW: Record<Element, { face: string; trait: string; zodiacs: string[]; months: string[] }> = {
  목: {
    face: '곧게 자란 키, 청량한 눈매와 또렷한 눈썹',
    trait: '성장과 새 시도를 즐기는 결',
    zodiacs: ['호랑이', '토끼'],
    months: ['1월', '2월'],
  },
  화: {
    face: '환한 인상, 또렷한 이목구비, 화사한 눈빛',
    trait: '솔직하고 표현이 분명한 결',
    zodiacs: ['뱀', '말'],
    months: ['4월', '5월'],
  },
  토: {
    face: '단단한 골격, 후덕하고 안정감 있는 인상',
    trait: '꾸준하고 신뢰가 두꺼운 결',
    zodiacs: ['소', '양'],
    months: ['환절기 (3·6·9·12월)'],
  },
  금: {
    face: '또렷한 윤곽, 단정하고 차분한 분위기',
    trait: '결단이 또렷하고 원칙이 단단한 결',
    zodiacs: ['원숭이', '닭'],
    months: ['7월', '8월'],
  },
  수: {
    face: '부드러운 눈매, 깊고 사려깊은 인상',
    trait: '깊이 생각하고 안목이 차분한 결',
    zodiacs: ['쥐', '돼지'],
    months: ['11월', '12월'],
  },
};

// 사주 장인 톤 라인 SVG — 디자이너가 그린 듯한 절제된 stroke
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

// 빈 상태 데모 — 토스 스타일 모션 미리보기. 입력 안 한 사용자를 위해
// 자동으로 사례를 사이클링하며 "이렇게 나와요" 시각화.
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
        border: '1px solid #ececec',
        borderRadius: 16,
        padding: 16,
        background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 데모 라벨 + 점멸 점 */}
      <div className="flex items-center gap-1.5 mb-3">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3182F6', animation: 'demo-pulse 1.6s ease-in-out infinite' }} aria-hidden />
        <span style={{ fontSize: 10, color: '#3182F6', fontWeight: 700, letterSpacing: '0.1em' }}>
          이렇게 나와요
        </span>
      </div>

      {/* 가상 입력 — 타이핑 톤 */}
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

      {/* 결 변환 → "내 결" 작은 칩 */}
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

      {/* 적합도 + 추천 */}
      <div
        style={{
          background: '#fafbfc',
          border: '1px solid #eef0f3',
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
              fontSize: 17, fontWeight: 800, color: '#3182F6',
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

      {/* 끌리는 결 — 칩 한 개 */}
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
          <span style={{ color: '#3182F6', fontWeight: 700 }}>{s.reasonWeight}</span>
        </span>
      </div>

      {/* 모듈 미니 라인 — 외모·추천띠·추천생월 살짝 */}
      <div className="flex flex-col gap-1 mb-2" style={{ paddingTop: 6, borderTop: '1px solid #f1f3f5' }}>
        {[
          { icon: <IconFace color="#3182F6" />, label: '외모', value: s.faceLine },
          { icon: <IconZodiac color="#3182F6" />, label: '추천 띠', value: s.matchZodiacs },
          { icon: <IconCalendar color="#3182F6" />, label: '추천 생월', value: s.monthLine },
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
        위에 <strong style={{ color: '#3182F6' }}>내 생일</strong>을 넣으면<br />진짜 내 결과를 풀어드려요
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

// 출생년 → 띠. 1924년이 쥐띠라는 기준점. ((year - 4) mod 12) 가 0 → 쥐, 1 → 소, ...
function yearToZodiac(year: number): Zodiac | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2050) return null;
  const idx = ((year - 4) % 12 + 12) % 12;
  return ZODIACS[idx].id;
}

// 띠 → 대표 출생년 3개 (사용자가 자기 띠 알 수 있게 hint)
function recentBirthYears(zodiac: Zodiac): number[] {
  const baseIdx = ZODIACS.findIndex((z) => z.id === zodiac);
  // 1924 = rat(0). zodiac index n 의 해당년 = 1924 + n + 12k
  const years: number[] = [];
  for (let k = 5; k <= 8; k++) {
    const y = 1924 + baseIdx + 12 * k;
    if (y >= 1980 && y <= 2030) years.push(y);
  }
  return years.slice(-3); // 최근 3개
}

const HOT_LETTERS_LIMIT = 5;

export function SideRail({
  selectedGroup: _selectedGroup,
  initialHotLetters,
}: {
  selectedGroup?: MbtiGroupId;
  // 서버 프리페치(2026-08-23) — HomeSideBar/HotLettersRail과 같은 이유.
  // 없으면 이 컴포넌트를 쓰는 모든 페이지(letters 상세 등)에서 "요즘
  // 가장 많이 읽힌 글"이 클라이언트 fetch가 끝날 때까지 안 보여서
  // 실사용자가 "느리게 나타난다"고 느낀다(사용자가 프로덕션에서 직접
  // 발견, "모든 부분 마찬가지"). 호출부가 안 넘기면 기존과 동일하게
  // 빈 배열로 시작(하위 호환).
  initialHotLetters?: TodayLetterCardLike[];
}) {
  // 2026-08-10 — "요즘 가장 많이 읽힌 글"의 데이터 소스를 useLatestLetters
  // (하루치 전체 레터, 개수 상한 없음)에서 fetchFollowingLetters(=홈
  // "이슈 톡톡"과 같은 분류: 실제 에디터 이름으로 태깅된 레터만)로 교체.
  // 상한도 5개로 맞춤(fetchFollowingLetters 두 번째 인자, todayLettersApi.ts
  // 참조 — 홈 "이슈 톡톡" 자체는 4개 그대로 두고 사이드바만 5개). 2026-08-12,
  // 이슈 톡톡 전체 삭제로 잠깐 useLatestLetters로 되돌렸다가 같은 날 이슈
  // 톡톡이 다시 부활하면서 이 원래 로직도 함께 복귀.
  const [hotLetters, setHotLetters] = useState<TodayLetterCardLike[]>(initialHotLetters ?? []);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingLetters(HOT_LETTERS_LIMIT).then((cards) => {
      if (!cancelled) setHotLetters(cards);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // 생년월일 통합 입력 — YYYYMMDD 8자리. 4자리 (연) 만 입력해도 띠 매핑 동작.
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [openModule, setOpenModule] = useState<'face' | 'trait' | 'zodiac' | 'month' | null>('face');

  const birthYear = birth.length >= 4 ? parseInt(birth.slice(0, 4)) : NaN;
  const birthMonth = birth.length >= 6 ? parseInt(birth.slice(4, 6)) : NaN;
  const birthDay = birth.length >= 8 ? parseInt(birth.slice(6, 8)) : NaN;
  const hasYear = !Number.isNaN(birthYear) && birthYear >= 1900 && birthYear <= 2050;
  const hasFullDate =
    hasYear &&
    !Number.isNaN(birthMonth) && birthMonth >= 1 && birthMonth <= 12 &&
    !Number.isNaN(birthDay) && birthDay >= 1 && birthDay <= 31;

  // 띠 — 출생년 기반 (즉시 매핑) / 풀 사주 — 8자리 완성 시 engine 호출
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

  // 미리보기 베이스 — 풀 사주가 있으면 일간 오행, 없으면 띠 오행에서 도출
  const baseElement: Element | null =
    fullSaju?.ilganOh ?? (zodiacFromYear ? ZODIACS.find((z) => z.id === zodiacFromYear)?.element ?? null : null);

  const zMeta = zodiacFromYear ? ZODIACS.find((z) => z.id === zodiacFromYear) : null;
  const pair = baseElement ? ELEMENT_PAIR[baseElement] : null;
  const score = zodiacFromYear ? computePreviewScore(zodiacFromYear, gender).toFixed(1) : '—';
  const reasons = baseElement ? buildReasons(baseElement, gender) : null;

  const handleBirthChange = (val: string) => {
    const next = val.replace(/[^0-9]/g, '').slice(0, 8);
    setBirth(next);
    // 8자리 완성 시 한 번 발송 — 이전이 8자리가 아니었을 때만 (편집 매번 트리거 방지)
    if (next.length === 8 && birth.length !== 8) {
      trackEvent('compat_input', { surface: 'sidebar', gender });
    }
  };
  const birthFormatted =
    birth.length >= 5
      ? `${birth.slice(0, 4)} / ${birth.slice(4, 6)}${birth.length >= 7 ? ` / ${birth.slice(6)}` : ''}`
      : birth;

  return (
    <aside
      className="lg:sticky lg:top-20 lg:self-start lg:border-l lg:border-gray-100 lg:pl-8 lg:pt-0 lg:border-t-0 lg:mt-0 border-t border-gray-100 mt-12 pt-8"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 36,
      }}
    >
      {/* 요즘 핫한 글 */}
      <section>
        <header className="flex items-baseline justify-between mb-3">
          <h3
            className="font-medium text-gray-900"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 15,
              letterSpacing: '-0.015em',
            }}
          >
            요즘 가장 많이 읽힌 글
          </h3>
          <Link
            href="/?tab=archive"
            className="text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 11.5, fontWeight: 500 }}
          >
            전체 →
          </Link>
        </header>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {hotLetters.map((l, idx) => (
            <li key={l.letterId}>
              <Link
                href={letterHref(l.letterId)}
                className="group flex items-start transition-opacity"
                style={{
                  gap: 12,
                  padding: '12px 0',
                  borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                  textDecoration: 'none',
                }}
              >
                <span
                  className="flex-shrink-0"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#9ca3af',
                    letterSpacing: '-0.02em',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 22,
                    lineHeight: 1.1,
                  }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>
                {/* 썸네일 추가(2026-08-10) — 텍스트뿐이던 행에 이슈 톡톡 카드와
                    같은 이미지를 붙여 시각적 밀도를 맞췄다. CMS 지정 썸네일 >
                    기본 아바타 폴백(FollowingFeed.tsx와 동일 패턴). */}
                <span
                  className="flex-shrink-0"
                  style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}
                >
                  <Image
                    src={l.thumbnailUrl ?? l.editorAvatar}
                    alt=""
                    width={40}
                    height={40}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  {/* 작가/역할 라벨(archetype) 제거(2026-08-10) — 다른 섹션들과
                      같은 원칙("모든 카테고리가 같은 조건"으로 제목만 표출,
                      2026-08-09 archiveItems.ts 등 참조)으로 통일. */}
                  <p
                    className="text-gray-900 font-medium group-hover:opacity-70 transition-opacity"
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 13,
                      lineHeight: 1.45,
                      letterSpacing: '-0.015em',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {l.title}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* 나의 결 × 짝꿍 미리보기 — 생일 + 성별 → 살짝만 보고 본 풀이는 /saju/compatibility */}
      <section>
        <header className="mb-1">
          <h3
            className="font-medium text-gray-900"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 15,
              letterSpacing: '-0.015em',
            }}
          >
            나의 이상형, 사주로 풀어보면
          </h3>
        </header>
        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, lineHeight: 1.6 }}>
          생일을 넣으면 내 결과 잘 맞는 결이 보여요.
        </p>

        {/* 생년월일 입력 */}
        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            inputMode="numeric"
            value={birthFormatted}
            onChange={(e) => handleBirthChange(e.target.value)}
            placeholder="1990 / 01 / 15"
            className="w-full focus:outline-none focus:border-blue-500 transition-colors"
            style={{
              fontSize: 14,
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              background: '#fff',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.005em',
            }}
          />
        </div>

        {/* 성별 toggle */}
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
                  background: on ? '#3182F6' : '#f4f4f5',
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

        {/* 미리보기 — 입력 전: Toss 톤 데모 사이클, 입력 후: 실제 결과 카드 */}
        {!hasYear || !pair ? (
          <DemoPreview />
        ) : (
          <div
            style={{
              border: '1px solid #ececec',
              borderRadius: 16,
              padding: 18,
              background: '#fff',
            }}
          >
            {/* 내 결 요약 — 일간 오행 + 띠 */}
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

            {/* 잘 맞는 결 — score + 추천 일간 */}
            <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
              잘 맞는 결
            </p>
            <div
              style={{
                border: '1px solid #eef0f3',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 14,
                background: '#fafbfc',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 11.5, color: '#374151', fontWeight: 600 }}>
                  적합도
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#3182F6', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
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

            {/* 끌리는 결 — 1개 명확 + 1개 마스킹 + 더보기 */}
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
                    <span style={{ color: '#3182F6', fontWeight: 700 }}>{reasons[0].weight}</span>
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

            {/* 모듈별 미리보기 — 한 줄 살짝 + 펼치면 더 자세히, 전체는 풀이에서 */}
            <p style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>
              풀이 미리보기
            </p>
            <div className="flex flex-col gap-1.5 mb-5">
              {(() => {
                const preview = MODULE_PREVIEW[pair.recommendElement];
                const ink = ELEMENT_HEX[pair.recommendElement];
                const modules: { id: 'face' | 'trait' | 'zodiac' | 'month'; label: string; preview: string; detail: string; Icon: ({ color }: { color: string }) => React.ReactElement }[] = [
                  { id: 'face', label: '외모·분위기', preview: preview.face, detail: '첫인상의 결, 눈빛과 이목구비의 흐름, 자세 톤까지 짚어드려요.', Icon: IconFace },
                  { id: 'trait', label: '성향·언어', preview: preview.trait, detail: '말투의 결, 갈등을 풀어가는 방식, 함께 있을 때의 호흡까지 짚어드려요.', Icon: IconBrush },
                  { id: 'zodiac', label: '추천 띠', preview: `${preview.zodiacs.join('·')}띠와 결이 맞아요`, detail: '삼합·육합·반합 — 띠 차원의 궁합 구조를 짚어드려요.', Icon: IconZodiac },
                  { id: 'month', label: '추천 생월', preview: preview.months.join(' · '), detail: '계절·절기 기운으로 본 가장 잘 맞는 출생월을 알려드려요.', Icon: IconCalendar },
                ];
                return modules.map((m) => {
                  const open = openModule === m.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        border: '1px solid #ececec',
                        borderRadius: 12,
                        background: open ? '#fafbfc' : '#fff',
                        overflow: 'hidden',
                        transition: 'background .15s',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenModule(open ? null : m.id)}
                        className="w-full text-left"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        aria-expanded={open}
                      >
                        <span
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: `${ink}14`,
                            flexShrink: 0,
                          }}
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
                          style={{
                            margin: '0 12px 12px',
                            padding: '10px 12px',
                            background: '#fff',
                            border: '1px solid #ececec',
                            borderRadius: 10,
                            fontSize: 12,
                            color: '#4b5563',
                            lineHeight: 1.65,
                            letterSpacing: '-0.005em',
                            wordBreak: 'keep-all',
                          }}
                        >
                          <p style={{ margin: 0 }}>{m.detail}</p>
                          {/* /saju/*는 다른 Next.js 앱(zone)으로 rewrite되는
                              경로라 일반 <a>로 하드 내비게이션(headerTabs.ts 참조) */}
                          <a
                            href="/saju/compatibility"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              marginTop: 8,
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: ink,
                              textDecoration: 'none',
                            }}
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
                background: '#3182F6',
                padding: '11px 0',
                borderRadius: 999,
                boxShadow: '0 8px 24px -10px rgba(49,130,246,0.45)',
              }}
            >
              내 짝꿍 풀어보기 →
            </a>
          </div>
        )}
      </section>
    </aside>
  );
}
