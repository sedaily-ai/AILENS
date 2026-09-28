"""admin 프롬프트(관리자가 편집하는 AI 프롬프트) — PostgreSQL (v1.27).

DynamoDB 원본 계약:
  pk = 'PROMPT#<category>/<name>'
  sk = 'LATEST'  → {active_version, updated_at}
     | 'v#<int>' → {content, created_at, actor, sections_json?}

Postgres에선 LATEST 포인터 대신 prompt_versions.is_active + 유일 부분
인덱스(prompt_id당 활성 버전 하나)로 표현 — 버전 번호가 진짜 정수라
버전이 10개 넘어도 사전식 정렬 버그(admin/backend/routes/prompts.py의
_load_version_history 워크어라운드)가 원천적으로 없다.

editor 식별자는 실제로 존재한 적이 없다(단일 공유 관리자 계정) —
prompt_versions.created_by는 항상 NULL로 남긴다, 응답의 "actor"는
DynamoDB 쪽처럼 항상 "admin" 리터럴.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor
from psycopg2.extras import Json


def get_active_content(category: str, name: str) -> Optional[str]:
    """prompt_loader.py/pipelines/common/ddb_prompt.py 전용 — content만."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT pv.content FROM prompts p
            JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.is_active
            WHERE p.category = %s AND p.name = %s
            """,
            (category, name),
        )
        row = cur.fetchone()
        return row["content"] if row else None


def list_prompts() -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.category, p.name, pv.version AS active_version, pv.created_at AS updated_at
            FROM prompts p
            LEFT JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.is_active
            ORDER BY p.category, p.name
            """
        )
        return [
            {
                "id": f"{r['category']}/{r['name']}",
                "active_version": r["active_version"] or 0,
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
            }
            for r in cur.fetchall()
        ]


def get_prompt(category: str, name: str, history_limit: int = 10) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        prompt_id = row["id"]

        cur.execute(
            "SELECT version, content, sections FROM prompt_versions WHERE prompt_id=%s AND is_active",
            (prompt_id,),
        )
        active = cur.fetchone()

        cur.execute(
            "SELECT version, created_at FROM prompt_versions WHERE prompt_id=%s "
            "ORDER BY version DESC LIMIT %s",
            (prompt_id, history_limit),
        )
        history = [
            {
                "version": r["version"],
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "actor": "admin",
            }
            for r in cur.fetchall()
        ]

        return {
            "id": f"{category}/{name}",
            "active_content": active["content"] if active else "",
            "active_version": active["version"] if active else 0,
            "sections": (active or {}).get("sections"),
            "history": history,
        }


