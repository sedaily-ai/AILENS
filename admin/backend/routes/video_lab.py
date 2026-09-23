"""영상 랩 — 실제 렌더 미리보기 폴링. 2026-09-23 신설, 사용자 요청:
"동영상도 가능?" → "네.. 진행을 해야합니다".

render_video WS kind(routes/chat_ws.py::_run_render_video_flow)가 ECS
video-lab 태스크를 RunTask로 띄운 뒤, admin Lambda는 그 작업의 완료를
기다리지 않는다(Remotion 렌더는 수십 초~수 분 걸려 WS 자기-invoke
Lambda 한 번의 실행 시간 안에도 못 들어가고, 그 사이 WS 커넥션이 계속
열려 있으리란 보장도 없다) — 대신 프런트(VideoRenderGenerator.tsx)가
이 라우트를 주기적으로 폴링한다.

DynamoDB job 테이블도, Fargate→Lambda 콜백도 없다 — Fargate 태스크
(pipelines/video/render_from_script.py)가 S3에 직접 올린 결과 오브젝트의
존재 여부만 본다. admin Lambda는 이 버킷에 GetObject 권한이 없어서
(CmsMediaWrite 정책은 PutObject만 허용) 인증된 boto3 호출 대신 공개
URL로 순수 HTTPS HEAD/GET만 쏜다 — 이 기능을 위해 새 S3 읽기 IAM을
늘리지 않는다(웹툰 컷 이미지·팟캐스트 음성도 이미 같은 이유로 버킷
자체가 공개 읽기).

**진행률(2026-09-23 추가)** — 사용자 요청: "진행상황이나... 퍼센테이지로
볼 수 있거나 하는 UX는 적용할 수 없는건가?? 렌더가 길어서". render_from_
script.py가 media/video-lab/{job_id}.progress.json에 2초 간격으로 덮어쓴
{"stage": "tts"|"bundling"|"rendering", ...}를 "pending" 응답에 그대로
실어 보낸다 — video.mp4/error.json과 마찬가지로 공개 URL GET일 뿐,
새 IAM 없음."""
import json
import urllib.error
import urllib.request

from shared import response
from routes.webtoon import jobs as webtoon_jobs

_TIMEOUT_SECONDS = 5


def _head_ok(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            return resp.status == 200
    except Exception:  # noqa: BLE001 — 404든 네트워크 일시 오류든 "아직 없음"과 동일 취급(다음 폴링에서 재시도)
        return False


def _get_text(url: str) -> str | None:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            return resp.read().decode("utf-8")
    except Exception:  # noqa: BLE001
        return None


def handle_poll(body: dict, path_params: dict, query_params: dict) -> dict:
    """`GET /admin/video-lab/{job_id}` — video.mp4/error.json S3 존재
    여부만으로 pending/done/error 셋 중 하나를 알려준다."""
    job_id = (path_params or {}).get("job_id", "")
    if not job_id:
        return response.err("job_id required", 400)
    bucket = webtoon_jobs.bucket()
    base = f"https://{bucket}.s3.us-east-1.amazonaws.com/media/video-lab/{job_id}"
    if _head_ok(f"{base}.mp4"):
        thumb_url = f"{base}.jpg" if _head_ok(f"{base}.jpg") else None
        return response.ok({"status": "done", "video_url": f"{base}.mp4", "thumb_url": thumb_url})
    error_raw = _get_text(f"{base}.error.json")
    if error_raw:
        try:
            message = json.loads(error_raw).get("error", "렌더 실패")
        except json.JSONDecodeError:
            message = "렌더 실패"
        return response.ok({"status": "error", "message": message})
    progress_raw = _get_text(f"{base}.progress.json")
    progress = None
    if progress_raw:
        try:
            progress = json.loads(progress_raw)
        except json.JSONDecodeError:
            progress = None
    return response.ok({"status": "pending", "progress": progress})
