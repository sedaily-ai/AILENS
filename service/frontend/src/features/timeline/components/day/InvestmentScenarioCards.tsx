// "그때와 지금의 숫자" 카드 — 뉴스(팩트) 다음에 오는 별도 성격의 섹션이다. 눌린 면과 굵은 구분선으로 뉴스와 구분한다.
// 로또(동행복권 공식 통계)와 스타벅스 아메리카노 가격(뉴스 보도 기준)만 사실 그대로 보여 주고, 수익률·배수는 쓰지 않는다
// (백엔드 config/investment_scenarios.py 참조, 2026-10-22 지수·가상자산 카드 제거).
// 데이터가 없는 구간은 카드가 배열에서 빠지므로(추정치로 채우지 않음) 있는 것만 렌더링한다.
import type { InvestmentScenario } from '@/shared/lib/api/timelineApi';
import {
  SURFACE_SUNKEN, TEXT_STRONG, TEXT_BODY, TEXT_MUTED,
  BORDER_HAIRLINE, BORDER_STRONG, FONT, LEADING, SPACE, RADIUS,
} from '@/features/timeline/lib/tone';

export function InvestmentScenarioCards({ scenarios }: { scenarios: InvestmentScenario[] }) {
  if (scenarios.length === 0) return null;

  return (
    <section
      aria-labelledby="tl-invest-heading"
      style={{
        marginTop: SPACE.section,
        paddingTop: SPACE.xl,
        borderTop: `2px solid ${BORDER_STRONG}`,
      }}
    >
      <h2
        id="tl-invest-heading"
        style={{
          fontSize: FONT.sectionTitle,
          fontWeight: 700,
          color: TEXT_STRONG,
          letterSpacing: '-0.02em',
          marginBottom: SPACE.lg,
        }}
      >
        그때와 지금의 숫자
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: SPACE.md,
        }}
      >
        {scenarios.map((s) => (
          <div
            key={s.id}
            style={{
              background: SURFACE_SUNKEN,
              border: `1px solid ${BORDER_HAIRLINE}`,
              borderRadius: RADIUS.card,
              padding: SPACE.xl,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
              {/* 이모지는 장식이라 보조기기에서 읽지 않는다 — 옆에 이름이 있다. */}
              <span aria-hidden style={{ fontSize: FONT.sectionTitle }}>{s.emoji}</span>
              <span style={{ fontSize: FONT.meta, fontWeight: 700, color: TEXT_STRONG }}>{s.label}</span>
            </div>
            <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, lineHeight: LEADING.body, marginBottom: SPACE.sm }}>
              {s.description}
            </p>
            <p
              style={{
                fontSize: FONT.body,
                fontWeight: 700,
                color: TEXT_STRONG,
                lineHeight: LEADING.title,
                marginBottom: s.story ? SPACE.sm : 0,
                wordBreak: 'keep-all',
              }}
            >
              {s.result}
            </p>
            {s.story && (
              <p
                style={{
                  fontSize: FONT.caption,
                  color: TEXT_BODY,
                  lineHeight: LEADING.body,
                  paddingLeft: SPACE.md,
                  borderLeft: `2px solid ${BORDER_HAIRLINE}`,
                  wordBreak: 'keep-all',
                }}
              >
                {s.story}
              </p>
            )}
            <p
              style={{
                fontSize: FONT.caption,
                color: TEXT_MUTED,
                marginTop: SPACE.md,
                paddingTop: SPACE.sm,
                borderTop: `1px solid ${BORDER_HAIRLINE}`,
                lineHeight: LEADING.body,
                // 375px에서 출처 줄이 '한 게 / 임'처럼 낱말 가운데서 갈라지지 않게 한다(이야기 줄도 같다).
                wordBreak: 'keep-all',
              }}
            >
              {s.source_label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
