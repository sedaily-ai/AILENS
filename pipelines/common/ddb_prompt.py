"""admin 프롬프트(PostgreSQL, lens-cms-api 경유)에서 4포맷(letters/webtoon/
podcast/video) 프롬프트를 읽어온다 — `pipelines/` 아래 모든 파이프라인이
공용으로 쓰는 모듈.

`service/backend/services/prompt_loader.py`와 같은 백엔드·같은 fallback
순서를 쓴다(그 파일의 docstring 참고) — 다만 이건 배포된 Lambda가 아니라
한 번 실행하고 끝나는 로컬 배치 스크립트라 5분 TTL 캐시는 의미가 없다.
run_article() 한 번 호출 동안 딱 한 번만 fetch하고 그 값을 계속 쓴다.

2026-09-09(v1.27): DynamoDB(pk='PROMPT#<category>/<name>', sk='LATEST'|
'v#<int>')에서 전환. 공개 무인증 엔드포인트(GET /api/v2/prompts/{category}/
{name})라 AWS 자격 증명이 아예 필요 없어졌다.

admin 화면(`/lens` → 프롬프트 드로어 → 각 포맷 탭)에서 저장한 내용이
여기로 그대로 들어온다 — 이 파일이 lens-cms-api를 못 읽으면(네트워크
장애 등) `../../service/backend/prompts/<category>/published.md`
(admin이 저장할 때마다 같이 갱신하는 파일시스템 사본)로 떨어진다. 두
경로 다 실패하면 명확한 에러를 낸다 — 예전처럼 각 파이프라인 안에 낡은
프롬프트 사본을 하드코딩해두고 그게 조용히 쓰이는 상황(2026-08-20에
webtoon-pipeline에서 실제로 발견된 문제 — admin에서 프롬프트를 고쳐도
결과물엔 반영이 안 되고 있었다)을 막기 위함. 원래 webtoon 전용
모듈이었다가, letters/podcast 파이프라인이 생기며 공용으로 옮겼다
(2026-08-20).
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
    # 재시도(2026-10-02) — 2026-10-01 12:00 KST 실행에서 lens-cms-api가 일시적으로 시간 초과·404를 내자 곧바로 파일시스템 폴백으로
    # 떨어졌는데, 컨테이너엔 그 파일이 없어(service/backend/prompts) 웹툰·영상 프롬프트 로드가 통째로 실패했다. 일시 장애는 몇 초 뒤
    # 되살아나므로 폴백 전에 짧은 대기와 함께 최대 3번 시도한다.
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
