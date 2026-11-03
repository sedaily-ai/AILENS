"""fetch_epaper_front 단위 시험 — 네트워크·AWS 없이 돈다.
실행: cd timemachine-data/collect && python3 -m unittest test_fetch_epaper_front -v
"""
import contextlib
import io
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import fetch_epaper_front as ep
import lambda_handler as lh

TOKEN = 'st=1000000000~exp=1000003920~acl=/svc/epaper/*~hmac=testsignature'


def jpeg(width=2495, height=3507, size=200_000, end=True):
    sof = b'\xff\xc0' + struct.pack('>HBHHB', 17, 8, height, width, 3) + b'\x01\x22\x00\x02\x11\x01\x03\x11\x01'
    body = b'\xff\xd8' + sof
    body += b'\x00' * (size - len(body) - 2)
    return body + (b'\xff\xd9' if end else b'\x00\x00')


def page_html(pub='20261103', folder='2026/11/03/', token=TOKEN, escaped=True, pages=None):
    # 서버는 슬래시를 \/ 로 내보낸다(JSON 이스케이프).
    tok = json.dumps(token)[1:-1].replace('/', '\\/') if escaped else token
    pages = pages if pages is not None else [{
        'pageNum': 1, 'imagePath': folder, 'imageName': f'02100311.{pub}0000100100_q10.jpg',
        'article': [{'headLine': '李 "청년 43조·R&amp;D 39조"', 'poly': 'R(1,2,3,4)', 'id': 'a1'}, {'headLine': '[광고]', 'poly': 'R(5,6,7,8)', 'id': 'a2'}],
    }, {'pageNum': 2, 'imagePath': folder, 'imageName': 'x_q10.jpg', 'article': []}]
    pdf_literal = json.dumps(json.dumps(pages, ensure_ascii=False), ensure_ascii=False)
    return ('<html><body><!-- PDF DATA --> <script>\n'
            'const CDN_URL = "https://eimg.sedaily.com/svc/epaper" + "/";\n'
            f'const FREE_PUB_DATE = "{pub}"; const FREE_PAGE_NO = 1;\n'
            f'const imgToken = "{tok}";\nconst IMG_TOKEN_NAME = "sedailypdf";\n'
            f'let pdfData = JSON.parse({pdf_literal});\n</script></body></html>')


class ParseIssue(unittest.TestCase):
    def test_image_url_is_built_with_unescaped_token(self):
        issue = ep.parse_issue(page_html())
        self.assertEqual(issue.image_url, 'https://eimg.sedaily.com/svc/epaper/2026/11/03/02100311.202611030000100100_q10.jpg?sedailypdf=' + TOKEN)
        self.assertNotIn('\\', issue.image_url)

    def test_date_and_key(self):
        issue = ep.parse_issue(page_html())
        self.assertEqual((issue.pub_date, issue.iso_date, issue.key), ('20261103', '2026-11-03', '2026/11/20261103.jpg'))

    def test_front_articles_are_kept_with_decoded_headlines(self):
        issue = ep.parse_issue(page_html())
        self.assertEqual([a['headline'] for a in issue.articles], ['李 "청년 43조·R&D 39조"', '[광고]'])

    def test_folder_date_mismatch_is_rejected(self):
        with self.assertRaisesRegex(ep.CaptureError, '발행일이 맞지 않아요'):
            ep.parse_issue(page_html(folder='2026/11/02/'))

    def test_missing_front_page_is_rejected(self):
        with self.assertRaisesRegex(ep.CaptureError, '1면 항목이 없음'):
            ep.parse_issue(page_html(pages=[{'pageNum': 2, 'imagePath': '2026/11/03/', 'imageName': 'x.jpg'}]))

    def test_changed_page_structure_is_reported(self):
        with self.assertRaisesRegex(ep.CaptureError, '페이지 구조가 달라졌어요'):
            ep.parse_issue('<html>다른 화면</html>')


class Validate(unittest.TestCase):
    def test_good_front_page(self):
        self.assertEqual(ep.validate_image(jpeg()), (2495, 3507))

    def test_rejects_error_pages_and_broken_files(self):
        for data, message in ((b'<html>403</html>', '너무 작아요'), (b'\x00' * 200_000, 'JPEG 로 읽히지'),
                              (jpeg(end=False), '잘렸어요'), (jpeg(width=3000, height=2000), '모양이 아니에요'),
                              (jpeg(width=800, height=1100), '모양이 아니에요')):
            with self.subTest(message=message), self.assertRaisesRegex(ep.CaptureError, message):
                ep.validate_image(data)


