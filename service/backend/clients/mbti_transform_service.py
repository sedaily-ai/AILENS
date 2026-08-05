"""
MBTI Transform Service
Handles article style transformation using AWS Bedrock Claude API

Transforms a single Korean article into 4 MBTI group styles (NT, NF, ST, SF).
Each group has a dedicated prompt file in /backend/prompts/:
- NT: 전략형 분석가 (nt.md)
- NF: 가치형 해석자 (nf.md)
- ST: 실용형 실무자 (st.md)
- SF: 공감형 소통가 (sf.md)
"""
import asyncio
from typing import Optional, Dict, Any
import logging
import os
import json

import boto3
from botocore.config import Config

from config.constants import MBTI_GROUPS, MBTI_GROUP_INFO, BEDROCK_MODEL_ID_OPUS
from services.prompt_loader import load_transform_prompt

# Boto3 config with extended timeouts for Bedrock (Opus is slower than Haiku)
BEDROCK_CONFIG = Config(
    read_timeout=600,  # 10 minutes read timeout
    connect_timeout=60,  # 1 minute connect timeout
    retries={'max_attempts': 3}
)

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 30
MAX_RETRY_DELAY = 600

class TransformError(Exception):
    """Raised when MBTI transformation fails"""
    pass


class MbtiTransformService:
    """
    Service for transforming Korean articles into 4 MBTI styles
    using AWS Bedrock Claude API.
    """

    def __init__(
        self,
        model_id: str = None,
        region: str = "us-east-1",
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
    ):
        self.model_id = model_id or BEDROCK_MODEL_ID_OPUS
        self.region = region

        if aws_access_key_id and aws_secret_access_key:
            self.bedrock_client = boto3.client(
                'bedrock-runtime',
                region_name=region,
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key,
                config=BEDROCK_CONFIG
            )
        else:
            self.bedrock_client = boto3.client(
                'bedrock-runtime',
                region_name=region,
                config=BEDROCK_CONFIG
            )

        logger.info(f"MbtiTransformService initialized with Bedrock model: {self.model_id}")

    def _load_group_prompt(self, group: str) -> Optional[str]:
        """Delegate to prompt_loader (Admin-3 cutover — DDB-backed with 5-min TTL +
        filesystem fallback). Returns None on unknown group or if every fallback
        layer fails (preserved by upstream callers that null-check)."""
        if group not in MBTI_GROUPS:
            logger.warning(f"Unknown MBTI group: {group}")
            return None
        try:
            return load_transform_prompt(group)
        except Exception as e:
            logger.warning(f"Failed to load transform prompt for {group}: {e}")
            return None

    def _build_group_system_prompt(self, group: str, group_prompt: str) -> str:
        """
        Build the system prompt for a single MBTI group transformation.

        Args:
            group: MBTI group (NT, NF, ST, SF)
            group_prompt: Raw prompt content from the group's .md file

        Returns:
            Complete system prompt with persona instructions + JSON output format
        """
        info = MBTI_GROUP_INFO[group]
        return f"""당신은 서울경제신문의 MBTI 맞춤형 뉴스 변환 전문가입니다.
다음 경제 기사를 [{info['label']}] 스타일로 변환합니다.
아래 가이드라인을 정확히 따라주세요.

{group_prompt}

[출력 형식] 반드시 아래 JSON으로 출력:
{{
  "title": "제목 (50자 내외)",
  "subtitle": "부제목 (1~2문장)",
  "body": "본문 (마크다운)",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "closing_line": "마무리 한 줄"
}}"""

    async def transform_single_group(
        self,
        group: str,
        title: str,
        subtitle: str,
        content: str,
        category: str = "",
    ) -> Dict[str, Any]:
        """
        Transform an article into a single MBTI group style.

        Args:
            group: MBTI group (NT, NF, ST, SF)
            title: Original Korean title
            subtitle: Original Korean subtitle
            content: Original Korean content (clean text)
            category: Article category

        Returns:
            Dict with 'version' (single group result) and 'usage' (token data)

        Raises:
            TransformError: If transformation fails after all retries
        """
        group_prompt = self._load_group_prompt(group)
        if not group_prompt:
            raise TransformError(f"Failed to load prompt for {group}")

        system_prompt = self._build_group_system_prompt(group, group_prompt)

        user_message = f"""다음 경제 기사를 {group} 스타일로 변환해주세요.

[원본 제목] {title}
[원본 부제목] {subtitle or '없음'}
[카테고리] {category or '경제'}

[원본 기사]
{content}"""

        last_error = None
        retry_delay = INITIAL_RETRY_DELAY

        for attempt in range(MAX_RETRIES):
            try:
                request_body = json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 16384,
                    "system": [
                        {
                            "type": "text",
                            "text": system_prompt,
                            "cache_control": {"type": "ephemeral", "ttl": "1h"}
                        }
                    ],
                    "messages": [
                        {"role": "user", "content": user_message}
                    ]
                })

                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: self.bedrock_client.invoke_model(
                        modelId=self.model_id,
                        contentType="application/json",
                        accept="application/json",
                        body=request_body
                    )
                )

                response_body = json.loads(response['body'].read())

                if not response_body.get("content") or len(response_body["content"]) == 0:
                    raise TransformError(f"Empty content in Bedrock response for {group}")

                response_text = response_body["content"][0].get("text", "")

                if attempt > 0:
                    logger.info(f"Transform {group} succeeded on attempt {attempt + 1}")

                # Parse JSON — extract first balanced {...} block
                start = response_text.find('{')
                if start == -1:
                    raise TransformError(f"No JSON found in {group} response")
                depth = 0
                json_str = None
                for _i in range(start, len(response_text)):
                    if response_text[_i] == '{':
                        depth += 1
                    elif response_text[_i] == '}':
                        depth -= 1
                        if depth == 0:
                            json_str = response_text[start:_i + 1]
                            break
                if json_str is None:
                    raise TransformError(f"No complete JSON object in {group} response")

                version = json.loads(json_str)

                # Validate required fields
                if not version.get('title') or not version.get('body'):
                    raise TransformError(f"{group} response missing title or body")
                version.setdefault('subtitle', '')
                version.setdefault('key_points', [])
                version.setdefault('closing_line', '')

                # Extract usage
                usage = response_body.get("usage", {})
                usage_data = {
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
                    "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                }

                return {"version": version, "usage": usage_data}

            except self.bedrock_client.exceptions.ThrottlingException as e:
                logger.warning(f"Bedrock throttling ({group}). Retry {attempt + 1}/{MAX_RETRIES} in {retry_delay}s...")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                    last_error = e
                    continue
                raise TransformError(f"Transform {group} failed: Throttling - {e}")

            except self.bedrock_client.exceptions.ModelTimeoutException as e:
                logger.warning(f"Bedrock timeout ({group}). Retry {attempt + 1}/{MAX_RETRIES} in {retry_delay}s...")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                    last_error = e
                    continue
                raise TransformError(f"Transform {group} failed: Timeout - {e}")

            except (json.JSONDecodeError, TransformError) as e:
                logger.error(f"Transform {group} parse error: {e}")
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"Retrying {group}... {attempt + 1}/{MAX_RETRIES}")
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                    last_error = e
                    continue
                raise TransformError(f"Transform {group} failed: {e}")

            except Exception as e:
                logger.error(f"Transform {group} error: {e}")
                last_error = e
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)
                    continue
                raise TransformError(f"Transform {group} failed: {e}")

        raise TransformError(f"Transform {group} failed after {MAX_RETRIES} retries: {last_error}")

    async def transform_article(
        self,
        title: str,
        subtitle: str,
        content: str,
        category: str = "",
    ) -> Dict[str, Any]:
        """
        Transform a Korean article into 4 MBTI styles using parallel per-group calls.

        Launches 4 concurrent Bedrock calls (one per MBTI group) via asyncio.gather.
        If some groups fail, returns the successful ones with a warning (graceful
        degradation). Raises TransformError only if ALL groups fail.

        Args:
            title: Original Korean title
            subtitle: Original Korean subtitle
            content: Original Korean content (clean text)
            category: Article category

        Returns:
            Dict with:
              - 'versions': {NT: {...}, NF: {...}, ST: {...}, SF: {...}}
              - 'usage': aggregated token usage across all calls
        """
        if not content or not content.strip():
            raise TransformError("Article content must be non-empty")

        # Launch 4 parallel calls — one per MBTI group
        tasks = [
            self.transform_single_group(
                group=group,
                title=title,
                subtitle=subtitle,
                content=content,
                category=category,
            )
            for group in MBTI_GROUPS
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Merge results — collect successes and log failures
        versions = {}
        total_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
        }
        failed_groups = []

        for group, result in zip(MBTI_GROUPS, results):
            if isinstance(result, Exception):
                logger.warning(f"Transform failed for {group}: {result}")
                failed_groups.append(group)
            else:
                versions[group] = result["version"]
                for key in total_usage:
                    total_usage[key] += result["usage"].get(key, 0)

        if not versions:
            raise TransformError(
                f"All 4 MBTI group transforms failed: "
                f"{[str(r) for r in results if isinstance(r, Exception)]}"
            )

        if failed_groups:
            logger.warning(
                f"Partial transform: {len(versions)}/4 groups succeeded, "
                f"failed: {failed_groups}"
            )

        return {
            "versions": versions,
            "usage": total_usage,
        }

    async def close(self):
        """Close resources (no-op for Bedrock client)"""
        pass
