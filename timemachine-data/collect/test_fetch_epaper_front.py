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


if __name__ == '__main__':
    unittest.main()
