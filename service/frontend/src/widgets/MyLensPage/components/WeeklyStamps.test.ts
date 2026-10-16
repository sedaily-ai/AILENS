import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyStamps, WeeklyStampSummary } from './WeeklyStamps';
import type { ReadingRecords } from '../lib/dashboardApi';

const week: ReadingRecords = {
  period: 'week', start: '2026-10-12', end: '2026-10-18', today: '2026-10-16',
  coverage_start: '2026-10-13', completed_contents: 1, read_days: 1,
  stamp_days: 0, pending_rewards: 0, categories: [], months: [],
  days: [{ date: '2026-10-14', completed_contents: 1, stamped: false, future: false, covered: true }],
};

describe('이용 날짜 표시', () => {
  it('스탬프가 없는 재열람 완료일도 체크하며 수집 전과 미래 날짜를 구분한다', () => {
    const html = renderToStaticMarkup(React.createElement(WeeklyStamps, { week }));
    expect(html).toContain('2026-10-14 콘텐츠 완료');
    expect(html).toContain('data-stamped="true"');
    expect(html).toContain('2026-10-12 수집 시작 전');
    expect(html).toContain('2026-10-18 미래 날짜');
  });

  it('홈 요약에 완료한 날과 기록 링크를 남기고 보상 목표는 표시하지 않는다', () => {
    const html = renderToStaticMarkup(React.createElement(WeeklyStampSummary, { area: { status: 'ready', data: week, error: null }, loading: false, onRetry: () => {} }));
    expect(html).toContain('이번 주 이용 기록');
    expect(html).toContain('1일');
    expect(html).toContain('주·월·연 기록 보기');
    expect(html).not.toMatch(/주간 목표|스탬프|배지/);
  });
});