class Save(unittest.TestCase):
    def test_save_is_idempotent_and_keeps_a_different_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first, other = jpeg(), jpeg(size=210_000)
            self.assertEqual(ep.save_local(root, '2026/11/20261103.jpg', first), 'saved')
            self.assertEqual(ep.save_local(root, '2026/11/20261103.jpg', first), 'exists')
            self.assertEqual(ep.save_local(root, '2026/11/20261103.jpg', other), 'conflict')
            self.assertEqual((root / '2026/11/20261103.jpg').read_bytes(), first)
            self.assertEqual(ep.save_local(root, '2026/11/20261103.jpg', other, force=True), 'saved')
            self.assertEqual((root / '2026/11/20261103.jpg').read_bytes(), other)
            self.assertEqual(list(root.rglob('*.part')), [])


class FakeS3:
    def __init__(self, existing=None):
        self.existing = existing or {}  # key -> (etag, size)
        self.puts = []
        self.list_calls = []

    def list_objects_v2(self, Bucket, Prefix, MaxKeys):
        self.list_calls.append(Prefix)
        return {'Contents': [{'Key': k, 'ETag': f'"{e}"', 'Size': s} for k, (e, s) in self.existing.items() if k.startswith(Prefix)]}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


class SaveS3(unittest.TestCase):
    KEY = '2026/11/20261103.jpg'
    OBJ = 'timemachine-newspaper/img/2026/11/20261103.jpg'

    def run_save(self, fake, data, force=False):
        boto3 = mock.Mock()
        boto3.client.return_value = fake
        with mock.patch.dict('sys.modules', {'boto3': boto3}):
            return ep.save_s3('test-bucket', 'us-east-1', self.KEY, data, force)

    def test_new_file_is_put_under_the_img_prefix_with_cache_headers(self):
        fake, data = FakeS3(), jpeg()
        self.assertEqual(self.run_save(fake, data), 'saved')
        put = fake.puts[0]
        self.assertEqual((put['Bucket'], put['Key'], put['ContentType']), ('test-bucket', self.OBJ, 'image/jpeg'))
        self.assertEqual(put['CacheControl'], 'public, max-age=2592000')
        self.assertEqual(fake.list_calls, [self.OBJ])  # 목록 조회는 접두어 제한 안의 정확한 키로만

    def test_same_content_is_skipped(self):
        import hashlib
        data = jpeg()
        fake = FakeS3({self.OBJ: (hashlib.md5(data).hexdigest(), len(data))})
        self.assertEqual(self.run_save(fake, data), 'exists')
        self.assertEqual(fake.puts, [])

    def test_different_content_is_kept_unless_forced(self):
        data = jpeg()
        fake = FakeS3({self.OBJ: ('0' * 32, len(data) + 1)})
        self.assertEqual(self.run_save(fake, data), 'conflict')
        self.assertEqual(fake.puts, [])
        self.assertEqual(self.run_save(fake, data, force=True), 'saved')

    def test_multipart_object_is_compared_by_size(self):
        data = jpeg()
        self.assertEqual(self.run_save(FakeS3({self.OBJ: ('abc-3', len(data))}), data), 'exists')
        self.assertEqual(self.run_save(FakeS3({self.OBJ: ('abc-3', len(data) + 1)}), data), 'conflict')

    def test_similar_key_does_not_count_as_existing(self):
        fake = FakeS3({self.OBJ + '.part': ('0' * 32, 1)})
        self.assertEqual(self.run_save(fake, jpeg()), 'saved')

    def test_s3_errors_are_reported_without_details(self):
        fake = FakeS3()
        fake.list_objects_v2 = mock.Mock(side_effect=PermissionError('secret detail'))
        with self.assertRaisesRegex(ep.CaptureError, r'S3 확인 실패\(PermissionError\)') as ctx:
            self.run_save(fake, jpeg())
        self.assertNotIn('secret detail', str(ctx.exception))


