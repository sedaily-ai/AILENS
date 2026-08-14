interface Props {
  lines: [boolean, boolean, boolean];
  color: string;
  width?: number;
}

/** 효(爻) 3개를 아래→위 순서로 렌더링. true=양효(통짜), false=음효(가운데 끊김) */
export function TrigramSymbol({ lines, color, width = 72 }: Props) {
  const barHeight = 8;
  const gap = 10;
  const rows = [...lines].reverse(); // 위(3효)부터 그려야 화면상 아래가 초효

  return (
    <svg width={width} height={barHeight * 3 + gap * 2} viewBox={`0 0 72 ${barHeight * 3 + gap * 2}`}>
      {rows.map((yang, i) => {
        const y = i * (barHeight + gap);
        return yang ? (
          <rect key={i} x="0" y={y} width="72" height={barHeight} rx="2" fill={color} />
        ) : (
          <g key={i}>
            <rect x="0" y={y} width="30" height={barHeight} rx="2" fill={color} />
            <rect x="42" y={y} width="30" height={barHeight} rx="2" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
