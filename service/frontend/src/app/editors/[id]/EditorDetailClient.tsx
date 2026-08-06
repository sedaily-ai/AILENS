'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { EditorDetail } from './editorsData';

interface Props {
  editor: EditorDetail;
}

export function EditorDetailClient({ editor }: Props) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('editor-subscriptions');
      if (saved) {
        const list: string[] = JSON.parse(saved);
        setSubscribed(list.includes(editor.group));
      }
      const e = localStorage.getItem('newsletter-email');
      if (e) setEmail(e);
    } catch {}
  }, [editor.group]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const handleSubscribeClick = () => {
    if (subscribed) {
      try {
        const list: string[] = JSON.parse(localStorage.getItem('editor-subscriptions') || '[]');
        const next = list.filter((g) => g !== editor.group);
        localStorage.setItem('editor-subscriptions', JSON.stringify(next));
      } catch {}
      setSubscribed(false);
      showToast(`${editor.name} 에디터 구독을 취소했어요`);
      return;
    }
    setModalOpen(true);
  };

  const confirmSubscribe = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('올바른 이메일을 입력해주세요');
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    try {
      const list: string[] = JSON.parse(localStorage.getItem('editor-subscriptions') || '[]');
      if (!list.includes(editor.group)) list.push(editor.group);
      localStorage.setItem('editor-subscriptions', JSON.stringify(list));
      localStorage.setItem('newsletter-email', email);
    } catch {}
    setSubscribed(true);
    setSubmitting(false);
    setModalOpen(false);
    showToast(`매일 아침 7시, ${editor.name} 에디터 뉴스레터를 보내드릴게요`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      {/* 헤더 */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            ← 돌아가기
          </button>
          <Link href="/" style={{ fontSize: 18, fontWeight: 800, color: '#111827', textDecoration: 'none', letterSpacing: '-0.02em' }}>
            AI LENS
          </Link>
          <Link
            href="/editors"
            style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none', fontWeight: 500 }}
          >
            전체 에디터 →
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 6vw, 48px) clamp(16px, 4vw, 24px) 80px' }}>
        {/* 프로필 헤더 */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <img loading="lazy"
                src={editor.avatar}
                alt={editor.name}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  boxShadow: '0 0 0 5px #fff, 0 4px 16px rgba(0,0,0,0.08)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#3b82f6',
                  border: '3px solid #fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
            </div>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 9999,
                background: editor.accentBg,
                color: editor.accentInk,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                marginBottom: 12,
              }}
            >
              {editor.group} · {editor.nickname}
            </span>
            <h1 style={{ fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 900, color: '#111827', letterSpacing: '-0.03em', marginBottom: 6 }}>
              {editor.name}
            </h1>
            <p style={{ fontSize: 14, color: editor.accentInk, fontWeight: 600, marginBottom: 14 }}>
              {editor.role}
            </p>
            <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.7, maxWidth: 480, marginBottom: 20 }}>
              {editor.bio}
            </p>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 'clamp(16px, 5vw, 28px)', marginBottom: 24, fontSize: 13, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {editor.followers}
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>팔로워</p>
              </div>
              <div style={{ width: 1, background: '#e5e7eb' }} />
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {editor.totalPicks}
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>누적 픽</p>
              </div>
              <div style={{ width: 1, background: '#e5e7eb' }} />
              <div>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {editor.picksThisWeek}
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>이번 주</p>
              </div>
            </div>

            {/* 구독 버튼 */}
            <button
              onClick={handleSubscribeClick}
              style={{
                padding: '12px 32px',
                borderRadius: 9999,
                border: subscribed ? `1.5px solid ${editor.accent}` : 'none',
                background: subscribed ? '#fff' : editor.accent,
                color: subscribed ? editor.accent : '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {subscribed ? '✓ 뉴스레터 구독 중' : '뉴스레터 구독'}
            </button>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
              {editor.joinedAt} 합류 · 매일 아침 7시 발송
            </p>
          </div>
        </section>

        {/* 시그니처 카테고리 */}
        <section style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            시그니처 카테고리
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editor.signature.map((s) => (
              <span
                key={s}
                style={{
                  padding: '6px 14px',
                  borderRadius: 9999,
                  background: editor.accentBg,
                  color: editor.accentInk,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* 철학 인용 */}
        <section
          style={{
            position: 'relative',
            padding: '24px 24px 24px 32px',
            background: '#fff',
            borderRadius: 16,
            border: '1px solid #f3f4f6',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 24,
              bottom: 24,
              width: 3,
              background: editor.accent,
              borderRadius: '0 3px 3px 0',
            }}
          />
          <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 8 }}>
            EDITORIAL PHILOSOPHY
          </p>
          <p
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: '#111827',
              lineHeight: 1.5,
              fontFamily: 'Pretendard Variable, Noto Serif KR, serif',
            }}
          >
            “{editor.philosophy}”
          </p>
        </section>

        {/* 자기소개 */}
        <section style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            소개
          </p>
          <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.85 }}>{editor.longBio}</p>
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: '#f9fafb',
              borderRadius: 10,
              fontSize: 12,
              color: '#6b7280',
              display: 'inline-block',
            }}
          >
            톤 &amp; 매너 — <span style={{ color: editor.accentInk, fontWeight: 600 }}>{editor.tone}</span>
          </div>
        </section>

        {/* 헤드라인 갤러리 (dokdok식) */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                Gallery
              </p>
              <h2 style={{ fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em' }}>
                {editor.name} 갤러리
              </h2>
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af', tabularNums: true } as React.CSSProperties}>
              {editor.sampleHeadlines.length}개
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
            {editor.name}이 최근 다룬 글들. 본인 관심 영역에 맞는 헤드라인 찾아보세요.
          </p>

          <div style={{ borderTop: '1px solid #f3f4f6' }}>
            {editor.sampleHeadlines.map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '18px 0',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: editor.accentInk,
                    background: editor.accentBg,
                    padding: '4px 8px',
                    borderRadius: 6,
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {h.date ?? '—'}
                </span>
                <div>
                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#111827',
                      lineHeight: 1.45,
                      marginBottom: 4,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {h.title}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: editor.accentInk,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: editor.accent,
                          display: 'inline-block',
                        }}
                      />
                      {h.category}
                    </span>
                    <span style={{ color: '#d1d5db', flexShrink: 0 }}>·</span>
                    <span style={{ color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                      “{h.comment}”
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {editor.sampleHeadlines.length < 10 && (
            <p style={{ marginTop: 16, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
              더 많은 글은 곧 만나요
            </p>
          )}
        </section>

        {/* 하단 CTA */}
        <section
          style={{
            padding: 28,
            background: editor.accentBg,
            borderRadius: 16,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 11, color: editor.accentInk, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>
            NEWSLETTER
          </p>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            매일 아침 7시, {editor.name}의 큐레이션
          </h3>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 16, maxWidth: 380, margin: '0 auto 16px' }}>
            구독하면 {editor.name}이(가) 고른 하루의 뉴스를 메일로 받아볼 수 있어요.
          </p>
          <button
            onClick={handleSubscribeClick}
            style={{
              padding: '11px 28px',
              borderRadius: 9999,
              border: 'none',
              background: editor.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {subscribed ? '✓ 구독 중' : '뉴스레터 구독하기'}
          </button>
        </section>
      </main>

      {/* 구독 모달 */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 20,
              padding: 28,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <img loading="lazy" src={editor.avatar} alt={editor.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
              <div>
                <p style={{ fontSize: 12, color: editor.accentInk, fontWeight: 600 }}>{editor.role}</p>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>{editor.name} 뉴스레터</h3>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 16 }}>
              매일 아침 7시 발송. 구독 해지는 언제든 가능합니다.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                fontSize: 14,
                marginBottom: 16,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 10,
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
                onClick={confirmSubscribe}
                disabled={submitting}
                style={{
                  flex: 2,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: editor.accent,
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

      {/* 토스트 */}
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
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
