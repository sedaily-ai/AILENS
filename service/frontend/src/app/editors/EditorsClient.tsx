'use client';

import { useEffect, useState } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

type EditorId = string;
type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

interface Editor {
  id: EditorId;
  group: MbtiGroup;
  name: string;
  role: string;
  nickname: string;
  bio: string;
  longBio: string;
  signature: string[];
  picksThisWeek: number;
  followers: string;
  avatar: string;
  accent: string;
  accentBg: string;
  cardAccent: string;
  isActive?: boolean;     // V1 활성 (스티비 연결 + 매일 발행)
  toneSample?: string;    // 활성 에디터의 시그니처 톤 한 줄
}

const dicebear = (seed: string, style = 'notionists') =>
  `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&scale=110&backgroundColor=ffffff,f5f5f4,fef3c7,ecfdf5,fef2f2,faf5ff&backgroundType=gradientLinear`;

const NT_STYLE = { accent: '#7c3aed', accentBg: '#f3eefe', cardAccent: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 50%)' };
const NF_STYLE = { accent: '#e11d48', accentBg: '#fff1f2', cardAccent: 'linear-gradient(135deg, #fff1f2 0%, #ffffff 50%)' };
const ST_STYLE = { accent: '#059669', accentBg: '#ecfdf5', cardAccent: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 50%)' };
const SF_STYLE = { accent: '#d97706', accentBg: '#fffbeb', cardAccent: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 50%)' };

