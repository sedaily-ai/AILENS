import { describe, expect, it } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { SECTIONS, paperTitle, pickSection } from './paperSections';

const lens = (id: string, date: string, section: string | null, order: number | null = null) =>
  ({ id, date, paper_section: section, display_order: order }) as unknown as CmsLens;

describe('paperSections', () => {
  it('SECTIONS: 탭 4개, 첫 탭이 전체', () => {
    expect(SECTIONS.map((s) => s.paperSection)).toEqual(['전체', '증권', '산업', '시그널']);
  });
  it('pickSection: 해당 지면만, 최신 날짜 우선, 같은 날은 display_order 오름차순(지정 없는 글은 뒤), 최대 4건', () => {
    const src = [
      lens('a', '2026-10-03', '전체'),
      lens('b', '2026-10-04', '전체', 2),
      lens('c', '2026-10-04', '전체', 1),
      lens('d', '2026-10-04', '전체'),
      lens('e', '2026-10-01', '전체'),
      lens('x', '2026-10-04', '증권'),
      lens('y', '2026-10-04', null),
    ];
    expect(pickSection(src, 0).map((l) => l.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(pickSection(src, 1).map((l) => l.id)).toEqual(['x']);
    expect(pickSection(src, 3)).toEqual([]);
  });
  it('paperTitle: 요일 포함, 날짜 없으면 오늘의 지면', () => {
    expect(paperTitle('2026-10-03')).toBe('10월 3일 토요일 지면');
    expect(paperTitle()).toBe('오늘의 지면');
  });
});
