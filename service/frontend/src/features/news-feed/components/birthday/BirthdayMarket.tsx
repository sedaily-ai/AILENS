'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EVENTS } from '@/shared/data/timelineEvents';
import snapshot from './data/birthdaySnapshot.json';
import { kstTodayStr } from '@/shared/lib/date/date';
import { useBirthdayToday } from './lib/useBirthdayToday';
import type { Sex, ViewMode } from './data/birthdayTypes';
import { BIRTHDAY_MARKET_PATH } from './data/birthdayRoutes';
import { calculate, dateLabel, parseDate, sharedYear } from './lib/birthdayModel';
import { getBirthdaySelection, getServerBirthdaySelection, rememberBirthdaySelection, subscribeBirthdaySelection, type BirthdaySelection } from './lib/birthdaySession';
import { BirthdayResults } from './BirthdayResults';
import { BirthdayDateDial } from './BirthdayDateDial';
import styles from './birthdayMarket.module.css';

const data = { ...snapshot, events: EVENTS };
const readYear = () => sharedYear(window.location.hash) ?? '';
const serverYear = () => '';
function subscribeYear(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => { window.removeEventListener('hashchange', callback); window.removeEventListener('popstate', callback); };
}

export default function BirthdayMarket({ variant = 'page' }: { variant?: 'entry' | 'page' }) {
  const router = useRouter();
  const year = useSyncExternalStore(subscribeYear, readYear, serverYear);
  const remembered = useSyncExternalStore(subscribeBirthdaySelection, getBirthdaySelection, getServerBirthdaySelection);
  const initialSelection: BirthdaySelection | null = year ? { date: `${year}-01-01`, sex: 'all', mode: 'year' } : remembered;
  useEffect(() => {
    // 기존 홈의 연도 공유 링크도 새 결과 페이지로 이어 준다.
    // 클라이언트 전환 중에는 이전 페이지의 fragment가 잠깐 남을 수 있다.
    if (year && variant === 'entry' && window.location.pathname === '/' && sharedYear(window.location.hash) === year) {
      router.replace(`${BIRTHDAY_MARKET_PATH}#birthday-year=${year}`);
    }
  }, [year, variant, router]);
  const key = initialSelection ? `${initialSelection.date}-${initialSelection.sex}-${initialSelection.mode}` : 'empty';
  return <BirthdayForm key={`${variant}-${key}`} variant={variant} initialSelection={initialSelection} />;
}

function BirthdayForm({ variant, initialSelection }: { variant: 'entry' | 'page'; initialSelection: BirthdaySelection | null }) {
  const router = useRouter();
  const id = useId();
  const today = useBirthdayToday();
  const resultRef = useRef<HTMLDivElement>(null);
  const [birthday, setBirthday] = useState(initialSelection?.date ?? '1988-02-03');
  const [sex, setSex] = useState<Sex>(initialSelection?.sex ?? 'all');
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<BirthdaySelection | null>(variant === 'page' ? initialSelection : null);
  const [editing, setEditing] = useState(!selection);
  const result = selection ? calculate(selection.date, selection.sex, data) : null;
  const IntroHeading = variant === 'entry' ? 'h3' : 'h2';

  useEffect(() => {
    if (!editing) resultRef.current?.focus({ preventScroll: true });
  }, [editing]);

  function show(date: string, mode: ViewMode) {
    if (!parseDate(date)) { setError(`1900년 1월 1일부터 ${dateLabel(kstTodayStr())}까지의 날짜를 넣어주세요.`); return; }
    setError('');
    const next = { date, sex, mode };
    if (variant === 'page' && window.location.hash) {
      // 공유 화면에서 다른 생일을 조회하면 이전 공유 연도를 남기지 않는다.
      window.history.replaceState(window.history.state, '', BIRTHDAY_MARKET_PATH);
    }
    rememberBirthdaySelection(next);
    if (variant === 'entry') { router.push(BIRTHDAY_MARKET_PATH); return; }
    setSelection(next);
    setEditing(false);
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); show(birthday, 'personal'); }

  return (
    <div className={styles.market} data-clarity-mask="true">
      {editing ? <div className={styles.intro}>
        <p className={styles.eyebrow}>생일 시세 타임머신</p>
        <IntroHeading className={styles.introTitle}>내가 태어난 날,<br />경제는 얼마였을까요?</IntroHeading>
        <p className={styles.description}>그날의 1억 원부터 한 시간의 일, 미래의 연금까지.<br />생일을 넣고 달라진 경제를 만나보세요.</p>
        <form id={`${id}-form`} tabIndex={-1} onSubmit={submit} autoComplete="off" className={styles.form}>
          <BirthdayDateDial today={today} value={birthday} onChange={date => { setBirthday(date); setError(''); }} errorId={`${id}-error`} />
          <div className={styles.departure}>
            <fieldset className={styles.sexField} aria-describedby={`${id}-help`}>
              <legend>성별 <span>선택</span></legend>
              <div className={styles.sexOptions}>{([{ value: 'all', label: '선택 안 함' }, { value: 'female', label: '여성' }, { value: 'male', label: '남성' }] as const).map(option =>
                <label key={option.value}><input type="radio" name={`${id}-sex`} value={option.value} checked={sex === option.value} onChange={() => setSex(option.value)} /><span>{option.label}</span></label>
              )}</div>
            </fieldset>
            <p id={`${id}-help`} className={styles.note}>생일은 저장하지 않아요.<br />성별은 기대수명에만 사용해요.</p>
            <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>
            <button type="submit" className={styles.primary}>내 생일 시세 보기</button>
          </div>
        </form>
      </div> : <div className={styles.editBar}><p>선택한 날의 경제를 살펴보세요.</p><button type="button" className={styles.secondary} onClick={() => {
        setEditing(true);
        requestAnimationFrame(() => document.getElementById(`${id}-form`)?.focus({ preventScroll: true }));
      }}>생일 바꾸기</button></div>}
      {editing && <div className={styles.dataNotice}><strong>18개 항목으로 보는 경제의 변화</strong><span>확인된 자료부터 보여드려요. 준비 중인 항목도 함께 담았어요. 자료 확인 {snapshot.retrievedAt.replaceAll('-', '.')}</span></div>}
      {!editing && result && selection && <div ref={resultRef} tabIndex={-1} className={styles.results} aria-label="생일 시세 결과"><BirthdayResults result={result} mode={selection.mode} /></div>}
    </div>
  );
}
