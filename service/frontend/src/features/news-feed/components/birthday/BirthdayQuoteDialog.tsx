import { useEffect, useId, useRef } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { GROUPS, SOURCES } from './data/birthdayCatalog';
import { ITEM_ICONS, STATE_LABELS } from './data/birthdayPresentation';
import type { MarketRow } from './data/birthdayTypes';
import { percent } from './lib/birthdayModel';
import { changeColor } from './lib/birthdayChangeColor';
import styles from './birthdayLedger.module.css';

const DESTINATIONS: Record<string, { id: string; label: string }> = {
  'million-won': { id: 'birthday-cash', label: '구매력 계산 살펴보기' },
  'pension-calendar': { id: 'birthday-pension', label: '내 연금 달력 살펴보기' },
  'history-chart': { id: 'birthday-history', label: '그래프와 경제 사건 살펴보기' },
};

export function BirthdayQuoteDialog({ row, position, total, comparisonYears, onClose, onPrevious, onNext }: {
  row: MarketRow | null; position: number; total: number; onClose: () => void;
  comparisonYears?: [number, number];
  onPrevious?: () => void; onNext?: () => void;
}) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const open = row !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);
  useEffect(() => {
    if (row) {
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [row]);

  const Icon = row ? ITEM_ICONS[row.id] : null;
  const destination = row ? DESTINATIONS[row.id] : null;
  const hasValues = row?.state === 'ready' || row?.state === 'partial';
  const labels = comparisonYears ? comparisonYears.map(year => `${year}년`) : row?.id === 'pension-calendar' ? ['조기 수령 연령', '정상 수령 연령'] : row?.id === 'history-chart' ? ['시작 연도', '마지막 연도'] : ['그때', '최근 공표값'];

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`} onClose={onClose}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
    }}>
    {row && <>
      <div className={styles.dialogTop}><span>{GROUPS[row.group]} · {STATE_LABELS[row.state]}</span><button type="button" onClick={() => dialogRef.current?.close()}>닫기<X size={18} aria-hidden="true" /></button></div>
      <div className={styles.dialogBody}>
        {Icon && <Icon className={styles.dialogIcon} size={36} strokeWidth={1.5} aria-hidden="true" />}
        <h5 ref={headingRef} tabIndex={-1} id={`${id}-title`}>{row.title}</h5>
        <p className={styles.subtitle}>{row.subtitle}</p>
        {hasValues ? <>
          <dl className={styles.comparison}><div><dt>{labels[0]}</dt><dd>{row.before}</dd></div><div><dt>{labels[1]}</dt><dd>{row.after}</dd></div></dl>
          {row.changeValue !== null ? <p className={styles.change}><span style={{ color: changeColor(row.changeValue) }}>{percent(row.changeValue)}</span>{row.change.endsWith('배') && <span className={styles.ratio}>당시의 {row.change}</span>}</p> : row.change !== '—' && <p className={styles.change}>{row.change}</p>}
        </> : <div className={styles.empty}><strong>{row.state === 'unavailable' ? row.before : '자료를 준비하고 있어요'}</strong>{row.availability !== row.before && <p>{row.availability}</p>}</div>}
        {hasValues && <p className={styles.period}>{row.period || row.availability}</p>}
        <p className={styles.explanation}>{row.explanation}</p>
        {row.detail && <p className={styles.explanation}>{row.detail}</p>}
        {row.sourceIds.length > 0 && <div className={styles.sourceList}><h6>출처 확인하기</h6>{row.sourceIds.map(sourceId => <a key={sourceId} href={SOURCES[sourceId].url} target="_blank" rel="noopener noreferrer">{SOURCES[sourceId].name}<ExternalLink size={14} aria-hidden="true" /></a>)}</div>}
        {destination && <button type="button" className={styles.jump} onClick={() => {
          dialogRef.current?.close();
          requestAnimationFrame(() => {
            const target = document.getElementById(destination.id);
            if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'start' }); }
          });
        }}>{destination.label}<ArrowDown size={16} aria-hidden="true" /></button>}
      </div>
      <div className={styles.dialogNavigation}><button type="button" onClick={onPrevious} disabled={!onPrevious}><ChevronLeft size={16} aria-hidden="true" />이전 항목</button><span>{position} / {total}</span><button type="button" onClick={onNext} disabled={!onNext}>다음 항목<ChevronRight size={16} aria-hidden="true" /></button></div>
    </>}
  </dialog>;
}
