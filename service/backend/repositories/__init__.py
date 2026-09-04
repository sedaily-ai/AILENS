"""
Repositories module.

패키지 재export는 안 한다 — 실제 호출부(user_service.py 등)는 전부
`from repositories.personal_repository import get_personal_repository`처럼
서브모듈에서 직접 import한다(2026-09-04 확인, `from repositories import ...`
호출부 0건).
"""
