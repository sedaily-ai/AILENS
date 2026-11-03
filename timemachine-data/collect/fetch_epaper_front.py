#!/usr/bin/env python3
"""서울경제 e-Paper 최신호 1면 이미지 받기. 로그인 없이 받을 수 있는 건 최신호뿐이라 매일 받아 둬야 한다.

사용:
  python3 collect/fetch_epaper_front.py --out local-capture                     # 폴더에 YYYY/MM/YYYYMMDD.jpg 로 저장
  python3 collect/fetch_epaper_front.py --s3-bucket sedaily-lens-timemachine-newspaper   # S3 timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg
  --dry-run 은 받아서 확인만 하고 저장하지 않는다. --force 는 같은 날짜에 다른 파일이 이미 있어도 덮어쓴다.

동작: epaper.sedaily.com 첫 화면에 박힌 데이터(발행일 FREE_PUB_DATE, 1시간짜리 이미지 토큰 imgToken, 면 목록 pdfData)로
1면 이미지 주소를 만들어 받는다. 이미지 주소 = CDN_URL + 면 폴더 + 파일명 + '?' + IMG_TOKEN_NAME + '=' + imgToken.
이미 있는 파일과 내용이 같으면 건너뛰고, 다르면 지키고 알린다(덮어쓰지 않음). 표준 라이브러리만 쓰며 S3는 boto3(--s3-bucket 때만).
토큰·서명값은 출력하지 않는다. 오류 문구에서도 가린다.
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import json
import os
import re
import struct
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PAGE_URL = 'https://epaper.sedaily.com/'
DEFAULT_CDN = 'https://eimg.sedaily.com/svc/epaper/'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36'
TIMEOUT_SECONDS = 30
ATTEMPTS = 3
S3_IMG_PREFIX = 'timemachine-newspaper/img/'
S3_CACHE_CONTROL = 'public, max-age=2592000'
# 그날 1면 기사 제목·영역 기록. 이미지(img/)와 폴더를 나눠 이미지 점검·대조에 섞이지 않게 한다.
EPAPER_PREFIX = 'timemachine-newspaper/epaper/'
EPAPER_CACHE_CONTROL = 'public, max-age=86400'
# 1면 사진으로 볼 수 있는 최소 기준 — 오류 화면이나 잘린 파일을 걸러내는 값이다(2026-11-03 실측 2495×3507, 905,533바이트).
MIN_BYTES = 100_000
MIN_WIDTH = 1000
SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
_SECRET = re.compile(r'(hmac|st|exp)=[^\s~&"\']+')


class CaptureError(Exception):
    """받기 실패. 메시지에는 토큰·서명값이 들어가지 않는다."""


def mask(text: str) -> str:
    return _SECRET.sub(lambda m: f'{m.group(1)}=<가림>', str(text))


@dataclass
class Issue:
    pub_date: str  # YYYYMMDD
    image_url: str  # 토큰이 들어 있다 — 출력하지 않는다
    image_path: str
    image_name: str
    articles: List[Dict[str, Any]] = field(default_factory=list)  # 1면 기사 제목·영역(저장 여부 미정)

    @property
    def iso_date(self) -> str:
        return f'{self.pub_date[:4]}-{self.pub_date[4:6]}-{self.pub_date[6:]}'

    @property
    def key(self) -> str:
        return f'{self.pub_date[:4]}/{self.pub_date[4:6]}/{self.pub_date}.jpg'


def _request(url: str) -> bytes:
    last: Optional[Exception] = None
    for attempt in range(ATTEMPTS):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9'})
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
                return response.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    code = getattr(last, 'code', '')
    raise CaptureError(f'받기 실패({type(last).__name__} {code})'.strip())


def fetch_bytes(url: str) -> bytes:
    return _request(url)


def fetch_text(url: str) -> str:
    return _request(url).decode('utf-8', 'replace')


def _js_string(literal: str) -> str:
    """JS 문자열 리터럴 속 이스케이프(\\/ 등)를 풀어 쓴다. 서버가 슬래시를 \\/ 로 내보내서 토큰도 풀어야 한다."""
    return json.loads('"' + literal + '"')


def _const(block: str, name: str) -> Optional[str]:
    m = re.search(r'(?:const|let)\s+' + re.escape(name) + r'\s*=\s*"((?:[^"\\]|\\.)*)"', block)
    return _js_string(m.group(1)) if m else None


def parse_issue(page_html: str) -> Issue:
    """첫 화면 HTML에서 최신호 1면 이미지 주소와 1면 기사 정보를 읽는다."""
    m = re.search(r'<!-- PDF DATA -->\s*<script>(.*?)</script>', page_html, re.S)
    if not m:
        raise CaptureError('페이지 구조가 달라졌어요: PDF DATA 블록을 찾지 못함')
    block = m.group(1)
    pub_date = _const(block, 'FREE_PUB_DATE')
    token = _const(block, 'imgToken')
    token_name = _const(block, 'IMG_TOKEN_NAME')
    page_no = re.search(r'(?:const|let)\s+FREE_PAGE_NO\s*=\s*(\d+)', block)
    if not (pub_date and re.fullmatch(r'\d{8}', pub_date) and token and token_name and page_no):
        raise CaptureError('페이지 구조가 달라졌어요: 발행일·토큰·무료 면 번호 중 빠진 값이 있음')
    cdn = DEFAULT_CDN
    cdn_stmt = re.search(r'(?:const|let)\s+CDN_URL\s*=\s*([^;]+);', block)
    if cdn_stmt:
        parts = re.findall(r'"((?:[^"\\]|\\.)*)"', cdn_stmt.group(1))
        joined = ''.join(_js_string(p) for p in parts)
        if joined.startswith('https://') and joined.endswith('/'):
            cdn = joined
    pdf = re.search(r'(?:const|let)\s+pdfData\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)', block)
    if not pdf:
        raise CaptureError('페이지 구조가 달라졌어요: 면 목록(pdfData)을 찾지 못함')
    try:
        pages = json.loads(_js_string(pdf.group(1)[1:-1]))
    except ValueError:
        raise CaptureError('페이지 구조가 달라졌어요: 면 목록을 읽지 못함')
    first = next((p for p in pages if p.get('pageNum') == int(page_no.group(1))), None)
    if not first or not first.get('imageName') or not first.get('imagePath'):
        raise CaptureError('페이지 구조가 달라졌어요: 1면 항목이 없음')
    if first['imagePath'].replace('/', '') != pub_date:
        raise CaptureError(f'발행일이 맞지 않아요: 발행일 {pub_date}, 이미지 폴더 {first["imagePath"]}')
    url = f'{cdn}{first["imagePath"]}{first["imageName"]}?{token_name}={token}'
    articles = [{'headline': htmllib.unescape(a.get('headLine') or ''), 'poly': a.get('poly'), 'id': a.get('id')}
                for a in first.get('article') or []]
    return Issue(pub_date, url, first['imagePath'], first['imageName'], articles)


def jpeg_size(data: bytes) -> Optional[Tuple[int, int]]:
    """JPEG 의 (가로, 세로). 읽지 못하면 None. (upload/check_images.py 와 같은 규칙)"""
    if data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker in SOF_MARKERS:
            height, width = struct.unpack('>HH', data[i + 5:i + 9])
            return width, height
        i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    return None


def validate_image(data: bytes) -> Tuple[int, int]:
    """1면 사진으로 쓸 수 있는지 확인하고 (가로, 세로)를 돌려준다. 아니면 CaptureError."""
    if len(data) < MIN_BYTES:
        raise CaptureError(f'파일이 너무 작아요({len(data):,}바이트). 오류 화면일 수 있어요')
    size = jpeg_size(data)
    if size is None:
        raise CaptureError('JPEG 로 읽히지 않아요')
    if b'\xff\xd9' not in data[-4096:]:
        raise CaptureError('파일 끝이 잘렸어요')
    width, height = size
    if width < MIN_WIDTH or height <= width:
        raise CaptureError(f'1면 사진 모양이 아니에요({width}×{height})')
    return size


def save_local(root: Path, key: str, data: bytes, force: bool = False) -> str:
    """'saved' | 'exists'(같은 내용이 이미 있음) | 'conflict'(다른 내용이 이미 있어 그대로 둠)."""
    path = root / key
    if path.exists():
        same = hashlib.md5(path.read_bytes()).hexdigest() == hashlib.md5(data).hexdigest()
        if same:
            return 'exists'
        if not force:
            return 'conflict'
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.jpg.part')
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return 'saved'


def _s3_find(s3: Any, bucket: str, object_key: str) -> Optional[Dict[str, Any]]:
    """객체가 있으면 목록 항목(Key·ETag·Size), 없으면 None.

    head_object 대신 목록 조회로 있는지 본다 — 없는 파일에 head 를 하면 목록 권한이 없을 때 403 이 와서 404 와 구분되지 않고,
    목록 권한을 접두어 제한 없이 줘야 한다. 목록 조회는 접두어 제한 그대로 쓸 수 있다.
    """
    try:
        listed = s3.list_objects_v2(Bucket=bucket, Prefix=object_key, MaxKeys=1)
    except Exception as e:  # noqa: BLE001
        raise CaptureError(f'S3 확인 실패({type(e).__name__})') from None
    return next((o for o in listed.get('Contents', []) if o['Key'] == object_key), None)


def save_s3(bucket: str, region: str, key: str, data: bytes, force: bool = False) -> str:
    import boto3  # AWS 자격 증명이 있는 기기·Lambda 에서만 쓴다

    s3 = boto3.client('s3', region_name=region)
    object_key = S3_IMG_PREFIX + key
    existing = _s3_find(s3, bucket, object_key)
    if existing:
        etag = existing['ETag'].strip('"')
        # 여러 조각으로 올린 파일(ETag 에 '-')은 해시를 비교할 수 없어 크기로 본다.
        same = existing['Size'] == len(data) if '-' in etag else etag == hashlib.md5(data).hexdigest()
        if same:
            return 'exists'
        if not force:
            return 'conflict'
    try:
        s3.put_object(Bucket=bucket, Key=object_key, Body=data, ContentType='image/jpeg', CacheControl=S3_CACHE_CONTROL)
    except Exception as e:  # noqa: BLE001
        raise CaptureError(f'S3 저장 실패({type(e).__name__})') from None
    return 'saved'


def epaper_key(issue: Issue) -> str:
    return f'{issue.pub_date[:4]}/{issue.pub_date[4:6]}/{issue.pub_date}.json'


def build_epaper_record(issue: Issue, width: int, height: int, size: int, saved_at: Optional[str] = None) -> Dict[str, Any]:
    """그날 1면 기사 제목·영역 기록. 영역(poly)의 좌표는 1면 이미지의 픽셀(image.width × image.height) 기준이다.
    광고 칸도 제목 '[광고]' 그대로 담는다(걸러내는 일은 쓰는 쪽이 한다). 토큰·서명값은 들어가지 않는다."""
    return {
        'schema': 1,
        'date': issue.iso_date,
        'source': PAGE_URL,
        'saved_at': saved_at or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'page': 1,
        'image': {'name': issue.image_name, 'width': width, 'height': height, 'bytes': size},
        'articles': issue.articles,
    }


def encode_record(record: Dict[str, Any]) -> bytes:
    return (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def save_articles(issue: Issue, width: int, height: int, size: int, *, out: Optional[Path] = None,
                  bucket: Optional[str] = None, region: str = 'us-east-1', force: bool = False) -> str:
    """1면 기사 제목·영역을 저장한다. 'saved' | 'exists'(같은 날짜 기록이 이미 있어 그대로 둠). 실패는 CaptureError."""
    if not issue.articles:
        raise CaptureError('1면 기사 영역이 비어 있어요(페이지 구조가 달라졌을 수 있어요)')
    body = encode_record(build_epaper_record(issue, width, height, size))
    key = epaper_key(issue)
    if bucket:
        import boto3

        s3 = boto3.client('s3', region_name=region)
        object_key = EPAPER_PREFIX + key
        if _s3_find(s3, bucket, object_key) and not force:
            return 'exists'
        try:
            s3.put_object(Bucket=bucket, Key=object_key, Body=body, ContentType='application/json; charset=utf-8',
                          CacheControl=EPAPER_CACHE_CONTROL)
        except Exception as e:  # noqa: BLE001
            raise CaptureError(f'S3 저장 실패({type(e).__name__})') from None
        return 'saved'
    path = out / 'epaper' / key  # type: ignore[operator]
    if path.exists() and not force:
        return 'exists'
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.json.part')
    tmp.write_bytes(body)
    os.replace(tmp, path)
    return 'saved'


def fetch_latest() -> Tuple[Issue, bytes, Tuple[int, int]]:
    """최신호 1면 이미지를 받아 확인까지 마친다. (발행 정보, 이미지 바이트, (가로, 세로))"""
    issue = parse_issue(fetch_text(PAGE_URL))
    data = fetch_bytes(issue.image_url)
    return issue, data, validate_image(data)


def capture(out: Optional[Path], bucket: Optional[str], region: str, force: bool, dry_run: bool) -> int:
    issue, data, (width, height) = fetch_latest()
    print(f'발행일 {issue.iso_date} · 1면 {width}×{height} · {len(data):,}바이트 · 1면 기사 영역 {len(issue.articles)}개')
    if dry_run:
        print('확인만 했어요(저장 안 함)')
        return 0
    if bucket:
        status = save_s3(bucket, region, issue.key, data, force)
        where = f's3://{bucket}/{S3_IMG_PREFIX}{issue.key}'
    else:
        status = save_local(out, issue.key, data, force)  # type: ignore[arg-type]
        where = str(out / issue.key)  # type: ignore[operator]
    messages = {
        'saved': f'저장했어요: {where}',
        'exists': f'이미 같은 파일이 있어요: {where} (새 호가 아직 안 올라왔을 수 있어요)',
        'conflict': f'같은 날짜에 다른 파일이 이미 있어 그대로 뒀어요: {where} (덮어쓰려면 --force)',
    }
    print(messages[status])
    if status != 'conflict':
        # 기사 기록은 덤이다. 실패해도 이미지는 저장됐으므로 종료 코드는 이미지 기준으로 둔다.
        try:
            result = save_articles(issue, width, height, len(data), out=out, bucket=bucket, region=region, force=force)
            print(f'1면 기사 {len(issue.articles)}개 제목·영역을 저장했어요' if result == 'saved' else '1면 기사 기록이 이미 있어요')
        except CaptureError as e:
            print(f'1면 기사 기록 저장 실패(이미지는 저장했어요): {mask(e)}', file=sys.stderr)
    return 1 if status == 'conflict' else 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='서울경제 e-Paper 최신호 1면 이미지 받기')
    target = parser.add_mutually_exclusive_group()
    target.add_argument('--out', type=Path, help='저장할 폴더(YYYY/MM/YYYYMMDD.jpg 로 저장)')
    target.add_argument('--s3-bucket', help='저장할 S3 버킷(timemachine-newspaper/img/ 아래)')
    parser.add_argument('--region', default='us-east-1')
    parser.add_argument('--force', action='store_true', help='같은 날짜에 다른 파일이 있어도 덮어쓴다')
    parser.add_argument('--dry-run', action='store_true', help='받아서 확인만 하고 저장하지 않는다')
    args = parser.parse_args(argv)
    if not args.dry_run and not (args.out or args.s3_bucket):
        parser.error('--out 또는 --s3-bucket 이 필요합니다(확인만 하려면 --dry-run)')
    try:
        return capture(args.out, args.s3_bucket, args.region, args.force, args.dry_run)
    except CaptureError as e:
        print(f'실패: {mask(e)}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
