export function changeColor(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return '#374151';
  return value > 0 ? '#b91c1c' : '#1d4ed8';
}
