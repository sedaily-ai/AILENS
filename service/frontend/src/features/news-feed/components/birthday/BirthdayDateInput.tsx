import { useId, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { dateFromDigits, FIRST_YEAR } from './lib/birthdayDial';
import { parseDate } from './lib/birthdayModel';
import styles from './birthdayMarket.module.css';

const FIELDS = [
  { label: '연도', name: '태어난 연도', placeholder: 'YYYY', length: 4 },
  { label: '월', name: '태어난 월', placeholder: 'MM', length: 2 },
  { label: '일', name: '태어난 일', placeholder: 'DD', length: 2 },
];

function toDate(parts: string[]) {
  return parts.map((part, index) => part && index > 0 ? part.padStart(2, '0') : part).join('-');
}

export function BirthdayDateInput({ initialValue, today, onChange, errorId, hintId }: {
  initialValue: string; today: string; onChange: (value: string) => void; errorId: string; hintId: string;
}) {
  const id = useId();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [parts, setParts] = useState(() => {
    const values = initialValue.split('-');
    return FIELDS.map((_, index) => values[index] ?? '');
  });
  const lastDate = today.split('-').map(Number);
  const complete = parts[0].length === 4 && parts.slice(1).every(Boolean);
  const invalid = complete && !parseDate(toDate(parts), today);

  function update(index: number, value: string) {
    const digits = value.replace(/\D/g, '').slice(0, FIELDS[index].length);
    const next = parts.map((part, position) => position === index ? digits : part);
    setParts(next);
    onChange(toDate(next));
    if (digits.length === FIELDS[index].length && parts[index].length < digits.length) inputs.current[index + 1]?.focus();
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (digits.length !== 8) return;
    event.preventDefault();
    const date = dateFromDigits(digits);
    setParts(date.split('-'));
    onChange(date);
    inputs.current[2]?.focus();
  }

  return <div className={styles.directDate}>
    <p className={styles.directTitle}>생일을 숫자로 적어주세요.</p>
    <div className={styles.dateSegments}>
      {FIELDS.map((field, index) => <label key={field.label} className={styles.dateSegment} data-invalid={invalid || undefined}>
        <span>{field.label}</span>
        <input ref={element => { inputs.current[index] = element; }} type="text" inputMode="numeric" autoComplete="off"
          aria-label={field.name} aria-describedby={`${hintId} ${errorId}${invalid ? ` ${id}-invalid` : ''}`} aria-invalid={invalid || undefined}
          required pattern={index === 0 ? '[0-9]{4}' : '[0-9]{1,2}'} maxLength={field.length} placeholder={field.placeholder} value={parts[index]}
          onFocus={event => event.currentTarget.select()} onChange={event => update(index, event.target.value)} onPaste={paste}
          onBlur={() => {
            if (index > 0 && parts[index].length === 1) setParts(current => current.map((part, position) => position === index ? part.padStart(2, '0') : part));
          }}
          onKeyDown={event => {
            if (event.key === 'Backspace' && !parts[index] && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
          }} />
      </label>)}
    </div>
    <p id={hintId} className={styles.directHint}>연도 4자리, 월·일 순서로 입력해 주세요.<br />19960601처럼 8자리를 붙여넣어도 돼요.</p>
    {invalid && <p id={`${id}-invalid`} role="alert" className={styles.directError}>{FIRST_YEAR}년부터 {lastDate[0]}년 {lastDate[1]}월 {lastDate[2]}일 사이의 실제 날짜를 입력해 주세요.</p>}
  </div>;
}
