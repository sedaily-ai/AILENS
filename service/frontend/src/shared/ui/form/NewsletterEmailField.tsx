'use client';

/**
 * 공통 뉴스레터 구독 입력(이메일 + 동의 + 버튼). 지금은 /onboarding 메일 섹션(NewsletterCTA)만 쓴다.
 *
 * 구독은 그룹과 무관하게 이메일 하나당 신청 1회이며 백엔드도 mbti_group을 받지 않는다.
 * `/api/v2/subscribe`(handlers/subscribe.py)를 호출한다(unsubscribe 엔드포인트가 있고 공용 이메일 렌더링을 재사용하는 정본).
 * format/interests/letter 페이로드도 이쪽으로 전달한다.
 *
 * 화면 규칙(2026-10-12 소개 화면 개편): 라벨은 입력칸 위, 형식 오류는 칸을 벗어난 뒤에만, 버튼이 비활성이면 이유를 버튼 아래에 쓴다.
 * 문구는 레터 구독 행동 정의(docs/product/모아쓰기레터/구독_UX_행동정의.md)와 같은 말을 쓴다. 발송 주기는 약속하지 않는다.
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { API_URL as API_BASE } from '@/shared/config/apiClient';

// 구독 즉시 최신 letter 한 통을 메일로 함께 발송하려면 호출자가 넘긴다. 백엔드는 letter.headline이 있으면 발송한다.
export interface SubscribeLetterPayload {
  article_path: string;
  published_date: string;
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
  /** 온보딩(/start)에서 고른 포맷/관심분야. 있으면 구독과 함께 저장된다(service/backend/handlers/subscribe.py). 발행 로직에는 아직 반영되지 않고 기록만 한다. */
  format?: string;
  interests?: string[];
  buttonLabel?: string;
  /** 값이 있으면 신청을 막고 이 문장을 버튼 아래에 이유로 보여 준다(예: 보낼 레터를 아직 불러오지 못함). */
  disabledReason?: string;
  helperText?: string;
  onSuccess?: (data: { email: string }) => void;
}

const fs = (n: number) => `var(--font-size-${n})`;

// 버튼 상태(hover·active·disabled)와 포커스 표시는 인라인 스타일로 쓸 수 없어 이 컴포넌트 안에 둔다(쓰는 화면의 CSS에 기대지 않는다).
const FIELD_CSS = `
  .nef-btn { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: var(--color-accent-primary); color: var(--color-bg); font: inherit; font-size: var(--font-size-16); font-weight: 700; cursor: pointer; transition: background-color .15s; }
  .nef-btn:hover { background: color-mix(in srgb, var(--color-accent-primary) 85%, var(--color-text)); }
  .nef-btn:active { transform: translateY(1px); }
  .nef-btn:disabled { background: var(--color-border); color: var(--color-text-muted); cursor: not-allowed; transform: none; }
  .nef-btn:focus-visible, .nef-input:focus-visible, .nef-check:focus-visible, .nef-link:focus-visible { outline: 3px solid var(--color-accent-primary); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .nef-btn { transition: none; } .nef-btn:active { transform: none; } }
`;

