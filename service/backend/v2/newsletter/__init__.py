"""AI LENS 뉴스레터 (SES) — Phase 1 모듈.

handlers/newsletter.py 가 오케스트레이션. 본 패키지:
  - subscribers: 구독자 조회 (DynamoDB + mock fallback)
  - render: 레터 → HTML 이메일
  - sender: SES 발송 (dry-run 안전장치)
"""
