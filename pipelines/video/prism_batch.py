"""PRISM 일괄 제작 — 기사 파일 1개 → 영어 대본 → 장면 JSON → 렌더(2026-10-22).

CMS "PRISM 제작" 화면(admin/backend/routes/prism_batch.py)이 기사 파일 1개당 video-lab 태스크를 1개 띄우고,
render_from_script.py가 --prism-article-s3-key를 받으면 이 모듈의 run()을 부른다.

- 대본·장면 프롬프트는 CMS PRISM 탭에서 "적용"한 버전을 그대로 쓴다: prism(대본 작성, 마케팅팀 지침) →
  prism-scene(장면 변환). CMS에서 고치면 다음 제작부터 반영된다.
- 지침은 [TYPE]·[RECORDING DATE]·[WEEKDAY]가 없으면 생성 대신 되묻는다(지침 "TYPE 미지정 → 상위 3개 유형 제시",
  "누락 시 한 줄만 질문"). 사람이 없는 일괄 제작이라 코드가 파일 이름에서 정한 값으로 이 머리줄을 붙인다.
  요일도 AI가 아니라 여기서 계산한다(지침 "Claude 임의 계산 금지").
- 렌더 뒤 채널 연결 정보가 있으면 유튜브(youtube_upload.py)·데일리모션(dailymotion_upload.py)에 올린다. 없으면 영상까지만 만든다.
- 묶음의 마지막 편이 끝나면 슬랙에 요약을 한 번 보낸다(prism_notify.py, Amazon Q Developer 경유).
- 진행 상황은 media/prism-batch/{batch_id}/{item_id}.status.json에 덮어쓴다. 렌더 단계 진행률·mp4·실패는
  CMS 영상 랩과 같은 media/video-lab/{job_id}.* 를 쓴다(render_from_script.render_and_upload) — 화면은 기존
  GET /admin/video-lab/{job_id}로 진행률·내려받기를 그대로 쓴다.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from config import CMS_MEDIA_BUCKET  # noqa: E402
import ddb_prompt  # noqa: E402
from bedrock_client import call_text  # noqa: E402
from bedrock_models import profile_arn  # noqa: E402

from generate_script import (  # noqa: E402
    date_issues,
    demote_incomplete_stats,
    fix_script,
    number_issues,
    validate_script,
)
from render_from_script import _extract_render_script, _fill_missing_top_level, render_and_upload  # noqa: E402
import video_settings  # noqa: E402
import prism_notify  # noqa: E402
import shorts_compose  # noqa: E402
import youtube_upload  # noqa: E402
from youtube_upload import shorts_metadata  # noqa: E402
import dailymotion_upload  # noqa: E402

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
# 그룹별 Polly 성우(2026-10-23, 마케팅팀 지정). 표에 없는 그룹(PG1~PG4 지면 — 지금은 만들지 않음)은 CMS PRISM
# "음성 설정"의 발행값(기본 Joanna)을 그대로 쓴다. 이미지 재빌드 없이 바꾸려면 작업 정의 환경변수
# PRISM_GROUP_VOICES에 {"SG1": "Matthew", ...} JSON을 넣는다(넣은 키만 덮어씀).
_GROUP_VOICES = {
    "SG1": "Matthew", "SG2": "Joanna", "SG3": "Stephen", "SG4": "Joanna",
    "SG5": "Matthew", "SG6": "Danielle", "SG7": "Stephen", "SG8": "Ruth",
    **json.loads(os.environ.get("PRISM_GROUP_VOICES") or "{}"),
}


def _status_key(batch_id: str, item_id: str) -> str:
    return f"media/prism-batch/{batch_id}/{item_id}.status.json"


def _put_json(s3, key: str, body: dict) -> None:
    s3.put_object(
        Bucket=CMS_MEDIA_BUCKET, Key=key, ContentType="application/json",
        Body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
    )


def _looks_like_script(text: str, display_name: str) -> bool:
    """대본 작성 응답이 EL Script 블록과 고정 아웃트로를 갖췄는가(되묻기·잘림 응답 걸러내기).
    코드블록(```)은 보지 않는다 — 2026-10-23 Haiku 5.5가 대본은 맞게 쓰고 펜스만 두 번 연속 빼 SG8이 실패했다.
    뒤 단계(장면 변환은 응답 전체를 넘기고, 유튜브 메타는 Block D를 찾는다)는 펜스를 쓰지 않는다."""
    return "EL Script" in text and f"AI PRISM: {display_name}" in text


def _episode_title(script_text: str) -> str | None:
    """Block D의 "Episode Title:" 다음 줄 — 화면 목록·유튜브 제목용."""
    m = re.search(r"Episode Title:\s*\n\s*(.+)", script_text)
    return m.group(1).strip() if m else None


def _voice_override(type_code: str) -> dict | None:
    """그룹 성우를 렌더 설정 위에 덮어쓴다. 발행값의 엔진을 그 성우가 지원하지 않으면 성우의 첫 엔진으로."""
    voice = _GROUP_VOICES.get(type_code)
    engines = video_settings._PRISM_VOICE_ENGINE_OPTIONS.get(voice or "")
    if not engines:
        return None
    current = video_settings.get_render_settings(None, video_settings.PRISM_SETTINGS_CATEGORY)
    engine = current["engine"] if current["engine"] in engines else engines[0]
    return {"provider": "polly", "voice": voice, "engine": engine}


def run(s3, work_dir: Path, *, batch_id: str, item_id: str, job_id: str, article_key: str,
        type_code: str, recording_date: str) -> bool:
    ok = _run(s3, work_dir, batch_id=batch_id, item_id=item_id, job_id=job_id, article_key=article_key,
              type_code=type_code, recording_date=recording_date)
    # 묶음의 마지막 편이면 슬랙에 요약을 한 번 보낸다(prism_notify.py). 알림 실패가 이 편의 결과를 바꾸지 않는다.
    try:
        prism_notify.notify_if_batch_done(s3, batch_id)
    except Exception as e:  # noqa: BLE001
        print(f"[prism-notify] 알림 실패(무시): {e}")
    return ok


def _run(s3, work_dir: Path, *, batch_id: str, item_id: str, job_id: str, article_key: str,
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
                print(f"[prism-batch] 대본 형식 이상(재요청 후) — 앞부분: {script_text[:300]!r}")
                return fail("대본 작성 응답이 지침 형식이 아닙니다(EL Script 제목이나 고정 아웃트로 없음) — 다시 시도해 주세요")
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
        last_candidate: dict | None = None
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
            last_candidate = candidate
            print(f"[prism-batch] 장면 검증 실패 {len(errors)}건(시도 {attempt})")
            problem = "\n\n(직전 JSON의 문제 — 고쳐서 JSON 하나만 다시 출력하세요:\n" + "\n".join(f"- {x}" for x in errors) + ")"
        # 재요청까지 실패했고 남은 문제가 "수치 빈 stat 컷"뿐이면 그 컷만 글자 컷으로 바꿔 계속 만든다(2026-11-05,
        # 자동 제작은 실패하면 사람이 [다시 시도]를 눌러야 한다). 다른 문제가 남으면 지금처럼 실패.
        if script is None and last_candidate is not None:
            demoted = demote_incomplete_stats(last_candidate)
            if demoted and not validate_script(last_candidate):
                for line in demoted:
                    print(f"[자동수정] {line}")
                script = last_candidate
        if script is None:
            return fail("장면 변환 결과가 두 번 모두 검증을 통과하지 못했습니다" + (f": {problem.strip()[:500]}" if problem else ""))
    except Exception as e:  # noqa: BLE001
        return fail(f"장면 나누기 실패: {e}")

    # 날짜·숫자 검수(2026-11-05) — 녹화일/원문과 어긋나는 날짜·금액을 로그·상태에 남긴다. 렌더를 막지는 않는다
    # (PRISM은 바로 공개라, 확실한 오류는 슬랙·로그로 사람이 보고, 영상 자체는 나간다).
    date_flags = date_issues(script, article, recording_date=recording_date)
    number_flags = number_issues(script, article)
    for line in date_flags + number_flags:
        print(f"[prism-batch] [검수] {line}")
    if date_flags:
        status["date_flags"] = date_flags[:20]
    if number_flags:
        status["number_flags"] = number_flags[:20]

    # 건수를 같은 이름으로 넘기면 위 목록을 덮어써 완료 알림이 죽는다(int + list). 목록은 status에 이미 있다.
    report("render", cuts=len(script["cuts"]))
    print(f"[prism-batch] {item_id} — 렌더 ({len(script['cuts'])}컷)")
    if not render_and_upload(s3, job_id, script, work_dir, _voice_override(type_code)):
        return fail("렌더 실패 — 자세한 내용은 영상 진행 상태를 확인하세요")

    # 유튜브 자동 공개 — 채널 연결 정보(시크릿)가 있을 때만. 업로드가 실패해도 영상은 이미 만들어졌으므로
    # 편 자체는 완료로 두고 화면에 실패 이유를 보여준다(내려받아 직접 올리면 된다). 다시 시도하면 중복 업로드가 된다.
    meta = youtube_upload.metadata_from_script(script_text, title or script.get("title") or display_name)
    creds = youtube_upload.load_credentials()
    if creds:
        report("upload")
        try:
            video_id = youtube_upload.upload(work_dir / "video.mp4", meta, creds)
            status["youtube_url"] = f"https://www.youtube.com/watch?v={video_id}"
            print(f"[prism-batch] {item_id} — 유튜브 업로드 {status['youtube_url']}")
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 유튜브 업로드 실패: {e}")
            status["youtube_error"] = str(e)[:500]

    # 데일리모션 자동 공개(2026-11-05) — 유튜브와 같은 제목·설명·태그. 유튜브와 같이 실패해도 편은 완료로 둔다.
    dm_creds = dailymotion_upload.load_credentials()
    if dm_creds:
        report("upload")
        try:
            dm = dailymotion_upload.upload(work_dir / "video.mp4", meta, dm_creds)
            status["dailymotion_url"] = dm["url"]
            print(f"[prism-batch] {item_id} — 데일리모션 업로드 {dm['url']}")
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 데일리모션 업로드 실패: {e}")
            status["dailymotion_error"] = str(e)[:500]

    # 유튜브 쇼츠 자동 공개 — PRISM_SHORTS=1일 때만(기본 꺼짐: 완성 모습을 확인한 뒤 켠다). 방금 올린 가로 영상을
    # 세로 틀 가운데에 넣고 위에 제목·아래에 AI PRISM 배너를 붙여(shorts_compose.py, ffmpeg) 쇼츠로 올린다.
    # 렌더를 다시 하지 않고, 가로 업로드가 모두 끝난 뒤에 돌아서 가로 공개를 늦추지 않는다. 합성이나 업로드가
    # 실패해도 가로 영상·편 완료에는 영향이 없다. 쇼츠는 세로 영상에 #Shorts를 붙여 올리면 유튜브가 분류한다.
    # 데일리모션에도 같은 세로 영상을 올린다(#Shorts 없는 원래 제목). 유튜브와 데일리모션은 서로 독립 — 한쪽이 실패해도 다른 쪽은 올린다.
    if os.environ.get("PRISM_SHORTS", "0") == "1" and creds:
        report("shorts")
        shorts_path = work_dir / "video_shorts.mp4"
        try:
            shorts_compose.compose(work_dir / "video.mp4", shorts_path, meta["title"])
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 쇼츠 합성 실패: {e}")
            status["youtube_shorts_error"] = str(e)[:500]
        else:
            report("upload")
            try:
                video_id = youtube_upload.upload(shorts_path, shorts_metadata(meta), creds)
                status["youtube_shorts_url"] = f"https://www.youtube.com/shorts/{video_id}"
                print(f"[prism-batch] {item_id} — 유튜브 쇼츠 업로드 {status['youtube_shorts_url']}")
            except Exception as e:  # noqa: BLE001
                print(f"[prism-batch] 유튜브 쇼츠 실패: {e}")
                status["youtube_shorts_error"] = str(e)[:500]
            if dm_creds:
                try:
                    dm_shorts = dailymotion_upload.upload(shorts_path, meta, dm_creds)
                    status["dailymotion_shorts_url"] = dm_shorts["url"]
                    print(f"[prism-batch] {item_id} — 데일리모션 쇼츠 업로드 {dm_shorts['url']}")
                except Exception as e:  # noqa: BLE001
                    print(f"[prism-batch] 데일리모션 쇼츠 실패: {e}")
                    status["dailymotion_shorts_error"] = str(e)[:500]

    report("done")
    print(f"[prism-batch] {item_id} — 완료")
    return True
