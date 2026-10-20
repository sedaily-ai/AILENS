import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { dateLabel, parseDate } from './lib/birthdayModel';
import { dialDate, FIRST_YEAR, monthDays } from './lib/birthdayDial';
import { BirthdayDateInput } from './BirthdayDateInput';
import styles from './birthdayMarket.module.css';

const ROW_HEIGHT = 44;

function DateWheel({ label, unit, min, max, value, helpId, onChange }: {
  label: string; unit: string; min: number; max: number; value: number; helpId: string;
  onChange: (value: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);

  useEffect(() => {
    const wheel = scrollRef.current;
    // 일반 스크롤은 브라우저의 관성을 유지하고, 외부 날짜 변경만 위치를 동기화한다.
    if (wheel && Math.round(wheel.scrollTop / ROW_HEIGHT) !== value - min) {
      wheel.scrollTop = (value - min) * ROW_HEIGHT;
    }
    wheel?.setAttribute('data-ready', 'true');
  }, [value, min, max]);

  function move(next: number) {
    const target = Math.max(min, Math.min(max, next));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: (target - min) * ROW_HEIGHT, behavior: reducedMotion ? 'instant' : 'smooth' });
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next: Record<string, number> = { ArrowUp: value - 1, ArrowDown: value + 1, PageUp: value - 10, PageDown: value + 10, Home: min, End: max };
    if (event.key in next) {
      event.preventDefault();
      const target = Math.max(min, Math.min(max, next[event.key]));
      // 연속 키 입력은 애니메이션 종료를 기다리지 않고 한 칸씩 반영한다.
      onChange(target);
      event.currentTarget.scrollTop = (target - min) * ROW_HEIGHT;
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const moved = drag.current.moved;
    ignoreClick.current = moved;
    drag.current = null;
    event.currentTarget.removeAttribute('data-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) move(min + Math.round(event.currentTarget.scrollTop / ROW_HEIGHT));
  }

  return <div className={styles.wheelColumn}>
    <span className={styles.wheelLabel} aria-hidden="true">{unit}</span>
    <div className={styles.wheelFrame}>
      <div ref={scrollRef} className={styles.wheel} role="spinbutton" tabIndex={0}
        aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value}${unit}`} aria-describedby={helpId}
        onKeyDown={keyDown}
        onScroll={event => {
          const next = Math.max(min, Math.min(max, min + Math.round(event.currentTarget.scrollTop / ROW_HEIGHT)));
          if (next !== value) onChange(next);
        }}
        onClick={event => {
          if (ignoreClick.current) { ignoreClick.current = false; return; }
          const item = (event.target as HTMLElement).closest<HTMLElement>('[data-wheel-value]');
          if (item) move(Number(item.dataset.wheelValue));
        }}
        onPointerDown={event => {
          ignoreClick.current = false;
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          drag.current = { y: event.clientY, top: event.currentTarget.scrollTop, moved: false };
          event.currentTarget.focus({ preventScroll: true });
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (!start || (event.buttons & 1) === 0) return;
          if (Math.abs(event.clientY - start.y) > 4) {
            start.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.setAttribute('data-dragging', 'true');
            event.currentTarget.scrollTop = start.top + start.y - event.clientY;
          }
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { drag.current = null; }}>
        {Array.from({ length: max - min + 1 }, (_, index) => {
          const item = min + index;
          const distance = Math.abs(item - value);
          return <div key={item} data-wheel-value={item} data-distance={Math.min(distance, 2)} aria-hidden="true" className={styles.wheelValue}>
            {unit === '년' ? item : String(item).padStart(2, '0')}
          </div>;
        })}
      </div>
      <span className={styles.wheelFallback} aria-hidden="true">{unit === '년' ? value : String(value).padStart(2, '0')}</span>
    </div>
  </div>;
}

export function BirthdayDateDial({ value, today, onChange, errorId }: { value: string; today: string; onChange: (value: string) => void; errorId: string }) {
  const id = useId();
  const [typing, setTyping] = useState(false);
  const date = parseDate(value, today);
  const lastDate = today.split('-').map(Number);
  const selected = date ?? { year: 1988, month: 2, day: 3 };
  const lastMonth = selected.year === lastDate[0] ? lastDate[1] : 12;
  const lastDay = selected.year === lastDate[0] && selected.month === lastDate[1] ? lastDate[2] : monthDays(selected.year, selected.month);

  return <fieldset className={styles.dateField}>
    <legend>생년월일</legend>
    <div className={styles.dialHeading}>
      <span>{typing ? '한 칸씩, 내 생일을 적어요' : '시간을 돌려, 내 생일로'}</span>
      <button type="button" className={styles.inputToggle} disabled={typing && !date} onClick={() => setTyping(!typing)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{typing ? <path d="M5 3v7m0 4v7M12 3v12m0 4v2M19 3v2m0 4v12M2 10h6m1 5h6m1-10h6" /> : <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M12 9h.01M17 9h.01M7 12h.01M12 12h.01M17 12h.01M8 15h8" /></>}</svg>
        {typing ? '다이얼로 선택' : '숫자로 입력'}
      </button>
    </div>
    {typing ? <BirthdayDateInput today={today} initialValue={value} onChange={onChange} errorId={errorId} hintId={`${id}-hint`} /> : <>
      <div className={styles.dials}>
        <DateWheel label="태어난 연도" unit="년" min={FIRST_YEAR} max={lastDate[0]} value={selected.year} helpId={`${id}-hint`} onChange={year => onChange(dialDate(year, selected.month, selected.day, today))} />
        <DateWheel label="태어난 월" unit="월" min={1} max={lastMonth} value={selected.month} helpId={`${id}-hint`} onChange={month => onChange(dialDate(selected.year, month, selected.day, today))} />
        <DateWheel label="태어난 일" unit="일" min={1} max={lastDay} value={selected.day} helpId={`${id}-hint`} onChange={day => onChange(dialDate(selected.year, selected.month, day, today))} />
      </div>
      <p id={`${id}-hint`} className={styles.dialHint}>위아래로 굴리거나 끌어보세요. 키보드 방향키로도 맞출 수 있어요.</p>
    </>}
    <p className={styles.selectedDate}><span>선택한 날</span><strong>{date ? dateLabel(value) : '생일을 입력해 주세요'}</strong></p>
  </fieldset>;
}
