import { describe, expect, it } from 'vitest';
import { categoryForDataLabel, categoryMatches, displayCategoryLabel, ECON_CATEGORIES } from './econCategories';
import { econSubcategoriesFor } from './econSubcategories';
import { lensCategorySlug } from '../lib/content/lensUrl';

// 분류 개편(2026-10-09): 대분류 9개, 글에는 옛 이름('증시', '금융·정책')이 남아 있을 수 있다.
describe('ECON_CATEGORIES', () => {
  it('대분류 9개, 슬러그·이름이 겹치지 않는다', () => {
    expect(ECON_CATEGORIES.map((c) => c.slug)).toEqual(['markets', 'property', 'economy', 'finance', 'industry', 'politics', 'national', 'international', 'culture']);
    expect(new Set(ECON_CATEGORIES.map((c) => c.label)).size).toBe(9);
    const all = ECON_CATEGORIES.flatMap((c) => c.dataLabels);
    expect(new Set(all).size).toBe(all.length); // 한 이름이 두 분류에 속하지 않는다
  });

  it('모든 대분류는 하위 분류 후보가 있고 label이 dataLabels에 들어 있다', () => {
    for (const c of ECON_CATEGORIES) {
      expect(econSubcategoriesFor(c.slug).length, c.slug).toBeGreaterThan(0);
      expect(c.dataLabels, c.slug).toContain(c.label);
    }
  });

  it('옛 이름과 새 이름을 같은 분류로 본다', () => {
    expect(categoryForDataLabel('증시')?.slug).toBe('markets');
    expect(categoryForDataLabel('시그널')?.slug).toBe('markets');
    expect(categoryForDataLabel('금융·정책')?.slug).toBe('finance');
    expect(categoryForDataLabel('금융')?.slug).toBe('finance');
    expect(categoryForDataLabel('사회')?.slug).toBe('national');
    expect(categoryForDataLabel('없는분류')).toBeUndefined();
    expect(categoryForDataLabel(null)).toBeUndefined();
  });

  it('categoryMatches는 새 이름·옛 이름 모두 맞고 다른 분류는 거른다', () => {
    const markets = ECON_CATEGORIES.find((c) => c.slug === 'markets')!;
    expect(categoryMatches(markets, '증시')).toBe(true);
    expect(categoryMatches(markets, '시그널')).toBe(true);
    expect(categoryMatches(markets, '산업')).toBe(false);
    expect(categoryMatches(markets, null)).toBe(false);
  });

  it('displayCategoryLabel은 옛 이름을 새 이름으로, 모르는 값은 그대로 돌려준다', () => {
    expect(displayCategoryLabel('증시')).toBe('시그널');
    expect(displayCategoryLabel('금융·정책')).toBe('금융');
    expect(displayCategoryLabel('산업')).toBe('산업');
    expect(displayCategoryLabel(null)).toBe('');
  });
});

describe('lensCategorySlug', () => {
  it('옛 이름과 새 이름이 같은 주소 슬러그가 된다(재분류 전후로 기사 주소가 바뀌지 않는다)', () => {
    expect(lensCategorySlug('증시')).toBe('markets');
    expect(lensCategorySlug('시그널')).toBe('markets');
    expect(lensCategorySlug('금융·정책')).toBe('finance');
    expect(lensCategorySlug('금융')).toBe('finance');
    expect(lensCategorySlug('경제')).toBe('economy');
    expect(lensCategorySlug('정치')).toBe('politics');
    expect(lensCategorySlug('사회')).toBe('national');
  });

  it('분류가 없거나 모르는 값은 /news로 간다', () => {
    expect(lensCategorySlug(null)).toBe('news');
    expect(lensCategorySlug('없는분류')).toBe('news');
  });
});
