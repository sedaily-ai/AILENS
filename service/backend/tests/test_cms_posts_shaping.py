"""services.content.cms_posts_shaping.shape_lens 특성화 테스트 — 리팩토링 전후 응답 모양이 같음을 고정."""
from services.content.cms_posts_shaping import DEFAULT_EDITOR, shape_lens


def _post(**over):
    base = {
        'slug': 's1', 'headline': '제목', 'subtitle': '부제', 'publish_date': '2026-10-04',
        'published_at': '2026-10-04T01:00:00Z', 'updated_at': '2026-10-04T02:00:00Z',
        'cover_image_url': 'c.png', 'source_url': 'http://x', 'display_order': 3,
        'body_inline': {
            'photo_image_url': 'p.png', 'category': '증시', 'paper_section': '증권',
            'lenses': [{
                'label': '레터', 'question': '왜?', 'bullets': ['a', '', 'b'], 'paragraphs': ['p', None],
                'images': [{'url': 'u1', 'caption': 'c1'}, {'url': '', 'caption': 'x'}, {'url': 'u2'}],
                'video_url': 'v', 'thumbnail_url': 't', 'media_url': 'm', 'transcript': 'tr',
            }],
        },
    }
    base.update(over)
    return base


def test_full_post_shape():
    out = shape_lens(_post())
    assert out['id'] == 's1' and out['headline'] == '제목' and out['context'] == '부제'
    assert out['date'] == '2026-10-04' and out['is_cms'] is True and out['display_order'] == 3
    assert out['photo_image_url'] == 'p.png' and out['category'] == '증시' and out['paper_section'] == '증권'
    assert out['editor_id'] == DEFAULT_EDITOR
    assert out['lenses'] == [{
        'label': '레터', 'question': '왜?', 'bullets': ['a', 'b'], 'paragraphs': ['p'],
        'images': [{'url': 'u1', 'caption': 'c1'}, {'url': 'u2', 'caption': ''}],
        'video_url': 'v', 'thumbnail_url': 't', 'media_url': 'm', 'transcript': 'tr',
    }]


def test_empty_post_defaults():
    out = shape_lens({'slug': 'x'})
    assert out['headline'] == '' and out['context'] == '' and out['date'] == ''
    assert out['cover_image_url'] is None and out['photo_image_url'] is None
    assert out['category'] is None and out['paper_section'] is None and out['display_order'] is None
    assert out['lenses'] == []


def test_lens_item_defaults():
    out = shape_lens({'slug': 'x', 'body_inline': {'lenses': [{}]}})
    assert out['lenses'] == [{
        'label': '', 'question': '', 'bullets': [], 'paragraphs': [], 'images': [],
        'video_url': None, 'thumbnail_url': None, 'media_url': None, 'transcript': None,
    }]
