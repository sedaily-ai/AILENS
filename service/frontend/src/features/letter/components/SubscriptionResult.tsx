'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { confirmSubscription, unsubscribeByToken } from '../data/interestApi';
import { LETTER_CSS } from './letterStyles';

const COPY = {
  confirm: { run: confirmSubscription, ok: ['신청이 완료됐어요', '선택한 관심사와 겹치는 레터를 메일로 보내 드릴게요. 모든 메일에서 수신거부할 수 있어요.'], busy: '확인하는 중…' },
  unsubscribe: { run: unsubscribeByToken, ok: ['수신거부가 완료됐어요', '이 주소로는 더 이상 레터 메일을 보내지 않아요.'], busy: '처리하는 중…' },
} as const;

/** 메일 링크(?token=)로 들어와 확인·수신거부를 한 번 실행하고 결과를 보여 준다. */
export function SubscriptionResult({ mode, token }: { mode: 'confirm' | 'unsubscribe'; token: string }) {
  const [state, setState] = useState<'busy' | 'ok' | 'fail'>(token ? 'busy' : 'fail');
  const [message, setMessage] = useState(token ? '' : '링크가 올바르지 않아요.');
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void COPY[mode].run(token).then((res) => {
      if (!alive) return;
      setState(res.ok ? 'ok' : 'fail');
      if (!res.ok) setMessage(res.message);
    });
    return () => { alive = false; };
  }, [mode, token]);
  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <div className="lt-sub-box lt-sub-result" role="status">
        <strong>{state === 'busy' ? COPY[mode].busy : state === 'ok' ? COPY[mode].ok[0] : '처리하지 못했어요'}</strong>
        <p>{state === 'ok' ? COPY[mode].ok[1] : state === 'fail' ? message : ''}</p>
        <Link href="/letter" className="lt-int-link">레터 목록으로</Link>
      </div>
    </div>
  );
}