const editors: Editor[] = [
  // ── NT 전략·논리 ──
  {
    id: 'NT-min',
    group: 'NT',
    name: '민철',
    role: '전략 분석 에디터',
    nickname: '분석가',
    bio: '데이터로 본질만 짚어드릴게요. 감정 빼고 구조만.',
    longBio: '구조적으로 봤을 때, 가장 중요한 변수만 추려서 전합니다. 감정은 변수에 넣지 않습니다.',
    signature: ['거시경제', 'IT·산업', '정책'],
    picksThisWeek: 28,
    followers: '12.4K',
    avatar: '/editors/intj.webp',
    isActive: true,
    toneSample: '"핵심 변수 세 개. 공급 차질, 빅테크 캡엑스, 환율."',
    ...NT_STYLE,
  },
  {
    id: 'NT-ji',
    group: 'NT',
    name: '지훈',
    role: 'AI·테크 전략가',
    nickname: '미래탐험가',
    bio: 'AI와 반도체, 빅테크 — 다음 10년의 변수를 찍어드려요.',
    longBio: '기술의 흐름에서 패턴을 찾아냅니다. 단기 변동보다는 산업 사이클 전체를 봐요.',
    signature: ['AI', '반도체', '빅테크'],
    picksThisWeek: 19,
    followers: '8.7K',
    avatar: dicebear('jihoon-tech-NT'),
    ...NT_STYLE,
  },
  {
    id: 'NT-seo',
    group: 'NT',
    name: '서연',
    role: '정책·거버넌스 분석가',
    nickname: '제도설계자',
    bio: '제도가 어떻게 시장을 흔드는지 — 규제의 큰 그림을 그려요.',
    longBio: '정책과 규제의 변화가 산업에 미치는 영향을 추적합니다. 입법 단계부터 시장 반응까지.',
    signature: ['정책', '규제', '거버넌스'],
    picksThisWeek: 16,
    followers: '6.3K',
    avatar: dicebear('seoyeon-policy-NT'),
    ...NT_STYLE,
  },

  // ── NF 의미·공감 ──
  {
    id: 'NF-ha',
    group: 'NF',
    name: '하은',
    role: '오피니언 에디터',
    nickname: '이야기꾼',
    bio: '숫자 뒤에 있는 사람의 이야기를 함께 읽어봐요...',
    longBio: '뉴스 속에 담긴 사람과 가치, 그 의미를 함께 곱씹어요. 감정과 맥락을 놓치지 않습니다.',
    signature: ['사회', '문화', '국제'],
    picksThisWeek: 24,
    followers: '9.8K',
    avatar: '/editors/infp.webp',
    isActive: true,
    toneSample: '"숫자 한 자리 변화가 누군가에게는 한 해의 무게예요."',
    ...NF_STYLE,
  },
  {
    id: 'NF-su',
    group: 'NF',
    name: '수빈',
    role: '문화·사회 에세이스트',
    nickname: '관찰자',
    bio: '오늘의 뉴스가 우리 삶에 닿는 결을, 천천히 적어내려가요.',
    longBio: '문화와 세대, 가치관이 어떻게 변해가는지를 에세이로 풀어요. 빠르지 않게, 깊이 있게.',
    signature: ['세대', '문화', '에세이'],
    picksThisWeek: 18,
    followers: '11.2K',
    avatar: dicebear('subin-culture-NF'),
    ...NF_STYLE,
  },
  {
    id: 'NF-ye',
    group: 'NF',
    name: '예린',
    role: '국제·라이프 에디터',
    nickname: '세계여행자',
    bio: '먼 나라 이야기도, 결국 우리 이야기인 거 아세요?',
    longBio: '국제 뉴스에서 인간적 결을 찾아요. 통계 너머 사람들의 일상을 전합니다.',
    signature: ['국제', '인권', '라이프'],
    picksThisWeek: 21,
    followers: '7.4K',
    avatar: dicebear('yerin-global-NF'),
    ...NF_STYLE,
  },

  // ── ST 팩트·실용 ──
  {
    id: 'ST-jun',
    group: 'ST',
    name: '준서',
    role: '팩트 큐레이터',
    nickname: '실용주의자',
    bio: '결론부터 말함. 3분 안에 핵심만 챙겨감.',
    longBio: '결론이 먼저, 이유는 나중에. 쓸데없는 수식어 없이 사실과 숫자로 정리합니다.',
    signature: ['금융·증시', '기업', '실용 정보'],
    picksThisWeek: 31,
    followers: '15.2K',
    avatar: '/editors/istj.webp',
    isActive: true,
    toneSample: '"7개월 만에 +12% 회복. 체크포인트 3개. 끝."',
    ...ST_STYLE,
  },
  {
    id: 'ST-do',
    group: 'ST',
    name: '도윤',
    role: '금융·증시 전담',
    nickname: '시장지킴이',
    bio: '오늘 장 마감. 종목·지수 핵심만 정리해서 드림.',
    longBio: '시장 데이터를 빠르고 정확하게 전합니다. 분석은 길지 않게, 숫자는 정확하게.',
    signature: ['주식', '채권', '환율'],
    picksThisWeek: 36,
    followers: '20.1K',
    avatar: dicebear('doyoon-finance-ST'),
    ...ST_STYLE,
  },
  {
    id: 'ST-si',
    group: 'ST',
    name: '시우',
    role: '생활경제 큐레이터',
    nickname: '체크리스트',
    bio: '오늘 알면 내일 돈 되는 정보만. 출퇴근 5분 컷.',
    longBio: '세금, 부동산, 정책 혜택 등 실생활에 바로 쓰는 정보를 체크리스트로 정리합니다.',
    signature: ['부동산', '세금', '소비'],
    picksThisWeek: 14,
    followers: '13.8K',
    avatar: dicebear('siwoo-life-ST'),
    ...ST_STYLE,
  },

  // ── SF 트렌드·재미 ──
  {
    id: 'SF-soy',
    group: 'SF',
    name: '소율',
    role: '트렌드 캐스터',
    nickname: '공감러',
    bio: '친구한테 카톡 보내듯 오늘 핫한 뉴스 알려드려요!! 💬',
    longBio: '혼자 보기 아까운 뉴스, 친구처럼 신나게 공유해요. 가볍게 시작해서 깊게 들어갑니다.',
    signature: ['라이프', 'IT·트렌드', '문화'],
    picksThisWeek: 22,
    followers: '18.6K',
    avatar: '/editors/esfp.webp',
    isActive: true,
    toneSample: '"친구야 진짜 신기한 거 알려줄게 🤔"',
    ...SF_STYLE,
  },
  {
    id: 'SF-yu',
    group: 'SF',
    name: '유나',
    role: '브랜드·라이프 에디터',
    nickname: '인플루언서',
    bio: '요즘 브랜드들 진짜 미쳤어요... 트렌드 큐레이션 갑니다!!',
    longBio: '소비자 입장에서 브랜드와 마케팅을 봅니다. 무엇이 왜 잘 팔리는지 사람의 언어로.',
    signature: ['브랜드', '소비', 'F&B'],
    picksThisWeek: 26,
    followers: '24.3K',
    avatar: dicebear('yuna-brand-SF'),
    ...SF_STYLE,
  },
  {
    id: 'SF-da',
    group: 'SF',
    name: '다은',
    role: '컬처·엔터 캐스터',
    nickname: '재미수집가',
    bio: '오늘 SNS 화제? 정리해서 알려드림 ㅎㅎ',
    longBio: '엔터, 콘텐츠, SNS 트렌드 — 지금 사람들이 무엇을 보고 무엇을 말하는지.',
    signature: ['K팝', '드라마', 'SNS'],
    picksThisWeek: 33,
    followers: '31.7K',
    avatar: dicebear('daeun-culture-SF'),
    ...SF_STYLE,
  },
];

