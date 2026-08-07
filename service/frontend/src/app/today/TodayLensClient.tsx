'use client';

import { useState } from 'react';
import Link from 'next/link';

type Persona = 'NT' | 'NF' | 'ST' | 'SF';
type Perspective = 'persona' | 'expert' | 'global' | 'reader' | 'opposite';

const PERSONAS: Record<Persona, { name: string; role: string; nickname: string; avatar: string; ink: string; soft: string; pill: string }> = {
  NT: { name: '민철', role: '한 걸음 더 파고들기', nickname: '분석가', avatar: '/editors/intj.webp', ink: '#5b21b6', soft: '#f5f3ff', pill: '#ede9fe' },
  NF: { name: '하은', role: '내 생각은 이래요', nickname: '이야기꾼', avatar: '/editors/infp.webp', ink: '#9f1239', soft: '#fff1f2', pill: '#ffe4e6' },
  ST: { name: '준서', role: '팩트만 딱딱 정리', nickname: '실용주의자', avatar: '/editors/istj.webp', ink: '#065f46', soft: '#ecfdf5', pill: '#d1fae5' },
  SF: { name: '소율', role: '가볍게 짚어주는 트렌드', nickname: '공감러', avatar: '/editors/esfp.webp', ink: '#92400e', soft: '#fffbeb', pill: '#fef3c7' },
};

// 사주 + MBTI 기반 mock 프로필
const USER_PROFILE = {
  name: '문영광',
  ilgan: '계수',
  ilganHanja: '癸',
  gyeokguk: '정인격',
  recommendedPersona: 'NT' as Persona,
  recommendReason: '깊이 있는 분석을 좋아하는 정인격에게는 민철의 전략적 시선이 잘 맞아요.',
  weekStats: { read: 28, saved: 12, streak: 5 },
  topCategories: ['거시경제', 'IT·산업', '정책'],
  weekComment: '정인격다운 한 주였어요. 분석·해석 영역 중심으로 읽으셨네요.',
};

const TODAYS_PICK = {
  category: '경제',
  title: '반도체 전쟁, 삼성의 반격이 시작됐다',
  subtitle: 'HBM3E 양산 시작 — SK하이닉스 독점 구도에 균열',
  excerpt:
    'SK하이닉스에 밀렸다는 평가를 받던 삼성전자가 드디어 반격에 나섰습니다. HBM3E 양산이라는 한 줄의 뉴스는 단순한 제품 출시가 아닌, 한국 반도체 생태계 전체의 구조 변화를 의미합니다.',
  readingTime: '4분',
};

// 다중 시선 mock
const PERSPECTIVES: Record<Perspective, { label: string; icon: string; ink: string; tint: string; quote: string; source: string }> = {
  persona: {
    label: '민철의 시선',
    icon: '🧠',
    ink: '#5b21b6',
    tint: '#f5f3ff',
    quote:
      '변수 셋을 봅니다. 첫째, SK하이닉스 단독 공급 깨짐. 둘째, 엔비디아 차세대 GPU 공급망 진입. 셋째, 점유율 30% 목표. 메모리 사이클 변곡점입니다.',
    source: 'AI 에디터 · 분석가',
  },
  expert: {
    label: '전문가의 시선',
    icon: '🎓',
    ink: '#0369a1',
    tint: '#f0f9ff',
    quote:
      '"HBM4 세대 진입이 진짜 시험대. 이번 양산은 회복의 시작일 뿐, 점유율 30% 회복은 2026년 하반기에야 윤곽이 잡힐 것."',
    source: '김OO 반도체 애널리스트',
  },
  global: {
    label: '해외 매체의 시선',
    icon: '🌏',
    ink: '#854d0e',
    tint: '#fefce8',
    quote:
      '"Samsung\'s HBM3E breakthrough signals end of SK Hynix\'s monopoly era — but TSMC\'s 2nm timeline still favors the underdog."',
    source: 'Bloomberg · 2026.05.10',
  },
  reader: {
    label: '독자들의 시선',
    icon: '💬',
    ink: '#0f766e',
    tint: '#f0fdfa',
    quote:
      '"드디어... 1년 만의 소식이네요. 주주로서 안도하지만 점유율 30%는 너무 야심차 보입니다." — 커뮤니티 23명 공감',
    source: 'AI LENS 커뮤니티',
  },
  opposite: {
    label: '반대 입장의 시선',
    icon: '🪞',
    ink: '#b91c1c',
    tint: '#fef2f2',
    quote:
      '"양산 시작은 의미 있지만, 이미 SK가 HBM4 샘플을 빅테크에 보낸 상태. 한 세대 늦은 추격으로는 점유율 역전 어려울 것."',
    source: 'OO경제연구원 리포트',
  },
};

