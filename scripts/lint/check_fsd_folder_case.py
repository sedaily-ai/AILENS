#!/usr/bin/env python3
"""service/frontend/src/{widgets,features,entities} 바로 아래 폴더의
대소문자 규칙을 검사한다.

service/frontend/CLAUDE.md의 "파일 네이밍 컨벤션"이 문서화하는 실제 규칙:
- widgets/ 바로 아래 폴더는 PascalCase (widgets/FeedPage/, widgets/Header/ 등,
  2026-09-04 확인 — 12개 전부 예외 없이 이 형태로 굳어져 있었다)
- features/·entities/ 바로 아래 폴더는 kebab-case (features/news-feed/,
  entities/saju/ 등)

이 규칙이 그동안 문서로만 존재해서 위반이 몇 주씩 안 걸리고 넘어간 적이
있다(리팩토링 감사에서 발견) — ESLint에는 폴더명 대소문자를 검사하는
표준 규칙이 없어(파일명 케이스는 eslint-plugin-unicorn이 다루지만
디렉터리명은 다루지 않는다) 새 의존성 없이 이 스크립트로 대신한다.
pre-commit이 변경된 파일 경로를 인자로 넘긴다 — 파일이 아니라 그 파일이
속한 첫 번째 폴더 세그먼트만 검사한다.
"""
import re
import sys

_PASCAL = re.compile(r"^[A-Z][A-Za-z0-9]*$")
_KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

_RULES = {
    "widgets": ("PascalCase", _PASCAL),
    "features": ("kebab-case", _KEBAB),
    "entities": ("kebab-case", _KEBAB),
}


def check(path: str) -> str | None:
    parts = path.split("/")
    try:
        idx = parts.index("src")
    except ValueError:
        return None
    if idx + 2 >= len(parts):
        return None
    layer, folder = parts[idx + 1], parts[idx + 2]
    rule = _RULES.get(layer)
    if rule is None:
        return None
    label, pattern = rule
    if not pattern.match(folder):
        return (
            f"{path}: '{layer}/{folder}/' — {layer}/ 바로 아래 폴더는 "
            f"{label}이어야 합니다 (service/frontend/CLAUDE.md 참조)"
        )
    return None


def main(argv: list[str]) -> int:
    problems = [p for p in (check(f) for f in argv) if p]
    for p in problems:
        print(p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
