import { describe, expect, it } from 'vitest';
import { ECON_CATEGORIES } from './econCategories';
import { econSubcategoriesFor } from './econSubcategories';
import { liveMenuCategories, MENU_TAXONOMY } from './menuTaxonomy';

// 메뉴 분류표와 지금 페이지·데이터가 어긋나면(주소가 없는 분류를 링크하거나, 글에 없는 하위 이름으로 거르면) 메뉴 링크가 빈 화면으로 간다.
describe('MENU_TAXONOMY', () => {
  it('slug가 겹치지 않는다', () => {
    const slugs = MENU_TAXONOMY.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('live 분류는 실제 페이지 주소(/{slug})로 연결된다', () => {
    const pages = new Set(ECON_CATEGORIES.map((c) => `/${c.slug}`));
    for (const c of liveMenuCategories()) expect(pages.has(c.href), `${c.label} → ${c.href}`).toBe(true);
  });

  it('live 분류의 하위 카테고리는 글에 저장되는 값(econSubcategories)과 같은 이름이다', () => {
    for (const c of liveMenuCategories()) {
      const known = new Set(econSubcategoriesFor(c.slug));
      if (known.size === 0) continue; // 하위 분류 정의가 없는 분류는 건너뛴다
      for (const sub of c.subs) expect(known.has(sub), `${c.label} > ${sub}`).toBe(true);
    }
  });

  it('planned 분류는 주소가 비어 있고 메뉴에 나오지 않는다', () => {
    for (const c of MENU_TAXONOMY.filter((x) => x.status === 'planned')) expect(c.href).toBe('');
    expect(liveMenuCategories().every((c) => c.status === 'live')).toBe(true);
  });
});
