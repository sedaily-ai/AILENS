"""
Hash Utilities for Content Change Detection

Used to detect changes in Korean article content for retranslation.
When Korean source content changes (e.g., typo fixes), the hash will differ,
triggering a retranslation of the article.
"""
import hashlib
from typing import Optional


def hash_content(content: str) -> str:
    """
    Generate SHA256 hash of content for change detection.

    Args:
        content: Text content to hash (Korean article content)

    Returns:
        64-character hexadecimal hash string, or empty string if no content

    Example:
        >>> hash_content("삼성전자가 실적을 발표했다")
        'a1b2c3d4e5f6...'  # 64 chars
    """
    if not content:
        return ""

    # Normalize content: strip whitespace
    normalized = content.strip()

    if not normalized:
        return ""

    # Generate SHA256 hash
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def content_changed(old_hash: Optional[str], new_content: str) -> bool:
    """
    Check if content has changed by comparing hashes.

    Args:
        old_hash: Previously stored hash (from DynamoDB)
        new_content: New content from BigKinds API

    Returns:
        True if content has changed (needs retranslation), False otherwise

    Example:
        >>> old = "abc123..."
        >>> new_content = "수정된 기사 내용"
        >>> content_changed(old, new_content)
        True
    """
    # No previous hash means legacy article without hash - skip retranslation
    # (will be handled on next fresh collection)
    if not old_hash:
        return False

    new_hash = hash_content(new_content)

    # Empty new content - don't trigger retranslation
    if not new_hash:
        return False

    return old_hash != new_hash
