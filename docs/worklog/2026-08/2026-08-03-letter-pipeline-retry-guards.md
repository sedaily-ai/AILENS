# 2026-08-03 레터 파이프라인 재시도 가드 + 브랜치 정리

작성: 문영광 + Claude Code
관련: feat/front-page-letters, core25_editor_pick, docs/superpowers/specs/2026-07-23-front-page-live-data-design.md

## 배경

"프롬프트만으로 자동 파이프라인" 조사 결과, 이미 배포본이 그 상태였다:
collector(00:00) → selector(00:30) → editor-pick(01:00, KST)이 1면 4건을
페르소나 카드 + orchestrator 프롬프트로 레터 4편 생성 (Sonnet 4.5, transform 불필요).
PR #12 (feat/front-page-live-data) 에 get_editor_pick_candidates 의 1면 고정
(paper_number='1', 주말 fallback)이 이미 들어 있고 배포까지 완료돼 있었다.
남은 것은 앞서 결정한 안정화 장치 — "1시간 간격 3회 시도 + 처리했으면 스킵".

## 한 것

- 브랜치 정리: 로컬 기본(chore/folder-rename)이 origin/feat/front-page-live-data
  (PR #12, 73커밋)보다 뒤처져 있어서, 최신 위에 feat/front-page-letters 를 만들고
  문서 재편·뉴스레터 폴리시 커밋 2개를 cherry-pick (CLAUDE.md 충돌은 최신 실측
  서술 유지 + 이동 경로만 재적용).
- editor-pick 가드 2종:
  1. skipped_existing — 그날 레터 4편이 이미 있으면 Bedrock invoke 없이 스킵.
  2. waiting_fresh_paper — 최종 시도 전(KST 03시 이전)에 후보 풀이 직전 지면일로
     fallback 된 상태면 생성 보류. env EDITOR_PICK_FINAL_ATTEMPT_HOUR(기본 0=비활성)로
     게이트 — 단발 크론 상태에서 켜지면 지면 없는 날 레터가 안 나가는 회귀 방지.
- get_editor_pick_candidates 후보에 paper_date 필드 추가 (가드 판정용).
- 테스트 3건 추가 (waiting / fresh 통과 / paper_date 없는 풀 통과), 전체 660 passed.

## 결정

- 재시도는 editor-pick 단독이 아니라 체인 전체(collector→selector→editor-pick)가
  시간대를 물려 3회 돌아야 의미가 있다 (지면이 늦으면 수집부터 다시 필요).
- 크론 변경과 env 설정은 묶어서 적용한다 (아래 "다음"의 적용안). 코드만 먼저
  배포해도 동작 변화 없음 (가드 기본 비활성).

## 다음 (적용 대기 — AWS 변경이라 승인 필요)

1. EventBridge cron 수정 (신규 리소스 없음, 기존 룰 3개 수정):
   - collector: cron(0 15 * * ? *) → cron(0 15,16,17 * * ? *)  (KST 00/01/02시)
   - selector: cron(30 15 * * ? *) → cron(30 15,16,17 * * ? *) (KST 00:30/01:30/02:30)
   - editor-pick: cron(0 16 * * ? *) → cron(0 16,17,18 * * ? *) (KST 01/02/03시)
2. editor-pick Lambda env: EDITOR_PICK_FINAL_ATTEMPT_HOUR=3
3. deploy-v2.sh 로 editor-pick update-function-code
4. 비용 영향: 평시 +$0 (2·3차는 skipped_existing 로 즉시 종료). 지면 늦는 날만
   Nova Lite 재선별 몇 센트. collector 재실행은 ON CONFLICT DO NOTHING 멱등.
