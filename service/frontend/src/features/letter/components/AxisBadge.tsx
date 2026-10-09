import { AXIS_META, type LetterAxis } from '../data/letterTypes';

/** 3축 배지(소식·실체·다른 시각). 이모지 대신 색 점과 글자만 쓴다. */
export function AxisBadge({ axis, label }: { axis: LetterAxis; label?: string }) {
  const m = AXIS_META[axis];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px 3px 8px',
        borderRadius: 999,
        background: m.soft,
        color: m.tone,
        fontSize: 12.5,
        fontWeight: 700,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: m.tone }} />
      {label ?? m.label}
    </span>
  );
}
