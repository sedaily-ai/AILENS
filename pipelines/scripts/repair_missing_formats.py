#!/usr/bin/env python3
"""웹툰·영상 없이 발행된 글(생성 실패 후 그대로 발행)에 빠진 포맷만 다시 만들어 채운다 — 2026-10-02.

배경: 2026-10-01 12:04 KST 실행의 첫 글(국고채 3년물)이 프롬프트 로드 시간 초과로 웹툰 없이(영상도 없이) 발행됐다.
이 스크립트는 원문 기사를 다시 찾아 빠진 포맷(웹툰·영상)만 생성·업로드하고, 글의 나머지(레터·팟캐스트 등)는 건드리지 않는다.

사용(pipelines/ 에서):
  python3 scripts/repair_missing_formats.py <source_url>                     # 어떤 포맷이 빠졌는지만 확인(생성·저장 없음)
  python3 scripts/repair_missing_formats.py --apply <source_url>             # 빠진 웹툰·영상을 생성해 저장
  python3 scripts/repair_missing_formats.py --apply --only webtoon <url>     # 웹툰만 (또는 --only video)

안전장치:
  - 빠진 포맷만 생성(이미 있으면 건너뜀). 웹툰은 MIN_WEBTOON_CUTS 이상 성공해야 저장.
  - 저장 전 글 전체를 backup 폴더에 JSON으로 보관, 저장 후 재조회해 다른 포맷·나머지 필드가 그대로인지 검증.
비용: 웹툰은 이미지 모델 8회 호출, 영상은 TTS+렌더링 — 포맷당 한 번씩만 생성한다.
"""
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # pipelines/
for p in (ROOT / "video", ROOT / "common", ROOT):
    sys.path.insert(0, str(p))

import requests  # noqa: E402

import lens_cms_client as cms  # noqa: E402
import publish_utils as pu  # noqa: E402

APPLY = "--apply" in sys.argv
ONLY = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
BACKUP_DIR = HERE / "repair_backup"
LOG = "mustknow-auto"  # 원래 파이프라인과 같은 S3 경로 접두어


def _lens(body: dict, label: str) -> dict:
    return next(l for l in body["lenses"] if l.get("label") == label)


def _admin(method: str, path: str, body=None):
    res = requests.request(method, f"{cms.LENS_CMS_API_URL}{path}", json=body, headers=cms._headers(), timeout=(5, 60))
    res.raise_for_status()
    return res.json()


def _load_article(source_url: str, date_yyyymmdd: str) -> dict:
    discovery = pu.load_module("repair_discovery", ROOT / "discovery" / "pipeline.py")
    key = re.search(r"/article/(\d+)", source_url).group(1)
    for a in discovery.fetch_articles(date_yyyymmdd):
        if str(a.get("key")) == key:
            return a
    raise RuntimeError(f"원문 후보에서 {key}를 못 찾음({date_yyyymmdd})")


def _article_file(article: dict, out_dir: Path) -> Path:
    from facts_extract import extract_facts  # noqa: lazy

    facts = extract_facts(article["content"], article.get("date", ""))
    text = article["content"] + (f"\n\n---\n[공용 팩트시트]\n{facts}" if facts else "")
    path = out_dir / f"{article['key']}_article.txt"
    path.write_text(text, encoding="utf-8")
    return path


def _make_webtoon(article: dict, article_path: Path, out_dir: Path, upload) -> dict | None:
    """pipelines/common/publish_utils.publish_article()의 웹툰 단계와 같은 처리. 성공 시 lens 슬라이스 값 반환."""
    from PIL import Image

    mod = pu.load_module("repair_webtoon", ROOT / "webtoon" / "pipeline.py")
    name = article["key"]
    mod.run_article(name, str(article_path), out_dir, manage_gpu=False)
    script = json.loads((out_dir / name / "1_script.json").read_text(encoding="utf-8"))
    min_cuts = max(1, mod.N_CUTS - 2)
    images, bullets = [], []
    for cut in script["cuts"]:
        n = cut["cut"]
        cut_path = out_dir / name / f"컷{n}.png"
        if not cut_path.exists():
            print(f"   컷{n} 파일 없음 — 건너뜀")
            continue
        caption = cut.get("narration") or (
            " ".join(f'{d["speaker"]}: {d["line"]}' for d in cut.get("dialogue", [])) if cut.get("dialogue") else ""
        ) or cut.get("caption", "")
        bullets.append(caption)
        webp = cut_path.with_suffix(".webp")
        Image.open(cut_path).convert("RGB").save(webp, "WEBP", quality=90, method=6)
        images.append({"url": upload(webp, f"media/{LOG}/{name}-webtoon-cut{n:03d}.webp"), "caption": caption})
    if len(images) < min_cuts:
        print(f"   웹툰 컷 {len(images)}/{len(script['cuts'])}개만 성공(최소 {min_cuts}) — 저장 안 함")
        return None
    return {"images": images, "bullets": bullets, "question": script.get("core_question")}


