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
import traceback
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
import doc_plan  # noqa: E402
import seo_description  # noqa: E402
import shorts_compose  # noqa: E402
import youtube_upload  # noqa: E402
from youtube_upload import shorts_metadata  # noqa: E402
import dailymotion_upload  # noqa: E402
try:  # 썸네일 모듈이 깨져도 영상 제작은 계속한다(2026-11-25)
    import prism_thumbnail  # noqa: E402
except Exception as _thumb_err:  # noqa: BLE001
    print(f"[prism-batch] 썸네일 모듈 불러오기 실패 — 썸네일 없이 진행: {_thumb_err!r}")
    prism_thumbnail = None

# 지침(대본 작성 프롬프트)의 "12개 카테고리 개요" 표와 같은 코드·이름. 화면(PrismBatchPage)과 서버 라우트도 같은 표를 쓴다.
GROUPS = {
    "SG1": "Students & Grads", "SG2": "Early Careers", "SG3": "Founders", "SG4": "Global Investors",
    "SG5": "CEO", "SG6": "Retail Investors", "SG7": "Real Estate", "SG8": "Stock Investors",
    "PG1": "Front Page Daily", "PG2": "Securities Daily", "PG3": "Industry Daily", "PG4": "Finance Daily",
}
_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_SCRIPT_CATEGORY = "prism"
_SCENE_CATEGORY = "prism-scene"
# 투자 고지("not investment advice")를 설명글에 넣는 그룹 — SG4 Global Investors, SG6 Retail Investors, SG8 Stock Investors.
_INVEST_TYPES = {"SG4", "SG6", "SG8"}
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


# 지면 영상(PG1~PG4) 자동 제작(2026-11-18) — 입력 txt는 섹션 첫 면의 TOP 기사 + 같은 면 기사 1개(prism_paper.py).
# 수동 영상(약 2분, TOP 중심, 두 번째는 "Separately," 한두 문장)에 맞추려고 대본 요청에 덧붙인다.
# 마케팅팀 지침(CMS prism)은 그대로 두고 지면 편에만 붙인다. 시험(11/17·18)에서 덧붙이기 전 대본은 370~640단어(2:16~4:24)였다.
_PAPER_TYPES = {"PG1", "PG2", "PG3", "PG4"}
_PAPER_NOTE = """

[지면 영상 추가 지시]
- 첫 번째 기사가 그 지면의 TOP 기사다. 이 영상의 주인공은 TOP 기사 하나다.
- Episode Title은 TOP 기사 하나로만 짓는다. 두 기사를 ";"나 "and"로 나열하지 않는다. 날짜·시리즈 꼬리를 뺀 제목 부분은 영어 60자 이내로 쓴다(유튜브 제목 100자 제한).
- 두 번째 기사는 SO WHAT 바로 앞에 "Separately,"로 시작하는 2~3문장으로만 다룬다.
- 섹션별 문장 수 규칙은 지키되 문장을 짧게 쓴다. EL Script 낭독 부분(오디오 태그 제외)은 영어 260~320단어로 맞춘다(약 2분).
"""


def paper_title(raw: str, day: dt.date, display_name: str) -> str:
    """지면 편 유튜브 제목을 지침 모양 '<제목> | November 17 2026 | Front Page Daily'로 맞춘다(2026-11-18 시험:
    1면 편 2개가 시리즈 꼬리를 빠뜨렸고, 날짜에 쉼표를 넣은 편도 있었다). 두 기사를 ';'로 나열했으면 앞(TOP)만 남긴다.
    100자를 넘으면 꼬리가 아니라 제목 쪽을 줄인다."""
    head = raw.split("|")[0].split(";")[0].strip() or display_name
    tail = f" | {day:%B} {day.day} {day.year} | {display_name}"
    room = youtube_upload._TITLE_MAX - len(tail)
    if len(head) > room:
        cut = head[:room].rsplit(" ", 1)[0] if " " in head[:room] else head[:room]
        head = cut.rstrip(" ,;:-—")  # 단어 중간에서 끊지 않는다
    return head + tail


