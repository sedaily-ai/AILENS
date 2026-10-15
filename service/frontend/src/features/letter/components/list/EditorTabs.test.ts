import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EditorTabs } from './EditorTabs';

it('현재 목록에 글이 없는 에디터도 직접 선택과 전체 에디터 진입을 유지한다', () => {
  const render = (selected: string | null, publishedEditorIds = ['mincheol']) =>
    renderToStaticMarkup(createElement(EditorTabs, { selected, publishedEditorIds, onSelect: vi.fn() }));

  expect(render(null)).toContain('민철 · 전략 분석 에디터');
  expect(render(null)).not.toContain('준서 · 팩트 큐레이터');
  expect(render('junseo')).toContain('준서 · 팩트 큐레이터');
  expect(render(null, [])).toContain('전체 에디터');
  expect(render('junseo', [])).toContain('준서 · 팩트 큐레이터');
});