export function NewsletterEmailField({
  letter,
  format,
  interests,
  buttonLabel = '구독 신청하기',
  disabledReason,
  helperText,
  onSuccess,
}: Props) {
  const ids = useId();
  const emailId = `${ids}-email`;
  const reasonId = `${ids}-reason`;
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [mailSent, setMailSent] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  // 이미 구독한 이메일 자동 채움. 단 done 상태 자동 진입은 X(재구독 시에도 항상 재발송 흐름을 막지 않게).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('newsletter-email');
      if (saved) setEmail(saved);
      setAlreadySubscribed(localStorage.getItem('newsletter-subscribed') === '1');
    } catch { /* 저장소 사용이 제한되면 빈 폼으로 시작한다. */ }
  }, []);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const showFormatError = touched && email.trim() !== '' && !validEmail;
  const canSubmit = validEmail && consent && !disabledReason && state !== 'sending';

  // 버튼이 눌리지 않는 이유 — 하나만, 가장 먼저 풀어야 할 것부터.
  const reason = !validEmail
    ? showFormatError
      ? '이메일 주소 형식을 확인해 주세요'
      : '이메일 주소를 입력해 주세요'
    : !consent
      ? '뉴스레터 수신·이메일 저장 동의에 체크해 주세요'
      : disabledReason ?? '';

  const submit = async () => {
    if (!canSubmit) return;
    setState('sending');
    setErrMsg('');
    try {
      const lower = email.trim().toLowerCase();
      const payload: Record<string, unknown> = { email: lower, consent: true };
      if (letter) payload.letter = letter;
      if (format) payload.format = format;
      if (interests && interests.length > 0) payload.interests = interests;
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/v2/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error('네트워크 연결을 확인하고 다시 시도해 주세요');
      }
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; welcome_sent?: boolean; send_status?: string };
      if (!res.ok || !d.ok) throw new Error('신청하지 못했어요. 잠시 후 다시 시도해 주세요');

      const sent = d.send_status === 'sent' && d.welcome_sent === true;
      setMailSent(sent);
      setDeliveryMessage(sent
        ? '스팸함도 한 번 확인해 주세요.'
        : d.send_status === 'error'
          ? '구독은 저장됐지만 메일을 보내지 못했어요. 메일로 받을 기사 링크에서 내용을 확인해 주세요.'
          : d.send_status === 'no_letter'
            ? '구독은 저장됐지만 지금 보낼 기사가 없어요.'
            : d.send_status === 'dry_run'
              ? '구독은 저장됐지만 현재 메일 발송이 꺼져 있어요.'
              : '구독은 저장됐지만 메일 발송 여부를 확인하지 못했어요.');
      // 브라우저 저장소 제한으로 이미 완료된 구독을 실패로 표시하지 않는다.
      try {
        localStorage.setItem('newsletter-email', lower);
        localStorage.setItem('newsletter-subscribed', '1');
      } catch { /* 저장소 사용이 제한되어도 API 결과는 유지한다. */ }
      trackEvent('newsletter_subscribe');
      setState('done');
      onSuccess?.({ email: email.trim() });
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '신청하지 못했어요. 잠시 후 다시 시도해 주세요');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div role="status" style={{ padding: '24px 16px', borderRadius: 16, background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)' }}>
        <p style={{ margin: 0, fontSize: fs(18), fontWeight: 700, lineHeight: 1.5 }}>{mailSent ? `${email.trim()}로 최근 발행 기사 요약을 보냈어요` : '구독 신청이 완료됐어요'}</p>
        <p style={{ margin: '8px 0 0', fontSize: fs(14), color: 'var(--color-text-secondary)' }}>{deliveryMessage}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <style>{FIELD_CSS}</style>
      {(helperText || alreadySubscribed) && (
        <p style={{ margin: '0 0 4px', fontSize: fs(14), lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          {helperText ?? '이 브라우저에서 구독한 기록이 있어요. 다시 신청하면 최근 발행 기사 요약의 발송을 요청해요.'}
        </p>
      )}
      <label htmlFor={emailId} style={{ fontSize: fs(14), fontWeight: 700, color: 'var(--color-text-primary)' }}>
        이메일
      </label>
      <input
        id={emailId}
        className="nef-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showFormatError || undefined}
        style={{
          height: 48,
          padding: '0 16px',
          fontSize: fs(16),
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg)',
          border: `1px solid ${showFormatError ? 'var(--color-text-danger)' : 'var(--color-text-muted)'}`,
          borderRadius: 12,
        }}
      />
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', fontSize: fs(14), lineHeight: 1.6, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="nef-check"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ flex: 'none', width: 24, height: 24, margin: 0, accentColor: 'var(--color-accent-primary)' }}
        />
        <span>
          뉴스레터 수신과 이메일 저장에 동의합니다. (필수){' '}
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="nef-link" style={{ display: 'inline-block', padding: '11px 4px', margin: '-11px -4px', color: 'var(--color-accent-primary)', fontWeight: 700 }}>
            개인정보처리방침 보기<span className="sr-only">(새 창)</span>
          </Link>
        </span>
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        aria-describedby={reason ? reasonId : undefined}
        className="nef-btn"
      >
        {state === 'sending' ? '신청하는 중…' : buttonLabel}
      </button>
      {state !== 'sending' && reason && (
        <p id={reasonId} aria-live="polite" style={{ margin: 0, fontSize: fs(13), color: showFormatError ? 'var(--color-text-danger)' : 'var(--color-text-muted)' }}>
          {reason}
        </p>
      )}
      {state === 'error' && errMsg && (
        <p role="alert" style={{ margin: 0, fontSize: fs(14), color: 'var(--color-text-danger)' }}>
          {errMsg}
        </p>
      )}
    </form>
  );
}
