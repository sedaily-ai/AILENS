// "그날 이걸 샀다면" 카드 — 뉴스(팩트) 다음에 오는 별도 섹션이라는 걸 시각적으로
// 드러내려고 배경을 크림/골드 톤으로 분리했다(이 코드베이스에서 "타임머신" 테마에
// 이미 쓰는 #8a6d3f 액센트, PocketWatchIcon과 같은 계열). 로또는 확률형이라 다른
// 카드처럼 "샀다면 지금 얼마"(수익률)로 안 보여주고 확률·평균 당첨금 사실 그대로 +
// 같은 돈을 코스피에 넣었을 때와 대조하는 문장으로 구성한다(백엔드
// config/investment_scenarios.py 참조) — 데이터가 없는 구간은 카드 자체가
// 배열에서 빠지므로(추정치로 안 채움) 여기선 있는 것만 그대로 렌더링한다.
import type { InvestmentScenario } from '../lib/timelineApi';

export function InvestmentScenarioCards({ scenarios }: { scenarios: InvestmentScenario[] }) {
  if (scenarios.length === 0) return null;

  return (
    <section style={{ marginTop: 40, borderRadius: 14, background: '#fdfaf3', border: '1px solid #ede1c5', padding: 'clamp(18px, 4vw, 26px)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#8a6d3f', textTransform: 'uppercase', marginBottom: 4 }}>
        만약에
      </p>
      <h2 style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(17px, 3.6vw, 20px)', fontWeight: 700, color: '#2a2622', marginBottom: 16 }}>
        그날 이걸 샀다면
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {scenarios.map((s) => (
          <div
            key={s.id}
            style={{
              background: '#fff',
              border: '1px solid #f1e9d6',
              borderRadius: 12,
              padding: '16px 18px',
            }}
          >
            <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2a2622' }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#8a7c66', lineHeight: 1.6, marginBottom: 8 }}>{s.description}</p>
            <p style={{ fontSize: 14.5, fontWeight: 700, color: '#2a2622', lineHeight: 1.5, marginBottom: s.story ? 6 : 0 }}>
              {s.result}
            </p>
            {s.story && (
              <p style={{ fontSize: 12, color: '#96876f', lineHeight: 1.6, fontStyle: 'italic' }}>{s.story}</p>
            )}
            <p style={{ fontSize: 10.5, color: '#c4b48f', marginTop: 10 }}>{s.source_label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