def _amount_feedback(flags: list[str]) -> str:
    listed = "\n".join(f"- {f}" for f in flags[:8])
    return (
        "\n\n[금액 재확인 요청]\n직전 대본의 아래 원화 금액은 입력 기사 어느 금액과도 맞지 않았습니다.\n"
        f"{listed}\n"
        "입력 기사의 한국어 금액을 단위 그대로 다시 환산하세요(만 원 = 10 thousand won, 억 원 = 100 million won, "
        "조 원 = 1 trillion won. 예: 4405만 원 = 44.05 million won, 2959억 원 = 295.9 billion won). "
        "주가(1주당 가격)를 시가총액으로 바꾸지 마세요. 기사에 없는 금액은 쓰지 마세요. 나머지 지침과 출력 형식은 그대로 지킵니다."
    )


def _write_script(script_guide: str, user_message: str, display_name: str) -> str | None:
    """대본 작성 → 지침 형식이면 대본, 형식이 두 번 다 이상하면 None."""
    script_text = call_text(script_guide, user_message, model=_SCRIPT_MODEL, max_tokens=_MAX_TOKENS)
    if _looks_like_script(script_text, display_name):
        return script_text
    print(f"[prism-batch] 대본 형식 이상 — 1회 재요청. 앞부분: {script_text[:200]!r}")
    script_text = call_text(
        script_guide,
        user_message + "\n\n(TYPE·RECORDING DATE·WEEKDAY는 위에 있습니다. 질문하지 말고 지침의 출력 형식대로 바로 생성하세요.)",
        model=_SCRIPT_MODEL, max_tokens=_MAX_TOKENS,
    )
    if _looks_like_script(script_text, display_name):
        return script_text
    print(f"[prism-batch] 대본 형식 이상(재요청 후) — 앞부분: {script_text[:300]!r}")
    return None


def _make_scene(scene_guide: str, script_text: str) -> tuple[dict | None, str]:
    """대본 → 검증을 통과한 장면 JSON(못 만들면 None)과 마지막 문제 설명."""
    scene_message = f"[입력 기사]\n{script_text}"
    problem = ""
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
            return candidate, ""
        last_candidate = candidate
        print(f"[prism-batch] 장면 검증 실패 {len(errors)}건(시도 {attempt})")
        problem = "\n\n(직전 JSON의 문제 — 고쳐서 JSON 하나만 다시 출력하세요:\n" + "\n".join(f"- {x}" for x in errors) + ")"
    # 재요청까지 실패했고 남은 문제가 "수치 빈 stat 컷"뿐이면 그 컷만 글자 컷으로 바꿔 계속 만든다(2026-11-05,
    # 자동 제작은 실패하면 사람이 [다시 시도]를 눌러야 한다). 다른 문제가 남으면 실패.
    if last_candidate is not None:
        demoted = demote_incomplete_stats(last_candidate)
        if demoted and not validate_script(last_candidate):
            for line in demoted:
                print(f"[자동수정] {line}")
            return last_candidate, ""
    return None, problem


def _safe_number_issues(script: dict, article: str) -> list[str]:
    try:
        return number_issues(script, article)
    except Exception as e:  # noqa: BLE001 — 검수 오류로 영상이 멈추면 안 된다
        print(f"[prism-batch] [검수] 금액 검수 건너뜀: {e!r}")
        return []


def _save_script(s3, batch_id: str, item_id: str, script_text: str) -> None:
    s3.put_object(
        Bucket=CMS_MEDIA_BUCKET, Key=f"media/prism-batch/{batch_id}/{item_id}.script.txt",
        Body=script_text.encode("utf-8"), ContentType="text/plain; charset=utf-8",
    )

def run(s3, work_dir: Path, *, batch_id: str, item_id: str, job_id: str, article_key: str,
        type_code: str, recording_date: str) -> bool:
    try:
        ok = _run(s3, work_dir, batch_id=batch_id, item_id=item_id, job_id=job_id, article_key=article_key,
                  type_code=type_code, recording_date=recording_date)
    except Exception as e:  # noqa: BLE001
        # 예상 못 한 오류로 죽으면 상태가 마지막 단계('장면 나누는 중' 등)에 멈춰 CMS에 계속 진행 중으로 보였다
        # (2026-11-10). 실패를 상태에 남겨 화면에 '실패'와 [다시 시도]가 뜨게 한다.
        traceback.print_exc()
        _record_crash(s3, batch_id, item_id, job_id, type_code, e)
        ok = False
    # 묶음의 마지막 편이면 슬랙에 요약을 한 번 보낸다(prism_notify.py). 알림 실패가 이 편의 결과를 바꾸지 않는다.
    try:
        prism_notify.notify_if_batch_done(s3, batch_id)
    except Exception as e:  # noqa: BLE001
        print(f"[prism-notify] 알림 실패(무시): {e}")
    return ok


