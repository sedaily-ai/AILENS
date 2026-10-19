import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EDITORS } from '../../data/editors';
import { EditorTabs } from './EditorTabs';

it('에디터는 목록에 글이 있는지와 관계없이 모두 보이고 목록 전환 버튼은 없다', () => {
  const render = (selected: string | null) =>
    renderToStaticMarkup(createElement(EditorTabs, { selected, onSelect: vi.fn() }));

  for (const html of [render(null), render('junseo')]) {
    for (const e of EDITORS) expect(html).toContain(`${e.name} · ${e.short ?? e.role}`);
    expect(html).not.toContain('전체 에디터');
    expect(html).not.toContain('현재 목록 에디터');
  }
});
