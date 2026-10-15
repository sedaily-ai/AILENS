'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notificationStatus, pushEnabled, visiblePushDevices } from '../lib/notificationPresentation';
import { useNotifications } from '../lib/useNotifications';
import { Bell, BellOff, Check, ChevronDown, Clock3 } from 'lucide-react';
import { notificationPreferenceError, type NotificationPreferences } from '../lib/notificationPreferences';
import type { NewsRecommendation } from '../lib/news/newsModel';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TYPES = [
  { key: 'briefing', title: '나를 위한 뉴스 브리핑', description: '자주 본 분야·키워드·저장 문장의 관심으로 새 뉴스를 모아요.' },
  { key: 'followups', title: '관심 이슈의 다음 소식', description: '저장한 이슈에 의미 있는 새 변화가 생겼을 때 알려드려요.' },
  { key: 'weekly', title: '한 주의 관심 기록', description: '지난주에 읽고 저장한 이야기를 돌아봐요.' },
] as const;

export function NotificationSettings({ recommendedTitle, recommendations, interestSummary }: { recommendedTitle?: string; recommendations?: NewsRecommendation[]; interestSummary?: { categories: string[]; keywords: string[]; sentenceWords: string[] } }) {
  const feed=useNotifications();
  const [consentChecked,setConsentChecked]=useState(false);
  const draft=feed.draft;
  if(feed.loading)return <section id="ml-notifications" className="ml-extension"><p role="status">계정 알림 설정을 불러오고 있어요.</p></section>;
  if(!feed.data||!draft)return <section id="ml-notifications" className="ml-extension"><p role="alert">{feed.error||'알림 설정을 불러오지 못했어요.'}</p><button type="button" className="ml-button" onClick={feed.retry}>다시 불러오기</button></section>;
  const data=feed.data,ready=!feed.busy,dirty=feed.dirty;
  const enabled=TYPES.filter(item=>draft[item.key]);
  const update=<K extends keyof NotificationPreferences>(key:K,value:NotificationPreferences[K])=>feed.setDraft({...draft,[key]:value});
  const validation = notificationPreferenceError(draft);
  const timeInvalid = !/^(?:0[8-9]|1\d|20):[0-5]\d$/.test(draft.time);
  const previewArticle = recommendations?.find((item) => item.reasons.some((reason) => reason.type === 'category' ? draft.categorySource : reason.type === 'keyword' ? draft.keywordSource : draft.sentenceSource));
  const developerTools = process.env.NODE_ENV === 'development';
  const liveEnabled = pushEnabled(data);
  const devices = visiblePushDevices(data, developerTools);
  const schedule = `${draft.frequency === 'daily' ? '매일' : '월·수·금'} ${draft.time}`;
  return (
    <section id="ml-notifications" className="ml-extension" aria-labelledby="ml-notifications-title">
      <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-notifications-title">소식이 찾아오는 시간</h2><p className="ml-helper">받고 싶은 이야기와 시간을 미리 골라보세요.</p></div><span className="ml-pending-label">{liveEnabled?'계정 개인화 푸시':'알림 발송은 아직 활성화되지 않았어요.'}</span></div>
      <p id="ml-push-scope" className="ml-connection-note">알림 유형과 시간을 계정에 저장해요. 수신 동의와 이 브라우저의 권한·기기 연결은 각각 따로 진행해요.</p>
      <form noValidate aria-describedby="ml-push-scope" onSubmit={event=>{event.preventDefault();if(!validation)void feed.save();}}>
        <fieldset className="ml-notification-fields" disabled={!ready}>
          <legend className="ml-sr-only">계정 개인화 푸시 설정</legend>
          <div className="ml-notification-types">{TYPES.map((item) => <label key={item.key} className="ml-notification-type"><span><strong>{item.title}</strong><small>{item.description}</small></span><input type="checkbox" role="switch" aria-label={item.title} checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} /></label>)}</div>
          <fieldset className="ml-news-alert-sources"><legend>뉴스 브리핑에 활용할 관심 기록</legend><p>새 글을 고를 기준이에요. 저장한 설정에만 반영하며 수신 동의를 자동으로 만들지 않아요.</p>{([
            { key: 'categorySource', label: '자주 본 뉴스 분야', description: interestSummary?.categories.slice(0, 3).join(' · ') || '분야를 직접 고르거나 뉴스를 살펴보면 반영해요.' },
            { key: 'keywordSource', label: '열람한 글의 키워드', description: interestSummary?.keywords.slice(0, 4).map((term) => `#${term}`).join(' ') || '등록된 용어가 있는 글을 살펴보면 반영해요.' },
            { key: 'sentenceSource', label: '내 서랍 문장의 주제', description: interestSummary?.sentenceWords.slice(0, 4).join(' · ') || '로그인 후 저장한 문장을 사용할 수 있어요.' },
          ] as const).map((item) => <label key={item.key}><input type="checkbox" checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}<p>문장 원문은 알림 미리보기에 표시하지 않아요. 이 선택은 계정의 브리핑 후보에 적용돼요. 뉴스 이용 형식이 분석되면 관심이 같은 후보의 순서와 이어볼 형식에도 반영해요.</p></fieldset>
          <details className="ml-format-method" open={liveEnabled || !!validation}>
            <summary>{liveEnabled ? '발송 시간 설정' : '발송 시간을 미리 설정할래요'}</summary>
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
          </details>
          {validation && <p id="ml-time-error" className="ml-settings-error" role="alert">{validation}</p>}
          <p id="ml-quiet-note" className="ml-settings-help">선택한 시간대의 21:00~08:00은 쉬는 시간이에요. 여러 소식은 하루 최대 한 번으로 묶고, 새로운 내용이 없으면 보내지 않아요.</p>
          <label className="ml-pause-setting"><input type="checkbox" checked={draft.paused} onChange={(event) => update('paused', event.target.checked)} /><span>모든 개인화 푸시 일시 중지<small>선택한 유형과 시간은 그대로 보관해요.</small></span></label>
        </fieldset>
        <div className="ml-notification-preview" aria-label="알림 설정 미리보기"><div className="ml-preview-label"><Bell size={15} aria-hidden/><span>선택한 유형 · 발송 결과와 별개</span></div>{draft.paused?<h3><BellOff size={17} aria-hidden/>알림 일시 중지</h3>:!enabled.length?<h3>받고 싶은 소식부터 골라보세요</h3>:<><h3>{previewArticle?.title??recommendedTitle??'나의 관심에 맞는 새 소식'}</h3><ul>{enabled.map(item=><li key={item.key}>{item.title}: {item.key==='weekly'?`매주 ${WEEKDAYS[draft.weeklyDay]}요일 ${draft.time}`:schedule}</li>)}</ul><small>{draft.timezone} 기준 · 하루 최대1묶음</small></>}</div>
        <div className="ml-settings-actions"><button type="submit" className="ml-button" disabled={!ready||!!validation||!dirty}>계정에 알림 설정 저장</button><button type="button" className="ml-button ml-button-quiet" disabled={!ready||!dirty} onClick={feed.reset}>변경 취소</button><span>{dirty?'저장하지 않은 변경':'계정에 저장된 설정'}</span></div>
      </form>
      <section className="ml-notification-consent" aria-label="개인화 푸시 수신 동의"><h3>개인화 푸시 수신 동의</h3><p className="ml-helper">{data.consent.current?'현재 정책으로 수신에 동의했어요.':'설정 저장과 별도로, 받고 싶은 소식의 수신에 동의해 주세요.'} <Link href="/privacy">개인정보처리방침</Link></p>
      {!data.consent.current?<><label className="ml-pause-setting"><input type="checkbox" checked={consentChecked} onChange={event=>setConsentChecked(event.target.checked)}/><span>선택한 뉴스·레터 소식과 주간 기록을 개인화 푸시로 받는 데 동의합니다.<small>정책 버전 {data.config.policy_version}. 저장 문장 활용은 위 기준에서 별도로 선택해요.</small></span></label><button type="button" className="ml-button" disabled={!consentChecked||!ready||dirty} onClick={()=>void feed.consent(true)}>수신 동의 저장</button></>:<button type="button" className="ml-button ml-button-quiet" disabled={!ready} onClick={()=>{setConsentChecked(false);void feed.consent(false);}}>수신 동의 철회</button>}
      </section>
      {(liveEnabled || developerTools || devices.length > 0) && <section className="ml-notification-devices" aria-label="푸시 기기 연결"><h3>알림을 받을 기기</h3><p className="ml-helper">권한을 허용한 브라우저의 푸시 구독을 연결해요. 활성 연결 {devices.filter(sub=>!sub.simulated).length}개</p>
      {(liveEnabled || developerTools) && <button type="button" className="ml-button" disabled={!ready||dirty||!data.consent.current||!data.config.supported||devices.some(s=>s.id===feed.currentDevice)} onClick={()=>void feed.connect()}>{data.config.mode==='dry_run'?'개발 검증 기기 연결':'이 브라우저 연결'}</button>}
      <ul className="ml-device-list">{devices.map((sub,index)=><li key={sub.id}><span>{sub.simulated?'개발 검증 기기':sub.id===feed.currentDevice?'이 기기':`연결 기기 ${index+1}`}</span><button type="button" className="ml-text-link" disabled={!ready} onClick={()=>void feed.disconnect(sub.id)}>연결 해제</button></li>)}</ul>
      </section>}
      <section className="ml-notification-server" aria-label="알림 상태"><h3>알림 상태</h3><p className="ml-helper">{notificationStatus(data)}</p>
      {liveEnabled && data.delivery.blocked_reasons.length>0&&<p className="ml-helper">{data.delivery.blocked_reasons.map(reason=>({no_types:'알림 유형 선택',no_consent:'수신 동의',policy_pending:'변경 정책 재동의',no_subscription:'기기 연결',provider_unavailable:'서버 발송 구성'})[reason as 'no_types']??'연결 상태').join(' · ')} 확인이 필요해요.</p>}
      {data.delivery.last_sent_at&&<p className="ml-helper">최근 알림 전송: {new Date(data.delivery.last_sent_at).toLocaleString('ko-KR')} · 기기 상태에 따라 도착이 늦어질 수 있어요.</p>}
      {developerTools && <><button type="button" className="ml-button ml-button-quiet" disabled={!ready||dirty} onClick={()=>void feed.loadPreview()}>서버 후보 미리보기</button>{data.delivery.last_simulated_at&&<p className="ml-helper">최근 모의 처리: {new Date(data.delivery.last_simulated_at).toLocaleString('ko-KR')}</p>}{feed.preview&&<div className="ml-notification-preview"><strong>개발 검증 · 실제 발송 없음</strong>{feed.preview.empty?<p>현재 설정에 맞는 새 소식이 없어요.</p>:<><ul>{feed.preview.items.map(item=><li key={item.href}><Link href={item.href} prefetch={false}>{item.title}</Link></li>)}</ul>{feed.preview.weekly&&<p>지난주 읽은 날 {feed.preview.weekly.read_days}일 · 저장 {feed.preview.weekly.saved_contents}건</p>}</>}</div>}</>}
      </section>
      <p className="ml-settings-feedback" role="status" aria-live="polite">{feed.message}</p>{feed.error&&<p role="alert" className="ml-settings-error">{feed.error}</p>}
      <p className="ml-storage-note">설정·동의는 계정 기준, 권한과 구독은 기기 기준이에요. 레터 이메일 구독은 별도이며 이 설정으로 바뀌지 않아요.</p>


    </section>
  );
}
