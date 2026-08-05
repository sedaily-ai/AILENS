# 2026-08-03 레터 프롬프트 v3 전환 (에세이형) — 배포 완료

작성: 문영광 + Claude Code
관련: feat/front-page-letters e585fef, sedaily-mbti-v2-editor-pick-dev

## 배경

웹 실물 비교(/letters/view?id=nt-2026-08-03 현행 vs nt-2026-07-01 v3) 후
v3 에세이형 채택 결정. 당일 내 프로덕션 전환까지 완료.

## 한 것

- v3 프롬프트(docs/prompt-mbti-v2 v3.0.0)를 v2/prompts/editor_letter_v3/ 로 이식
  + web_output_contract.md (■/[라벨] 라인 문법, JSON 계약, 1,500자+ 규격)
- editor-pick v3 경로 (core25/editor_pick_v3.py): 페르소나별 4 invoke,
  기사 입력 400자 snippet → S3 original.json 전문 2,800자, 부분 실패 허용
- body_inline 신형식({body[], key_points[]}) 저장 — API 평탄화 불필요
- 스위치: Lambda env EDITOR_PICK_PROMPT_VERSION=v3 (코드 기본값 v1 = 롤백은 env 제거)
- 배포: deploy-v2.sh editor-pick (16:06) + env 갱신
- 스모크: letter_date=2026-07-02 백필 발화 → 4편 생성·API 서빙 확인
  (2,957~3,524자, 섹션 5~6개, keywords 4~5개)

## 결정

- 부분 발행 > 전체 결손: 한 페르소나 3회 재시도 소진 시 그 편만 스킵
- 프롬프트 정본은 docs/prompt-mbti-v2 유지, 백엔드 사본은 이식본 — 수정 시 양쪽 동기화

## 다음

- 내일(8/4) 새벽 1시 첫 v3 자동 발행 — 아침에 분량·품질 확인
- 재시도 크론 3회화 + EDITOR_PICK_FINAL_ATTEMPT_HOUR=3 활성 (승인 대기 유지)
- 매일 프론트 자동 빌드·배포 방식 결정 (CodeBuild vs crontab)
- 비용: 일 ~$0.1 → ~$0.35 (4 invoke, 시스템 프롬프트 캐시 적용)

## 추가 (같은 날 저녁) — 8/3 당일분 v3 백필 + 출력 포맷 교정

- 1차 백필 실패: JSON 출력의 이스케이프 실수로 파싱 실패율 ~50% → 재시도 누적 →
  Lambda 600s 타임아웃 → 일괄 insert 구조라 전량 유실.
- 교정 (커밋 1367cb4): 출력 계약을 HEADLINE:/KEYPOINT:/BODY: 라인 마커 평문으로
  전환(이스케이프 실패 모드 제거), 편별 즉시 upsert, Lambda timeout 900s.
- 2차 백필 성공: 8/3 4편 전부 v3 교체 (4,363~5,131자, 재시도 0회).
  기존 압축판은 scratchpad/letters_backup_v1/ 에 11일치 백업.
- 수동 backfill(letter_date 명시)은 skip 가드 우회 (커밋 4c2a4e8).
- 교훈: 장문 한국어 생성물은 JSON 문자열로 받지 말 것 — 라인 마커가 안정적.
