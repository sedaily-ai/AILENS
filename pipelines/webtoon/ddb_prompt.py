"""admin 프롬프트 DDB에서 webtoon 프롬프트를 읽어온다.

`service/backend/services/prompt_loader.py`와 같은 스키마·같은 fallback
순서를 쓴다(그 파일의 docstring 참고) — 다만 이건 배포된 Lambda가 아니라
한 번 실행하고 끝나는 로컬 배치 스크립트라 5분 TTL 캐시는 의미가 없다.
run_article() 한 번 호출 동안 딱 한 번만 fetch하고 그 값을 계속 쓴다.

DDB 스키마:
    pk = 'PROMPT#<category>/<name>'
    sk = 'LATEST'  → {active_version}
    sk = 'v#<int>' → {content}

admin 화면(`/lens` → 프롬프트 드로어 → 웹툰 탭)에서 저장한 내용이 여기로
그대로 들어온다 — 이 파일이 DDB를 못 읽으면(자격 증명 없음, 오프라인 등)
`../service/backend/prompts/webtoon/published.md`(admin이 저장할 때마다
같이 갱신하는 파일시스템 사본)로 떨어진다. 두 경로 다 실패하면 명확한
에러를 낸다 — 예전처럼 이 파일 안에 낡은 프롬프트 사본을 하드코딩해두고
그게 조용히 쓰이는 상황(2026-08-20에 실제로 발견된 문제 — admin에서
프롬프트를 고쳐도 이 파이프라인의 결과물엔 반영이 안 되고 있었다)을
막기 위함.
"""
import os
from pathlib import Path

import boto3

_TABLE_NAME = os.environ.get("ADMIN_PROMPTS_TABLE", "sedaily-mbti-admin-prompts-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_AWS_PROFILE = os.environ.get("AWS_PROFILE")  # 로컬 실행용, Lambda에선 안 씀

_FILESYSTEM_FALLBACK = (
    Path(__file__).parent.parent.parent / "service" / "backend" / "prompts"
)

_table = None


def _get_table():
    global _table
    if _table is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        _table = session.resource("dynamodb", region_name=_REGION).Table(_TABLE_NAME)
    return _table


def _read_filesystem(category: str, name: str) -> str:
    path = _FILESYSTEM_FALLBACK / category / f"{name}.md"
    return path.read_text(encoding="utf-8")


def load_prompt(category: str, name: str = "published") -> str:
    """DDB LATEST → active_version → v#N → content. 실패하면 파일시스템 폴백."""
    try:
        table = _get_table()
        pk = f"PROMPT#{category}/{name}"
        latest = table.get_item(Key={"pk": pk, "sk": "LATEST"}).get("Item")
        if latest is None:
            raise KeyError(f"{pk} LATEST not found")
        active_version = int(latest["active_version"])
        version_item = table.get_item(Key={"pk": pk, "sk": f"v#{active_version}"}).get("Item")
        if version_item is None:
            raise KeyError(f"{pk} v#{active_version} not found")
        print(f"[ddb_prompt] {category}/{name} v#{active_version} (DDB)")
        return version_item["content"]
    except Exception as e:
        print(f"[ddb_prompt] DDB 조회 실패({type(e).__name__}: {e}), 파일시스템 폴백")
        content = _read_filesystem(category, name)
        print(f"[ddb_prompt] {category}/{name} (파일시스템 폴백)")
        return content
