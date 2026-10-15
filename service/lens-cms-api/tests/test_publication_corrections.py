import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publication_corrections', ROOT / 'scripts/apply_publication_corrections.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
PLAN = json.loads((ROOT / 'seed/2026-10-15-audit-corrections.json').read_text())['articles']


def sample(item):
    publication = {'slug': item['slug'], 'title': '그대로', 'subtitle': '그대로',
                   'admin_extra': {'body_inline': {'category': '그대로', 'lenses': []}}, 'status': 'published'}
    lenses = publication['admin_extra']['body_inline']['lenses']
    for change in item['changes']:
        path = change['path']
        if len(path) == 1:
            publication[module.TOP_FIELDS[path[0]]] = copy.deepcopy(change['before'])
        else:
            lens = next((l for l in lenses if l['label'] == path[1]), None)
            if lens is None:
                lens = {'label': path[1], 'media_url': 'https://example.com/keep.mp3'}
                lenses.append(lens)
            lens[path[2]] = copy.deepcopy(change['before'])
    return publication


@pytest.mark.parametrize('item', PLAN, ids=lambda item: item['source_url'].rsplit('/', 1)[-1])
def test_reviewed_revision_preserves_unrelated_fields_and_input(item):
    before = sample(item)
    original = copy.deepcopy(before)
    after = module.revise(before, item['changes'])
    assert before == original
    assert after['slug'] == before['slug']
    assert after['status'] == 'published'
    assert after['admin_extra']['body_inline']['category'] == '그대로'
    assert all(l['media_url'] == 'https://example.com/keep.mp3' for l in after['admin_extra']['body_inline']['lenses'])
    for change in item['changes']:
        path = change['path']
        value = after[module.TOP_FIELDS[path[0]]] if len(path) == 1 else next(l for l in after['admin_extra']['body_inline']['lenses'] if l['label'] == path[1])[path[2]]
        assert value == change['after']


def test_concurrent_editor_change_stops_the_revision():
    item = PLAN[0]
    before = sample(item)
    before['admin_extra']['body_inline']['lenses'][0]['paragraphs'][0] = '편집자가 수정한 내용'
    with pytest.raises(ValueError, match='기존 값 변경 감지'):
        module.revise(before, item['changes'])


def test_media_replacement_is_rejected():
    item = copy.deepcopy(PLAN[3])
    before = sample(item)
    next(c for c in item['changes'] if c['path'][-1] == 'images')['after'][0]['url'] = 'https://example.com/replaced.jpg'
    with pytest.raises(ValueError, match='이미지 URL'):
        module.revise(before, item['changes'])


def test_unknown_field_is_rejected():
    with pytest.raises(ValueError, match='허용되지 않은'):
        module.revise(sample(PLAN[0]), [{'path': ['status'], 'before': 'published', 'after': 'draft'}])
