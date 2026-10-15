"""편집자가 확인한 메타데이터 관리 CLI. 기본 rollback; 앱 역할 쓰기 권한 확대 없음."""
import argparse
import json
import math
from pathlib import Path
import re
from urllib.parse import urlsplit

from psycopg2.extras import RealDictCursor
from account_schema import connection

KEY = re.compile(r'^(publication|issue_letter):([1-9][0-9]*)$')
GROUP = re.compile(r'^[a-z][a-z0-9_]*:[A-Za-z0-9-]+$')


def content(key):
    if not isinstance(key, str) or len(key) > 96 or not (match := KEY.fullmatch(key)):
        raise ValueError('안정적인 content_key가 필요합니다')
    return match[1], int(match[2])


def validate(payload):
    if not isinstance(payload, dict) or set(payload) - {'content_key', 'reward_group_key', 'editor_slugs', 'followups', 'media'}:
        raise ValueError('지원하지 않는 메타데이터 필드')
    kind, _ = content(payload.get('content_key'))
    if 'reward_group_key' in payload:
        group = payload['reward_group_key']
        if group is not None and (not isinstance(group, str) or len(group) > 96 or not GROUP.fullmatch(group)):
            raise ValueError('편집 확인한 보상 그룹 또는 null 필요')
    if 'editor_slugs' in payload:
        editors = payload['editor_slugs']
        if kind != 'issue_letter' or not isinstance(editors, list) or len(editors) > 20 or any(not isinstance(s, str) or not re.fullmatch(r'[a-z0-9-]{1,80}', s) for s in editors) or len(set(editors)) != len(editors):
            raise ValueError('이슈 레터의 실제 작성자 slug 목록 필요')
    links = payload.get('followups', [])
    if not isinstance(links, list) or len(links) > 100:
        raise ValueError('후속 관계는 최대 100개')
    seen = set()
    for link in links:
        if not isinstance(link, dict) or set(link) != {'target_content_key', 'editor_approved'} or type(link['editor_approved']) is not bool:
            raise ValueError('관계별 명시적인 편집 승인 여부 필요')
        target = link['target_content_key']
        content(target)
        if target == payload['content_key'] or target in seen:
            raise ValueError('중복/자기 자신 후속 관계 금지')
        seen.add(target)
    media = payload.get('media', [])
    if not isinstance(media, list) or len(media) > 10 or media and kind != 'publication':
        raise ValueError('뉴스 media_assets만 수정 가능')
    ids = set()
    for item in media:
        if not isinstance(item, dict) or set(item) != {'asset_id', 'file_url', 'duration_seconds'}:
            raise ValueError('asset_id/file_url/duration_seconds 필요')
        duration = item['duration_seconds']
        url = urlsplit(item['file_url'])
        if type(item['asset_id']) is not int or item['asset_id'] <= 0 or item['asset_id'] in ids or type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= 86400:
            raise ValueError('실측한 유효 재생 길이와 중복 없는 asset_id 필요')
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment or not url.path.lower().endswith(('.mp3', '.m4a', '.wav', '.ogg', '.mp4', '.webm')):
            raise ValueError('iframe 주소 대신 직접 재생 HTTPS 파일 URL 필요')
        ids.add(item['asset_id'])
    return payload


def require_content(cur, key):
    kind, identifier = content(key)
    table = 'publications' if kind == 'publication' else 'issue_letters'
    cur.execute(f'SELECT id FROM public.{table} WHERE id=%s AND deleted_at IS NULL FOR UPDATE', (identifier,))
    if not cur.fetchone():
        raise ValueError('콘텐츠가 없거나 삭제됐습니다')
    return kind, identifier


def inspect(cur, key):
    kind, identifier = require_content(cur, key)
    cur.execute('SELECT group_key FROM public.content_reward_groups WHERE content_key=%s', (key,))
    group = cur.fetchone()
    cur.execute('SELECT target_content_key,editor_approved FROM public.content_followup_links WHERE source_content_key=%s ORDER BY target_content_key', (key,))
    result = {'content_key': key, 'reward_group': group, 'followups': cur.fetchall()}
    if kind == 'issue_letter':
        cur.execute('SELECT e.slug FROM public.issue_letter_editors x JOIN public.letter_editors e ON e.id=x.editor_id WHERE x.letter_id=%s ORDER BY x.position', (identifier,))
        result['editor_slugs'] = [r['slug'] for r in cur.fetchall()]
    else:
        cur.execute('SELECT a.id AS asset_id,a.file_url,a.duration_seconds FROM public.media_assets a JOIN public.renditions r ON r.id=a.rendition_id WHERE r.publication_id=%s ORDER BY a.id', (identifier,))
        result['media'] = cur.fetchall()
    return result


