'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { subscribeByEmail, type InterestItem } from '../data/interestApi';

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i);

/** 선택한 관심사와 겹치는 새 레터를 메일로 받는 신청. 신청 뒤 메일의 확인 링크를 열어야 완료된다(그 전에는 아무것도 보내지 않는다). */
export function SubscribeForm({ interests }: { interests: InterestItem[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [hour, setHour] = useState(8);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="lt-sub-box" role="status">
        <strong>확인 메일을 보냈어요</strong>
        <p>메일의 &quot;신청 확인하기&quot;를 누르면 신청이 끝나요. 48시간 안에 확인하지 않으면 신청은 취소돼요. 메일이 보이지 않으면 스팸함도 확인해 주세요.</p>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="lt-sub-box">
        <div>
          <strong>관심사와 겹치는 새 레터를 메일로 받기</strong>
          <p>고른 관심사와 겹치는 레터만 모아서 보내요. 겹치는 레터가 없는 날은 보내지 않아요.</p>
        </div>
        <button type="button" className="lt-int-btn" onClick={() => setOpen(true)}>메일로 받기</button>
      </div>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await subscribeByEmail({ email, interests, frequency, sendHour: hour });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    trackEvent('letter_subscribe_request', { frequency });
    setDone(true);
  };
  return (
    <form className="lt-sub-box lt-sub-form" onSubmit={submit}>
      <strong>메일로 받기</strong>
      <label className="lt-sub-field">
        <span>이메일</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      </label>
      <div className="lt-sub-row">
        <label className="lt-sub-field">
          <span>받는 주기</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly')}>
            <option value="daily">매일</option>
            <option value="weekly">매주 월요일</option>
          </select>
        </label>
        <label className="lt-sub-field">
          <span>받는 시각</span>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {HOURS.map((h) => <option key={h} value={h}>{h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`}</option>)}
          </select>
        </label>
      </div>
      <label className="lt-sub-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          레터 메일 수신에 동의해요. 이메일 주소와 선택한 관심사를 메일 발송 목적으로만 쓰고, 수신거부하면 더 보내지 않아요. 모든 메일에 수신거부 링크가 있어요.{' '}
          <Link href="/privacy" target="_blank">개인정보처리방침</Link>
        </span>
      </label>
      {error && <p className="lt-int-err" role="alert">{error}</p>}
      <div className="lt-int-actions">
        <button type="submit" className="lt-int-btn" disabled={busy || !consent || !email}>{busy ? '신청 중…' : '신청하기'}</button>
        <button type="button" className="lt-int-link" disabled={busy} onClick={() => setOpen(false)}>닫기</button>
      </div>
    </form>
  );
}
