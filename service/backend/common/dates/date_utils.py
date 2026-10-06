"""
Date/Time utilities for article processing
"""
from datetime import datetime, timezone, timedelta

_KST = timezone(timedelta(hours=9))


def get_kst_today() -> str:
    """Today's date in YYYYMMDD format (KST)."""
    return datetime.now(_KST).strftime("%Y%m%d")
