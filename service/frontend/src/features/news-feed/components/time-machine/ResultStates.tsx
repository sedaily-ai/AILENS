// 결과 영역의 비어 있는/불러오는 상태. 스피너 대신 스켈레톤 — 레이아웃이 미리 보여야 체감 대기가 줄고 도착할 때 화면이 튀지 않는다.
import { INK, LINE, MUTED, SR_ONLY } from './tokens';
import type { DayKind } from './useTimeMachineDay';

export function EmptyDay() {
  return (
    <div style={{ textAlign: 'center', padding: '24px 8px' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 4 }}>이 날은 보관된 기사가 없어요</p>
      <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>다른 날짜를 골라보세요. 1990년부터 오늘까지 찾을 수 있어요.</p>
    </div>
  );
}

const Bar = ({ w, h, tone }: { w: string; h: number; tone: string }) => (
  <span style={{ display: 'block', width: w, height: h, borderRadius: 4, background: tone }} />
);

/** 왼쪽 열 폭은 실제 행과 같아야(최근 44px / 과거 24px) 데이터가 도착할 때 행 높이가 튀지 않는다. */
export function ResultSkeleton({ kind }: { kind: DayKind }) {
  const live = kind === 'live';
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
      <div style={{ paddingBottom: 12, marginBottom: 4, borderBottom: `1px solid ${LINE}` }} aria-hidden>
        <Bar w="170px" h={16} tone="#eceef1" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-baseline" style={{ gap: 12, padding: '12px 8px', borderTop: i === 0 ? 'none' : `1px solid ${LINE}` }} aria-hidden>
          <span className="flex-shrink-0" style={{ width: live ? 44 : 24 }}>
            <Bar w={live ? '36px' : '20px'} h={13} tone="#f1f3f5" />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <Bar w={i === 0 ? '92%' : '84%'} h={14} tone="#eceef1" />
            <span style={{ display: 'block', height: 8 }} />
            <Bar w="62%" h={13} tone="#f4f6f8" />
          </span>
        </div>
      ))}
      <span style={SR_ONLY}>그날의 기사를 불러오는 중입니다</span>
    </div>
  );
}
