"""video-lab 전용 렌더 엔트리포인트 — CMS 영상 탭이 만든 각본 텍스트를 받아 렌더만 한다.

별도 ECS 태스크 정의(sedaily-lens-video-lab)로 실행되며, 완료·실패는 S3 오브젝트 존재 여부로만 알린다
(성공 media/video-lab/{job_id}.mp4·.jpg, 실패 .error.json, 진행률 .progress.json).
기사 조회·Bedrock 각본 생성은 건너뛰고, 텍스트를 generate_script.py의 fix_script → validate_script에 통과시킨다.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from config import CMS_MEDIA_BUCKET  # noqa: E402 — sys.path 세팅 후 import
from json_extract import extract_json_object, loads_lenient  # noqa: E402
import video_settings  # noqa: E402

import boto3  # noqa: E402

from generate_script import fix_script, validate_script  # 같은 폴더(pipelines/video/) — sibling, sys.path 조작 불필요

# ECS 실행 방식: Docker 이미지는 frontpage_auto와 같은 ECR 리포지토리를 쓰므로 새로 빌드하지 않고
# entryPoint만 ["python3.11", "/app/pipelines/video/render_from_script.py"]로 등록한다(video-lab-taskdef.json).
# 컨테이너 WORKDIR이 frontpage_auto/라 상대경로는 파일을 못 찾으므로 절대경로여야 한다. ECS RunTask의
# containerOverrides는 CMD만 바꿀 수 있어 frontpage_auto/Dockerfile의 ENTRYPOINT를 우회하려면 별도 family가 필요하다.
#
# 완료·실패 신호를 DynamoDB나 콜백 없이 S3 오브젝트로 전달하는 이유: admin Lambda는 이 버킷에 GetObject
# 권한이 없고(CmsMediaWrite 정책은 PutObject만) IAM을 더 늘리지 않으려는 것이다. 버킷은 공개 읽기이므로
# admin은 공개 URL로 HTTPS HEAD만 확인한다(admin/backend/routes/video_lab.py::handle_poll).
VIDEO_DIR = Path(__file__).parent


def _find_balanced_json_objects(text: str) -> list[str]:
    """text 안의 모든 최상위 '{...}' 균형잡힌 구간을 순서대로 찾는다
    (문자열 리터럴 안의 중괄호는 무시, 중첩 객체는 바깥 구간에 이미
    포함되므로 별도 후보로 안 뽑는다)."""
    candidates: list[str] = []
    depth = 0
    start: int | None = None
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    candidates.append(text[start:i + 1])
                    start = None
    return candidates


def _extract_render_script(raw: str) -> dict:
    """extract_json_object보다 적극적으로 "렌더용 JSON"을 찾는다. cuts가 실제로 채워진 배열을 가진
    첫 후보를 채택한다.

    extract_json_object()의 마지막 폴백(첫 '{'~마지막 '}')은 코드펜스를 안 지킨 응답에서 본문 전체를
    한 덩어리로 집어와 title/brand/cuts/source가 빈 JSON이 될 수 있다. 이 입력은 사람이 채팅에서
    복사한 텍스트라 포맷이 덜 보장되므로 한 후보만 믿지 않는다."""
    try:
        obj = extract_json_object(raw)
        if isinstance(obj, dict) and isinstance(obj.get("cuts"), list) and obj["cuts"]:
            return obj
    except (ValueError, json.JSONDecodeError):
        pass

    for candidate in _find_balanced_json_objects(raw):
        try:
            obj = loads_lenient(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("cuts"), list) and obj["cuts"]:
            return obj

    raise ValueError(
        "응답에서 title/brand/cuts/source를 갖춘 렌더용 JSON을 찾지 못했습니다 — "
        "왼쪽 채팅 응답에 \"(2) 렌더용 JSON\" 부분이 실제로 포함돼 있는지 확인해 주세요."
    )


def _fill_missing_top_level(script: dict) -> list[str]:
    """title/brand/source는 사실 정보가 아니라 메타·브랜딩 필드다. cuts(실제 팩트)는 찾았는데 이 셋만
    빠져 Remotion 스키마 검증에서 막히는 것을 막는다. cuts 내용은 건드리지 않는 순수 구조 보정이다."""
    applied: list[str] = []
    if not script.get("brand"):
        script["brand"] = "같은 뉴스, 네 가지 시선 | AILENS"  # 영상 프롬프트 예시 JSON의 고정값과 동일
        applied.append("brand 누락 → 고정 브랜드 문구로 채움")
    if not script.get("title"):
        first_cut = (script.get("cuts") or [{}])[0]
        narration = first_cut.get("narration")
        script["title"] = narration[:40] if isinstance(narration, str) and narration else "(제목 없음)"
        applied.append("title 누락 → 첫 컷 나레이션으로 채움")
    if not script.get("source"):
        script["source"] = "자료: "
        applied.append("source 누락 → 빈 출처 표기로 채움(직접 채워 넣는 것을 권장)")
    return applied

_TTS_LINE_RE = re.compile(r"\[(\d+)/(\d+)\]\s+\S+\s+(캐시 사용|신규 합성)")
_RENDER_LINE_RE = re.compile(r"진행률: (\d+)% \(렌더 (\d+)/(\d+), 인코딩 (\d+)\)")
_MIN_UPLOAD_INTERVAL_SECONDS = 2.0  # S3 PutObject 과호출 방지(프레임마다 안 올림)


def _progress_key(job_id: str) -> str:
    return f"media/video-lab/{job_id}.progress.json"


def _upload_error(s3, job_id: str, message: str) -> None:
    s3.put_object(
        Bucket=CMS_MEDIA_BUCKET,
        Key=f"media/video-lab/{job_id}.error.json",
        Body=json.dumps({"error": message}, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )


def _run_render_streaming(cmd: list[str], cwd: str, s3, job_id: str, env: dict | None = None) -> tuple[int, str]:
    """렌더 출력을 실시간으로 읽으며 진행률을 S3에 스로틀 업로드한다.
    반환값은 (returncode, 전체 출력) — 실패 시 에러 메시지 조립에 쓴다.

    로컬 render.ts는 렌더링 줄을 캐리지 리턴(CR, 줄바꿈 아님)으로 갱신하므로, subprocess.run(capture_output=True)
    으로는 렌더가 끝나야 한꺼번에 보인다. Popen으로 문자 단위로 읽고 CR/LF를 둘 다 줄 경계로 취급한다.
    진행률은 progress.json에 덮어쓰며 video_lab.py::handle_poll이 pending 응답에 싣는다.

    env — tts.ts::DEFAULT_VOICE는 엔진을 process.env.TTS_ENGINE에서 읽고 CLI 플래그가 없다(voiceId만
    --voice로 온다). CMS video-settings 발행값을 반영하려면 환경변수로 넘기는 방법뿐이다."""
    proc = subprocess.Popen(
        cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env,
    )
    assert proc.stdout is not None
    lines: list[str] = []
    buf = ""
    last_upload = 0.0
    last_state: dict | None = None

    def maybe_upload(state: dict, *, force: bool = False) -> None:
        nonlocal last_upload, last_state
        if not force and state == last_state:
            return
        now = time.monotonic()
        if not force and now - last_upload < _MIN_UPLOAD_INTERVAL_SECONDS:
            return
        try:
            s3.put_object(
                Bucket=CMS_MEDIA_BUCKET, Key=_progress_key(job_id),
                Body=json.dumps(state, ensure_ascii=False).encode("utf-8"),
                ContentType="application/json",
            )
        except Exception as e:  # noqa: BLE001 — 진행률 표시는 부가 기능, 실패해도 렌더는 계속 진행
            print(f"[progress] 업로드 실패(무시): {e}")
        last_upload = now
        last_state = state

    while True:
        ch = proc.stdout.read(1)
        if ch == "" and proc.poll() is not None:
            break
        if ch not in ("\r", "\n"):
            buf += ch
            continue
        line, buf = buf, ""
        if not line.strip():
            continue
        print(line)
        lines.append(line)

        m = _RENDER_LINE_RE.search(line)
        if m:
            percent, rendered, total, encoded = m.groups()
            maybe_upload({
                "stage": "rendering", "percent": int(percent),
                "renderedFrames": int(rendered), "totalFrames": int(total), "encodedFrames": int(encoded),
            })
            continue
        m = _TTS_LINE_RE.search(line)
        if m:
            current, total, _tag = m.groups()
            maybe_upload({"stage": "tts", "current": int(current), "total": int(total)})
            continue
        if "번들링" in line:
            maybe_upload({"stage": "bundling"}, force=True)
        elif "렌더링 (" in line:
            maybe_upload({"stage": "rendering", "percent": 0}, force=True)
        elif "TTS 처리" in line:
            maybe_upload({"stage": "tts", "current": 0, "total": 0}, force=True)

    if buf.strip():
        print(buf)
        lines.append(buf)
    proc.wait()
    return proc.returncode, "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="이미 생성된 각본 텍스트로 영상만 렌더(CMS 영상 랩 전용)")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--script-s3-key", required=True)
    # CMS 카드(VideoCardGenerator.tsx)의 "성우 미리듣기"에서 고른 provider/voice를 이 렌더 1회에도 쓰고
    # 싶을 때 chat_ws.py::_run_render_video_flow가 JSON으로 담아 넘긴다. 없으면(자동 발행 파이프라인 등)
    # 발행된 설정만 쓴다.
    parser.add_argument("--settings-override", default=None)
    args = parser.parse_args()
    settings_override = json.loads(args.settings_override) if args.settings_override else None

    s3 = boto3.client("s3", region_name="us-east-1")
    work_dir = Path("/tmp") / args.job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    raw_path = work_dir / "raw.txt"
    s3.download_file(CMS_MEDIA_BUCKET, args.script_s3_key, str(raw_path))
    raw = raw_path.read_text(encoding="utf-8")

    try:
        script = _extract_render_script(raw)
    except (ValueError, json.JSONDecodeError) as e:
        print(f"각본 JSON 파싱 실패: {e}")
        _upload_error(s3, args.job_id, f"각본이 유효한 JSON이 아닙니다: {e}")
        sys.exit(1)

    for line in _fill_missing_top_level(script):
        print(f"[자동수정] {line}")

    script, applied = fix_script(script)
    for line in applied:
        print(f"[자동수정] {line}")

    errors = validate_script(script)
    if errors:
        print(f"검증 실패 {len(errors)}건")
        _upload_error(s3, args.job_id, "각본에 문제가 있습니다(직접 수정 후 다시 시도):\n" + "\n".join(f"- {e}" for e in errors))
        sys.exit(1)

    script_path = work_dir / "script.json"
    script_path.write_text(json.dumps(script, ensure_ascii=False), encoding="utf-8")

    settings = video_settings.get_render_settings(settings_override)  # admin CMS에서 fresh 조회(캐시 없음), --settings-override가 있으면 그 위에 덮어씀
    mp4_path = work_dir / "video.mp4"
    print(
        f"렌더 시작... (provider={settings['provider']}, voice={settings['voice']}, "
        f"engine={settings['engine']}, format={settings['format']})"
    )
    # get_render_env()가 TTS_PROVIDER/TTS_VOICE_ID/TTS_ENGINE(+provider가 elevenlabs면 ELEVENLABS_*)을
    # 만든다. publish_utils.py::generate_video()와 이 로직을 공유한다(video_settings.py 모듈 docstring 참고).
    #
    # 단일 Fargate 컨테이너 렌더는 코어 수 한계를 못 벗어나므로 Remotion Lambda(render:lambda)로 렌더한다.
    # 계약(work_dir/video.mp4가 로컬에 생성됨)은 로컬 렌더와 같아 이후 썸네일 생성·S3 업로드는 그대로다.
    returncode, output = _run_render_streaming(
        [
            "npm", "run", "render:lambda", "--",
            "--input", str(script_path.resolve()),
            "--format", settings["format"],
            "--output", str(mp4_path.resolve()),
            "--voice", settings["voice"],
            "--job-id", args.job_id,
        ],
        cwd=str(VIDEO_DIR),
        s3=s3,
        job_id=args.job_id,
        env={**os.environ, **video_settings.get_render_env(settings_override)},
    )
    if returncode != 0 or not mp4_path.exists():
        _upload_error(s3, args.job_id, f"렌더 실패(returncode={returncode}): {output[-1000:]}")
        sys.exit(1)

    thumb_path = work_dir / "thumb.jpg"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", "2", "-i", str(mp4_path), "-frames:v", "1", str(thumb_path)],
        capture_output=True,
    )

    s3.upload_file(str(mp4_path), CMS_MEDIA_BUCKET, f"media/video-lab/{args.job_id}.mp4", ExtraArgs={"ContentType": "video/mp4"})
    if thumb_path.exists():
        s3.upload_file(str(thumb_path), CMS_MEDIA_BUCKET, f"media/video-lab/{args.job_id}.jpg", ExtraArgs={"ContentType": "image/jpeg"})
    print(f"완료 — media/video-lab/{args.job_id}.mp4")


if __name__ == "__main__":
    main()
