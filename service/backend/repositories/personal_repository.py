"""
Personal repository for user-specific data operations.

Provides business-level methods on top of PersonalDBClient for:
  - Archived sentences (save, get, list, delete)
  - User profiles (save, get, update)
  - Reading history (save, list)

Follows the same patterns as SettingsRepository and LogRepository.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import timezone, timedelta

from clients.personal_db_client import PersonalDBClient
from models.personal import ArchivedSentence, UserProfile, ReadingRecord
from config.constants import AWS_REGION_DEFAULT

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


class PersonalRepository:
    """
    Repository for user-specific Personal DB operations.

    Uses PersonalDBClient (PK=user_id, SK=sk) for all storage.
    """

    def __init__(
        self,
        table_name: Optional[str] = None,
        region: str = AWS_REGION_DEFAULT,
    ):
        self._client = PersonalDBClient(
            table_name=table_name,
            region=region,
        )

    # =========================================================================
    # Archived Sentences
    # =========================================================================

    async def save_archived_sentence(self, sentence: ArchivedSentence) -> bool:
        """
        Save an archived sentence.

        Args:
            sentence: ArchivedSentence model

        Returns:
            True if saved successfully
        """
        item = sentence.to_item()
        success = await self._client.put_item(item)
        if success:
            logger.info(
                f"Archived sentence saved: user={sentence.user_id} "
                f"article={sentence.article_id}"
            )
        return success

    async def delete_archived_sentence(
        self,
        user_id: str,
        article_id: str,
        timestamp: str,
    ) -> bool:
        """
        Delete a specific archived sentence.

        Args:
            user_id: User ID
            article_id: Article ID
            timestamp: Creation timestamp (ISO format, used in SK)

        Returns:
            True if deleted
        """
        sk = f"ARCHIVE#{article_id}#{timestamp.replace(':', '-')}"
        success = await self._client.delete_item(user_id, sk)
        if success:
            logger.info(
                f"Archived sentence deleted: user={user_id} article={article_id}"
            )
        return success

    async def list_archived_sentences(
        self,
        user_id: str,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 50,
    ) -> List[ArchivedSentence]:
        """
        List archived sentences for a user, optionally filtered by date range.

        Args:
            user_id: User ID
            date_from: Start date filter (ISO format, inclusive)
            date_to: End date filter (ISO format, inclusive)
            limit: Maximum results

        Returns:
            List of ArchivedSentence, newest first
        """
        if date_from and date_to:
            sk_start = f"ARCHIVE#{date_from}"
            sk_end = f"ARCHIVE#{date_to}~"  # ~ sorts after all chars
            items = await self._client.query_by_user(
                user_id=user_id,
                sk_between=(sk_start, sk_end),
                limit=limit,
                scan_forward=False,
            )
        else:
            items = await self._client.query_by_user(
                user_id=user_id,
                sk_prefix='ARCHIVE#',
                limit=limit,
                scan_forward=False,
            )

        return [ArchivedSentence.from_item(item) for item in items]

    async def list_popular_archived_sentences(
        self,
        limit: int = 20,
        sample_size: int = 800,
    ) -> List[Dict[str, Any]]:
        """
        Aggregate the most-archived sentences across ALL users — "Popular
        Highlights" style (Kindle) social proof that needs zero authorship:
        it's built entirely from the save-a-sentence action every archive
        user already takes, not from anyone writing a post.

        Deliberately returns no user identity (no user_id/name/avatar) —
        this is meant to read as "여러 사람이 담았어요", not a per-user feed.

        Args:
            limit: Max distinct sentences to return
            sample_size: Max raw ARCHIVE# items to scan (bounded — see
                PersonalDBClient.scan_by_sk_prefix)

        Returns:
            List of {text, article_id, article_title, count}, sorted by
            count desc then most-recently-seen desc.
        """
        items = await self._client.scan_by_sk_prefix('ARCHIVE#', max_items=sample_size)

        # normalized text -> aggregate. Keep the first article_id/title seen
        # for a given text (they should always agree since text is quoted
        # verbatim from one article).
        agg: Dict[str, Dict[str, Any]] = {}
        for item in items:
            text = str(item.get('text', '')).strip()
            if not text:
                continue
            entry = agg.get(text)
            created_at = str(item.get('created_at', ''))
            if entry is None:
                agg[text] = {
                    'text': text,
                    'article_id': item.get('article_id', ''),
                    'article_title': item.get('article_title', ''),
                    'count': 1,
                    'latest_at': created_at,
                }
            else:
                entry['count'] += 1
                if created_at > entry['latest_at']:
                    entry['latest_at'] = created_at

        ranked = sorted(
            agg.values(),
            key=lambda e: (e['count'], e['latest_at']),
            reverse=True,
        )
        # 1회만 저장된 문장은 "여러 사람이 담았다"는 신호가 아니므로 최소
        # 2건부터만 노출 — 표본이 아직 작아 전부 1건뿐이면 빈 리스트가
        # 정직한 결과다(가짜로 채우지 않는다).
        popular = [e for e in ranked if e['count'] >= 2][:limit]
        return [
            {
                'text': e['text'],
                'article_id': e['article_id'],
                'article_title': e['article_title'],
                'count': e['count'],
            }
            for e in popular
        ]

    # =========================================================================
    # User Profile
    # =========================================================================

    async def save_user_profile(self, profile: UserProfile) -> bool:
        """
        Save or overwrite a user profile.

        Args:
            profile: UserProfile model

        Returns:
            True if saved
        """
        item = profile.to_item()
        success = await self._client.put_item(item)
        if success:
            logger.info(f"User profile saved: {profile.user_id}")
        return success

    async def get_user_profile(self, user_id: str) -> Optional[UserProfile]:
        """
        Get a user profile.

        Args:
            user_id: User ID

        Returns:
            UserProfile or None
        """
        item = await self._client.get_item(user_id, UserProfile.SK)
        if item:
            return UserProfile.from_item(item)
        return None

    async def update_user_profile(
        self,
        user_id: str,
        updates: Dict[str, Any],
    ) -> Optional[UserProfile]:
        """
        Partially update a user profile.

        Args:
            user_id: User ID
            updates: Fields to update (e.g., {'name': 'New Name', 'last_login': '...'})

        Returns:
            Updated UserProfile, or None on failure
        """
        updated = await self._client.update_item(
            user_id=user_id,
            sk=UserProfile.SK,
            updates=updates,
        )
        if updated:
            return UserProfile.from_item(updated)
        return None

    # =========================================================================
    # Reading History
    # =========================================================================

    async def save_reading_record(self, record: ReadingRecord) -> bool:
        """
        Save a reading record. If the user already read this article,
        increments read_count and updates read_at.

        Args:
            record: ReadingRecord model

        Returns:
            True if saved
        """
        existing = await self._client.get_item(record.user_id, record.sk)

        if existing:
            old_count = int(existing.get('read_count', 1))
            updated = await self._client.update_item(
                user_id=record.user_id,
                sk=record.sk,
                updates={
                    'read_count': old_count + 1,
                    'read_at': record.read_at,
                },
            )
            return updated is not None

        item = record.to_item()
        success = await self._client.put_item(item)
        if success:
            logger.info(
                f"Reading record saved: user={record.user_id} "
                f"article={record.article_id}"
            )
        return success

    async def list_reading_history(
        self,
        user_id: str,
        limit: int = 50,
    ) -> List[ReadingRecord]:
        """
        List reading history for a user, newest first.

        Args:
            user_id: User ID
            limit: Maximum results

        Returns:
            List of ReadingRecord
        """
        items = await self._client.query_by_user(
            user_id=user_id,
            sk_prefix='READING#',
            limit=limit,
            scan_forward=False,
        )
        records = [ReadingRecord.from_item(item) for item in items]
        records.sort(key=lambda r: r.read_at, reverse=True)
        return records


# Singleton
_personal_repository: Optional[PersonalRepository] = None


def get_personal_repository() -> PersonalRepository:
    """Get or create singleton PersonalRepository instance."""
    global _personal_repository
    if _personal_repository is None:
        _personal_repository = PersonalRepository()
    return _personal_repository
