'use client';

/**
 * 공통 — 뉴스레터 구독 입력 (이메일 + 동의 + 버튼).
 *
 * 호출자가 어떤 그룹(들)을 구독시킬지 결정해 props 로 넘긴다.
 * 다중 그룹은 group 별로 N 회 subscribe 호출 (현재 백엔드 API 가 단일 그룹만 받음).
 */
import { useEffect, useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { trackEvent } from '@/shared/lib/trackEvent';

const API_BASE = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';

// 구독 즉시 그 페르소나의 최신 letter 한 통을 메일로 함께 발송하고 싶을 때
// 호출자가 group → letter payload 매핑을 넘긴다. 백엔드가 letter.headline 있으면 발송.
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
  groups: MbtiGroupId[];
  lettersByGroup?: Partial<Record<MbtiGroupId, SubscribeLetterPayload>>;
  accent?: string;
  buttonLabel?: string;
  disabled?: boolean;
  helperText?: string;
  onSuccess?: (data: { email: string; groups: MbtiGroupId[] }) => void;
}

export function NewsletterEmailField({
  groups,
  lettersByGroup,
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
  // (재구독·다른 그룹 추가 시 항상 재발송 흐름을 막지 않게).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('newsletter-email');
    if (saved) setEmail(saved);
  }, []);

  // 같은 이메일이 이미 모든 선택 그룹을 구독했는지 — 안내 helper 로만 활용 (submit 막지 않음)
  const alreadyAllSubscribed = (() => {
    if (typeof window === 'undefined') return false;
    if (groups.length === 0) return false;
    const existing = (localStorage.getItem('newsletter-groups') || '').split(',').filter(Boolean);
    return groups.every((g) => existing.includes(g));
  })();

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const canSubmit = validEmail && consent && groups.length > 0 && !disabled && state !== 'sending';

  const submit = async () => {
    if (!canSubmit) return;
    setState('sending');
    setErrMsg('');
    try {
      const lower = email.trim().toLowerCase();
      const results = await Promise.allSettled(
        groups.map((g) => {
          const payload: Record<string, unknown> = {
            email: lower,
            mbti_group: g,
            consent: true,
          };
          // 그 페르소나의 최신 letter 가 주어졌으면 함께 보냄 → 백엔드가 즉시 발송
          const letter = lettersByGroup?.[g];
          if (letter) payload.letter = letter;
          return fetch(`${API_BASE}/api/newsletter/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
            .then((r) => r.json())
            .then((d: { ok?: boolean; error?: string }) => {
              if (!d.ok) throw new Error(d.error || 'subscribe failed');
              return d;
            });
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === groups.length) {
        throw new Error('신청 실패. 잠시 후 다시 시도해주세요.');
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('newsletter-email', email.trim());
        const existing = (localStorage.getItem('newsletter-groups') || '').split(',').filter(Boolean);
        for (const g of groups) if (!existing.includes(g)) existing.push(g);
        localStorage.setItem('newsletter-groups', existing.join(','));
      }
      trackEvent('newsletter_subscribe_multi', {
        groups: groups.join(','),
        count: groups.length,
      });
      setState('done');
      onSuccess?.({ email: email.trim(), groups });
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
      {(helperText || alreadyAllSubscribed) && (
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, marginBottom: 12, textAlign: 'center' }}>
          {helperText ?? '이미 구독 중인 에디터예요. 다시 받기를 눌러도 한 번 더 보내드려요.'}
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
