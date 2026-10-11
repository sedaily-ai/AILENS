'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { NEEDS, SITUATIONS, recommendEditors, type LetterEditor, type NeedId, type SituationId } from '../../data/editors';
import { fetchMailPreview, sendTestMail, subscribeByEmail, type InterestItem } from '../../data/interestApi';
import { EditorAvatar } from '../EditorAvatar';

const EMAIL_OK = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$/;

/**
 * 메일 구독 대화상자. 행동 정의: docs/product/모아쓰기레터/구독_UX_행동정의.md
 * 입력은 이메일 하나가 핵심이고(주기·시각은 기본값이 있어 건드리지 않아도 됨), 동의는 미리 체크하지 않으며, 신청 뒤에는 "메일 확인"까지 안내한다.
 */
export function SubscribeDialog({ open, onClose, interests, title, lead, source, editors = [] }: { open: boolean; onClose: () => void; interests: InterestItem[]; title: string; lead?: ReactNode; source: string; editors?: LetterEditor[] }) {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [consent, setConsent] = useState(false);
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [sits, setSits] = useState<SituationId[]>([]);
  const [needs, setNeeds] = useState<NeedId[]>([]);
  const [picked, setPicked] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [testError, setTestError] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
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

  // "이렇게 와요": 서버가 만든 실제 메일 본문을 처음 눌렀을 때 한 번만 불러와 대화상자 안에 보여 준다.
  const togglePreview = async () => {
    if (previewOpen) return setPreviewOpen(false);
    setPreviewOpen(true);
    trackEvent('letter_sub_preview', { source });
    if (preview) return;
    setPreviewBusy(true);
    setPreview(await fetchMailPreview());
    setPreviewBusy(false);
  };

  // 신청 전에 메일이 실제로 오는지 보는 테스트 한 통. 구독과 별개이고 이후 메일은 가지 않는다.
  const sendTest = async () => {
    setTouched(true);
    if (!valid) return;
    setTestState('busy');
    setTestError('');
    trackEvent('letter_sub_test', { source });
    const res = await sendTestMail(email.trim());
    if (!res.ok) { setTestState('idle'); return setTestError(res.message); }
    setTestState('sent');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !consent) return;
    setBusy(true);
    setError('');
    trackEvent('letter_sub_submit', { source });
    const res = await subscribeByEmail({ email: email.trim(), interests, editors: editors.map((e) => e.id), frequency: 'daily', sendHour: 8 });
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
              <li><b>3</b><span>끝! 겹치는 레터가 올라오면 바로 도착해요</span></li>
            </ol>
            <p className="lt-dlg-tip">몇 분이 지나도 안 보이면 스팸함을 확인해 주세요. 확인 전에는 아무 메일도 보내지 않아요.</p>
            {!picked ? (
              <div className="lt-ob">
                <h3 className="lt-ob-h">어떤 분께 맞춰 드릴까요? <small>선택 · 건너뛰어도 괜찮아요</small></h3>
                <p className="lt-ob-q">지금 상황 <small>최대 2개</small></p>
                <div className="lt-ob-chips" role="group" aria-label="상황">
                  {SITUATIONS.map((x) => (
                    <button key={x.id} type="button" aria-pressed={sits.includes(x.id)} onClick={() => setSits((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : p.length < 2 ? [...p, x.id] : p))}>{x.label}</button>
                  ))}
                </div>
                <p className="lt-ob-q">필요한 것 <small>최대 2개</small></p>
                <div className="lt-ob-chips" role="group" aria-label="필요한 것">
                  {NEEDS.map((x) => (
                    <button key={x.id} type="button" aria-pressed={needs.includes(x.id)} onClick={() => setNeeds((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : p.length < 2 ? [...p, x.id] : p))}>{x.label}</button>
                  ))}
                </div>
                <div className="lt-ob-actions">
                  <button type="button" className="lt-dlg-primary" disabled={sits.length === 0 && needs.length === 0} onClick={() => { trackEvent('letter_onboard_done', { source, situations: sits.join(','), needs: needs.join(',') }); setPicked(true); }}>맞는 에디터 보기</button>
                  <button type="button" className="lt-dlg-skip" onClick={onClose}>건너뛰기</button>
                </div>
              </div>
            ) : (
              <div className="lt-ob">
                <h3 className="lt-ob-h">이 에디터가 맞을 것 같아요</h3>
                {recommendEditors(sits, needs).length > 0 ? (
                  <ul className="lt-ob-rec">
                    {recommendEditors(sits, needs).map(({ editor, why }) => (
                      <li key={editor.id}>
                        <EditorAvatar editor={editor} size={44} />
                        <div><strong>{editor.name} <small>{editor.role}</small></strong><p>{why}</p></div>
                        <a href={`/letter/editors/${editor.id}`} className="lt-ob-go">보러 가기</a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="lt-ob-none">고르신 조건에 맞는 에디터가 아직 없어요. 에디터 전체를 둘러볼 수 있어요.</p>
                )}
                <p className="lt-ob-note">레터 본문은 모든 에디터가 같은 중립 원칙을 따라요. 고르신 내용은 에디터 추천에만 쓰고, 언제든 바꿀 수 있어요.</p>
                <button type="button" className="lt-dlg-primary" onClick={onClose}>닫기</button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            {editors.length > 0 && (
              <div className="lt-dlg-faces" aria-hidden>
                {editors.slice(0, 4).map((e) => <span key={e.id} className="lt-dlg-face"><EditorAvatar editor={e} size={56} /></span>)}
              </div>
            )}
            <h2 id="lt-dlg-title" className="lt-dlg-h">{title}</h2>
            {lead && <div className="lt-dlg-lead">{lead}</div>}
            <ul className="lt-dlg-promise" aria-label="약속">
              <li>겹치는 레터가 나올 때만 보내요</li>
              <li>새 레터가 올라오면 바로, 한 통에 한 편</li>
              <li>메일 아래 링크로 언제든 수신거부</li>
            </ul>

            <label className="lt-dlg-field" htmlFor="lt-dlg-email">
              <span>이메일</span>
              <input id="lt-dlg-email" ref={inputRef} type="email" inputMode="email" autoComplete="email" value={email} placeholder="name@example.com"
                aria-invalid={showEmailError} aria-describedby={showEmailError ? 'lt-dlg-email-err' : undefined}
                onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
            </label>
            {showEmailError && <p id="lt-dlg-email-err" className="lt-dlg-err" role="alert">이메일 주소 형식을 확인해 주세요</p>}

            <button type="button" className="lt-dlg-prevbtn" aria-expanded={previewOpen} onClick={togglePreview}>
              {previewOpen ? '미리보기 닫기' : '이렇게 와요 · 메일 미리보기'}
            </button>
            {previewOpen && (
              <div className="lt-dlg-prev">
                {previewBusy ? <p className="lt-dlg-prevmsg">불러오는 중…</p> : preview ? (
                  <>
                    <p className="lt-dlg-prevsub">{preview.subject}</p>
                    <iframe title="메일 미리보기" className="lt-dlg-frame" sandbox="" srcDoc={preview.html} />
                  </>
                ) : <p className="lt-dlg-prevmsg">지금은 미리보기를 불러오지 못했어요.</p>}
              </div>
            )}

            <div className="lt-dlg-test">
              <button type="button" className="lt-dlg-testbtn" onClick={sendTest} disabled={testState === 'busy' || !valid}>
                {testState === 'busy' ? '보내는 중…' : testState === 'sent' ? '보냈어요. 다시 받기' : '테스트로 한 통 먼저 받아보기'}
              </button>
              <span className="lt-dlg-testnote">{testState === 'sent' ? '메일함(스팸함 포함)을 확인해 주세요. 구독 신청과는 별개예요.' : '실제 레터 한 편을 샘플로 보내 드려요. 구독 신청과는 별개예요.'}</span>
              {testError && <span className="lt-dlg-err" role="alert">{testError}</span>}
            </div>

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
            <p className="lt-dlg-foot">신청하면 확인 메일이 가요. 메일의 버튼을 눌러야 구독이 시작되고, 이후 새 레터가 올라오면 바로 보내 드려요.</p>
          </form>
        )}
      </div>
    </div>
  );
}