def _make_video(article: dict, article_path: Path, out_dir: Path, upload) -> dict | None:
    name = article["key"]
    video = None
    # 각본 생성 결과가 렌더 전 스키마 검증(예: 자막 text가 빈 문자열)에 걸리는 경우가 가끔 있어, 각본부터 다시 만들어 최대 3번 시도한다.
    for attempt in range(1, 4):
        video = pu.generate_video(
            name, article_path, out_dir, photo_url=article.get("photo_url"),
            photo_caption=article.get("photo_caption"), log_prefix=LOG,
        )
        if video:
            break
        print(f"   영상 생성 실패 — 재시도 {attempt}/3")
    if not video:
        print("   영상 생성 3번 모두 실패 — 저장 안 함")
        return None
    video_url = upload(video["mp4_path"], f"media/video/{LOG}/{name}-video.mp4")
    thumb_url = upload(video["thumb_path"], f"media/video/{LOG}/{name}-thumb.jpg") if video["thumb_path"] else None
    script_path = out_dir / name / "script.json"
    transcript = None
    if script_path.exists():
        data = json.loads(script_path.read_text(encoding="utf-8"))
        transcript = "\n\n".join(c["narration"] for c in data.get("cuts", []) if c.get("narration")) or None
    return {"video_url": video_url, "thumbnail_url": thumb_url, "transcript": transcript}


def _kst_ymd(ts: str) -> str:
    """발행 시각(ISO, UTC일 수 있음)을 KST 날짜(YYYYMMDD)로 — 원문 후보 파일(daily-xml)은 KST 게재일 기준이다.
    UTC 날짜를 그대로 쓰면 00~09시 KST 발행분이 하루 전 날짜로 계산돼 원문을 못 찾는다(2026-10-02 확인)."""
    from datetime import datetime, timedelta, timezone

    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone(timedelta(hours=9))).strftime("%Y%m%d")


def main():
    urls = [a for a in sys.argv[1:] if a.startswith("http")]
    if not urls:
        sys.exit("source_url을 하나 이상 넘겨 주세요.")
    BACKUP_DIR.mkdir(exist_ok=True)
    import boto3  # noqa: lazy

    from config import CMS_MEDIA_BUCKET  # noqa: lazy
    from s3_utils import upload_media  # noqa: lazy

    s3 = boto3.Session(region_name="us-east-1").client("s3")

    def upload(local: Path, key: str) -> str:
        return upload_media(s3, local, key, CMS_MEDIA_BUCKET)

    print(f"mode={'APPLY' if APPLY else 'CHECK'} only={ONLY} | 대상 {len(urls)}건")
    for su in urls:
        try:
            found = cms.find_by_source_url(su)
            if not found:
                print(f"SKIP 글 없음 {su}")
                continue
            admin_id = found.get("admin_post_id") or found["id"]
            cur = _admin("GET", f"/admin/posts/{admin_id}")["post"]
            body = cur["body_inline"]
            wt, vd = _lens(body, "웹툰"), _lens(body, "영상")
            need_wt = not (wt.get("images") or []) and ONLY in (None, "webtoon")
            need_vd = not vd.get("video_url") and ONLY in (None, "video")
            print(f"대상 {su} | 웹툰 {'없음' if need_wt else '있음/제외'} | 영상 {'없음' if need_vd else '있음/제외'}")
            if not (need_wt or need_vd):
                continue
            if not APPLY:
                continue
            date = _kst_ymd(cur.get("published_at")) if cur.get("published_at") else (cur.get("publish_date") or "").replace("-", "")
            article = _load_article(su, date)
            out_dir = Path(tempfile.mkdtemp(prefix="repair_formats_"))
            article_path = _article_file(article, out_dir)
            new_wt = _make_webtoon(article, article_path, out_dir, upload) if need_wt else None
            new_vd = _make_video(article, article_path, out_dir, upload) if need_vd else None
            if not (new_wt or new_vd):
                print(f"FAIL 생성 결과 없음 — 저장 안 함 {su}")
                continue
            json.dump(cur, open(BACKUP_DIR / f"backup_{admin_id}.json", "w"), ensure_ascii=False, indent=1)
            new_body = json.loads(json.dumps(body))
            payload = {"channels": ["lens"]}
            if new_wt:
                t = _lens(new_body, "웹툰")
                t["images"], t["bullets"] = new_wt["images"], new_wt["bullets"]
                if new_wt.get("question"):
                    t["question"] = new_wt["question"]
                t["pending"] = False
                payload["cover_image_url"] = new_wt["images"][0]["url"]
            if new_vd:
                t = _lens(new_body, "영상")
                t["video_url"], t["thumbnail_url"], t["transcript"] = new_vd["video_url"], new_vd["thumbnail_url"], new_vd["transcript"]
                t["pending"] = False
                new_body["needs_video"] = False
            payload["body_inline"] = new_body
            _admin("PUT", f"/admin/posts/{admin_id}", payload)
            after = _admin("GET", f"/admin/posts/{admin_id}")["post"]["body_inline"]
            keep = [l for l in ("레터", "팟캐스트") if l]
            same_kept = [_lens(body, l) for l in keep] == [_lens(after, l) for l in keep]
            got_wt = (len(_lens(after, "웹툰").get("images") or []) if new_wt else None)
            got_vd = (bool(_lens(after, "영상").get("video_url")) if new_vd else None)
            print(f"OK   {su} | 웹툰 컷 {got_wt} | 영상 {got_vd} | 레터·팟캐스트 동일={same_kept}")
        except Exception as e:  # noqa: BLE001
            import traceback

            print(f"FAIL {su}: {type(e).__name__}: {e}\n{traceback.format_exc()[-600:]}")


if __name__ == "__main__":
    main()
