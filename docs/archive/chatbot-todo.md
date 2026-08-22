# 챗봇 고도화 TODO

## 1. MBTI별 변환 기사 활용
- [ ] `get_recent_articles`에서 S3 body의 `version_{group}` 필드 활용
- [ ] 현재: `content_ko` 원문 500자만 전달
- [ ] 개선: 사용자의 MBTI 그룹에 맞는 변환 버전(`version_NT`, `version_NF` 등)을 컨텍스트로 전달
- [ ] 페르소나 톤에 맞는 답변 자연스럽게 유도

## 2. 브리핑 캐시 시스템
- [ ] 브리핑 생성 Lambda(`sedaily-mbti-briefing-dev`) 구현/점검
- [ ] DynamoDB에 `NEWS_BRIEFING_LATEST` 항목으로 MBTI 그룹별 브리핑 저장
- [ ] 챗봇 호출 시 캐시된 브리핑 우선 사용 → S3 호출 제거로 응답 속도 개선
- [ ] `NEWS_BRIEFING_MAX_AGE_HOURS` 이내면 캐시 사용, 초과 시 fallback

## 3. 브리핑 Lambda 스케줄링
- [ ] EventBridge 규칙으로 하루 2회(오전 7시, 오후 1시) 자동 실행
- [ ] 최신 기사 수집 → MBTI 4그룹별 브리핑 생성 → DynamoDB 저장
- [ ] 실패 시 알림 (CloudWatch Alarm 또는 SNS)

## 4. 대화 주제 감지 + 관련 기사 추천
- [ ] 사용자 메시지에서 키워드/주제 추출
- [ ] DynamoDB 기사 제목/카테고리와 매칭
- [ ] 챗봇 응답에 관련 기사 카드(제목 + 링크) 삽입
- [ ] 프론트: 기사 카드 UI 컴포넌트 추가

## 5. 대화 로그 수집 + 분석
- [ ] 대화 로그 DynamoDB 테이블 설계 (user_id, session_id, messages, mbti_group, timestamp)
- [ ] 챗봇 Lambda에서 대화 완료 시 로그 저장
- [ ] 자주 묻는 질문 TOP N 집계 쿼리
- [ ] 분석 결과를 퀵 액션 버튼 개선에 활용
