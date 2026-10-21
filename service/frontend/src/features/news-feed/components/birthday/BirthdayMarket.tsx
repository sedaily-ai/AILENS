'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { EVENTS } from '@/shared/data/timelineEvents';
import snapshot from './data/birthdaySnapshot.json';
import { kstTodayStr } from '@/shared/lib/date/date';
import { useBirthdayToday } from './lib/useBirthdayToday';
import type { ViewMode } from './data/birthdayTypes';
import { BIRTHDAY_MARKET_PATH } from './data/birthdayRoutes';
import { calculate, dateLabel, parseDate, sharedYear } from './lib/birthdayModel';
import { prefetchFrontPage } from './lib/birthdayFrontPage';
import { getBirthdaySelection, getServerBirthdaySelection, rememberBirthdaySelection, subscribeBirthdaySelection, type BirthdaySelection } from './lib/birthdaySession';
import { BirthdayResults } from './BirthdayResults';
import { BirthdayDateDial } from './BirthdayDateDial';
import { nb } from './lib/keepTogether';
import styles from './birthdayMarket.module.css';

/** 생년월일 다이얼이 처음 가리키는 날. 예시 생일 기능은 2026-10-20 요청으로 없앴고, 다이얼 시작 위치로만 남겼다. */
const DIAL_START = '1996-06-01';

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
  const initialSelection: BirthdaySelection | null = year ? { date: `${year}-01-01`, mode: 'year' } : remembered;
  useEffect(() => {
    // 기존 홈의 연도 공유 링크도 새 결과 페이지로 이어 준다.
    // 클라이언트 전환 중에는 이전 페이지의 fragment가 잠깐 남을 수 있다.
    if (year && variant === 'entry' && window.location.pathname === '/' && sharedYear(window.location.hash) === year) {
      router.replace(`${BIRTHDAY_MARKET_PATH}#birthday-year=${year}`);
    }
  }, [year, variant, router]);
  const key = initialSelection ? `${initialSelection.date}-${initialSelection.mode}` : 'empty';
  return variant === 'entry' ? <BirthdayEntry key={key} /> : <BirthdayForm key={key} initialSelection={initialSelection} />;
}

function useDeparture() {
  const router = useRouter();
  const [error, setError] = useState('');
  function depart(date: string, mode: ViewMode, open: (selection: BirthdaySelection) => void = () => router.push(BIRTHDAY_MARKET_PATH)) {
    if (!date) { setError('생일을 넣어주세요.'); return; }
    if (!parseDate(date)) { setError(`1900년 1월 1일부터 ${dateLabel(kstTodayStr())}까지의 날짜를 넣어주세요.`); return; }
    setError('');
    const next = { date, mode };
    rememberBirthdaySelection(next);
    // 그날 신문은 '타임머신 타기'를 누른 지금부터 받기 시작한다(홈에서는 결과 페이지로 넘어가는 동안).
    // 다이얼을 돌리는 동안에는 보내지 않는다 — 날짜는 그날 신문을 찾을 때만 서버로 간다.
    if (mode === 'personal') prefetchFrontPage(date);
    open(next);
  }
  return { error, setError, depart };
}

/**
 * 생일 입력 — 홈 진입(그날로 떠나요)과 결과 페이지가 같은 다이얼·숫자 입력 구조를 쓴다.
 * 홈은 생일만 받아 결과 페이지로 넘기며 여기서 자료를 부르지 않는다.
 */
