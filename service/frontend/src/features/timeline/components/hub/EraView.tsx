// 시대 페이지 — 소개 문단 + 연표. 데이터는 shared/data/timelineEvents.ts.
import type { TimelineEra } from '@/shared/data/timelineEvents';
import { Chronicle } from '@/features/timeline/components/chronicle/Chronicle';
import { ChronicleFrame } from '@/features/timeline/components/chronicle/ChronicleFrame';
import { TEXT_BODY, FONT, SPACE } from '@/features/timeline/lib/tone';

export function EraView({ era }: { era: TimelineEra }) {
  return (
    <ChronicleFrame kicker="그날로 떠나요 · 시대" title={era.title} subtitle={`${era.period} · 사건 ${era.events.length}개`}>
      {era.summary && (
        <p style={{ fontSize: FONT.body, color: TEXT_BODY, lineHeight: 1.8, wordBreak: 'keep-all', marginBottom: SPACE.xl }}>{era.summary}</p>
      )}
      <Chronicle events={era.events} />
    </ChronicleFrame>
  );
}
