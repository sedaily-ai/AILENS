# 2026-08-03 빌링 태그 정비 — Project 통일 + 레터 Bedrock 분리 집계

작성: 문영광 + Claude Code
관련: mbti-letter-sonnet-45 (zapmhfe3zm4y), 커밋 df9f51b

## 배경

빌링에서 AI LENS 지출 추적 요구. 점검 결과 Lambda Project 태그가 4갈래
(sedaily-mbti 20 / Sedaily-MBTI 7 / AI-LENS 3 / 없음 2)로 분열, Bedrock 레터
생성 호출은 raw 모델 ID 라 미태깅("Not Applicable" 버킷).

## 한 것

- Lambda 12개 태그 수정 → 32개 전부 Project=sedaily-mbti (S3·RDS·CF·OpenSearch 와 일치)
- application inference profile 신설: mbti-letter-sonnet-45 (Sonnet 4.5,
  Project=sedaily-mbti / Workload=letter) — 기존 mbti-* 프로파일 5개와 동일 패턴
- IAM: editor-pick 역할 EditorPickBedrockSonnet45 정책에 프로파일 ARN 추가
- 코드: EDITOR_PICK_MODEL_ID env 로 모델/프로파일 주입 (미설정 시 기존 동작)
- 스모크(7/2 백필): 4편 생성, 재시도 0회, 프로파일 경유 확인

## 결정

- Project 정본 값 = sedaily-mbti (다수값·타 리소스와 일치 기준). 새 리소스 생성 시 준수.
- RDS pgvector·기사 데이터는 보존 (영문사이트와 무관 확인, 삭제 실익 0 —
  타임머신·생일뉴스·RAG 코퍼스 원료)

## 다음

- 빌링 반영은 1~2일 후 확인 (태그는 부착 시점 이후 지출부터 집계)
- selector 의 Nova Lite 호출도 같은 패턴 적용 여부 판단