class Articles(unittest.TestCase):
    def setUp(self):
        self.issue = ep.parse_issue(page_html())

    def test_record_shape(self):
        record = ep.build_epaper_record(self.issue, 2495, 3507, 905533, saved_at='2026-11-03T11:10:12Z')
        self.assertEqual(record, {
            'schema': 1, 'date': '2026-11-03', 'source': 'https://epaper.sedaily.com/', 'saved_at': '2026-11-03T11:10:12Z', 'page': 1,
            'image': {'name': '02100311.202611030000100100_q10.jpg', 'width': 2495, 'height': 3507, 'bytes': 905533},
            'articles': [{'headline': '李 "청년 43조·R&D 39조"', 'poly': 'R(1,2,3,4)', 'id': 'a1'},
                         {'headline': '[광고]', 'poly': 'R(5,6,7,8)', 'id': 'a2'}]})

    def test_record_has_no_token_and_keeps_hangul_readable(self):
        text = ep.encode_record(ep.build_epaper_record(self.issue, 2495, 3507, 1)).decode('utf-8')
        self.assertNotIn('testsignature', text)
        self.assertNotIn('sedailypdf', text)
        self.assertIn('李 "청년 43조', text.replace('\\"', '"'))

    def test_epaper_key(self):
        self.assertEqual(ep.epaper_key(self.issue), '2026/11/20261103.json')

    def test_local_save_is_under_epaper_and_keeps_the_first_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(ep.save_articles(self.issue, 2495, 3507, 1, out=root), 'saved')
            path = root / 'epaper/2026/11/20261103.json'
            first = path.read_bytes()
            self.assertEqual(json.loads(first)['articles'][0]['id'], 'a1')
            self.assertEqual(ep.save_articles(self.issue, 2495, 3507, 999, out=root), 'exists')
            self.assertEqual(path.read_bytes(), first)
            self.assertEqual(ep.save_articles(self.issue, 2495, 3507, 999, out=root, force=True), 'saved')
            self.assertEqual(json.loads(path.read_bytes())['image']['bytes'], 999)
            self.assertEqual(list(root.rglob('*.part')), [])

    def test_empty_article_list_is_rejected(self):
        issue = ep.parse_issue(page_html(pages=[{'pageNum': 1, 'imagePath': '2026/11/03/', 'imageName': 'a.jpg', 'article': []}]))
        with self.assertRaisesRegex(ep.CaptureError, '비어 있어요'):
            ep.save_articles(issue, 2495, 3507, 1, out=Path('.'))

    def run_s3(self, fake, force=False):
        boto3 = mock.Mock()
        boto3.client.return_value = fake
        with mock.patch.dict('sys.modules', {'boto3': boto3}):
            return ep.save_articles(self.issue, 2495, 3507, 1, bucket='test-bucket', region='us-east-1', force=force)

    def test_s3_save_goes_under_epaper_prefix_as_json(self):
        fake = FakeS3()
        self.assertEqual(self.run_s3(fake), 'saved')
        put = fake.puts[0]
        self.assertEqual((put['Bucket'], put['Key']), ('test-bucket', 'timemachine-newspaper/epaper/2026/11/20261103.json'))
        self.assertEqual((put['ContentType'], put['CacheControl']), ('application/json; charset=utf-8', 'public, max-age=86400'))
        self.assertEqual(fake.list_calls, ['timemachine-newspaper/epaper/2026/11/20261103.json'])
        self.assertEqual(json.loads(put['Body'])['date'], '2026-11-03')

    def test_s3_existing_record_is_kept_unless_forced(self):
        fake = FakeS3({'timemachine-newspaper/epaper/2026/11/20261103.json': ('0' * 32, 10)})
        self.assertEqual(self.run_s3(fake), 'exists')
        self.assertEqual(fake.puts, [])
        self.assertEqual(self.run_s3(fake, force=True), 'saved')

    def test_s3_failure_is_reported_without_details(self):
        fake = FakeS3()
        fake.put_object = mock.Mock(side_effect=PermissionError('secret detail'))
        with self.assertRaisesRegex(ep.CaptureError, r'S3 저장 실패\(PermissionError\)') as ctx:
            self.run_s3(fake)
        self.assertNotIn('secret detail', str(ctx.exception))


