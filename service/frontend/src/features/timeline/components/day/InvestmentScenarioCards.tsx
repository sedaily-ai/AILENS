// "그날 이걸 샀다면" 카드 — 뉴스(팩트) 다음에 오는 별도 성격의 섹션이다.
//
// 원래 이 구분을 크림/골드 배경(#fdfaf3 + #ede1c5 테두리 + #8a6d3f 라벨)으로
// 냈는데, 페이지 전체가 홈 톤(회색·파랑)으로 바뀌면서 이 섹션만 갈색으로
// 남으면 오히려 "덜 만든 부분"처럼 보인다(2026-08-19). 배경 색 대신 **눌린 면
// + 굵은 구분선**으로 성격 차이를 낸다 — 색을 하나 더 쓰지 않고도 "여긴 뉴스가
// 아니다"가 읽힌다.
//
// 갈색 팔레트에서 대비 미달이 4건이었다: 설명문 #8a7c66(4.07:1),
// story #96876f(3.50:1), 출처 #c4b48f(2.04:1), 라벨 #8a6d3f(4.64:1은 통과하나
// 11px 이었다).
//
// 로또는 확률형이라 다른 카드처럼 "샀다면 지금 얼마"(수익률)로 안 보여주고
// 확률·평균 당첨금 사실 그대로 + 같은 돈을 코스피에 넣었을 때와 대조하는
// 문장으로 구성한다(백엔드 config/investment_scenarios.py 참조) — 데이터가
// 없는 구간은 카드 자체가 배열에서 빠지므로(추정치로 안 채움) 여기선 있는
// 것만 그대로 렌더링한다.
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
      <p
        style={{
          fontSize: FONT.caption,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: TEXT_MUTED,
          marginBottom: SPACE.xs,
        }}
      >
        만약에
      </p>
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
        그날 이걸 샀다면
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
