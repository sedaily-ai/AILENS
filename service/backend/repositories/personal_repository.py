"""
Personal repository for user-specific data operations.

v1.24 — PostgreSQL(lens-cms-api 경유)로 전환. PersonalDBClient(DynamoDB
PK=user_id/SK=sk)는 더 이상 쓰지 않는다. 메서드 시그니처와 반환 타입
(ArchivedSentence/UserProfile/ReadingRecord 모델)은 호출부(archive_service.py/
user_service.py)가 무수정이도록 그대로 유지 — clients/personal_pg_client.py
가 실제 HTTP 호출을 담당한다.

temperature/title은 원본 DynamoDB에 있었지만 폐기 필드로 판단해 Postgres
schema에 컬럼을 안 만들었다(temperature는 이미 초기 마이그레이션 결정으로
제외됨, title은 이번 조사에서 실사용 0건 확인) — Model의 기본값(36.5, '')
으로 그대로 채워진다.
"""

import logging
from typing import Optional, Dict, Any, List

from clients.pg import personal as client
from models.personal import ArchivedSentence, UserProfile, ReadingRecord

logger = logging.getLogger(__name__)


class PersonalRepository:
    """Repository for user-specific personal data — PostgreSQL 기반(v1.24)."""

    # =========================================================================
    # Archived Sentences
    # =========================================================================

    async def save_archived_sentence(self, sentence: ArchivedSentence) -> bool:
        item = client.save_archived_sentence(
            sentence.user_id, sentence.text, article_no=sentence.article_id or None,
        )
        logger.info(f"Archived sentence saved: user={sentence.user_id} article={sentence.article_id}")
        # 서버가 새로 채번한 id/created_at을 호출자에게 반영(다음 delete가
        # 이 id를 써야 하므로) — 원본 dataclass는 불변 취급이 아니라 그냥
        # 속성을 덮어써도 안전하다(post_init에서 이미 한 번 계산된 값 재정의).
        sentence.id = item["id"]
        sentence.created_at = item["created_at"] or sentence.created_at
        return True

    async def delete_archived_sentence(self, user_id: str, article_id: str, timestamp: str) -> bool:
        """v1.24부터 archive_id(관계형 PK)로 지운다 — DynamoDB sk 조합
        (article_id+timestamp)은 더 이상 주소로 안 쓴다. 호출부가 여전히
        이 3개 인자를 넘기면 article_id 자리에 실제로는 archive_id가
        들어온다(services/archive_service.py 쪽도 이 변경에 맞춰 호출).
        """
        archive_id = article_id
        success = client.delete_archived_sentence(user_id, archive_id)
        if success:
            logger.info(f"Archived sentence deleted: user={user_id} id={archive_id}")
        return success

    async def list_archived_sentences(
        self, user_id: str, date_from: Optional[str] = None,
        date_to: Optional[str] = None, limit: int = 50,
    ) -> List[ArchivedSentence]:
        items = client.list_archived_sentences(user_id, date_from, date_to, limit)
        return [ArchivedSentence.from_item(_to_legacy_archive_item(i)) for i in items]

    async def list_popular_archived_sentences(
        self, limit: int = 20, sample_size: int = 800,
    ) -> List[Dict[str, Any]]:
        return client.list_popular_archived_sentences(limit=limit)

    # =========================================================================
    # User Profile
    # =========================================================================

    async def save_user_profile(self, profile: UserProfile) -> bool:
        client.get_or_create_user(
            profile.user_id, email=profile.email or None,
            name=profile.name or None, picture=profile.picture or None,
        )
        if profile.badges:
            client.update_user_profile(profile.user_id, {"badges": profile.badges})
        logger.info(f"User profile saved: {profile.user_id}")
        return True

    async def get_user_profile(self, user_id: str) -> Optional[UserProfile]:
        item = client.get_user_profile(user_id)
        if item:
            return UserProfile.from_item(_to_legacy_profile_item(item))
        return None

    async def update_user_profile(self, user_id: str, updates: Dict[str, Any]) -> Optional[UserProfile]:
        # user_service.py::get_or_create_user()가 기존 유저 로그인마다
        # {'last_login': today}만 보낸다 — Postgres 쪽엔 last_login 컬럼을
        # 직접 갱신하는 UPDATE 경로가 없고, get_or_create_user(신규 email/
        # name 없이 호출)가 기존 유저 분기에서 정확히 이 일(last_login_at=
        # now())을 하므로 그걸 재사용한다. 처음엔 이 키를 그냥 무시하도록
        # 짰다가, 실제로는 로그인 시각이 영원히 안 갱신되는 회귀였음을
        # 뒤늦게 발견해 수정.
        item = None
        if "last_login" in updates:
            item = client.get_or_create_user(user_id)
        field_updates = {k: v for k, v in updates.items() if k != "last_login"}
        if field_updates:
            item = client.update_user_profile(user_id, field_updates)
        if item is None:
            item = client.get_user_profile(user_id)
        if item:
            return UserProfile.from_item(_to_legacy_profile_item(item))
        return None

    # =========================================================================
    # Reading History
    # =========================================================================

    async def save_reading_record(self, record: ReadingRecord) -> bool:
        item = client.save_reading_record(record.user_id, article_no=record.article_id or None)
        record.read_count = item["read_count"]
        record.read_at = item["read_at"] or record.read_at
        logger.info(f"Reading record saved: user={record.user_id} article={record.article_id}")
        return True

    async def list_reading_history(self, user_id: str, limit: int = 50) -> List[ReadingRecord]:
        items = client.list_reading_history(user_id, limit)
        records = [ReadingRecord.from_item(_to_legacy_reading_item(i)) for i in items]
        records.sort(key=lambda r: r.read_at, reverse=True)
        return records


def _to_legacy_archive_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": item["id"],
        "user_id": item["user_id"],
        "text": item["text"],
        "article_id": item.get("article_no") or "",
        "article_title": item.get("article_title") or "",
        "article_published_at": item.get("article_published_at") or "",
        "created_at": item.get("created_at") or "",
    }


def _to_legacy_profile_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": item["user_id"],
        "email": item.get("email") or "",
        "name": item.get("name") or "",
        "picture": item.get("picture") or "",
        "badges": item.get("badges") or [],
        "created_at": item.get("created_at") or "",
        "last_login": item.get("last_login") or "",
    }


def _to_legacy_reading_item(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": item["user_id"],
        "article_id": item.get("article_no") or "",
        "article_title": item.get("article_title") or "",
        "read_at": item.get("read_at") or "",
        "read_count": item.get("read_count", 1),
    }


# Singleton
_personal_repository: Optional[PersonalRepository] = None


def get_personal_repository() -> PersonalRepository:
    """Get or create singleton PersonalRepository instance."""
    global _personal_repository
    if _personal_repository is None:
        _personal_repository = PersonalRepository()
    return _personal_repository
