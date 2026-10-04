"""admin 프롬프트(lens-cms-api 경유)에서 4포맷(letters/webtoon/podcast/video)
프롬프트를 읽어오는 `pipelines/` 공용 모듈.

공개 무인증 엔드포인트(GET /api/v2/prompts/{category}/{name})를 쓰므로 AWS
자격 증명이 필요 없다. 한 번 실행하고 끝나는 배치라 캐시 없이 호출마다 fetch한다.
lens-cms-api를 읽지 못하면 `service/backend/prompts/<category>/published.md`
(admin 저장 시 갱신되는 파일시스템 사본)로 폴백하고, 둘 다 실패하면 에러를 낸다.
파이프라인 안에 낡은 프롬프트 사본을 하드코딩하면 admin 수정이 반영되지 않은 채
조용히 쓰이므로 이를 막기 위한 구조다.
"""
import json
import os
import time
import urllib.request
from pathlib import Path

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TIMEOUT_SECONDS = 15
_MAX_ATTEMPTS = 3
_RETRY_WAIT_SECONDS = 4

_FILESYSTEM_FALLBACK = (
    Path(__file__).parent.parent.parent / "service" / "backend" / "prompts"
)


def _read_filesystem(category: str, name: str) -> str:
    path = _FILESYSTEM_FALLBACK / category / f"{name}.md"
    return path.read_text(encoding="utf-8")


def load_prompt(category: str, name: str = "published") -> str:
    """lens-cms-api GET /api/v2/prompts/{category}/{name}. 실패하면 파일시스템 폴백."""
    # 컨테이너에는 파일시스템 사본(service/backend/prompts)이 없어 폴백이 실패한다.
    # lens-cms-api 일시 장애(시간 초과·404)는 몇 초 뒤 복구되므로 폴백 전에 대기하며 재시도한다.
    last_err: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            req = urllib.request.Request(f"{_API_URL}/api/v2/prompts/{category}/{name}", method="GET")
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
                content = json.loads(res.read())["content"]
            print(f"[ddb_prompt] {category}/{name} (lens-cms-api)" + (f" — {attempt}번째 시도에 성공" if attempt > 1 else ""))
            return content
        except Exception as e:
            last_err = e
            print(f"[ddb_prompt] lens-cms-api 조회 실패 {attempt}/{_MAX_ATTEMPTS}({type(e).__name__}: {e})")
            if attempt < _MAX_ATTEMPTS:
                time.sleep(_RETRY_WAIT_SECONDS * attempt)
    print(f"[ddb_prompt] lens-cms-api {_MAX_ATTEMPTS}번 모두 실패({type(last_err).__name__}), 파일시스템 폴백")
    content = _read_filesystem(category, name)
    print(f"[ddb_prompt] {category}/{name} (파일시스템 폴백)")
    return content
