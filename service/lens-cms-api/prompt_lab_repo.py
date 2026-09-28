"""프롬프트 실험 챗랩(admin PromptChatLab) 전용 — 설명·지침·파일을 각각
독립적으로 저장한다(2026-09-15, 사용자 요청: "설명 입력하고 저장하면
설명만.. 지침 수정하고 저장하면 지침만.. 파일도 마찬가지" — Claude
프로젝트의 지침/컨텍스트 파일처럼 서로 침범하지 않는 개별 CRUD).

prompts_repo.py(버전 스냅샷 하나에 설명+지침+파일을 합친 문자열 하나만
담는, pipelines/*가 그대로 읽는 프로덕션 프롬프트)와는 별개의 저장
계층이다 — 이 모듈은 실험 단계의 편집 상태만 담고, 절대 손대지 않는다.
"발행"은 admin/backend가 이 모듈에서 읽은 설명+지침+파일을 조립해
prompts_repo.update_prompt()를 부르는 별도 단계다(routes 쪽에서 처리).

테이블(prompt_lab_docs, prompt_lab_files)은 이 코드가 아니라 1회성
마이그레이션으로 이미 만들어져 있다(2026-09-15, RDS 마스터 계정으로
직접 실행 — docs/worklog 참고). 앱이 붙는 DB 역할(lens_service_app)은
최소권한이라 스키마에 CREATE 권한이 없고, `CREATE TABLE IF NOT EXISTS`는
테이블이 이미 있어도 스키마 CREATE 권한 자체를 먼저 검사하기 때문에
"멱등하게 스스로 만들기"를 런타임에서 시도하면 항상 permission denied가
난다 — 처음에 이 방식으로 잘못 만들었다가 실제로 겪은 버그. 그래서
DDL은 앱 코드에 절대 넣지 않는다(prompts/prompt_versions 등 다른
테이블들과 동일한 원칙).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor


def _get_or_create_prompt_id(cur, category: str, name: str) -> int:
    """2026-09-25 — 원래 SELECT 후 없으면 INSERT하는 2단계였는데, 동시
    요청 둘이 동시에 "없음"을 보고 둘 다 INSERT를 시도하면 `prompts`의
    (category, name) 복합 UNIQUE 제약(`prompts_category_name_key`, 실측
    확인)에 걸려 뒤에 도착한 쪽이 psycopg2.errors.UniqueViolation으로
    500이 나는 경쟁 상태가 있었다(코드 감사로 발견, 실제 재현 트래픽은
    아직 없었음). INSERT ... ON CONFLICT DO NOTHING 후 SELECT로
    원자적으로 만든다 — 경쟁이 나도 있는 쪽 id를 그대로 반환."""
    cur.execute(
        "INSERT INTO prompts (name, category) VALUES (%s,%s) "
        "ON CONFLICT (category, name) DO NOTHING",
        (name, category),
    )
    cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
    return cur.fetchone()["id"]


def _file_meta(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "name": r["name"],
        "size": r["size"],
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
    }


def get_doc(category: str, name: str) -> Dict[str, Any]:
    """설명·지침·파일 목록(내용 제외, 메타만) — 패널이 열릴 때 한 번에 불러온다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return {"description": "", "instructions": "", "files": []}
        prompt_id = row["id"]

        cur.execute(
            "SELECT description, instructions FROM prompt_lab_docs WHERE prompt_id=%s",
            (prompt_id,),
        )
        doc = cur.fetchone()

        cur.execute(
            "SELECT id, name, length(content) AS size, updated_at FROM prompt_lab_files "
            "WHERE prompt_id=%s ORDER BY created_at",
            (prompt_id,),
        )
        files: List[Dict[str, Any]] = [_file_meta(r) for r in cur.fetchall()]

        return {
            "description": (doc or {}).get("description") or "",
            "instructions": (doc or {}).get("instructions") or "",
            "files": files,
        }


def update_description(category: str, name: str, text: str) -> Dict[str, Any]:
    with get_cursor() as cur:
        prompt_id = _get_or_create_prompt_id(cur, category, name)
        cur.execute(
            """
            INSERT INTO prompt_lab_docs (prompt_id, description, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (prompt_id) DO UPDATE
                SET description = EXCLUDED.description, updated_at = now()
            """,
            (prompt_id, text),
        )
    return {"updated": True}


def update_instructions(category: str, name: str, text: str) -> Dict[str, Any]:
    with get_cursor() as cur:
        prompt_id = _get_or_create_prompt_id(cur, category, name)
        cur.execute(
            """
            INSERT INTO prompt_lab_docs (prompt_id, instructions, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (prompt_id) DO UPDATE
                SET instructions = EXCLUDED.instructions, updated_at = now()
            """,
            (prompt_id, text),
        )
    return {"updated": True}


def create_file(category: str, name: str, file_name: str, content: str) -> Dict[str, Any]:
    with get_cursor() as cur:
        prompt_id = _get_or_create_prompt_id(cur, category, name)
        cur.execute(
            "INSERT INTO prompt_lab_files (prompt_id, name, content) VALUES (%s,%s,%s) "
            "RETURNING id, name, length(content) AS size, updated_at",
            (prompt_id, file_name, content),
        )
        return _file_meta(cur.fetchone())


def get_file_content(file_id: int) -> Optional[Dict[str, Any]]:
    """단일 파일 본문 포함 조회 — 패널에서 펼쳐볼 때만 호출."""
    with get_cursor() as cur:
        cur.execute("SELECT id, name, content FROM prompt_lab_files WHERE id=%s", (file_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def update_file(file_id: int, file_name: Optional[str] = None, content: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if file_name is None and content is None:
        return None
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompt_lab_files WHERE id=%s", (file_id,))
        if not cur.fetchone():
            return None
        sets = ["updated_at = now()"]
        vals: list = []
        if file_name is not None:
            sets.append("name = %s")
            vals.append(file_name)
        if content is not None:
            sets.append("content = %s")
            vals.append(content)
        vals.append(file_id)
        cur.execute(
            f"UPDATE prompt_lab_files SET {', '.join(sets)} WHERE id=%s "
            "RETURNING id, name, length(content) AS size, updated_at",
            vals,
        )
        return _file_meta(cur.fetchone())


def delete_file(file_id: int) -> bool:
    with get_cursor() as cur:
        cur.execute("DELETE FROM prompt_lab_files WHERE id=%s", (file_id,))
        return cur.rowcount > 0
