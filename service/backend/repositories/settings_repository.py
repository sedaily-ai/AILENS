"""
Settings repository for DynamoDB operations.
Handles settings, prompts, and configuration storage.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta

from repositories.base import BaseDynamoDBRepository
from config import settings, NAVER_TV_URL_DEFAULT

logger = logging.getLogger(__name__)


class SettingsRepository(BaseDynamoDBRepository):
    """
    Repository for settings and configuration operations.

    Handles:
    - Global settings (Naver TV URL, effective date, etc.)
    - Translation prompts
    - Category prompts
    """

    # Settings item keys
    SETTINGS_KEY = 'settings_config'
    PROMPT_PREFIX = 'prompt_'

    def __init__(self, table_name: Optional[str] = None, region: Optional[str] = None):
        super().__init__(
            table_name=table_name or settings.dynamodb_table_articles,
            region=region
        )

    async def get_settings(self) -> Dict[str, Any]:
        """
        Get global settings.

        Returns:
            Settings dict or empty dict if not found
        """
        try:
            item = await self.get_item({'news_id': self.SETTINGS_KEY})
            return item or {}
        except Exception as e:
            logger.error(f"Failed to get settings: {e}")
            return {}

    async def save_settings(self, settings_data: Dict[str, Any]) -> bool:
        """
        Save global settings.

        Args:
            settings_data: Settings to save

        Returns:
            True if successful
        """
        try:
            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)

            item = {
                'news_id': self.SETTINGS_KEY,
                'item_type': 'settings',
                'updated_at': now_kst.isoformat(),
                **settings_data
            }

            return await self.put_item(item)

        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return False

    async def get_naver_tv_url(self, published_at: str) -> str:
        """
        Get Naver TV URL based on publication date.

        If article is published on or after the effective date,
        uses the configured URL. Otherwise, falls back to default.

        Args:
            published_at: Article publication date (ISO format)

        Returns:
            Naver TV URL string
        """
        try:
            settings_data = await self.get_settings()

            if settings_data:
                effective_date = settings_data.get('effective_date', '')
                naver_tv_url = settings_data.get('naver_tv_url', '')

                if naver_tv_url and effective_date and published_at >= effective_date:
                    return naver_tv_url

            return NAVER_TV_URL_DEFAULT

        except Exception as e:
            logger.warning(f"Failed to get Naver TV URL from settings: {e}")
            return NAVER_TV_URL_DEFAULT

    async def get_prompt(self, prompt_type: str) -> Optional[Dict[str, Any]]:
        """
        Get a translation prompt by type.

        Args:
            prompt_type: Type of prompt (e.g., 'default', 'economy', 'technology')

        Returns:
            Prompt dict or None if not found
        """
        try:
            prompt_id = f"{self.PROMPT_PREFIX}{prompt_type}"
            return await self.get_item({'news_id': prompt_id})
        except Exception as e:
            logger.error(f"Failed to get prompt '{prompt_type}': {e}")
            return None

    async def save_prompt(self, prompt_type: str, prompt_data: Dict[str, Any]) -> bool:
        """
        Save a translation prompt.

        Args:
            prompt_type: Type of prompt
            prompt_data: Prompt data including content, description, etc.

        Returns:
            True if successful
        """
        try:
            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)

            prompt_id = f"{self.PROMPT_PREFIX}{prompt_type}"

            item = {
                'news_id': prompt_id,
                'item_type': 'prompt',
                'prompt_type': prompt_type,
                'updated_at': now_kst.isoformat(),
                **prompt_data
            }

            return await self.put_item(item)

        except Exception as e:
            logger.error(f"Failed to save prompt '{prompt_type}': {e}")
            return False

    async def list_prompts(self) -> List[Dict[str, Any]]:
        """
        List all translation prompts.

        Returns:
            List of prompt dicts
        """
        try:
            from boto3.dynamodb.conditions import Attr

            result = await self.scan(
                filter_expression=Attr('item_type').eq('prompt')
            )

            return result.get('items', [])

        except Exception as e:
            logger.error(f"Failed to list prompts: {e}")
            return []

    async def delete_prompt(self, prompt_type: str) -> bool:
        """
        Delete a translation prompt.

        Args:
            prompt_type: Type of prompt to delete

        Returns:
            True if successful
        """
        try:
            prompt_id = f"{self.PROMPT_PREFIX}{prompt_type}"
            return await self.delete_item({'news_id': prompt_id})
        except Exception as e:
            logger.error(f"Failed to delete prompt '{prompt_type}': {e}")
            return False

    async def get_category_prompt(self, category: str) -> Optional[str]:
        """
        Get translation prompt for a specific category.

        First tries to find a category-specific prompt,
        then falls back to default prompt.

        Args:
            category: Article category

        Returns:
            Prompt content string or None
        """
        # Try category-specific prompt
        prompt = await self.get_prompt(category.lower())
        if prompt and prompt.get('content'):
            return prompt['content']

        # Fall back to default prompt
        default_prompt = await self.get_prompt('default')
        if default_prompt and default_prompt.get('content'):
            return default_prompt['content']

        return None


# Singleton instance
_settings_repository: Optional[SettingsRepository] = None


def get_settings_repository() -> SettingsRepository:
    """Get or create singleton SettingsRepository instance."""
    global _settings_repository
    if _settings_repository is None:
        _settings_repository = SettingsRepository()
    return _settings_repository
