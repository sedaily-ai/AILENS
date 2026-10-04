#!/usr/bin/env python3
"""웹툰 컷1의 글자 합성만 다시 해서 교체한다 — 2026-10-02.

배경: 웹툰식 말풍선 모드에서 표지(컷1)는 제목 띠가 위를 차지해 말풍선 자리 계산이 실패했고(개정 108에서 수정),
그 오류로 컷1 글자 합성이 통째로 빠진 채 올라갔다. repair_missing_formats.py --redo 가 남긴 임시 폴더의 원본 컷1(글자 없음)을 그대로 써서
다시 합성한다 — 이미지 생성 비용 없음.

사용(pipelines/ 에서):
  python3 scripts/recompose_cut1.py [--apply] <source_url> [...]
"""
import glob
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
for p in (ROOT / "webtoon", ROOT / "common", ROOT):
    sys.path.insert(0, str(p))

import requests  # noqa: E402

import compose_text  # noqa: E402
import lens_cms_client as cms  # noqa: E402
import publish_utils as pu  # noqa: E402
import rekognition_people  # noqa: E402

APPLY = "--apply" in sys.argv
BACKUP_DIR = HERE / "repair_backup"
LOG = "mustknow-auto"


def _admin(method, path, body=None):
    r = requests.request(method, f"{cms.LENS_CMS_API_URL}{path}", json=body, headers=cms._headers(), timeout=(5, 60))
    r.raise_for_status()
    return r.json()


def _find_workdir(key: str) -> Path | None:
    tmp = Path(tempfile.gettempdir())
    cands = [Path(p) for p in glob.glob(str(tmp / "repair_formats_*" / key))]
    cands = [c for c in cands if (c / "컷1.png").exists() and (c / "1_script.json").exists()]
    return max(cands, key=lambda c: (c / "1_script.json").stat().st_mtime) if cands else None


def main():
    from PIL import Image
    import boto3

    from config import CMS_MEDIA_BUCKET
    from s3_utils import upload_media

    urls = [a for a in sys.argv[1:] if a.startswith("http")]
    BACKUP_DIR.mkdir(exist_ok=True)
    s3 = boto3.Session(region_name="us-east-1").client("s3")
    for su in urls:
        try:
            key = re.search(r"/article/(\d+)", su).group(1)
            wd = _find_workdir(key)
            if not wd:
                print(f"SKIP 작업 폴더 없음 {su}")
                continue
            raw = wd / "컷1.png"
            script = json.loads((wd / "1_script.json").read_text(encoding="utf-8"))
            cut = next(c for c in script["cuts"] if int(c["cut"]) == 1)
            if Image.open(raw).size != (1216, 832):
                # 컷1이 이미 기본 스타일로 합성돼 원본이 없다 — 같은 프롬프트·seed로 컷1 그림만 한 장 다시 뽑는다(약 $0.08)
                if not APPLY:
                    print(f"DRY  컷1 원본 없음 — --apply 시 컷1 그림을 다시 생성 {su}")
                    continue
                import webtoon_image as wi

                wi.set_run_seed(script.get("image_seed") if isinstance(script.get("image_seed"), int) else None)
                wi.set_run_negative(script.get("negative_prompt") if isinstance(script.get("negative_prompt"), str) else "")
                ok, _ = wi.generate_cut_image_to_file("", cut["image_prompt"], wi.get_active_image_model(), raw, retries=3)
                if not ok:
                    print(f"FAIL 컷1 그림 재생성 실패 {su}")
                    continue
                print(f"컷1 그림 재생성 {key}")
            cc = {"cut": 1, "title": cut.get("title"), "title_keyword": cut.get("title_keyword") or "", "dialogue": cut.get("dialogue") or [],
                  "caption": cut.get("caption") or "", "narration": cut.get("narration") or "", "bubble_style": "oval", "bubble_margin": True}
            det = rekognition_people.detect_people(raw.read_bytes())
            if det:
                cc["detect"] = det
            out = wd / "컷1_fixed.png"
            out.write_bytes(raw.read_bytes())
            compose_text.compose(out, cc, None, scale=compose_text.OUTPUT_SCALE)
            print(f"합성 OK {key} -> {Image.open(out).size}")
            if not APPLY:
                continue
            webp = out.with_suffix(".webp")
            Image.open(out).convert("RGB").save(webp, "WEBP", quality=90, method=6)
            url = upload_media(s3, webp, f"media/{LOG}/{key}-webtoon-cut001-v2.webp", CMS_MEDIA_BUCKET)
            found = cms.find_by_source_url(su)
            admin_id = found.get("admin_post_id") or found["id"]
            cur = _admin("GET", f"/admin/posts/{admin_id}")["post"]
            json.dump(cur, open(BACKUP_DIR / f"backup_cut1_{admin_id}.json", "w"), ensure_ascii=False, indent=1)
            body = json.loads(json.dumps(cur["body_inline"]))
            wt = next(l for l in body["lenses"] if l.get("label") == "웹툰")
            wt["images"][0]["url"] = url
            _admin("PUT", f"/admin/posts/{admin_id}", {"channels": ["lens"], "cover_image_url": url, "body_inline": body})
            after = _admin("GET", f"/admin/posts/{admin_id}")["post"]["body_inline"]
            got = next(l for l in after["lenses"] if l.get("label") == "웹툰")["images"][0]["url"]
            print(f"OK   {su} | 컷1 교체={got == url} | 컷 {len(next(l for l in after['lenses'] if l.get('label') == '웹툰')['images'])}장")
        except Exception as e:  # noqa: BLE001
            import traceback

            print(f"FAIL {su}: {type(e).__name__}: {e}\n{traceback.format_exc()[-500:]}")
    if APPLY:
        try:
            secret = pu.get_revalidate_secret(boto3.Session(region_name="us-east-1"), log_prefix="recompose")
            if secret:
                pu.notify_revalidate(secret, log_prefix="recompose")
        except Exception as e:  # noqa: BLE001
            print(f"(캐시 갱신 생략: {type(e).__name__})")


if __name__ == "__main__":
    main()
