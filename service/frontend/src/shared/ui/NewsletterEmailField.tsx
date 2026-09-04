'use client';

/**
 * 공통 — 뉴스레터 구독 입력 (이메일 + 동의 + 버튼).
 *
 * 단일 명의(AI LENS) 체계(2026-08-07) 이후 구독은 그룹 무관 — 이메일 하나당
 * 구독 신청 1회, 백엔드도 mbti_group 을 더 이상 받지 않는다.
 *
 * 2026-09-04 — `/api/newsletter/subscribe`(handlers/newsletter/subscribe.py)
 * 대신 `/api/v2/subscribe`(handlers/subscribe.py)를 호출한다 — 리팩토링
 * 감사로 두 엔드포인트가 같은 테이블에 독립적으로 upsert하던 중복 구현임이
 * 드러나 하나로 통합했다(subscribe.py가 정본 — unsubscribe 엔드포인트가
 * 있고 공용 이메일 렌더링을 재사용함). format/interests/letter 페이로드는
 * 그쪽으로 이식됐다.
 */
import { useEffect, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { API_URL as API_BASE } from '@/shared/config/apiClient';

// 구독 즉시 최신 letter 한 통을 메일로 함께 발송하고 싶을 때 호출자가 넘긴다.
// 백엔드가 letter.headline 있으면 발송.
export interface SubscribeLetterPayload {
  editor_name: string;
  editor_role: string;
  accent: string;
  headline: string;
  subtitle: string | null;
  body: string[];
  key_points: string[];
  closing_line: string | null;
}

interface Props {
  letter?: SubscribeLetterPayload | null;
  /** 온보딩(/start)에서 고른 포맷/관심분야 — 있으면 구독과 함께 저장된다
   *  (service/backend/handlers/subscribe.py). 발행 로직엔 아직 반영 안 됨
   *  — 기록만. */
  format?: string;
  interests?: string[];
  accent?: string;
  buttonLabel?: string;
  disabled?: boolean;
  helperText?: string;
  onSuccess?: (data: { email: string }) => void;
}

export function NewsletterEmailField({
  letter,
  format,
  interests,
  accent = '#3182F6',
  buttonLabel = '구독하기',
  disabled = false,
  helperText,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  // 이미 구독한 이메일 자동 채움. 단 done 상태 자동 진입은 X
  // (재구독 시에도 항상 재발송 흐름을 막지 않게).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('newsletter-email');
    if (saved) setEmail(saved);
  }, []);

  // 이 이메일이 이미 구독 중인지 — 안내 helper 로만 활용 (submit 막지 않음)
  const alreadySubscribed = (() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('newsletter-subscribed') === '1';
  })();

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const canSubmit = validEmail && consent && !disabled && state !== 'sending';

  const submit = async () => {
    if (!canSubmit) return;
    setState('sending');
    setErrMsg('');
    try {
      const lower = email.trim().toLowerCase();
      const payload: Record<string, unknown> = {
        email: lower,
        consent: true,
      };
      if (letter) payload.letter = letter;
      if (format) payload.format = format;
      if (interests && interests.length > 0) payload.interests = interests;
      const res = await fetch(`${API_BASE}/api/v2/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!d.ok) throw new Error(d.error || 'subscribe failed');

      if (typeof window !== 'undefined') {
        localStorage.setItem('newsletter-email', email.trim());
        localStorage.setItem('newsletter-subscribed', '1');
      }
      trackEvent('newsletter_subscribe');
      setState('done');
      onSuccess?.({ email: email.trim() });
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '신청 실패. 잠시 후 다시 시도해주세요.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 17,
            fontWeight: 700,
            color: '#1a1a1a',
            margin: '0 0 6px',
          }}
        >
          {email || '입력하신 이메일'}로 첫 한 통이 곧 도착해요
        </p>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
          내일부터 매일 아침 같은 메일함으로 (스팸함도 한 번)
        </p>
      </div>
    );
  }

  return (
    <div>
      {(helperText || alreadySubscribed) && (
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginBottom: 12, textAlign: 'center' }}>
          {helperText ?? '이미 구독 중이에요. 다시 받기를 눌러도 한 번 더 보내드려요.'}
        </p>
      )}
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
          disabled={!canSubmit}
          style={{
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: canSubmit ? accent : '#d1d5db',
            border: 'none',
            borderRadius: 10,
            cursor: canSubmit ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            transition: 'background .15s',
          }}
        >
          {state === 'sending' ? '신청 중…' : buttonLabel}
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
      {state === 'error' && errMsg && (
        <p style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 12 }}>{errMsg}</p>
      )}
    </div>
  );
}
