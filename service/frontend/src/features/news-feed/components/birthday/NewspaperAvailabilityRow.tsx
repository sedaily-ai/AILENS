import { Check, CircleHelp, LoaderCircle } from 'lucide-react';
import styles from './birthdayAvailability.module.css';

type Status = 'available' | 'loading' | 'missing' | 'unknown' | 'alternative';

export function NewspaperAvailabilityRow({ kind, status, children }: {
  kind: 'photo' | 'article'; status: Status; children: string;
}) {
  const Marker = status === 'available' ? Check : status === 'loading' ? LoaderCircle : CircleHelp;
  return <div className={styles.row} data-state={status}>
    <span className={styles.label}>{kind === 'photo' ? '1면 사진' : '1면 기사'}</span>
    <span className={styles.status}><Marker size={15} strokeWidth={2} aria-hidden="true" />{children}</span>
  </div>;
}
