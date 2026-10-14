'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, ChevronDown, Clock3 } from 'lucide-react';
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_STORAGE_KEY, notificationPreferenceError, parseNotificationPreferences, type NotificationPreferences } from '../lib/notificationPreferences';
import type { NewsRecommendation } from '../lib/news/newsModel';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TYPES = [
  { key: 'briefing', title: '나를 위한 뉴스 브리핑', description: '자주 본 분야·키워드·저장 문장의 관심으로 새 뉴스를 모아요.' },
  { key: 'followups', title: '관심 이슈의 다음 소식', description: '저장한 이슈에 의미 있는 새 변화가 생겼을 때 알려드려요.' },
  { key: 'weekly', title: '한 주의 관심 기록', description: '지난주에 읽고 저장한 이야기를 돌아봐요.' },
] as const;

export function NotificationSettings({ recommendedTitle, recommendations, interestSummary }: { recommendedTitle?: string; recommendations?: NewsRecommendation[]; interestSummary?: { categories: string[]; keywords: string[]; sentenceWords: string[] } }) {
  const [draft, setDraft] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [saved, setSaved] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restoreNote, setRestoreNote] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
      const restored = parseNotificationPreferences(raw);
      /* eslint-disable react-hooks/set-state-in-effect -- 마운트 후 브라우저에만 있는 설정 초안을 복원한다. */
      if (restored) { setDraft(restored); setSaved(restored); setHasSaved(true); }
      else if (raw) setRestoreNote('이전 설정 초안을 읽지 못해 기본값으로 열었어요. 다시 저장해 주세요.');
    } catch { setRestoreNote('브라우저 저장소에 접근할 수 없어요. 화면에서 설정을 살펴볼 수 있어요.'); }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const enabled = TYPES.filter((item) => draft[item.key]);
  const update = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value })); setMessage(''); setError('');
  };
  const validation = notificationPreferenceError(draft);
  const timeInvalid = !/^(?:0[8-9]|1\d|20):[0-5]\d$/.test(draft.time);
  const previewArticle = recommendations?.find((item) => item.reasons.some((reason) => reason.type === 'category' ? draft.categorySource : reason.type === 'keyword' ? draft.keywordSource : draft.sentenceSource));
  const schedule = `${draft.frequency === 'daily' ? '매일' : '월·수·금'} ${draft.time}`;
  return (
    <section id="ml-notifications" className="ml-extension" aria-labelledby="ml-notifications-title">
      <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-notifications-title">소식이 찾아오는 시간</h2><p className="ml-helper">받고 싶은 이야기와 시간을 미리 골라보세요.</p></div><span className="ml-pending-label">푸시 발송 미연동</span></div>
      <p id="ml-push-scope" className="ml-connection-note">지금은 설정 미리보기예요. 이 브라우저에 초안만 저장하며, 수신 동의나 구독으로 처리되지 않아요. 실제 푸시는 발송되지 않아요.</p>
      <form noValidate aria-describedby="ml-push-scope" onSubmit={(event) => {
        event.preventDefault(); setMessage('');
        if (validation) { setError(validation); return; }
        try {
          localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(draft));
          setSaved({ ...draft }); setHasSaved(true); setError(''); setRestoreNote('');
          setMessage('설정 초안을 이 브라우저에 저장했어요. 실제 알림 수신은 시작되지 않아요.');
        } catch { setError('설정 초안을 저장하지 못했어요. 선택은 유지돼요. 브라우저 저장 설정을 확인하고 다시 시도해 주세요.'); }
      }}>
        <fieldset className="ml-notification-fields" disabled={!ready}>
          <legend className="ml-sr-only">개인화 푸시 설정 초안</legend>
          <div className="ml-notification-types">{TYPES.map((item) => <label key={item.key} className="ml-notification-type"><span><strong>{item.title}</strong><small>{item.description}</small></span><input type="checkbox" role="switch" aria-label={item.title} checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} /></label>)}</div>
          <fieldset className="ml-news-alert-sources"><legend>뉴스 브리핑에 활용할 관심 기록</legend><p>새 글을 고를 기준이에요. 실제 발송은 아직 연결되지 않았어요.</p>{([
            { key: 'categorySource', label: '자주 본 뉴스 분야', description: interestSummary?.categories.slice(0, 3).join(' · ') || '분야를 직접 고르거나 뉴스를 살펴보면 반영해요.' },
            { key: 'keywordSource', label: '열람한 글의 키워드', description: interestSummary?.keywords.slice(0, 4).map((term) => `#${term}`).join(' ') || '등록된 용어가 있는 글을 살펴보면 반영해요.' },
            { key: 'sentenceSource', label: '내 서랍 문장의 주제', description: interestSummary?.sentenceWords.slice(0, 4).join(' · ') || '로그인 후 저장한 문장을 사용할 수 있어요.' },
          ] as const).map((item) => <label key={item.key}><input type="checkbox" checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}<p>문장 원문은 알림 미리보기에 표시하지 않아요. 이 선택은 브리핑 초안에만 적용돼요.</p></fieldset>
          <div className="ml-delivery-settings">
            <h3><Clock3 size={16} aria-hidden /> 언제 받아볼까요?</h3>
            <fieldset className="ml-choice-field"><legend>브리핑·다음 소식 빈도</legend><div className="ml-frequency-options">
              <label><input type="radio" name="ml-notification-frequency" value="daily" checked={draft.frequency === 'daily'} onChange={() => update('frequency', 'daily')} aria-label="매일" /><span><strong>매일</strong><small>하루 한 번</small></span><Check size={15} aria-hidden /></label>
              <label><input type="radio" name="ml-notification-frequency" value="threeDays" checked={draft.frequency === 'threeDays'} onChange={() => update('frequency', 'threeDays')} aria-label="주 3회 · 월·수·금" /><span><strong>주 3회</strong><small>월·수·금에만</small></span><Check size={15} aria-hidden /></label>
            </div></fieldset>
            <div className="ml-delivery-grid">
              <div className="ml-setting-field"><label htmlFor="ml-delivery-time">받을 시간</label><input id="ml-delivery-time" type="time" min="08:00" max="20:59" value={draft.time} aria-invalid={timeInvalid} aria-describedby={timeInvalid ? 'ml-time-error' : 'ml-quiet-note'} onChange={(event) => update('time', event.target.value)} /></div>
              <div className="ml-setting-field"><label htmlFor="ml-delivery-timezone">시간대</label><div className="ml-select-wrap"><select id="ml-delivery-timezone" value={draft.timezone} onChange={(event) => update('timezone', event.target.value as NotificationPreferences['timezone'])}><option value="Asia/Seoul">서울 · 한국</option><option value="America/New_York">뉴욕 · 미국</option><option value="Europe/London">런던 · 영국</option><option value="UTC">UTC · 세계 표준시</option></select><ChevronDown size={15} aria-hidden /></div></div>
            </div>
            <fieldset className="ml-choice-field ml-weekday-field"><legend>주간 기록 받는 요일</legend><div className="ml-weekday-options">{WEEKDAYS.map((day, index) => <label key={day}><input type="radio" name="ml-notification-weekday" value={index} checked={draft.weeklyDay === index} aria-label={`${day}요일`} onChange={() => update('weeklyDay', index)} /><span>{day}</span></label>)}</div></fieldset>
          </div>
          {validation && <p id="ml-time-error" className="ml-settings-error" role="alert">{validation}</p>}
          <p id="ml-quiet-note" className="ml-settings-help">선택한 시간대의 21:00~08:00은 쉬는 시간이에요. 여러 소식은 하루 최대 한 번으로 묶고, 새로운 내용이 없으면 보내지 않는 방식으로 준비하고 있어요.</p>
          <label className="ml-pause-setting"><input type="checkbox" checked={draft.paused} onChange={(event) => update('paused', event.target.checked)} /><span>모든 개인화 푸시 일시 중지<small>선택한 유형과 시간은 그대로 보관해요.</small></span></label>
        </fieldset>
        <div className="ml-notification-preview" aria-label="개인화 알림 문구 예시">
          <div className="ml-preview-label"><Bell size={15} aria-hidden /><span>알림 문구 예시 · 실제 발송 아님</span></div>
          {draft.paused ? <><h3><BellOff size={17} aria-hidden /> 알림을 쉬어가는 중</h3><p>설정 초안에서 일시 중지를 선택했어요. 받아볼 유형과 시간은 유지돼요.</p></> : !enabled.length ? <><h3>받고 싶은 소식부터 골라보세요</h3><p>알림은 기본 꺼짐이에요. 유형을 고르면 문구와 일정을 미리 볼 수 있어요.</p></> : <><h3>{draft.briefing ? '오늘, 나의 관심에서 고른 뉴스' : draft.followups ? '관심 이슈의 다음 이야기를 만나요' : '지난주의 관심을 다시 펼쳐보세요'}</h3><p>{draft.briefing ? previewArticle?.title ?? (!recommendations ? recommendedTitle : null) ?? '선택한 관심 기록과 맞는 새 뉴스가 있으면 모아 전해드려요.' : draft.followups ? '저장한 이슈의 새 변화가 확인되면 관련 소식으로 연결해요.' : '읽고 저장한 이야기를 한곳에서 돌아봐요.'}</p><ul>{enabled.map((item) => <li key={item.key}>{item.title}: {item.key === 'weekly' ? `매주 ${WEEKDAYS[draft.weeklyDay]}요일 ${draft.time}` : schedule}</li>)}</ul><small>{draft.timezone} 기준 · 실제 발송 시 하루 최대 1건</small></>}
        </div>
        {restoreNote && <p className="ml-settings-help" role="status">{restoreNote}</p>}
        <div className="ml-settings-actions"><button type="submit" className="ml-button" disabled={!ready || !!validation || (hasSaved && !dirty)}>이 브라우저에 설정 저장</button><button type="button" className="ml-button ml-button-quiet" disabled={!ready || !dirty} onClick={() => { setDraft({ ...saved }); setError(''); setMessage(''); }}>변경 취소</button><span>{!ready ? '초안 불러오는 중' : dirty ? '저장하지 않은 변경' : hasSaved ? '브라우저에 저장된 초안' : '아직 저장하지 않은 초안'}</span></div>
        <p className="ml-settings-feedback" role="status" aria-live="polite">{message}</p>
        {error && <p className="ml-settings-error" role="alert">{error}</p>}
      </form>
      <p className="ml-storage-note">이 설정은 기기 간에 동기화되지 않아요. 실제 수신은 로그인·서버 연동·별도 동의·기기 권한 확인 후에 시작돼요. 레터 이메일 구독은 별도 서비스이며 이 설정으로 바뀌지 않아요.</p>
    </section>
  );
}
