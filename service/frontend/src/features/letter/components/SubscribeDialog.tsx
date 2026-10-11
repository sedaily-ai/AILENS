'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { subscribeByEmail, type InterestItem } from '../data/interestApi';

type Frequency = 'daily' | 'weekly';
const FREQUENCIES: { id: Frequency; label: string; hint: string }[] = [
  { id: 'daily', label: '매일', hint: '새 레터가 있는 날' },
  { id: 'weekly', label: '매주 월요일', hint: '한 주에 한 편' },
];
const HOURS = [{ h: 8, label: '오전 8시' }, { h: 12, label: '낮 12시' }, { h: 18, label: '오후 6시' }];
const EMAIL_OK = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$/;

/**
 * 메일 구독 대화상자. 행동 정의: docs/product/모아쓰기레터/구독_UX_행동정의.md
 * 입력은 이메일 하나가 핵심이고(주기·시각은 기본값이 있어 건드리지 않아도 됨), 동의는 미리 체크하지 않으며, 신청 뒤에는 "메일 확인"까지 안내한다.
 */
export function SubscribeDialog({ open, onClose, interests, title, lead, source }: { open: boolean; onClose: () => void; interests: InterestItem[]; title: string; lead?: ReactNode; source: string }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [hour, setHour] = useState(8);
  const [consent, setConsent] = useState(false);
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    trackEvent('letter_sub_open', { source });
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose, source]);

  if (!open) return null;
  const valid = EMAIL_OK.test(email.trim());
  const showEmailError = touched && email.trim() !== '' && !valid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !consent) return;
    setBusy(true);
    setError('');
    trackEvent('letter_sub_submit', { source, frequency, hour });
    const res = await subscribeByEmail({ email: email.trim(), interests, frequency, sendHour: hour });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    trackEvent('letter_sub_requested', { source });
    setSentTo(email.trim());
  };

  return (
    <div className="lt-dlg-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lt-dlg" role="dialog" aria-modal="true" aria-labelledby="lt-dlg-title">
        <button type="button" className="lt-dlg-x" onClick={onClose} aria-label="닫기">×</button>
        {sentTo ? (
          <div className="lt-dlg-done">
            <span className="lt-dlg-check" aria-hidden>✓</span>
            <h2 id="lt-dlg-title" className="lt-dlg-h">확인 메일을 보냈어요</h2>
            <p className="lt-dlg-lead"><strong>{sentTo}</strong> 로 보냈어요. 아래 순서로 마치면 구독이 시작돼요.</p>
            <ol className="lt-dlg-steps">
              <li><b>1</b><span>메일함에서 &quot;[AI LENS 레터] 메일 받기 확인&quot;을 열어요</span></li>
              <li><b>2</b><span>&quot;신청 확인하기&quot; 버튼을 눌러요 (48시간 안에)</span></li>
              <li><b>3</b><span>끝! 겹치는 레터가 나오면 선택한 시간에 도착해요</span></li>
            </ol>
            <p className="lt-dlg-tip">몇 분이 지나도 안 보이면 스팸함을 확인해 주세요. 확인 전에는 아무 메일도 보내지 않아요.</p>
            <button type="button" className="lt-dlg-primary" onClick={onClose}>닫기</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id="lt-dlg-title" className="lt-dlg-h">{title}</h2>
            {lead && <div className="lt-dlg-lead">{lead}</div>}
            <ul className="lt-dlg-promise" aria-label="약속">
              <li>겹치는 레터가 나올 때만 보내요</li>
              <li>한 통에 레터 한 편, 하루 최대 1통</li>
              <li>메일 아래 링크로 언제든 수신거부</li>
            </ul>

            <label className="lt-dlg-field" htmlFor="lt-dlg-email">
              <span>이메일</span>
              <input id="lt-dlg-email" ref={inputRef} type="email" inputMode="email" autoComplete="email" value={email} placeholder="name@example.com"
                aria-invalid={showEmailError} aria-describedby={showEmailError ? 'lt-dlg-email-err' : undefined}
                onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
            </label>
            {showEmailError && <p id="lt-dlg-email-err" className="lt-dlg-err" role="alert">이메일 주소 형식을 확인해 주세요</p>}

            <fieldset className="lt-dlg-group">
              <legend>받는 주기</legend>
              <div className="lt-seg">
                {FREQUENCIES.map((f) => (
                  <button key={f.id} type="button" aria-pressed={frequency === f.id} onClick={() => setFrequency(f.id)}>
                    <b>{f.label}</b><small>{f.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="lt-dlg-group">
              <legend>받는 시각</legend>
              <div className="lt-seg lt-seg-3">
                {HOURS.map((x) => (
                  <button key={x.h} type="button" aria-pressed={hour === x.h} onClick={() => setHour(x.h)}><b>{x.label}</b></button>
                ))}
              </div>
            </fieldset>

            <div className="lt-dlg-consent">
              <label>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span><b>[필수]</b> 레터 메일 수신에 동의해요</span>
              </label>
              <button type="button" className="lt-dlg-more" aria-expanded={detail} onClick={() => setDetail((v) => !v)}>{detail ? '접기' : '자세히'}</button>
            </div>
            {detail && (
              <p className="lt-dlg-detail">
                이메일 주소와 선택한 관심 분야를 레터 메일을 보내는 목적으로만 써요. 수신거부하면 더 보내지 않아요. 자세한 내용은{' '}
                <Link href="/privacy" target="_blank">개인정보처리방침</Link>에서 볼 수 있어요.
              </p>
            )}
            {touched && !consent && valid && <p className="lt-dlg-err" role="alert">수신 동의에 체크해 주세요</p>}
            {error && <p className="lt-dlg-err" role="alert">{error}</p>}

            <button type="submit" className="lt-dlg-primary" disabled={busy || !valid || !consent}>{busy ? '신청하는 중…' : '구독 신청하기'}</button>
            <p className="lt-dlg-foot">신청하면 확인 메일이 가요. 메일의 버튼을 눌러야 구독이 시작돼요.</p>
          </form>
        )}
      </div>
    </div>
  );
}
