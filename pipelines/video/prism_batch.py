"""PRISM 일괄 제작 — 기사 파일 1개 → 영어 대본 → 장면 JSON → 렌더(2026-10-22).

CMS "PRISM 제작" 화면(admin/backend/routes/prism_batch.py)이 기사 파일 1개당 video-lab 태스크를 1개 띄우고,
render_from_script.py가 --prism-article-s3-key를 받으면 이 모듈의 run()을 부른다.

- 대본·장면 프롬프트는 CMS PRISM 탭에서 "적용"한 버전을 그대로 쓴다: prism(대본 작성, 마케팅팀 지침) →
  prism-scene(장면 변환). CMS에서 고치면 다음 제작부터 반영된다.
- 지침은 [TYPE]·[RECORDING DATE]·[WEEKDAY]가 없으면 생성 대신 되묻는다(지침 "TYPE 미지정 → 상위 3개 유형 제시",
  "누락 시 한 줄만 질문"). 사람이 없는 일괄 제작이라 코드가 파일 이름에서 정한 값으로 이 머리줄을 붙인다.
  요일도 AI가 아니라 여기서 계산한다(지침 "Claude 임의 계산 금지").
- 렌더 뒤 채널 연결 정보가 있으면 유튜브에 올린다(youtube_upload.py). 없으면 영상까지만 만든다.
- 진행 상황은 media/prism-batch/{batch_id}/{item_id}.status.json에 덮어쓴다. 렌더 단계 진행률·mp4·실패는
  CMS 영상 랩과 같은 media/video-lab/{job_id}.* 를 쓴다(render_from_script.render_and_upload) — 화면은 기존
  GET /admin/video-lab/{job_id}로 진행률·내려받기를 그대로 쓴다.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from config import CMS_MEDIA_BUCKET  # noqa: E402
import ddb_prompt  # noqa: E402
from bedrock_client import call_text  # noqa: E402
from bedrock_models import profile_arn  # noqa: E402

from generate_script import fix_script, validate_script  # noqa: E402
from render_from_script import _extract_render_script, _fill_missing_top_level, render_and_upload  # noqa: E402
import youtube_upload  # noqa: E402

# 지침(대본 작성 프롬프트)의 "12개 카테고리 개요" 표와 같은 코드·이름. 화면(PrismBatchPage)과 서버 라우트도 같은 표를 쓴다.
GROUPS = {
    "SG1": "Students & Grads", "SG2": "Early Careers", "SG3": "Founders", "SG4": "Global Investors",
    "SG5": "CEO", "SG6": "Retail Investors", "SG7": "Real Estate", "SG8": "Stock Investors",
    "PG1": "Front Page Daily", "PG2": "Securities Daily", "PG3": "Industry Daily", "PG4": "Finance Daily",
}
_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_SCRIPT_CATEGORY = "prism"
_SCENE_CATEGORY = "prism-scene"
_MAX_TOKENS = 8000  # CMS PRISM 탭과 같다(admin/backend/routes/prompts.py::_CATEGORY_BEDROCK["prism"])
# 대본·장면 모델은 bedrock_models 별칭으로 따로 둔다 — 작업 정의 환경변수 BEDROCK_MODEL_PRISM_SCRIPT /
# BEDROCK_MODEL_PRISM_SCENE 로 이미지 재빌드 없이 바꿀 수 있다.
_SCRIPT_MODEL = profile_arn("prism_script")
_SCENE_MODEL = profile_arn("prism_scene")


def _status_key(batch_id: str, item_id: str) -> str:
    return f"media/prism-batch/{batch_id}/{item_id}.status.json"


def _put_json(s3, key: str, body: dict) -> None:
    s3.put_object(
        Bucket=CMS_MEDIA_BUCKET, Key=key, ContentType="application/json",
        Body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
    )


def _looks_like_script(text: str, display_name: str) -> bool:
    """대본 작성 응답이 EL Script 블록과 고정 아웃트로를 갖췄는가(되묻기·잘림 응답 걸러내기)."""
    return "EL Script" in text and "```" in text and f"AI PRISM: {display_name}" in text


def _episode_title(script_text: str) -> str | None:
    """Block D의 "Episode Title:" 다음 줄 — 화면 목록·유튜브 제목용."""
    m = re.search(r"Episode Title:\s*\n\s*(.+)", script_text)
    return m.group(1).strip() if m else None


def run(s3, work_dir: Path, *, batch_id: str, item_id: str, job_id: str, article_key: str,
        type_code: str, recording_date: str) -> bool:
    status_key = _status_key(batch_id, item_id)
    status: dict = {"job_id": job_id, "type": type_code}

    def report(stage: str, **extra) -> None:
        status.update(stage=stage, updated_at=dt.datetime.now(dt.timezone.utc).isoformat(), **extra)
        try:
            _put_json(s3, status_key, status)
        except Exception as e:  # noqa: BLE001 — 상태 기록 실패가 제작을 멈추면 안 된다
            print(f"[prism-batch] 상태 기록 실패(무시): {e}")

    def fail(message: str) -> bool:
        print(f"[prism-batch] 실패: {message}")
        report("error", message=message[:1000])
        return False

    try:
        display_name = GROUPS[type_code]
        day = dt.date.fromisoformat(recording_date)
    except (KeyError, TypeError, ValueError):
        return fail(f"그룹 코드나 날짜가 잘못됐습니다(type={type_code}, date={recording_date})")

    report("script")
    article_path = work_dir / "article.txt"
    s3.download_file(CMS_MEDIA_BUCKET, article_key, str(article_path))
    article = article_path.read_text(encoding="utf-8-sig")
    header = f"[TYPE: {type_code}]\n[RECORDING DATE: {day.isoformat()}]\n[WEEKDAY: {_WEEKDAYS[day.weekday()]}]\n"
    user_message = f"[입력 기사]\n{header}{article}"
    print(f"[prism-batch] {item_id} {type_code} {display_name} {day} — 대본 작성")

    try:
        script_guide = ddb_prompt.load_prompt(_SCRIPT_CATEGORY)
        script_text = call_text(script_guide, user_message, model=_SCRIPT_MODEL, max_tokens=_MAX_TOKENS)
        if not _looks_like_script(script_text, display_name):
            print(f"[prism-batch] 대본 형식 이상 — 1회 재요청. 앞부분: {script_text[:200]!r}")
            script_text = call_text(
                script_guide,
                user_message + "\n\n(TYPE·RECORDING DATE·WEEKDAY는 위에 있습니다. 질문하지 말고 지침의 출력 형식대로 바로 생성하세요.)",
                model=_SCRIPT_MODEL, max_tokens=_MAX_TOKENS,
            )
            if not _looks_like_script(script_text, display_name):
                return fail(f"대본 작성 응답이 지침 형식이 아닙니다: {script_text[:300]}")
    except Exception as e:  # noqa: BLE001
        return fail(f"대본 작성 실패: {e}")

    s3.put_object(
        Bucket=CMS_MEDIA_BUCKET, Key=f"media/prism-batch/{batch_id}/{item_id}.script.txt",
        Body=script_text.encode("utf-8"), ContentType="text/plain; charset=utf-8",
    )
    title = _episode_title(script_text)
    report("scene", title=title)
    print(f"[prism-batch] {item_id} — 장면 나누기 ({title})")

    try:
        scene_guide = ddb_prompt.load_prompt(_SCENE_CATEGORY)
        scene_message = f"[입력 기사]\n{script_text}"
        problem = ""
        script: dict | None = None
        for attempt in (1, 2):
            raw = call_text(scene_guide, scene_message + problem, model=_SCENE_MODEL, max_tokens=_MAX_TOKENS)
            try:
                candidate = _extract_render_script(raw)
            except (ValueError, json.JSONDecodeError) as e:
                problem = f"\n\n(직전 응답에서 JSON을 찾지 못했습니다: {e}. JSON 하나만 출력하세요.)"
                continue
            _fill_missing_top_level(candidate)
            # PRISM 디자인·성우 설정은 각본의 design.theme으로 갈린다. 프롬프트가 빠뜨려도 PRISM으로 렌더되게 코드로 고정한다.
            candidate["design"] = {**(candidate.get("design") or {}), "theme": "prism"}
            candidate, applied = fix_script(candidate)
            for line in applied:
                print(f"[자동수정] {line}")
            errors = validate_script(candidate)
            if not errors:
                script = candidate
                break
            print(f"[prism-batch] 장면 검증 실패 {len(errors)}건(시도 {attempt})")
            problem = "\n\n(직전 JSON의 문제 — 고쳐서 JSON 하나만 다시 출력하세요:\n" + "\n".join(f"- {x}" for x in errors) + ")"
        if script is None:
            return fail("장면 변환 결과가 두 번 모두 검증을 통과하지 못했습니다" + (f": {problem.strip()[:500]}" if problem else ""))
    except Exception as e:  # noqa: BLE001
        return fail(f"장면 나누기 실패: {e}")

    report("render", cuts=len(script["cuts"]))
    print(f"[prism-batch] {item_id} — 렌더 ({len(script['cuts'])}컷)")
    if not render_and_upload(s3, job_id, script, work_dir):
        return fail("렌더 실패 — 자세한 내용은 영상 진행 상태를 확인하세요")

    # 유튜브 자동 공개 — 채널 연결 정보(시크릿)가 있을 때만. 업로드가 실패해도 영상은 이미 만들어졌으므로
    # 편 자체는 완료로 두고 화면에 실패 이유를 보여준다(내려받아 직접 올리면 된다). 다시 시도하면 중복 업로드가 된다.
    creds = youtube_upload.load_credentials()
    if creds:
        report("upload")
        try:
            meta = youtube_upload.metadata_from_script(script_text, title or script.get("title") or display_name)
            video_id = youtube_upload.upload(work_dir / "video.mp4", meta, creds)
            status["youtube_url"] = f"https://www.youtube.com/watch?v={video_id}"
            print(f"[prism-batch] {item_id} — 유튜브 업로드 {status['youtube_url']}")
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 유튜브 업로드 실패: {e}")
            status["youtube_error"] = str(e)[:500]

    report("done")
    print(f"[prism-batch] {item_id} — 완료")
    return True