const FILTERS = [
  { id: 'all', label: '전체', sub: `${editors.length}명` },
  { id: 'NT', label: 'NT · 분석가', sub: '전략·논리' },
  { id: 'NF', label: 'NF · 이야기꾼', sub: '의미·공감' },
  { id: 'ST', label: 'ST · 실용주의자', sub: '팩트·실용' },
  { id: 'SF', label: 'SF · 공감러', sub: '트렌드·재미' },
] as const;

// V1 그룹 대표 4명 — 스티비 뉴스레터 연결, 매일 발행
// 나머지 8명은 Coming Soon
const STIBEE_BASE_URL = 'https://ailens.stibee.com';
const REPRESENTATIVE_IDS: Record<string, MbtiGroup> = {
  'NT-min': 'NT',
  'NF-ha': 'NF',
  'ST-jun': 'ST',
  'SF-soy': 'SF',
};

export function EditorsClient() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [subscribed, setSubscribed] = useState<Set<EditorId>>(new Set());
  const [modalEditor, setModalEditor] = useState<Editor | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedGroup] = useMbtiGroup('SF');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('editor-subscriptions');
      if (saved) setSubscribed(new Set(JSON.parse(saved)));
      const savedEmail = localStorage.getItem('newsletter-email');
      if (savedEmail) setEmail(savedEmail);
    } catch {}
  }, []);

  const filteredEditors = (filter === 'all' ? editors : editors.filter((e) => e.group === filter))
    .slice()
    .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)); // 활성 먼저
  const activeCount = editors.filter((e) => e.isActive).length;
  const upcomingCount = editors.length - activeCount;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const handleSubscribe = (ed: Editor) => {
    // 그룹 대표 4명은 스티비 구독 페이지로 새 창 (MBTI 그룹 쿼리 동봉)
    const group = REPRESENTATIVE_IDS[ed.id];
    if (group) {
      window.open(`${STIBEE_BASE_URL}?mbti_group=${group}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (subscribed.has(ed.id)) {
      const next = new Set(subscribed);
      next.delete(ed.id);
      setSubscribed(next);
      try {
        localStorage.setItem('editor-subscriptions', JSON.stringify([...next]));
      } catch {}
      showToast(`${ed.name} 에디터 구독을 취소했어요`);
      return;
    }
    setModalEditor(ed);
  };

  const handleConfirmSubscribe = async () => {
    if (!modalEditor) return;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('올바른 이메일을 입력해주세요');
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    const next = new Set(subscribed);
    next.add(modalEditor.id);
    setSubscribed(next);
    try {
      localStorage.setItem('editor-subscriptions', JSON.stringify([...next]));
      localStorage.setItem('newsletter-email', email);
    } catch {}
    setSubmitting(false);
    showToast(`매일 아침 7시, ${modalEditor.name} 에디터 뉴스레터를 보내드릴게요`);
    setModalEditor(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('editors')}
      />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={selectedGroup} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(28px, 6vw, 48px) clamp(16px, 4vw, 24px) 80px' }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
            Editors
          </p>
          <h1 style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(26px, 5.4vw, 32px)', fontWeight: 600, color: '#111827', letterSpacing: '-0.025em', marginBottom: 10, lineHeight: 1.3 }}>
            오늘 뉴스, 누구의 눈으로 볼까요?
          </h1>
          <p style={{ fontSize: 'clamp(14px, 3.4vw, 15px)', color: '#6b7280', lineHeight: 1.65, maxWidth: 580, marginBottom: 12 }}>
            저마다 다른 결로 매일 한 통을 보내는 사람들이에요. 마음에 드는 사람을 따라가보세요.
          </p>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#6b7280' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#10b981',
                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.18)',
              }} />
              <strong style={{ color: '#111827' }}>{activeCount}명</strong> 매일 발행 중
            </span>
            <span style={{ color: '#d1d5db' }}>·</span>
            <span>
              <strong style={{ color: '#9ca3af' }}>{upcomingCount}명</strong> 곧 합류
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 32, overflowX: 'auto', paddingBottom: 4 }}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: 9999,
                  border: 'none',
                  background: active ? '#3182F6' : '#fff',
                  color: active ? '#fff' : '#6b7280',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: active ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
                <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>{f.sub}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 'clamp(12px, 3vw, 20px)' }}>
          {filteredEditors.map((ed) => {
            const isSubscribed = subscribed.has(ed.id as EditorId);
            const isActive = ed.isActive ?? false;
            return (
              <Link
                key={ed.id}
                href={`/editors/${ed.id}`}
                style={{
                  position: 'relative',
                  borderRadius: 22,
                  background: isActive ? '#fdfcfb' : '#fafaf9',
                  boxShadow: isActive
                    ? '0 4px 20px rgba(0,0,0,0.04)'
                    : '0 1px 6px rgba(0,0,0,0.02)',
                  padding: 24,
                  opacity: isActive ? 1 : 0.85,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  transition: 'transform 0.2s, box-shadow 0.2s, opacity 0.2s',
                  overflow: 'hidden',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                onMouseEnter={(ev) => {
                  ev.currentTarget.style.transform = 'translateY(-2px)';
                  ev.currentTarget.style.boxShadow = isActive
                    ? '0 10px 28px rgba(0,0,0,0.08)'
                    : '0 6px 18px rgba(0,0,0,0.05)';
                  ev.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(ev) => {
                  ev.currentTarget.style.transform = 'translateY(0)';
                  ev.currentTarget.style.boxShadow = isActive
                    ? '0 4px 20px rgba(0,0,0,0.04)'
                    : '0 1px 6px rgba(0,0,0,0.02)';
                  ev.currentTarget.style.opacity = isActive ? '1' : '0.85';
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    padding: '4px 10px',
                    borderRadius: 9999,
                    background: ed.accentBg,
                    color: ed.accent,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  {ed.group}
                </span>

                {/* 활성/비활성 라벨 (우상단) */}
                {isActive ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 9999,
                      background: '#dcfce7',
                      color: '#15803d',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%', background: '#10b981',
                    }} />
                    매일 발행
                  </span>
                ) : (
                  <span
                    style={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      padding: '4px 10px',
                      borderRadius: 9999,
                      background: '#f3f4f6',
                      color: '#9ca3af',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    곧 합류
                  </span>
                )}

                <div style={{ position: 'relative', marginTop: 16, marginBottom: 20 }}>
                  <img
                    src={ed.avatar}
                    alt={ed.name}
                    style={{
                      width: 104,
                      height: 104,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      boxShadow: '0 0 0 4px #fff, 0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: '#3b82f6',
                      border: '3px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                </div>

                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {ed.name}
                </h2>
                <p style={{ fontSize: 13, fontWeight: 600, color: ed.accent, marginBottom: 12 }}>
                  {ed.role}
                </p>

                <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 12, minHeight: 42 }}>
                  {ed.bio}
                </p>

                {/* 톤 샘플 — 활성 에디터의 시그니처 한 줄 */}
                {isActive && ed.toneSample && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: ed.accentBg,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: ed.accent,
                      textAlign: 'left',
                      width: '100%',
                      fontFamily: '"Noto Serif KR", serif',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    “{ed.toneSample.replace(/^["']|["']$/g, '')}”
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16, fontSize: 12, alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {ed.picksThisWeek}
                    </span>
                    <span style={{ color: '#9ca3af', marginLeft: 4 }}>주간 픽</span>
                  </div>
                  <div style={{ width: 1, height: 14, background: '#e5e7eb' }} />
                  <div>
                    <span style={{ fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                      {ed.followers}
                    </span>
                    <span style={{ color: '#9ca3af', marginLeft: 4 }}>팔로워</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                  {ed.signature.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: ed.accentBg,
                        color: ed.accent,
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>

                <button
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    handleSubscribe(ed);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 12,
                    border: isActive
                      ? (isSubscribed ? `1px solid ${ed.accent}` : 'none')
                      : '1px solid #e5e7eb',
                    background: isActive
                      ? (isSubscribed ? '#fff' : ed.accent)
                      : '#fff',
                    color: isActive
                      ? (isSubscribed ? ed.accent : '#fff')
                      : '#6b7280',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.opacity = '1')}
                >
                  {!isActive
                    ? '곧 만나요 · 알림 받기'
                    : isSubscribed
                      ? '✓ 팔로우 중'
                      : '+ 팔로우 (매일 메일)'}
                </button>
              </Link>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 56,
            padding: 28,
            borderRadius: 20,
            background: '#fff',
            border: '1px solid #f3f4f6',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
            Newsletter
          </p>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            매일 아침 7시, 메일로 받아보세요
          </h3>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 0 }}>
            구독한 에디터가 큐레이션한 그날의 뉴스를 매일 아침 7시에 메일로 보내드려요.
            <br />
            언제든 구독 해지할 수 있고, 광고 메일은 보내지 않아요.
          </p>
        </div>
      </main>

      {modalEditor && (
        <div
          onClick={() => setModalEditor(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 32,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <img
                src={modalEditor.avatar}
                alt={modalEditor.name}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
              />
              <div>
                <p style={{ fontSize: 12, color: modalEditor.accent, fontWeight: 600, margin: 0 }}>
                  {modalEditor.role}
                </p>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>
                  {modalEditor.name} 에디터 뉴스레터
                </h3>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
              {modalEditor.longBio}
              <br />
              <br />
              매일 아침 7시에 보내드릴게요. 구독 해지는 언제든 가능해요.
            </p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                fontSize: 14,
                marginBottom: 20,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(ev) => (ev.currentTarget.style.borderColor = modalEditor.accent)}
              onBlur={(ev) => (ev.currentTarget.style.borderColor = '#e5e7eb')}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setModalEditor(null)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#6b7280',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleConfirmSubscribe}
                disabled={submitting}
                style={{
                  flex: 2,
                  padding: '12px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: modalEditor.accent,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? '구독 중...' : '구독하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 200,
            animation: 'toastIn 0.25s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 12px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
          {toast}
        </div>
      )}
    </div>
  );
}