def get_prompt_history(category: str, name: str, history_limit: int = 20) -> List[Dict[str, Any]]:
    """버전 번호·시각만 — content(웹툰 카테고리 기준 10만자 이상)는 안 준다.
    get_prompt()가 이미 같은 쿼리를 하지만 active_content까지 같이 읽어오는
    무거운 함수라(2026-09-20 "프롬프트 실험 페이지 로딩이 느리다" 신고로
    listPrompts() 경량화를 한 번 했던 전례, admin/backend/routes/prompts.py
    참고) 버전 드롭다운 채우기 용도로는 이 가벼운 쪽을 쓴다(2026-09-21).

    2026-09-26 — label도 같이 준다(사용자 요청: "버전 저장... 사용자가
    직접 버전 네이밍을 입력하고 저장할 수 있도록 하는게 자유도가 높지
    않을까"). 번호 새 컬럼을 추가하는 대신(이 DB 역할엔 ALTER TABLE 권한이
    없어 마스터 계정으로 수동 마이그레이션이 필요했을 것) 이미 있는
    sections JSONB 안에 "label" 키로 얹는다 — 프롬프트 실험 챗랩이 발행한
    버전만 sections를 채우므로(main.py::internal_publish_prompt_lab,
    2026-09-26부터) 그 이전 버전은 label이 자연히 null이다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return []
        cur.execute(
            "SELECT version, created_at, sections->>'label' AS label FROM prompt_versions WHERE prompt_id=%s "
            "ORDER BY version DESC LIMIT %s",
            (row["id"], history_limit),
        )
        return [
            {
                "version": r["version"],
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "actor": "admin",
                "label": r.get("label"),
            }
            for r in cur.fetchall()
        ]


def get_prompt_version(category: str, name: str, version: int) -> Optional[Dict[str, Any]]:
    """특정 과거 버전의 content 하나만 — 버전 드롭다운으로 골라 "지금
    초안/발행본을 건드리지 않고" 테스트 실행하는 용도(2026-09-21, 사용자
    요청 — "버전을 드롭다운 해서... 그걸로 적용해서 출력... AB 테스트
    느낌"). get_prompt()의 history는 버전 번호·시각만 주고 content는 안
    주므로 별도로 뺐다.

    2026-09-26 — sections도 같이 반환한다(사용자 지적: "생성 프롬프트"가
    프로덕션 패널(설명/지침/파일 분리)과 테스트 카드(버전 숫자 하나뿐)에서
    서로 다른 구조로 보여 헷갈린다 — "일관되게, 프로덕션이랑 동일한
    구조로"). 프롬프트 실험 챗랩(webtoon/letters/podcast/video)이 발행할
    때부터 sections에 {description, instructions, files}를 채워 넣는다
    (main.py::internal_publish_prompt_lab) — 그 이전에 발행된 옛 버전은
    sections가 null이라 프론트가 content로 폴백한다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        cur.execute(
            "SELECT version, content, sections, created_at FROM prompt_versions WHERE prompt_id=%s AND version=%s",
            (row["id"], version),
        )
        v = cur.fetchone()
        if not v:
            return None
        return {
            "version": v["version"],
            "content": v["content"],
            "sections": v.get("sections"),
            "created_at": v["created_at"].isoformat() if v.get("created_at") else None,
        }


def update_prompt(category: str, name: str, content: str,
                   sections: Optional[dict] = None, activate: bool = True) -> Dict[str, Any]:
    """새 버전 삽입(+ activate=True면 이전 활성 버전 비활성화까지)를 한
    트랜잭션으로 — DynamoDB 쪽의 non-atomic 2-write(v#N put + LATEST update)를
    Postgres 트랜잭션으로 개선. prompts 행이 없으면(신규 프롬프트) 함께
    만든다(created=True).

    2026-09-26 — activate 파라미터 추가 + 채번을 "활성 버전+1"에서 "지금까지
    나온 최대 버전+1"로 바꿨다(사용자 요청 — 테스트 카드에서 "버전 저장"을
    눌러도 프로덕션 활성값은 안 바뀌고, 별도로 "프로덕션에 적용"을 눌러야
    실제 반영되는 구조: "버전 저장을 하면 버전만 저장하는거지, 프로덕션
    으로 적용하는건.. 다른 버튼을 눌러야"). activate=False로 비활성 버전을
    하나 끼워 넣으면, 그다음 저장(활성이든 비활성이든)이 여전히 "활성
    버전+1"로 채번했다면 이미 쓰인 그 비활성 버전 번호와 충돌한다(unique
    (prompt_id, version)) — MAX(version)+1로 바꿔 항상 가장 큰 번호 다음을
    쓰도록 고쳤다. 활성 승격은 activate_version()이 별도로 맡는다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        created = row is None

        if created:
            cur.execute(
                "INSERT INTO prompts (name, category) VALUES (%s,%s) RETURNING id",
                (name, category),
            )
            prompt_id = cur.fetchone()["id"]
            prev_version = 0
        else:
            prompt_id = row["id"]
            cur.execute(
                "SELECT COALESCE(MAX(version), 0) AS max_version FROM prompt_versions WHERE prompt_id=%s",
                (prompt_id,),
            )
            prev_version = cur.fetchone()["max_version"]
            if activate:
                cur.execute(
                    "UPDATE prompt_versions SET is_active=false WHERE prompt_id=%s AND is_active",
                    (prompt_id,),
                )

        new_version = prev_version + 1
        cur.execute(
            """
            INSERT INTO prompt_versions (prompt_id, version, content, sections, is_active)
            VALUES (%s,%s,%s,%s,%s)
            """,
            (prompt_id, new_version, content, Json(sections) if sections is not None else None, activate),
        )

        return {"created": created, "new_version": new_version, "prev_version": prev_version}


def activate_version(category: str, name: str, version: int) -> Optional[Dict[str, Any]]:
    """이미 있는 버전(테스트 카드가 activate=False로 저장해둔 것 포함)을
    프로덕션 활성값으로 승격한다 — 새 버전을 만들지 않고 is_active만
    옮긴다. 2026-09-26 신설 — "버전 드롭다운에서 특정 버전 선택하고
    적용 버튼 누르면 적용되는 구조"(사용자 요청)의 "적용" 쪽 절반.
    대상 버전이 없으면 None(라우트가 404로 변환)."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        prompt_id = row["id"]
        cur.execute(
            "SELECT version FROM prompt_versions WHERE prompt_id=%s AND version=%s",
            (prompt_id, version),
        )
        if not cur.fetchone():
            return None
        cur.execute(
            "UPDATE prompt_versions SET is_active=false WHERE prompt_id=%s AND is_active",
            (prompt_id,),
        )
        cur.execute(
            "UPDATE prompt_versions SET is_active=true WHERE prompt_id=%s AND version=%s",
            (prompt_id, version),
        )
        return {"activated": True, "version": version}


def delete_version(category: str, name: str, version: int) -> Optional[Dict[str, Any]]:
    """버전 하나를 완전히 삭제한다 — 2026-09-26 신설, 사용자 요청: "버전을
    삭제하는 방법도 있어야 할 것 같고" (실험하다 버린 초안 버전들이 쌓이는
    걸 정리할 수 있게). 지금 활성(프로덕션)인 버전은 삭제를 거부한다 —
    그러면 실제 서비스가 읽는 콘텐츠 자체가 사라진다(get_active_content가
    빈 결과를 주게 됨). 대상이 아예 없으면 None, 활성이라 거부하면
    {"deleted": False}, 성공하면 {"deleted": True} — 라우트가 각각
    404/400/200으로 변환한다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        prompt_id = row["id"]
        cur.execute(
            "SELECT is_active FROM prompt_versions WHERE prompt_id=%s AND version=%s",
            (prompt_id, version),
        )
        v = cur.fetchone()
        if not v:
            return None
        if v["is_active"]:
            return {"deleted": False}
        cur.execute(
            "DELETE FROM prompt_versions WHERE prompt_id=%s AND version=%s",
            (prompt_id, version),
        )
        return {"deleted": True}


def rename_version(category: str, name: str, version: int, label: str) -> Optional[Dict[str, Any]]:
    """버전 번호·content는 그대로 두고 sections 안 label만 바꾼다 —
    2026-09-26 신설, 사용자 지적: "버전이름도 수정가능하게 해야합니다".
    "버전 저장"(update_prompt)은 항상 새 버전(번호 증가)을 만드는 동작이라
    이미 저장된 버전의 이름만 고치는 덴 안 맞는다(새 번호가 매겨져 버림) —
    이 함수는 번호는 그대로 두고 sections JSONB의 label 키만 갈아끼운다.
    label이 빈 문자열이면 라벨을 지운다(키 삭제, "이름 없음" 상태로 되돌림).
    sections가 원래 null이던 버전(이 프롬프트 랩 이전에 발행된 옛 버전)도
    빈 객체에서 시작해 label만 얹을 수 있게 COALESCE로 방어한다."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        prompt_id = row["id"]
        cur.execute(
            "SELECT version FROM prompt_versions WHERE prompt_id=%s AND version=%s",
            (prompt_id, version),
        )
        if not cur.fetchone():
            return None
        trimmed = label.strip()
        if trimmed:
            cur.execute(
                "UPDATE prompt_versions SET sections = COALESCE(sections, '{}'::jsonb) "
                "|| jsonb_build_object('label', %s::text) WHERE prompt_id=%s AND version=%s",
                (trimmed, prompt_id, version),
            )
        else:
            cur.execute(
                "UPDATE prompt_versions SET sections = COALESCE(sections, '{}'::jsonb) - 'label' "
                "WHERE prompt_id=%s AND version=%s",
                (prompt_id, version),
            )
        return {"renamed": True, "version": version, "label": trimmed or None}
