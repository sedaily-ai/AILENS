# 2026-08-03 프론트 일일 자동 배포 가동 (GitHub Actions)

작성: 문영광 + Claude Code
관련: PR #14 (머지됨), .github/workflows/deploy-frontend.yml

## 배경

레터 딥링크/SEO 페이지는 빌드 시점 최근 14일만 prerender — 매일 재빌드가 없으면
새 레터의 직접 진입 URL 이 빈 껍데기 (7/31~8/2 실측). OIDC 는 과하다는 판단으로
GitHub Secrets 키 방식으로 심플하게 감.

## 한 것

- deploy-frontend-daily 워크플로우: 매일 19:30 UTC(KST 04:30) + 수동 실행.
  DEPLOY_REF=feat/front-page-letters 체크아웃 → 기존 deploy.sh 그대로 실행.
- Secrets: AWS_ACCESS_KEY_ID/SECRET (개인 admin 키 — 추후 배포 전용 키로 교체 권장)
- PR #14 머지 + 수동 실행 1회 검증: success (2m22s), 배포 후 8/3 v3 딥링크
  타이틀 실측 확인 ("진입 장벽이 구조를 가르는 한 주").

## 결정

- 워크플로우 파일은 기본 브랜치(스케줄 발화 조건), 빌드 대상은 DEPLOY_REF 로 분리.
  스택(PR #13 → front-page-live-data → 기본) 머지 완료 시 DEPLOY_REF 갱신 필수.

## 다음

- 전체 자동 체인 완성: 00:00 수집 → 00:30 선별 → 01:00 레터(v3) → 04:30 프론트 배포.
  내일(8/4) 아침 첫 무인 사이클 확인.
- 남은 선택: 재시도 크론 3회화, 뉴스레터 발송 자동화, 배포 전용 IAM 키,
  deploy.sh 구빌드 에셋 7일 보관(열린 탭 깨짐 완화).
