from cms_posts_shaping import shape_lens_summary


def test_summary_keeps_glossary_without_loading_media_or_body():
    result = shape_lens_summary({'slug': 'sample', 'body_inline': {'lenses': [{
        'label': '레터', 'format': 'letter', 'question': '제목', 'bullets': ['요약'],
        'keywords': [{'term': 'EPC', 'explain': '설계·조달·시공'}, {'term': '', 'explain': '무효'}],
        'paragraphs': ['긴 본문'], 'images': [{'url': 'https://example.com/image.jpg'}],
        'transcript': '긴 대본',
    }]}})
    assert result['lenses'] == [{'label': '레터', 'format': 'letter', 'question': '제목', 'bullets': ['요약'],
                                 'keywords': [{'term': 'EPC', 'explain': '설계·조달·시공'}]}]