function BirthdayIntro({ heading: Heading, formId, initialDate, error, onDateChange, onDepart }: {
  heading: 'h2' | 'h3'; formId: string; initialDate: string; error: string;
  onDateChange: () => void; onDepart: (date: string, mode: ViewMode) => void;
}) {
  const id = useId();
  const today = useBirthdayToday();
  const [birthday, setBirthday] = useState(initialDate);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onDepart(birthday, 'personal'); }
  // 넓은 화면은 왼쪽에 소개·출발 버튼, 오른쪽에 다이얼을 둬 빈 칸 없이 한 덩어리로 보이게 한다(좁은 화면은 소개 → 다이얼 → 출발 순으로 쌓인다).
  return <div className={styles.intro}>
    <form id={formId} tabIndex={-1} onSubmit={submit} autoComplete="off" className={styles.form}>
      <div className={styles.introCopy}>
        <p className={styles.eyebrow}>내 생일 타임머신</p>
        <Heading className={styles.introTitle}>내 생일에 샀다면,<br />지금은?</Heading>
        <p className={styles.description}>그날 서울경제 1면부터 최저시급, 연금 달력까지.<br />생일을 넣고 그날로 돌아가 보세요.</p>
      </div>
      <BirthdayDateDial today={today} value={birthday} onChange={date => { setBirthday(date); onDateChange(); }} errorId={`${id}-error`} />
      <div className={styles.departure}>
        <p className={styles.note}>생일은 이 탭에만 남고 탭을 닫으면 지워져요. 날짜는 {nb('그날 신문을')} {nb('찾을 때만')} 서버로 보내요. 100만 원 계산은 {nb('연도별 자료만')} 받아 {nb('이 기기에서')} 해요.</p>
        <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>
        <button type="submit" className={styles.primary}>타임머신 타기</button>
      </div>
    </form>
  </div>;
}

function BirthdayEntry() {
  const id = useId();
  const { error, setError, depart } = useDeparture();
  return <div className={styles.market} data-clarity-mask="true">
    <BirthdayIntro heading="h3" formId={`${id}-form`} initialDate={DIAL_START} error={error} onDateChange={() => setError('')} onDepart={(date, mode) => depart(date, mode)} />
  </div>;
}

/** 결과 페이지. 홈에서 고른 생일이 있으면 바로 결과를, 없으면(새로고침·직접 방문) 다이얼 입력을 보여 준다. */
function BirthdayForm({ initialSelection }: { initialSelection: BirthdaySelection | null }) {
  const id = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const initialDate = initialSelection?.mode === 'year' ? DIAL_START : initialSelection?.date ?? DIAL_START;
  const [selection, setSelection] = useState<BirthdaySelection | null>(initialSelection);
  const [editing, setEditing] = useState(!selection);
  const { error, setError, depart } = useDeparture();
  const result = selection ? calculate(selection.date, data, selection.mode) : null;

  useEffect(() => {
    if (!editing) resultRef.current?.focus({ preventScroll: true });
  }, [editing]);

  function show(date: string, mode: ViewMode) {
    depart(date, mode, next => {
      if (window.location.hash) {
        // 공유 화면에서 다른 생일을 조회하면 이전 공유 연도를 남기지 않는다.
        window.history.replaceState(window.history.state, '', BIRTHDAY_MARKET_PATH);
      }
      setSelection(next);
      setEditing(false);
    });
  }
  function edit() {
    setEditing(true);
    requestAnimationFrame(() => {
      const form = document.getElementById(`${id}-form`);
      form?.focus({ preventScroll: true });
      form?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  return (
    <div className={styles.market} data-clarity-mask="true">
      {editing ? <BirthdayIntro heading="h2" formId={`${id}-form`} initialDate={initialDate} error={error} onDateChange={() => setError('')} onDepart={show} />
        : <div className={styles.editBar}><button type="button" className={styles.secondary} onClick={edit}>← 다른 생일 입력</button><p>{selection?.mode === 'year' ? '출생연도로 공유된 결과예요.' : '선택한 날로 돌아왔어요.'}</p></div>}
      {!editing && result && selection && <div ref={resultRef} tabIndex={-1} className={styles.results} aria-label="내 생일 타임머신 결과"><BirthdayResults key={`${selection.date}-${selection.mode}`} result={result} mode={selection.mode} onEdit={edit} /></div>}
    </div>
  );
}
