/** "2026-10-09" 또는 "2026-10-09T20:48" → "2026.10.09" / "2026.10.09 20:48". */
export function formatLetterDate(iso: string): string {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-');
  return `${y}.${m}.${d}${time ? ` ${time}` : ''}`;
}
