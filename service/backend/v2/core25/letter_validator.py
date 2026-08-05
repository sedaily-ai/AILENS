"""Letter Validator — rule-based post-generation quality check.

parse_orchestrator_output()의 구조 검증(필드 누락, 글자수 등) 이후에 실행되는
내용 품질 검증 단계. LLM 호출 없이 rule-based로만 동작.

검증 항목:
1. article_id가 후보 풀에 존재하는가 (hallucination 차단)
2. 4편 letter의 theme이 서로 겹치지 않는가
3. 동일 article_id가 다른 에디터 letter에서도 중복 사용되는가 (허용이지만 로깅)

반환: ValidationResult (pass/fail + warnings)
fail이어도 기존 pipeline은 중단하지 않음 (로깅만). 향후 retry 로직에 연결 가능.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Set


logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    passed: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def validate_letters(
    letters: List[Dict[str, Any]],
    candidates: List[Dict[str, Any]],
) -> ValidationResult:
    """Rule-based validation. 기존 흐름을 차단하지 않음 — 결과는 로깅 용도."""
    result = ValidationResult()
    candidate_ids: Set[str] = {c["article_id"] for c in candidates}

    # 1. article_id existence check (hallucination detection)
    for ltr in letters:
        editor = ltr.get("editor_id", "?")
        articles = ltr.get("articles", [])
        for art in articles:
            aid = art.get("article_id", "")
            if aid and aid not in candidate_ids:
                result.errors.append(
                    f"[{editor}] hallucinated article_id: {aid}"
                )
                result.passed = False

    # 2. theme uniqueness check
    themes = [ltr.get("theme", "") for ltr in letters]
    themes_lower = [t.strip().lower() for t in themes if t]
    if len(set(themes_lower)) < len(themes_lower):
        duplicates = [t for t in themes_lower if themes_lower.count(t) > 1]
        result.warnings.append(
            f"duplicate themes detected: {list(set(duplicates))}"
        )

    # 3. cross-editor article_id overlap (warning, not error)
    all_article_ids_by_editor: Dict[str, List[str]] = {}
    for ltr in letters:
        editor = ltr.get("editor_id", "?")
        aids = [a.get("article_id", "") for a in ltr.get("articles", [])]
        all_article_ids_by_editor[editor] = aids

    all_ids_flat = []
    for aids in all_article_ids_by_editor.values():
        all_ids_flat.extend(aids)

    if len(all_ids_flat) != len(set(all_ids_flat)):
        seen: Dict[str, List[str]] = {}
        for editor, aids in all_article_ids_by_editor.items():
            for aid in aids:
                seen.setdefault(aid, []).append(editor)
        shared = {aid: editors for aid, editors in seen.items() if len(editors) > 1}
        if shared:
            result.warnings.append(
                f"article_id shared across editors: {shared}"
            )

    # Log result
    if not result.passed or result.warnings:
        logger.info(json.dumps({
            "event": "letter_validation_result",
            "passed": result.passed,
            "error_count": len(result.errors),
            "warning_count": len(result.warnings),
            "errors": result.errors[:5],
            "warnings": result.warnings[:5],
        }))

    return result