def write(cur, payload):
    validate(payload)
    kind, identifier = require_content(cur, payload['content_key'])
    if 'reward_group_key' in payload:
        cur.execute('INSERT INTO public.content_reward_groups(content_key,group_key) VALUES(%s,%s) ON CONFLICT(content_key) DO UPDATE SET group_key=EXCLUDED.group_key,updated_at=now()', (payload['content_key'], payload['reward_group_key']))
    if 'editor_slugs' in payload:
        editors = []
        for slug in payload['editor_slugs']:
            cur.execute('SELECT id FROM public.letter_editors WHERE slug=%s AND is_active FOR SHARE', (slug,))
            row = cur.fetchone()
            if not row:
                raise ValueError('없는/비활성 작성자')
            editors.append(row['id'])
        cur.execute('DELETE FROM public.issue_letter_editors WHERE letter_id=%s', (identifier,))
        for position, editor in enumerate(editors):
            cur.execute('INSERT INTO public.issue_letter_editors(letter_id,editor_id,position) VALUES(%s,%s,%s)', (identifier, editor, position))
    for link in payload.get('followups', []):
        require_content(cur, link['target_content_key'])
        cur.execute('INSERT INTO public.content_followup_links(source_content_key,target_content_key,editor_approved) VALUES(%s,%s,%s) ON CONFLICT(source_content_key,target_content_key) DO UPDATE SET editor_approved=EXCLUDED.editor_approved', (payload['content_key'], link['target_content_key'], link['editor_approved']))
    for item in payload.get('media', []):
        cur.execute('SELECT a.id,r.format FROM public.media_assets a JOIN public.renditions r ON r.id=a.rendition_id WHERE a.id=%s AND r.publication_id=%s FOR UPDATE OF a', (item['asset_id'], identifier))
        row = cur.fetchone()
        if not row or row['format'] not in ('podcast', 'video'):
            raise ValueError('해당 뉴스의 재생 asset이 아닙니다')
        cur.execute('SELECT admin_extra FROM public.publications WHERE id=%s', (identifier,))
        extra = cur.fetchone()['admin_extra'] or {}
        body = extra.get('body_inline') or {}
        label = '팟캐스트' if row['format'] == 'podcast' else '영상'
        lenses = body.get('lenses') or []
        slices = [p for p in lenses if p.get('label') == label] if lenses else [body]
        if not slices:
            raise ValueError('관리자 원본에 해당 재생 형식이 없습니다')
        if row['format'] == 'podcast' and (not lenses or extra.get('media_embed_url')):
            extra['media_embed_url'] = item['file_url']
        field = 'media_url' if row['format'] == 'podcast' else 'video_url'
        for part in slices:
            # admin 원본과 읽기용 projection을 함께 갱신해 다음 편집 때 길이 소실 방지.
            part[field] = item['file_url']
            part['duration_seconds'] = item['duration_seconds']
        extra['body_inline'] = body
        cur.execute('UPDATE public.publications SET admin_extra=%s WHERE id=%s', (json.dumps(extra), identifier))
        cur.execute('UPDATE public.media_assets SET file_url=%s,duration_seconds=%s WHERE id=%s', (item['file_url'], item['duration_seconds'], item['asset_id']))
    return inspect(cur, payload['content_key'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--manifest', type=Path)
    group.add_argument('--inspect')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        payload = validate(json.loads(args.manifest.read_text())) if args.manifest else None
        conn = connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute('SELECT current_user')
                if cur.fetchone()['current_user'] == 'lens_service_app':
                    raise ValueError('편집 자료 관리는 별도 마이그레이션 역할로 실행하세요')
                result = write(cur, payload) if payload else inspect(cur, args.inspect)
                print(json.dumps(result, ensure_ascii=False, default=str))
            if args.apply and payload:
                conn.commit()
                print('편집 확인한 메타데이터 적용 완료')
            else:
                conn.rollback()
                print('확인만 완료 — 변경은 rollback했습니다')
        finally:
            conn.close()
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
    except Exception:
        raise SystemExit('메타데이터 처리 실패: 입력·콘텐츠 소유 관계·편집 역할 확인. transaction은 적용하지 않습니다.') from None