def _record_crash(s3, batch_id: str, item_id: str, job_id: str, type_code: str, err: Exception) -> None:
    """_run이 예외로 끝났을 때 상태를 error로 바꾼다. 이미 적힌 제목 등은 살린다."""
    key = _status_key(batch_id, item_id)
    status: dict = {}
    try:
        status = json.loads(s3.get_object(Bucket=CMS_MEDIA_BUCKET, Key=key)["Body"].read())
    except Exception:  # noqa: BLE001
        pass
    status.update(job_id=job_id, type=type_code, stage="error",
                  message=f"제작 중 오류로 멈췄습니다: {err!r}"[:1000],
                  updated_at=dt.datetime.now(dt.timezone.utc).isoformat())
    try:
        _put_json(s3, key, status)
    except Exception as e:  # noqa: BLE001
        print(f"[prism-batch] 실패 상태 기록 실패(무시): {e}")


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
    if type_code in _PAPER_TYPES:
        user_message += _PAPER_NOTE
    print(f"[prism-batch] {item_id} {type_code} {display_name} {day} — 대본 작성")

    try:
        script_guide = ddb_prompt.load_prompt(_SCRIPT_CATEGORY)
        scene_guide = ddb_prompt.load_prompt(_SCENE_CATEGORY)
    except Exception as e:  # noqa: BLE001
        return fail(f"프롬프트 읽기 실패: {e}")
    try:
        script_text = _write_script(script_guide, user_message, display_name)
    except Exception as e:  # noqa: BLE001
        return fail(f"대본 작성 실패: {e}")
    if script_text is None:
        return fail("대본 작성 응답이 지침 형식이 아닙니다(EL Script 제목이나 고정 아웃트로 없음) — 다시 시도해 주세요")

    _save_script(s3, batch_id, item_id, script_text)
    title = _episode_title(script_text)
    report("scene", title=title)
    print(f"[prism-batch] {item_id} — 장면 나누기 ({title})")
    try:
        script, problem = _make_scene(scene_guide, script_text)
    except Exception as e:  # noqa: BLE001
        return fail(f"장면 나누기 실패: {e}")
    if script is None:
        return fail("장면 변환 결과가 두 번 모두 검증을 통과하지 못했습니다" + (f": {problem.strip()[:500]}" if problem else ""))

    # 날짜·숫자 검수(2026-11-05) — 녹화일/원문과 어긋나는 날짜·금액을 로그·상태에 남긴다. 렌더를 막지는 않는다
    # (PRISM은 바로 공개라, 확실한 오류는 슬랙·로그로 사람이 보고, 영상 자체는 나간다).
    # 검수는 참고용이라 검수 코드 오류로 영상이 멈추면 안 된다(2026-11-07·09 주식 편이 이것으로 멈춤).
    number_flags = _safe_number_issues(script, article)
    # 금액 표시가 있으면 대본을 한 번 다시 쓴다(2026-11-18). 고친 검수로 최근 표시 4건(11/12·11/16)과 지면 시험 1건이
    # 모두 실제 10배·단위 오류였다. 정답 값은 알려 주지 않고(코드가 어느 원문 금액과 짝인지 모른다) 문제 금액만 알린다.
    # 다시 쓴 쪽의 표시가 더 적을 때만 바꾼다 — 나빠지면 처음 것을 그대로 쓴다.
    if number_flags:
        print(f"[prism-batch] 금액 표시 {len(number_flags)}건 — 대본 1회 다시 쓰기")
        report("script", title=title, rewrite="amount")
        try:
            retry_text = _write_script(script_guide, user_message + _amount_feedback(number_flags), display_name)
            retry_script = _make_scene(scene_guide, retry_text)[0] if retry_text else None
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 다시 쓰기 실패 — 처음 대본 사용: {e!r}")
            retry_script = None
        if retry_script is not None:
            retry_flags = _safe_number_issues(retry_script, article)
            print(f"[prism-batch] 다시 쓴 대본 금액 표시 {len(retry_flags)}건(처음 {len(number_flags)}건)")
            if len(retry_flags) < len(number_flags):
                script_text, script, number_flags = retry_text, retry_script, retry_flags
                _save_script(s3, batch_id, item_id, script_text)
                title = _episode_title(script_text)
                status["amount_rewrite"] = "adopted"
            else:
                status["amount_rewrite"] = "kept-original"
        else:
            status["amount_rewrite"] = "failed"
    try:
        date_flags = date_issues(script, article, recording_date=recording_date)
    except Exception as e:  # noqa: BLE001
        print(f"[prism-batch] [검수] 날짜 검수 건너뜀: {e!r}")
        date_flags = []
    for line in date_flags + number_flags:
        print(f"[prism-batch] [검수] {line}")
    if date_flags:
        status["date_flags"] = date_flags[:20]
    if number_flags:
        status["number_flags"] = number_flags[:20]
    status["title"] = title

    # 건수를 같은 이름으로 넘기면 위 목록을 덮어써 완료 알림이 죽는다(int + list). 목록은 status에 이미 있다.
    report("render", cuts=len(script["cuts"]))
    print(f"[prism-batch] {item_id} — 렌더 ({len(script['cuts'])}컷)")
    # 화면 틀(2026-11-18) — PRISM_LAYOUT=doc(기본)이면 영문 유튜브 v2와 같은 다큐(인포그래픽) 틀, classic이면 기존 PRISM 틀.
    # 대본·장면 JSON·음성 설정은 두 틀이 같고, doc은 장면 JSON을 doc_plan으로 화면 계획만 바꿔 렌더한다.
    doc_layout = os.environ.get("PRISM_LAYOUT", "doc") == "doc"
    plan = None
    if doc_layout:
        try:
            plan = doc_plan.build_plan(script)
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 다큐 틀 변환 실패 — 기존 틀로 렌더: {e!r}")
            doc_layout = False
    status["layout"] = "doc" if doc_layout else "classic"
    if not render_and_upload(s3, job_id, script, work_dir, _voice_override(type_code), plan=plan, composition="DocHorizontal"):
        return fail("렌더 실패 — 자세한 내용은 영상 진행 상태를 확인하세요")

    # 유튜브 자동 공개 — 채널 연결 정보(시크릿)가 있을 때만. 업로드가 실패해도 영상은 이미 만들어졌으므로
    # 편 자체는 완료로 두고 화면에 실패 이유를 보여준다(내려받아 직접 올리면 된다). 다시 시도하면 중복 업로드가 된다.
    meta = youtube_upload.metadata_from_script(script_text, title or script.get("title") or display_name)
    if type_code in _PAPER_TYPES:
        meta["title"] = paper_title(meta["title"], day, display_name)
        status["title"] = meta["title"]
    # v2 설명글(2026-11-18) — 요약·챕터·출처·AI 고지·한국어판/영문판 링크·해시태그. 실패하면 기존 설명글 그대로.
    try:
        chapters = ""
        timing_path = work_dir / "video.mp4.timing.json"
        if timing_path.exists():
            timing = json.loads(timing_path.read_text(encoding="utf-8"))
            chapters = youtube_upload.chapters_from_timing(script, timing["starts"], timing["total"])
        meta["description"] = youtube_upload.v2_description(script_text, meta["tags"], chapters=chapters,
                                                            investment=type_code in _INVEST_TYPES)
    except Exception as e:  # noqa: BLE001
        chapters = ""
        print(f"[prism-batch] v2 설명글 실패 — 기존 설명글 사용: {e!r}")
    # 마케팅팀 SEO·GEO 템플릿 설명글(2026-11-18) — 통과하면 위 v2 설명글을 대신한다. 검사에 걸리거나 실패하면 v2 그대로.
    seo_call = lambda system, user: call_text(system, user, model=_SCRIPT_MODEL, max_tokens=1500)  # noqa: E731
    seo_kwargs = dict(title=meta["title"], date_label=f"{day.strftime('%b')} {day.day}, {day.year}", script_text=script_text,
                      article_text=article, investment=type_code in _INVEST_TYPES)
    try:
        desc, problems = seo_description.build(seo_call, shorts=False, chapters=chapters, **seo_kwargs)
        if desc:
            meta["description"] = desc
            status["description"] = "seo-template"
        else:
            print(f"[prism-batch] SEO 설명글 검사 실패 — v2 설명글 사용: {problems[:5]}")
    except Exception as e:  # noqa: BLE001
        print(f"[prism-batch] SEO 설명글 실패 — v2 설명글 사용: {e!r}")
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

    # 썸네일 자동(2026-11-25, prism_thumbnail.py) — 기사 사진 + 큰 문구. 가로 영상이 올라간 뒤 만들어 가로에 지정하고,
    # 세로판은 쇼츠를 올린 뒤 지정한다. 만들기·지정이 실패해도 유튜브 기본 썸네일로 남고 편은 완료된다.
    thumbs = None
    if creds and status.get("youtube_url") and prism_thumbnail is not None:
        thumbs = prism_thumbnail.make(s3, work_dir, article=article, script_text=script_text,
                                      title=meta["title"], day=day, job_id=job_id)
        if thumbs:
            status["thumbnail_text"] = f"{thumbs['hook'].get('kicker', '')} / {thumbs['hook'].get('headline', '')}"
            try:
                youtube_upload.set_thumbnail(status["youtube_url"].rsplit("=", 1)[-1], thumbs["h"], creds)
                status["thumbnail"] = "set"
            except Exception as e:  # noqa: BLE001
                print(f"[prism-batch] 썸네일 지정 실패(무시): {e}")
                status["thumbnail_error"] = str(e)[:300]

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
    # 시험 모드(2026-11-19) — PRISM_REVIEW_ONLY=1이면 유튜브 연결 없이도 쇼츠까지 렌더하고 업로드는 하지 않는다.
    # 제목·설명글은 {item}.meta.json에 남겨 사람이 확인한다(업로드를 끄면 설명글을 볼 곳이 없었다).
    review_only = os.environ.get("PRISM_REVIEW_ONLY") == "1"
    review = {"title": meta["title"], "description": meta["description"], "tags": meta["tags"]}
    if os.environ.get("PRISM_SHORTS", "0") == "1" and (creds or review_only):
        report("shorts")
        shorts_path = work_dir / "video_shorts.mp4"
        try:
            if doc_layout:
                # 다큐 틀 쇼츠 — 롱폼을 세로 틀에 끼우지 않고, 훅·숫자 컷만 골라 세로 화면으로 따로 렌더한다(약 50초).
                short_script, short_plan = doc_plan.build_shorts(script)
                if not render_and_upload(s3, f"{job_id}-shorts", short_script, work_dir, _voice_override(type_code),
                                         plan=short_plan, composition="DocVertical", out_name="video_shorts.mp4"):
                    raise RuntimeError("세로 렌더 실패")
            else:
                shorts_compose.compose(work_dir / "video.mp4", shorts_path, meta["title"])
        except Exception as e:  # noqa: BLE001
            print(f"[prism-batch] 쇼츠 합성 실패: {e}")
            status["youtube_shorts_error"] = str(e)[:500]
        else:
            report("upload")
            try:
                smeta = shorts_metadata(meta)
                try:
                    smeta["description"] = youtube_upload.v2_description(
                        script_text, meta["tags"], shorts=True, full_video_url=status.get("youtube_url", ""),
                        investment=type_code in _INVEST_TYPES)
                except Exception as e:  # noqa: BLE001
                    print(f"[prism-batch] 쇼츠 v2 설명글 실패 — 기존 설명글 사용: {e!r}")
                try:
                    sdesc, sproblems = seo_description.build(seo_call, shorts=True, **seo_kwargs)
                    if sdesc:
                        smeta["description"] = sdesc
                    else:
                        print(f"[prism-batch] 쇼츠 SEO 설명글 검사 실패 — v2 사용: {sproblems[:5]}")
                except Exception as e:  # noqa: BLE001
                    print(f"[prism-batch] 쇼츠 SEO 설명글 실패 — v2 사용: {e!r}")
                review["shorts"] = {"title": smeta.get("title"), "description": smeta.get("description")}
                if not creds:
                    raise RuntimeError("시험 모드 — 쇼츠 업로드 안 함")
                video_id = youtube_upload.upload(shorts_path, smeta, creds)
                status["youtube_shorts_url"] = f"https://www.youtube.com/shorts/{video_id}"
                print(f"[prism-batch] {item_id} — 유튜브 쇼츠 업로드 {status['youtube_shorts_url']}")
                if thumbs:
                    try:
                        youtube_upload.set_thumbnail(video_id, thumbs["v"], creds)
                        status["shorts_thumbnail"] = "set"
                    except Exception as e:  # noqa: BLE001
                        print(f"[prism-batch] 쇼츠 썸네일 지정 실패(무시): {e}")
                        status["shorts_thumbnail_error"] = str(e)[:300]
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

    try:
        _put_json(s3, f"media/prism-batch/{batch_id}/{item_id}.meta.json", review)
    except Exception as e:  # noqa: BLE001
        print(f"[prism-batch] 제목·설명글 기록 실패(무시): {e}")
    report("done")
    print(f"[prism-batch] {item_id} — 완료")
    return True
