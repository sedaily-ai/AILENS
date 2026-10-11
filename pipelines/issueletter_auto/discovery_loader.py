"""최근 N일의 서울경제 기사(S3 일일 XML)를 모아 돌려준다. 기사 수집·파싱은 pipelines/discovery 를 그대로 쓴다."""
from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

KST = timezone(timedelta(hours=9))
_PATH = Path(__file__).parent.parent / "discovery" / "pipeline.py"


def fetch_recent(days: int) -> List[Dict[str, Any]]:
    spec = importlib.util.spec_from_file_location("issueletter_discovery", _PATH)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    out: List[Dict[str, Any]] = []
    seen = set()
    for i in range(days):
        d = (datetime.now(KST) - timedelta(days=i)).strftime("%Y%m%d")
        for a in mod.fetch_articles(d):
            k = a.get("key")
            if k and k not in seen and a.get("content_len", 0) >= 300:
                seen.add(k)
                out.append(a)
    return out
