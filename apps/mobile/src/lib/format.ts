/** 'YYYY-MM-DD' 또는 ISO → '10월 14일'. 파싱 실패 시 원문. */
export function dateLabel(value?: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : value;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO(UTC) → KST '2026.10.14 08:55'. 웹 kstDateTimeLabel 과 같은 표기.
 * 백엔드가 마이크로초(.186826)를 주는데 Hermes Date 가 이를 못 읽을 수 있어 소수부를 떼고 파싱한다.
 * 시각이 없거나 파싱 실패 시 date('YYYY-MM-DD')만 '2026.10.14' 로 돌려준다.
 */
export function kstDateTime(iso?: string | null, fallbackDate?: string | null): string {
  if (iso) {
    const t = Date.parse(iso.replace(/\.\d+/, ''));
    if (!Number.isNaN(t)) {
      const d = new Date(t + 9 * 3600 * 1000);
      return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    }
  }
  const m = fallbackDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(fallbackDate) : null;
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '';
}
