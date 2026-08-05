"""
Prompt service - Business logic for translation prompt management.
Handles prompt CRUD, versioning, and testing.
"""

import logging
import os
from typing import Optional, Dict, Any, List
from datetime import datetime

import boto3

from config import settings, DYNAMODB_TABLE_ARTICLES_DEV, AWS_REGION_DEFAULT
from core.exceptions import ValidationError, ExternalServiceError

logger = logging.getLogger(__name__)


class PromptService:
    """
    Service for translation prompt business logic.

    Handles:
    - Prompt retrieval and updates
    - Prompt version history
    - Prompt testing with Claude API
    """

    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION_DEFAULT)
        self.table = self.dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)
        self._default_prompt_cache = None

    def _load_default_prompt(self) -> str:
        """Load default translation prompt from file."""
        if self._default_prompt_cache is not None:
            return self._default_prompt_cache

        try:
            # Look in multiple possible locations
            possible_paths = [
                os.path.join(os.path.dirname(os.path.dirname(__file__)), "TRANSLATION_PROMPT.md"),
                os.path.join(os.path.dirname(__file__), "..", "TRANSLATION_PROMPT.md"),
                "/var/task/TRANSLATION_PROMPT.md",  # Lambda
            ]

            for prompt_path in possible_paths:
                if os.path.exists(prompt_path):
                    with open(prompt_path, 'r', encoding='utf-8') as f:
                        self._default_prompt_cache = f.read()
                        return self._default_prompt_cache

            logger.warning("Default prompt file not found in any location")
            return ""

        except Exception as e:
            logger.error(f"Failed to load default prompt: {e}")
            return ""

    async def get_prompt(self) -> Dict[str, Any]:
        """
        Get current translation prompt and history.

        Returns:
            Dict with current_prompt, updated_at, history, default_prompt
        """
        try:
            response = self.table.get_item(Key={'news_id': 'settings_config'})
            settings_data = response.get('Item', {})

            current_prompt = settings_data.get('translation_prompt')
            default_prompt = self._load_default_prompt()

            if not current_prompt:
                current_prompt = default_prompt

            history = settings_data.get('prompt_history', [])

            return {
                'current_prompt': current_prompt,
                'updated_at': settings_data.get('translation_prompt_updated_at'),
                'history': history,
                'default_prompt': default_prompt
            }

        except Exception as e:
            logger.error(f"Get prompt error: {e}", exc_info=True)
            raise

    async def save_prompt(self, new_prompt: str) -> Dict[str, Any]:
        """
        Save translation prompt with version history.

        Args:
            new_prompt: New prompt content

        Returns:
            Dict with success, message, updated_at, history_count
        """
        if not new_prompt or not new_prompt.strip():
            raise ValidationError("Prompt content is required")

        new_prompt = new_prompt.strip()

        try:
            # Get current settings
            response = self.table.get_item(Key={'news_id': 'settings_config'})
            settings_data = response.get('Item', {})

            current_prompt = settings_data.get('translation_prompt')
            history = settings_data.get('prompt_history', [])
            current_updated_at = settings_data.get('translation_prompt_updated_at')

            # If there's an existing prompt, add it to history
            if current_prompt and current_prompt != new_prompt:
                history_entry = {
                    'version': len(history) + 1,
                    'content': current_prompt,
                    'updated_at': current_updated_at or datetime.now().isoformat(),
                }
                history.insert(0, history_entry)

                # Keep only last 5 versions
                history = history[:5]

            # Update settings
            now = datetime.now().isoformat()

            self.table.update_item(
                Key={'news_id': 'settings_config'},
                UpdateExpression="SET translation_prompt = :prompt, translation_prompt_updated_at = :updated_at, prompt_history = :history, updated_at = :now",
                ExpressionAttributeValues={
                    ':prompt': new_prompt,
                    ':updated_at': now,
                    ':history': history,
                    ':now': now
                }
            )

            return {
                'success': True,
                'message': 'Prompt saved successfully',
                'updated_at': now,
                'history_count': len(history)
            }

        except Exception as e:
            logger.error(f"Save prompt error: {e}", exc_info=True)
            raise

    async def test_prompt(
        self,
        prompt: str,
        sample_text: str
    ) -> Dict[str, Any]:
        """
        Test translation with a sample text using the provided prompt.

        Args:
            prompt: Translation prompt to test
            sample_text: Korean text to translate

        Returns:
            Dict with success, input, output, prompt_length
        """
        if not prompt or not prompt.strip():
            raise ValidationError("Prompt is required")

        if not sample_text or not sample_text.strip():
            raise ValidationError("Sample text is required")

        try:
            import httpx
            import os

            # Note: previous version imported `clients.translation_service`,
            # which never existed (only `clients.translate_client` exists, and
            # it does not surface an Anthropic API key). The admin "test prompt"
            # path therefore raised ImportError. Read the key directly from the
            # environment instead — Lambda config or local .env via dotenv.
            api_key = os.getenv('ANTHROPIC_API_KEY')
            if not api_key:
                raise ExternalServiceError(
                    "Anthropic API key not configured",
                    service_name="anthropic"
                )

            user_message = f"Translate the following Korean text to English:\n\n{sample_text}"

            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-5-haiku-20241022",
                        "max_tokens": 4096,
                        "system": prompt,
                        "messages": [{"role": "user", "content": user_message}]
                    }
                )

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"Claude API error: {response.status_code} - {error_detail}")
                raise ExternalServiceError(
                    f"Claude API error: {response.status_code}",
                    service_name="anthropic"
                )

            result_data = response.json()
            translated_text = result_data.get('content', [{}])[0].get('text', '')

            return {
                'success': True,
                'input': sample_text,
                'output': translated_text,
                'prompt_length': len(prompt)
            }

        except httpx.TimeoutException:
            raise ExternalServiceError(
                "Translation request timed out",
                service_name="anthropic"
            )
        except Exception as e:
            logger.error(f"Test prompt error: {e}", exc_info=True)
            raise

    async def restore_prompt_version(self, version_index: int) -> Dict[str, Any]:
        """
        Restore a previous version of the prompt.

        Args:
            version_index: Index of the version in history (0 = most recent)

        Returns:
            Dict with success, message, restored_prompt
        """
        try:
            response = self.table.get_item(Key={'news_id': 'settings_config'})
            settings_data = response.get('Item', {})

            history = settings_data.get('prompt_history', [])

            if not history or version_index >= len(history):
                raise ValidationError(f"Version {version_index} not found in history")

            version_to_restore = history[version_index]
            restored_prompt = version_to_restore.get('content', '')

            if not restored_prompt:
                raise ValidationError("Cannot restore empty prompt version")

            # Save the restored prompt (this will archive current)
            result = await self.save_prompt(restored_prompt)

            return {
                'success': True,
                'message': f'Restored prompt from version {version_index + 1}',
                'restored_prompt': restored_prompt[:500] + '...' if len(restored_prompt) > 500 else restored_prompt
            }

        except Exception as e:
            logger.error(f"Restore prompt version error: {e}", exc_info=True)
            raise

    async def reset_to_default(self) -> Dict[str, Any]:
        """
        Reset prompt to default from file.

        Returns:
            Dict with success, message
        """
        default_prompt = self._load_default_prompt()

        if not default_prompt:
            raise ValidationError("Default prompt file not found")

        result = await self.save_prompt(default_prompt)

        return {
            'success': True,
            'message': 'Prompt reset to default successfully',
            'updated_at': result.get('updated_at')
        }


# Singleton instance
_prompt_service: Optional[PromptService] = None


def get_prompt_service() -> PromptService:
    """Get or create singleton PromptService instance."""
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = PromptService()
    return _prompt_service
