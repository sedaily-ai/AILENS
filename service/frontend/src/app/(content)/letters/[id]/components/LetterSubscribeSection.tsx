'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { API_URL } from '@/shared/config/apiClient';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';

// 뉴스레터 구독 — 레터 하단 인라인. POST /api/newsletter/subscribe로 DDB에 저장한다.
export function LetterSubscribeSection({ letter }: { letter: DisplayLetter }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // 이미 구독 중이면 미리 채워둔다(localStorage 캐시). 단일 명의이므로 이메일 저장 여부만 본다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('newsletter-email');
    if (saved) {
      setEmail(saved);
      setState('done');
    }
  }, []);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && consent && state !== 'sending';

  const submit = async () => {
    if (!valid) return;
    setState('sending');
    setErrorMsg('');
    try {
      const res = await fetch(
        `${API_URL}/api/newsletter/subscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            consent: true,
            // 즉시 첫 메일 발송용 — 백엔드가 받아 SES 로 보냄
            letter: {
              editor_name: letter.editorName,
              editor_role: letter.editorRole,
              accent: letter.accent,
              headline: letter.headline,
              subtitle: letter.subtitle,
              body: letter.body,
              key_points: letter.key_points,
              closing_line: letter.closing_line,
            },
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // 성공 — localStorage 캐시 업데이트 (재방문 시 즉시 done 상태)
      if (typeof window !== 'undefined') {
        localStorage.setItem('newsletter-email', email.trim());
      }
      trackEvent('newsletter_subscribe', { editor: letter.editorName });
      setState('done');
    } catch (e) {
      console.warn('subscribe failed', e);
      setErrorMsg(e instanceof Error ? e.message : '신청 실패. 잠시 후 다시 시도해주세요.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <section
        style={{
          marginTop: 36,
          padding: 'clamp(24px,4vw,32px) clamp(20px,4vw,28px)',
          borderRadius: 20,
          background: letter.accentBg,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: letter.accent, letterSpacing: '0.18em' }}>
          SENT
        </span>
        <p
          style={{
            marginTop: 10,
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1.5,
          }}
        >
          {letter.editorName}의 한 통을 메일로 보냈어요
        </p>
        <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
          {email} · 받은편지함을 확인해보세요 (스팸함도 한 번)
        </p>
        <p style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
          내일부터는 매일 아침 새 레터가 도착해요
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        marginTop: 36,
        padding: 'clamp(28px,5vw,40px) clamp(22px,5vw,32px)',
        borderRadius: 20,
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Image
          src={letter.editorAvatar}
          alt={letter.editorName}
          width={52}
          height={52}
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: `0 0 0 1px ${letter.accent}22`,
          }}
        />
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: letter.accent, letterSpacing: '0.14em' }}>
            NEWSLETTER
          </p>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(18px,3.5vw,22px)',
              fontWeight: 700,
              color: '#111827',
              marginTop: 2,
              letterSpacing: '-0.01em',
            }}
          >
            {letter.editorName}의 한 통, 매일 아침 받아보세요
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7, marginBottom: 18, maxWidth: 460 }}>
        {letter.editorName} 에디터가 그날의 뉴스를 한 통으로 정리해 메일로 보내드려요.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="email"
          inputMode="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: 0,
            padding: '12px 16px',
            fontSize: 14,
            color: '#111827',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          style={{
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: valid ? letter.accent : '#d1d5db',
            border: 'none',
            borderRadius: 10,
            cursor: valid ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            transition: 'background .15s',
          }}
        >
          {state === 'sending' ? '신청 중…' : '구독하기'}
        </button>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12.5,
          color: '#6b7280',
          lineHeight: 1.6,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span>매일 뉴스레터 수신과 이메일 저장에 동의합니다. 메일 하단 링크로 언제든 해지할 수 있어요.</span>
      </label>

      {state === 'error' && errorMsg && (
        <p style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 12 }}>{errorMsg}</p>
      )}
    </section>
  );
}
