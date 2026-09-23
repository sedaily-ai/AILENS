"""video-lab 전용 렌더 엔트리포인트 — 사용자 요청("동영상도 가능?" →
"네.. 진행을 해야합니다")으로 2026-09-23 신설.

admin CMS 영상 탭(PromptTextLab.tsx)에서 이미 만든 각본 텍스트를 받아
"렌더만" 한다 — 기사 조회·Bedrock 각본 생성(같은 폴더 generate_script.py의
generate_script())은 건너뛴다. 대신 텍스트를 generate_script.py의
검증·자동수정 파이프라인(extract_json_object → fix_script →
validate_script)에 그대로 통과시킨다 — CMS 영상 탭이 지금 쓰는
_CATEGORY_BEDROCK["video"] 단일 Bedrock 호출(admin/backend/routes/
chat_ws.py::_run_article_text_flow)에는 generate_script.py의 아이콘
화이트리스트 보정·JSON 파싱 실패 시 재요청 같은 안전망이 전혀 없어서,
그 안전망 없이 원문 그대로 렌더를 시도하면 실패율이 훨씬 높다.

**별도 ECS 태스크 정의로 실행된다** — `sedaily-lens-video-lab`(cluster는
`sedaily-lens-frontpage-auto`와 공유, family만 다름). Docker 이미지는
`frontpage_auto`와 완전히 동일(같은 ECR 리포지토리) — Node+Remotion+
ffmpeg가 이미 다 들어있어 새로 빌드할 필요가 없고, entryPoint만
`["python3.11", "/app/pipelines/video/render_from_script.py"]`(절대경로
— 2026-09-23 상대경로였다가 컨테이너 WORKDIR이 frontpage_auto/라 실제
파일을 못 찾아 27초 만에 죽던 버그 수정)로 다르게 등록한다(ECS RunTask의
containerOverrides는 CMD만 바꿀 수 있고 ENTRYPOINT는 못 바꾸므로 —
frontpage_auto/Dockerfile의 `ENTRYPOINT ["python3.11", "run.py"]`를 못
우회해 별도 family가 필요했다). 프로덕션 frontpage_auto/mustknow_auto
태스크 정의·실행에는 전혀 영향 없다.

**완료/실패 신호는 DynamoDB나 콜백 없이 S3 오브젝트 존재 여부로만
전달한다** — admin Lambda는 이 버킷에 GetObject 권한이 없고(CmsMediaWrite
정책은 PutObject만) 새 IAM을 더 늘리지 않으려고, admin은 공개 URL로
plain HTTPS HEAD만 확인한다(웹툰 컷 이미지·팟캐스트 음성과 동일하게
버킷 자체가 공개 읽기). 성공하면 media/video-lab/{job_id}.mp4
(+.jpg 썸네일), 실패하면 media/video-lab/{job_id}.error.json이 대신
올라간다 — admin/backend/routes/video_lab.py::handle_poll이 그 셋을
그대로 이 순서로 확인한다.

**진행률(2026-09-23 추가)** — 사용자 요청: "진행상황이나... 퍼센테이지로
볼 수 있거나 하는 UX는 적용할 수 없는건가?? 렌더가 길어서". scripts/
render.ts는 TTS 합성(컷별 1줄)·렌더링(프레임별 퍼센트) 둘 다 실시간으로
찍지만, 렌더링 줄은 `process.stdout.write`로 `\r`(캐리지 리턴 — 줄바꿈
아님)을 써서 완성 대기형 subprocess.run(capture_output=True)으로는 렌더가
끝나야만 한꺼번에 보인다. Popen으로 바꿔 문자 단위로 읽고 `\r`/`\n` 둘 다
줄 경계로 취급해야 실시간으로 잡힌다 — media/video-lab/{job_id}.
progress.json에 2초 간격으로 스로틀해서 덮어쓰고, video_lab.py::
handle_poll이 이걸 그대로 "pending" 응답에 실어 보낸다.

**JSON 추출 강화(2026-09-23 추가)** — 사용자 리포트: "이 응답 전체 복사"로
붙여넣었는데도 title/brand/cuts/source가 전부 비어 있는 JSON이 뽑혀
Remotion 스키마 검증에서 실패("알아서 파싱하게 해주는거 그런거는 없나?").
원인: json_extract.extract_json_object()의 마지막 폴백("첫 '{'~마지막
'}' 구간")은 모델이 ```json 코드펜스를 안 지킨 응답에서는 본문 전체를
한 덩어리로 집어와 전혀 다른(또는 텅 빈) 구조가 될 수 있다 — 이 파일은
Bedrock 원본 응답(코드펜스를 비교적 잘 지킴)만 다루는 generate_script.py
와 달리, 사람이 채팅에서 복사해 온 텍스트라 포맷이 덜 보장된다.
`_extract_render_script()`가 텍스트 안의 모든 균형잡힌 '{...}' 구간을
찾아 그중 실제로 cuts 배열을 가진 것만 골라 쓴다 — extract_json_object
하나만 믿지 않는다."""
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
    """extract_json_object보다 적극적으로 "렌더용 JSON"을 찾는다 — 후보를
    하나만 믿지 않고, cuts가 실제로 채워진 배열을 가진 첫 후보를 채택한다
    (모듈 docstring "JSON 추출 강화" 참고)."""
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
    """title/brand/source는 사실 정보가 아니라 메타·브랜딩 필드다 — cuts
    (실제 팩트)를 찾는 데는 성공했는데 이 셋만 빠져 Remotion 스키마 검증
    에서 막히는 걸 막는다(사용자 리포트 재현). cuts 내용은 전혀 안 건드림
    — §23 원칙(사실을 지어내지 않는다)과 무관한 순수 구조 보정이다."""
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
    """render.ts 출력을 실시간으로 읽으며 진행률을 S3에 스로틀 업로드한다.
    반환값은 (returncode, 전체 출력) — 실패 시 에러 메시지 조립에 쓴다.

    env(2026-09-23 추가) — tts.ts::DEFAULT_VOICE는 엔진을 process.env.
    TTS_ENGINE에서 읽는다(CLI 플래그가 없음 — voiceId만 --voice로 옴) —
    CMS video-settings 발행값을 반영하려면 이 방법뿐이다."""
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
    args = parser.parse_args()

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

    settings = video_settings.get_render_settings()  # admin CMS에서 fresh 조회(캐시 없음)
    mp4_path = work_dir / "video.mp4"
    print(f"렌더 시작... (voice={settings['voice']}, engine={settings['engine']}, format={settings['format']})")
    returncode, output = _run_render_streaming(
        [
            "npm", "run", "render", "--",
            "--input", str(script_path.resolve()),
            "--format", settings["format"],
            "--output", str(mp4_path.resolve()),
            "--voice", settings["voice"],
        ],
        cwd=str(VIDEO_DIR),
        s3=s3,
        job_id=args.job_id,
        env={**os.environ, "TTS_ENGINE": settings["engine"]},
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
