import type { LetterChart } from '@/shared/lib/api/todayLettersApi';

// CMS 글이 배경자료(edragon 등)의 수치 인포그래픽을 재구성해 넣을 때 쓰는 블록. 원본 이미지·캐릭터는 가져오지 않고 수치만 가져와
// AI LENS 자체 톤(세리프 라벨 없는 담백한 가로 막대)으로 새로 그린다.
export function LetterChartBlock({ chart, accent }: { chart: LetterChart; accent: string }) {
  const max = Math.max(...chart.series.map((s) => Math.abs(s.value)), 1);
  return (
    <div
      style={{
        margin: '28px 0',
        padding: 'clamp(16px, 3vw, 22px)',
        borderRadius: 14,
        background: '#fafaf9',
        border: '1px solid #f0efe9',
      }}
    >
      <p style={{ fontSize: 12.5, fontWeight: 700, color: '#78716c', marginBottom: 16, letterSpacing: '-0.005em' }}>
        {chart.title}
        {chart.unit ? ` (${chart.unit})` : ''}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {chart.series.map((s) => (
          <div key={s.label} className="flex items-center" style={{ gap: 10 }}>
            <span style={{ width: 64, flexShrink: 0, fontSize: 12.5, color: '#57534e', fontWeight: 600 }}>{s.label}</span>
            <div style={{ flex: 1, background: '#efece4', borderRadius: 6, height: 20, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(4, (Math.abs(s.value) / max) * 100)}%`,
                  height: '100%',
                  background: accent,
                  borderRadius: 6,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#292524' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
