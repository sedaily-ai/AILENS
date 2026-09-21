"""프롬프트 실험 챗랩(admin PromptChatLab) — 대화 스레드/메시지 저장
(2026-09-15, 사용자 요청: "대화들.. 저장 가능한 세션들.. 좌측 사이드바에
놔두면 좋겠다.. 각 대화마다 어떤 대화를 했고 출력물이 나왔는지 체크해야
해서").

prompts_repo.py(발행 버전 스냅샷)·prompt_lab_repo.py(설명/지침/파일 편집
상태)와는 완전히 별개 저장소다 — 여기는 순수 대화 기록(사람이 무슨 말을
했고 어떤 결과물이 나왔는지)만 담는다. 한 (category, name) 프롬프트당
여러 스레드를 가질 수 있다(지금은 webtoon/published 하나만 이 화면에서
쓰지만 프롬프트별로 스레드를 나눠 둔다).

⚠️ 테이블 이름을 prompt_lab_threads/prompt_lab_thread_messages로 잡은 이유
— 처음엔 chat_threads/chat_messages로 마이그레이션을 시도했는데,
**이미 conversation_id/position/content 스키마의 별개 프로덕션
chat_messages 테이블이 존재했다**(실사용자 대상 챗봇 기능, service/backend/
services/chatbot_prompt_service.py 계열로 추정 — 이 저장소 코드베이스엔
없어 직접 만든 게 아님이 확실). CREATE TABLE IF NOT EXISTS라 데이터 충돌은
없었지만(트랜잭션 롤백으로 실제로 아무 것도 안 건드리고 끝남), 이름이
겹치면 다음 사람이 착각하기 쉬워 prompt_lab_* 접두어로 완전히 분리했다
(2026-09-15).

테이블은 1회성 마이그레이션으로 만들어져 있다 — prompt_lab_repo.py와 같은
이유로 이 코드는 DDL을 시도하지 않는다(앱 DB 역할은 스키마 CREATE 권한이
없고, 시도해도 매번 permission denied).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor
from psycopg2.extras import Json


def _thread_summary(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "title": r["title"],
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
    }


def create_thread(category: str, name: str, title: str = "") -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "INSERT INTO prompt_lab_threads (category, name, title) VALUES (%s,%s,%s) "
            "RETURNING id, title, created_at, updated_at",
            (category, name, title),
        )
        return _thread_summary(cur.fetchone())


def list_threads(category: str, name: str, limit: int = 50) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, title, created_at, updated_at FROM prompt_lab_threads "
            "WHERE category=%s AND name=%s ORDER BY updated_at DESC LIMIT %s",
            (category, name, limit),
        )
        return [_thread_summary(r) for r in cur.fetchall()]


def get_thread(thread_id: int, message_limit: int = 40) -> Optional[Dict[str, Any]]:
    """message_limit(2026-09-20 추가) — 이 대화의 가장 최근 메시지 N개만
    가져온다. 예전엔 LIMIT 없이 전체를 가져왔는데(2026-09-18 "날것으로
    모든 출력결과 다 출력해주세요" 결정으로 메시지 하나당 storyboard
    8컷 전체 JSON — camera/scene 문장까지 — 이 payload에 그대로 실림),
    오래 쓴 대화(사이드바에서 자주 재사용되는 스레드일수록 턴이 많음)를
    열 때 admin에서 실측 렉 신고("좌측 채팅 기록 버튼 클릭하면 반응도
    느리고") — list_threads()가 이미 쓰는 것과 같은 "무제한 대신 최근
    N개만" 패턴을 여기도 적용한다. id DESC로 최근 N개를 뽑은 뒤 화면
    표시 순서(오래된→최신)로 다시 뒤집는다. 오래된 메시지를 더 보고
    싶을 때의 페이지네이션 UI는 없음(지금은 범위 밖 — 필요해지면
    이 함수에 before_id 커서를 추가)."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, title, created_at, updated_at FROM prompt_lab_threads WHERE id=%s",
            (thread_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        cur.execute(
            "SELECT id, role, payload, created_at FROM prompt_lab_thread_messages "
            "WHERE thread_id=%s ORDER BY id DESC LIMIT %s",
            (thread_id, message_limit),
        )
        messages = [
            {
                # payload는 호출부가 자유롭게 채우는 dict라 어떤 키가 들어올지
                # 보장이 없다 — 실제 컬럼값(id/role/created_at)을 먼저 스프레드해
                # payload가 같은 이름의 키를 담고 있어도 절대 덮어쓰지 못하게 한다
                # (예전엔 순서가 반대라 그런 payload가 오면 조용히 덮어썼다).
                **(m["payload"] or {}),
                "id": m["id"],
                "role": m["role"],
                "created_at": m["created_at"].isoformat() if m.get("created_at") else None,
            }
            for m in reversed(cur.fetchall())
        ]
        return {**_thread_summary(row), "messages": messages}


def append_message(thread_id: int, role: str, payload: dict) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompt_lab_threads WHERE id=%s", (thread_id,))
        if not cur.fetchone():
            return None
        cur.execute(
            "INSERT INTO prompt_lab_thread_messages (thread_id, role, payload) VALUES (%s,%s,%s) "
            "RETURNING id, created_at",
            (thread_id, role, Json(payload)),
        )
        r = cur.fetchone()
        cur.execute("UPDATE prompt_lab_threads SET updated_at = now() WHERE id=%s", (thread_id,))
        return {"id": r["id"], "created_at": r["created_at"].isoformat()}


def update_thread_title(thread_id: int, title: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE prompt_lab_threads SET title=%s, updated_at=now() WHERE id=%s",
            (title, thread_id),
        )
        return cur.rowcount > 0


def delete_thread(thread_id: int) -> bool:
    with get_cursor() as cur:
        cur.execute("DELETE FROM prompt_lab_threads WHERE id=%s", (thread_id,))
        return cur.rowcount > 0