class Secrets(unittest.TestCase):
    def test_mask_hides_signature_values(self):
        text = f'실패 https://x/y.jpg?sedailypdf={TOKEN}'
        masked = ep.mask(text)
        self.assertNotIn('testsignature', masked)
        self.assertNotIn('1000000000', masked)

    def test_cli_output_never_contains_the_token(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(ep, 'fetch_text', return_value=page_html()), \
                mock.patch.object(ep, 'fetch_bytes', return_value=jpeg()):
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = ep.main(['--out', tmp])
            self.assertEqual(code, 0)
            self.assertTrue((Path(tmp) / '2026/11/20261103.jpg').exists())
            record = (Path(tmp) / 'epaper/2026/11/20261103.json').read_text(encoding='utf-8')
            self.assertEqual(len(json.loads(record)['articles']), 2)
            self.assertNotIn('testsignature', record)
            for stream in (out.getvalue(), err.getvalue()):
                self.assertNotIn('hmac', stream)
                self.assertNotIn('testsignature', stream)

    def test_download_failure_is_reported_without_token(self):
        with mock.patch.object(ep, 'fetch_text', return_value=page_html()), \
                mock.patch.object(ep, 'fetch_bytes', side_effect=ep.CaptureError(f'받기 실패 {TOKEN}')):
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                code = ep.main(['--dry-run'])
            self.assertEqual(code, 1)
            self.assertNotIn('testsignature', err.getvalue())

    def test_dry_run_saves_nothing(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(ep, 'fetch_text', return_value=page_html()), \
                mock.patch.object(ep, 'fetch_bytes', return_value=jpeg()):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ep.main(['--dry-run']), 0)
            self.assertEqual(list(Path(tmp).iterdir()), [])


class LambdaHandler(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict('os.environ', {'NEWSPAPER_BUCKET': 'test-bucket', 'AWS_REGION': 'us-east-1'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def run_handler(self, status='saved', articles=None):
        data = jpeg()
        with mock.patch.object(ep, 'fetch_text', return_value=page_html()), \
                mock.patch.object(ep, 'fetch_bytes', return_value=data), \
                mock.patch.object(ep, 'save_s3', return_value=status) as save, \
                mock.patch.object(ep, 'save_articles', **(articles or {'return_value': 'saved'})) as self.articles_mock:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                result = lh.handler({}, None)
        return result, save, data, out.getvalue()

    def test_saves_under_the_issue_date_and_returns_a_summary(self):
        result, save, data, _ = self.run_handler()
        save.assert_called_once_with('test-bucket', 'us-east-1', '2026/11/20261103.jpg', data)
        self.assertEqual(result, {'date': '2026-11-03', 'status': 'saved', 'width': 2495, 'height': 3507,
                                  'bytes': len(data), 'epaper': 'saved'})

    def test_article_record_is_saved_with_the_same_bucket_and_image_facts(self):
        _, _, data, _ = self.run_handler()
        args, kwargs = self.articles_mock.call_args
        self.assertEqual(args[1:], (2495, 3507, len(data)))
        self.assertEqual((kwargs['bucket'], kwargs['region']), ('test-bucket', 'us-east-1'))

    def test_article_record_failure_does_not_fail_the_image_capture(self):
        result, _, _, log = self.run_handler(articles={'side_effect': ep.CaptureError('S3 저장 실패(X)')})
        self.assertEqual((result['status'], result['epaper']), ('saved', 'error'))
        lines = [json.loads(line) for line in log.strip().splitlines()]
        self.assertEqual([(line['event'], line['status']) for line in lines], [('epaper', 'error'), ('capture', 'saved')])

    def test_unexpected_article_error_is_isolated_too(self):
        result, _, _, log = self.run_handler(articles={'side_effect': ImportError('No module named boto3')})
        self.assertEqual(result['epaper'], 'error')
        self.assertIn('ImportError', log)

    def test_article_record_is_skipped_when_the_image_conflicts(self):
        with self.assertRaises(RuntimeError):
            self.run_handler('conflict')
        self.articles_mock.assert_not_called()

    def test_already_saved_issue_is_not_an_error(self):
        result, _, _, _ = self.run_handler('exists')
        self.assertEqual(result['status'], 'exists')

    def test_different_file_on_the_same_date_fails_the_run(self):
        with self.assertRaisesRegex(RuntimeError, '다른 파일이 이미 있어'):
            self.run_handler('conflict')

    def test_log_is_one_json_line_without_the_token(self):
        _, _, _, log = self.run_handler()
        line = json.loads(log.strip())
        self.assertEqual((line['event'], line['status'], line['date']), ('capture', 'saved', '2026-11-03'))
        self.assertNotIn('testsignature', log)

    def test_page_problem_fails_the_run_with_a_masked_message(self):
        with mock.patch.object(ep, 'fetch_text', return_value='<html>다른 화면</html>'):
            out = io.StringIO()
            with contextlib.redirect_stdout(out), self.assertRaisesRegex(RuntimeError, '페이지 구조가 달라졌어요'):
                lh.handler({}, None)
            self.assertEqual(json.loads(out.getvalue().strip())['status'], 'error')

    def test_missing_bucket_setting_fails_clearly(self):
        with mock.patch.dict('os.environ', {}, clear=True), self.assertRaisesRegex(RuntimeError, 'NEWSPAPER_BUCKET'):
            lh.handler({}, None)


if __name__ == '__main__':
    unittest.main()
