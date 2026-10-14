/** 'YYYY-MM-DD' 또는 ISO → '10월 14일'. 파싱 실패 시 원문. */
export function dateLabel(value?: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : value;
}