const SECONDARY_ARTICLES = [
  { category: '국제', title: '미국 기준금리 동결…파월 "인플레이션 주시"', persona: 'NT' as Persona, readingTime: '3분' },
  { category: 'IT·과학', title: "카카오, AI 챗봇 '카나나' 출시", persona: 'SF' as Persona, readingTime: '2분' },
  { category: '사회', title: '청년 주거 문제, 통계 너머의 삶', persona: 'NF' as Persona, readingTime: '5분' },
  { category: '경제', title: '이번 주 실적 발표 일정 정리', persona: 'ST' as Persona, readingTime: '2분' },
  { category: '문화', title: '주말 박스오피스 깜짝 1위의 이유', persona: 'SF' as Persona, readingTime: '3분' },
];

const POPULAR_SENTENCES = [
  { text: '시장은 짧게 말하고, 길게 듣는다.', saves: 28, persona: 'ST' as Persona },
  { text: '숫자 너머의 사람들 표정이 보였어요.', saves: 23, persona: 'NF' as Persona },
  { text: '오늘의 화제가 내일의 시장이다.', saves: 19, persona: 'SF' as Persona },
  { text: '감정은 변수에 넣지 않는다.', saves: 17, persona: 'NT' as Persona },
];

export function TodayLensClient() {
  const [perspective, setPerspective] = useState<Perspective>('persona');
  const recommendedEditor = PERSONAS[USER_PROFILE.recommendedPersona];
  const currentPerspective = PERSPECTIVES[perspective];

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      {/* 헤더 */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontSize: 17, fontWeight: 800, color: '#111827', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            AI LENS
          </Link>
          <nav style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <Link href="/today" style={{ color: '#111827', fontWeight: 700, textDecoration: 'none' }}>
              레터
            </Link>
            <Link href="/?tab=feed" style={{ color: '#6b7280', textDecoration: 'none' }}>
              뉴스피드
            </Link>
            <Link href="/?tab=archive" style={{ color: '#6b7280', textDecoration: 'none' }}>
              내 서랍
            </Link>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{USER_PROFILE.name}</span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: recommendedEditor.ink,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {USER_PROFILE.name[0]}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* ── 인사 + 오늘의 1편 ────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
            안녕하세요, {USER_PROFILE.name}님.
          </p>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: '#111827',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
              marginBottom: 24,
              fontFamily: 'Pretendard Variable, Noto Serif KR, serif',
            }}
          >
            오늘 당신에게 1편을 골랐어요
          </h1>

          {/* 오늘의 1편 — 큰 카드 */}
          <div
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 0,
              border: '1px solid #f3f4f6',
              boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 12px 32px rgba(17,24,39,0.06)',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
            }}
          >
            {/* 좌측: 이미지/일러스트 영역 */}
            <div
              style={{
                background: `linear-gradient(135deg, ${recommendedEditor.soft} 0%, #fff 50%, ${recommendedEditor.pill} 100%)`,
                padding: '40px 36px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `${recommendedEditor.ink}10`, filter: 'blur(20px)' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: recommendedEditor.ink,
                      background: '#fff',
                      padding: '4px 10px',
                      borderRadius: 9999,
                      letterSpacing: '0.06em',
                    }}
                  >
                    🎯 당신을 위한 추천
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: '#374151',
                    lineHeight: 1.7,
                    marginBottom: 24,
                    fontWeight: 500,
                  }}
                >
                  {USER_PROFILE.recommendReason}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
                <img loading="lazy"
                  src={recommendedEditor.avatar}
                  alt={recommendedEditor.name}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    boxShadow: '0 0 0 3px #fff, 0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <div>
                  <p style={{ fontSize: 11, color: recommendedEditor.ink, fontWeight: 700, marginBottom: 2 }}>
                    {recommendedEditor.role}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
                    {recommendedEditor.name} 에디터
                  </p>
                </div>
              </div>
            </div>

            {/* 우측: 기사 정보 */}
            <div style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, letterSpacing: '0.06em' }}>
                    {TODAYS_PICK.category}
                  </span>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>읽기 {TODAYS_PICK.readingTime}</span>
                </div>
                <h2
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    color: '#111827',
                    lineHeight: 1.3,
                    letterSpacing: '-0.02em',
                    marginBottom: 10,
                  }}
                >
                  {TODAYS_PICK.title}
                </h2>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>{TODAYS_PICK.subtitle}</p>
                <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.8 }}>{TODAYS_PICK.excerpt}</p>
              </div>
              <Link
                href="/?tab=feed"
                style={{
                  marginTop: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 22px',
                  borderRadius: 9999,
                  background: '#111827',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                  width: 'fit-content',
                }}
              >
                지금 읽기 →
              </Link>
            </div>
          </div>
        </section>

        {/* ── 같은 이슈, 5가지 시선 ────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              같은 이슈, 다른 시선
            </h2>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>5가지 관점</span>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            같은 사실을 누가 어떻게 해석하는지 — 하나의 관점에 갇히지 않게 비교해 보세요.
          </p>

          {/* 시선 탭 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {(Object.keys(PERSPECTIVES) as Perspective[]).map((p) => {
              const item = PERSPECTIVES[p];
              const active = p === perspective;
              return (
                <button
                  key={p}
                  onClick={() => setPerspective(p)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: 'none',
                    background: active ? item.ink : '#fff',
                    color: active ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ marginRight: 4 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* 현재 시선 카드 */}
          <div
            style={{
              background: currentPerspective.tint,
              border: `1px solid ${currentPerspective.ink}22`,
              borderRadius: 20,
              padding: '28px 32px',
              transition: 'background 0.3s',
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: currentPerspective.ink,
                marginBottom: 12,
              }}
            >
              {currentPerspective.label}
            </p>
            <p
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#111827',
                lineHeight: 1.65,
                marginBottom: 14,
                fontFamily: 'Pretendard Variable, Noto Serif KR, serif',
              }}
            >
              &ldquo;{currentPerspective.quote}&rdquo;
            </p>
            <p style={{ fontSize: 12, color: '#6b7280' }}>— {currentPerspective.source}</p>
          </div>
        </section>

        {/* ── 나의 AI LENS — 누적 데이터 ────────────────────────── */}
        <section
          style={{
            background: '#fff',
            borderRadius: 24,
            padding: 32,
            border: '1px solid #f3f4f6',
            boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)',
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 4 }}>
                MY AI LENS
              </p>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
                이번 주 나의 LENS
              </h2>
            </div>
            <Link href="/?tab=dna" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
              전체 보기 →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 20, borderRadius: 16, background: '#fafafa' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>읽은 글</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {USER_PROFILE.weekStats.read}
                <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600, marginLeft: 4 }}>편</span>
              </p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>지난주 대비 +12%</p>
            </div>
            <div style={{ padding: 20, borderRadius: 16, background: '#fafafa' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>저장한 문장</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {USER_PROFILE.weekStats.saved}
                <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600, marginLeft: 4 }}>개</span>
              </p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>총 156개 모임</p>
            </div>
            <div style={{ padding: 20, borderRadius: 16, background: '#fafafa' }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>연속 출석</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {USER_PROFILE.weekStats.streak}
                <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600, marginLeft: 4 }}>일</span>
              </p>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>7일 배지까지 2일</p>
            </div>
          </div>

          {/* 출석 도장 */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 10 }}>이번 주 출석 도장</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => {
                const done = i < USER_PROFILE.weekStats.streak;
                const today = i === USER_PROFILE.weekStats.streak;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      background: done ? recommendedEditor.ink : today ? recommendedEditor.soft : '#f9fafb',
                      border: today ? `1.5px solid ${recommendedEditor.ink}` : '1px solid transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 10, color: done ? 'rgba(255,255,255,0.7)' : '#9ca3af', fontWeight: 600 }}>{d}</span>
                    {done && <span style={{ fontSize: 16, color: '#fff' }}>✓</span>}
                    {today && <span style={{ fontSize: 11, color: recommendedEditor.ink, fontWeight: 700 }}>레터</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 관심사 톱3 */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 10 }}>이번 주 관심사 톱3</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {USER_PROFILE.topCategories.map((cat, i) => (
                <span
                  key={cat}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 9999,
                    background: i === 0 ? recommendedEditor.ink : '#f3f4f6',
                    color: i === 0 ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}. {cat}
                </span>
              ))}
            </div>
          </div>

          {/* 페르소나 코멘트 — 사주 기반 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, background: recommendedEditor.soft, borderRadius: 16 }}>
            <img loading="lazy"
              src={recommendedEditor.avatar}
              alt={recommendedEditor.name}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: recommendedEditor.ink, marginBottom: 4 }}>
                {recommendedEditor.name}이(가) 본 나의 한 주
              </p>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                {USER_PROFILE.weekComment}{' '}
                <span style={{ color: recommendedEditor.ink, fontWeight: 600 }}>
                  당신의 일간({USER_PROFILE.ilgan})은 학습·해석 영역에 강점이 있어요.
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* ── 오늘의 6편 미리보기 (다른 5편) ────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              오늘의 다른 5편
            </h2>
            <Link href="/?tab=feed" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
              전체 6편 보기 →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {SECONDARY_ARTICLES.map((article, i) => {
              const p = PERSONAS[article.persona];
              return (
                <Link
                  key={i}
                  href="/?tab=feed"
                  style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 18,
                    border: '1px solid #f3f4f6',
                    boxShadow: '0 1px 3px rgba(17,24,39,0.03)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(17,24,39,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(17,24,39,0.03)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: p.ink,
                        background: p.soft,
                        padding: '3px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {article.category}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>· {article.readingTime}</span>
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.4, marginBottom: 12, flex: 1 }}>
                    {article.title}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                    <img loading="lazy" src={p.avatar} alt={p.name} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      {p.name} <span style={{ color: '#d1d5db' }}>·</span> {p.nickname}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── 독자들이 가장 많이 저장한 문장 ────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              독자들이 가장 많이 저장한 문장
            </h2>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>이번 주</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {POPULAR_SENTENCES.map((s, i) => {
              const p = PERSONAS[s.persona];
              return (
                <div
                  key={i}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    padding: 18,
                    border: '1px solid #f3f4f6',
                    boxShadow: '0 1px 3px rgba(17,24,39,0.03)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#111827',
                      lineHeight: 1.6,
                      marginBottom: 10,
                      fontFamily: 'Pretendard Variable, Noto Serif KR, serif',
                    }}
                  >
                    &ldquo;{s.text}&rdquo;
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: p.ink, fontWeight: 600 }}>
                      — {p.name} 에디터
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      ♥ {s.saves}명이 저장
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 사주 기반 에디터 매칭 ────────────────────────── */}
        <section
          style={{
            background: `linear-gradient(135deg, ${recommendedEditor.soft} 0%, #fff 60%, ${recommendedEditor.pill} 100%)`,
            borderRadius: 24,
            padding: 36,
            border: `1px solid ${recommendedEditor.ink}22`,
            marginBottom: 32,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: '#fff',
                border: `2px solid ${recommendedEditor.ink}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: recommendedEditor.ink,
                  fontFamily: 'Noto Serif KR, serif',
                }}
              >
                {USER_PROFILE.ilganHanja}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: recommendedEditor.ink, letterSpacing: '0.1em', marginBottom: 6 }}>
                사주 × 에디터 매칭
              </p>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#111827', marginBottom: 8, letterSpacing: '-0.02em' }}>
                당신의 일간은 {USER_PROFILE.ilgan}({USER_PROFILE.ilganHanja}), {USER_PROFILE.gyeokguk}.
              </h3>
              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
                깊고 정제된 분석을 좋아하는 당신과 가장 잘 맞는 에디터는{' '}
                <span style={{ color: recommendedEditor.ink, fontWeight: 700 }}>
                  {recommendedEditor.name} ({recommendedEditor.role})
                </span>
                입니다. 매일 아침 7시 메일로 받아보실 수 있어요.
              </p>
            </div>
            <Link
              href="/letters"
              style={{
                padding: '13px 26px',
                borderRadius: 9999,
                background: recommendedEditor.ink,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              구독 시작하기 →
            </Link>
          </div>
        </section>

        {/* ── 양방향: 에디터에게 물어보기 ────────────────────────── */}
        <section
          style={{
            background: '#fff',
            borderRadius: 24,
            padding: 32,
            border: '1px solid #f3f4f6',
            boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <img loading="lazy"
              src={recommendedEditor.avatar}
              alt={recommendedEditor.name}
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
            />
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: recommendedEditor.ink, letterSpacing: '0.08em', marginBottom: 2 }}>
                ASK THE EDITOR
              </p>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
                {recommendedEditor.name}에게 직접 물어보세요
              </p>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 18 }}>
            기존 뉴스레터는 일방향이었어요. AI LENS는 다릅니다. 당신의 사주·읽기 패턴을 알고 있는 에디터에게 무엇이든 물어보세요.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {[
              '오늘 코스피 흐름 어떻게 봐?',
              '내 사주에 맞는 투자 분야는?',
              '이번 주 회의에 쓸 만한 뉴스 한 줄?',
            ].map((q, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 16px',
                  background: '#fafafa',
                  borderRadius: 12,
                  fontSize: 13,
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = recommendedEditor.soft)}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fafafa')}
              >
                <span style={{ color: '#9ca3af', marginRight: 6 }}>›</span>
                {q}
              </div>
            ))}
          </div>
        </section>

        {/* Footer note */}
        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            AI LENS — 양방향 · 누적 · 다중 시각 · 개인화. 매일 새 풀이.
          </p>
        </div>
      </main>
    </div>
  );
}
