# 6/11 서울경제 최종 데모 체크리스트

> 데모 전에 모든 항목을 확인하세요.
> 자동 확인: `python tests/run_demo_checks.py`

---

## 인프라 (Infrastructure)

- [ ] 19개 Lambda 함수 배포 완료 (`./deploy.sh` 실행)
  - API 함수 13개 + Pipeline 함수 6개
- [ ] Step Functions 파이프라인 작동 중 (`./infrastructure/deploy_step_functions.sh`)
  - 최근 3일간 실행 기록 확인
- [ ] DynamoDB 테이블 4개 활성
  - `sedaily-mbti-articles-dev` (기사)
  - `sedaily-mbti-personal-dev` (유저)
  - `sedaily-mbti-podcast-dev` (팟캐스트)
  - `sedaily-mbti-engagement-dev` (참여)
- [ ] S3 버킷 3개 존재
  - `sedaily-mbti-article-body-dev` (기사 본문)
  - `sedaily-mbti-audio-dev` (오디오 파일)
  - `sedaily-news-xml-storage` (원본 XML)
- [ ] OpenSearch 도메인 활성 (선택적 — RAG 검색)
- [ ] RDS pgvector 인스턴스 활성 (선택적 — 유사도 검색)
- [ ] EventBridge 스케줄 활성 (매일 07:00 KST)
- [ ] CloudWatch 알람 설정 (`./infrastructure/cost_monitoring.sh`)

## 데이터 (Data)

- [ ] 최근 7일간 변환 기사 존재 (일일 11개 이상)
- [ ] S3 body.json 파일 존재 (articles/{news_id}/body.json)
- [ ] MBTI 4버전 모두 포함 (version_NT/NF/ST/SF)
- [ ] 데모 사용자 데이터 준비 (`python tests/demo_data_setup.py`)
  - 읽기 기록 30건
  - 아카이빙 문장 8건
  - 사용자 프로필 (NT, 온도 68.5, 뱃지 5개)

## 기능 (Functionality)

### 뉴스 피드
- [ ] S3 기사 목록 로드 (`GET /s3-articles?date=오늘`)
- [ ] MBTI 버전 전환 작동 (NT/NF/ST/SF 탭)
- [ ] 기사 상세 MBTI 본문 표시 (`GET /api/article/{id}`)

### AI 챗봇
- [ ] 챗봇 응답 생성 (`POST /api/chat`)
- [ ] MBTI 페르소나 적용 (시현/지원/정훈/하은)
- [ ] RAG 컨텍스트 활용 (OpenSearch 설정 시 `context_source: opensearch_rag`)

### 내 서랍 (Archive)
- [ ] 문장 저장 (`POST /api/archive`)
- [ ] 문장 목록 조회 (`GET /api/archive?user_id=...`)
- [ ] 문장 삭제 작동
- [ ] 유사 문장 검색 (pgvector 설정 시)

### 팟캐스트
- [ ] 팟캐스트 생성 (`POST /api/podcast/generate`)
- [ ] 오디오 재생 (presigned URL)
- [ ] MBTI별 음성 스타일 차이

### 추천 시스템
- [ ] 맞춤 추천 (`GET /api/recommend?user_id=...`)
- [ ] DNA 분석 (`GET /api/recommend/analysis?user_id=...`)
- [ ] 레이더 차트 데이터 7개 카테고리

### 기타
- [ ] 사주 분석 (`POST /saju`)
- [ ] 타임머신 (`GET /time-machine?date=...`)
- [ ] 사용자 프로필 동기화 (`POST /api/user/profile`)
- [ ] A/B 테스트 프레임워크 작동

## 성능 (Performance)

- [ ] 파이프라인 일일 처리 11개 이상 기사
- [ ] 평균 변환 시간 < 5분
- [ ] API 응답 시간 < 3초 (챗봇 제외)
- [ ] 챗봇 응답 시간 < 20초
- [ ] 최근 24시간 5xx 에러 없음

## 비용 (Cost)

- [ ] 일일 비용 < $5 (dev 환경)
- [ ] 월간 예상 비용 < $150
- [ ] $26,000 크레딧 잔액 확인
- [ ] Bedrock throttling 없음

## 데모 시나리오

### 시나리오 1: MBTI 맞춤 뉴스 (3분)
1. 메인 페이지 → 오늘 기사 목록 확인
2. NT(시현) → SF(하은) 에디터 전환 → 같은 기사 톤 차이 비교
3. 기사 상세 → 문장 아카이빙 → 내 서랍 확인

### 시나리오 2: AI 기능 (3분)
1. 챗봇으로 오늘 뉴스 질문 → RAG 답변 확인
2. 오디오 브리핑 재생 → MBTI 음성 스타일
3. DNA 분석 → 레이더 차트 → 맞춤 추천 기사

### 시나리오 3: 기술 아키텍처 (3분)
1. `GET /api/metrics/dashboard` → 파이프라인 성능 지표
2. Step Functions 콘솔 → 최근 실행 결과
3. 비용 분석 → $26,000 크레딧 소진 예측

---

## 자동 확인 실행

```bash
cd backend
python tests/run_demo_checks.py
```

## 긴급 대응

| 문제 | 해결 |
|------|------|
| 기사 없음 | `aws stepfunctions start-execution --input '{"date":"오늘날짜","source":"manual"}'` |
| 챗봇 에러 | CloudWatch 로그 확인: `aws logs tail /aws/lambda/sedaily-mbti-chatbot-dev` |
| 팟캐스트 실패 | S3 audio 버킷 확인, Polly 리전 확인 |
| Lambda 에러 | `./deploy.sh` 재배포 |
| 프론트엔드 에러 | `npm run build && aws s3 sync out/ s3://sedaily-mbti-frontend-dev` |
