"""
Date/Time utilities for article processing
"""
from datetime import datetime, timezone, timedelta


def extract_timestamp_from_news_id(news_id: str) -> str:
    """
    Extract actual publish timestamp from news_id

    News ID format: {category_code}.{YYYYMMDDHHMMSS}{sequence}
    Example: 02100311.20251223090937001
    - Category code: 02100311
    - Timestamp: 20251223090937 (2025-12-23 09:09:37)
    - Sequence: 001

    Args:
        news_id: BigKinds news ID

    Returns:
        ISO 8601 timestamp with KST timezone (e.g., "2025-12-23T09:09:37.000+09:00")

    Raises:
        ValueError: If news_id format is invalid
    """
    try:
        # Split by dot to get timestamp part
        parts = news_id.split('.')
        if len(parts) != 2:
            raise ValueError(f"Invalid news_id format: {news_id}")

        timestamp_part = parts[1]

        # Extract YYYYMMDDHHMMSS (first 14 characters)
        if len(timestamp_part) < 14:
            raise ValueError(f"Timestamp part too short in news_id: {news_id}")

        timestamp_str = timestamp_part[:14]

        # Parse timestamp: YYYYMMDDHHMMSS
        year = int(timestamp_str[0:4])
        month = int(timestamp_str[4:6])
        day = int(timestamp_str[6:8])
        hour = int(timestamp_str[8:10])
        minute = int(timestamp_str[10:12])
        second = int(timestamp_str[12:14])

        # Create datetime with KST timezone (+09:00)
        kst = timezone(timedelta(hours=9))
        dt = datetime(year, month, day, hour, minute, second, tzinfo=kst)

        # Return ISO format with milliseconds
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000+09:00")

    except (ValueError, IndexError) as e:
        raise ValueError(f"Failed to parse timestamp from news_id '{news_id}': {e}")
