# 2026-10-12 마스터DB LENS 탭 비용 BillingON 자동 기입

작성: 김경윤 + Kiro
관련: AI-dashboard PR #128(코드·워크플로·정본 문서), 이 레포 `docs/architecture/비용시트_파이프라인.md`(사본),
AI-dashboard `dev_logs/2026-10-12_lens-sheet-billingon.md`(적용 기록·변경 전 스냅샷)

## 배경

마스터DB `LENS` 탭(AI LENS 주차별 비용)은 주간 비용 보고서 캡처를 보고 사람이 옮겨 적고 있었다.
캡처 시점의 청구 적재 지연과 카드에 안 나온 항목 때문에 실청구보다 주당 $41~$142 낮게 적혀 있었다.
다른 분께 인계하기 전에 BillingON API로 자동화했다.

## 한 것

- AI-dashboard에 `pipeline/push_lens_cost_to_sheets.py`와 주간 워크플로 `lens-sheet-weekly.yml`(금 07:40 KST) 추가.
  `Service` 태그 비용을 AWS 서비스별로 받아 탭 입력칸 10개(웹툰 이미지·Opus 5·Sonnet 4.6·Sonnet 5·기타 Bedrock·
  EC2·VPC·RDS·ECS·인프라 기타)와 메모에 쓴다. 합계·증감은 시트 수식이 계산한다.
- 1~9주차 백필 적용(19:15 KST). 누적 총비용 $2,988.86 → $3,553.65.
- 인계 문서 2개(AI-dashboard `docs/guides/lens-sheet.md` 운영, `lens-sheet-pipeline.md` 내부 동작) 작성.
  내부 동작 문서 사본을 이 레포 `docs/architecture/비용시트_파이프라인.md`에 두고, 이 레포 개발자가 알아야 할
  연결 지점(§0)을 덧붙였다.
- `비용태깅_규칙.md` §8 체크리스트에 `push_lens_cost_to_sheets.py`의 `DEFAULT_TAGS` 추가.

## 결정

- **합산 태그는 `atlas4`+`lens`+`mbti`.** AI LENS의 `Service` 값이 `mbti`(~8/23) → `lens` → `atlas4`(지원기간) →
  `lens`(10/1~)로 바뀌어 왔기 때문이다. 하나라도 빼면 그 시기 비용이 사라진다. 마스터DB `MBTI` 탭은 7/01 주차까지 틀만
  있고 비용이 비어 있어 이중계상은 없다.
- 새 모델은 `기타 Bedrock`으로 자동 분류한다(누락 방지). Opus 5.5·Sonnet 5.5가 5 칸에 섞이지 않게 괄호까지 비교한다.
- 한 주차를 두 번 쓴다(다음 금요일에 잠정치를 확정치로). BillingON 적재가 T+3이라서다.
- 문서 정본은 코드 옆(AI-dashboard)에 두고 이 레포에는 사본을 둔다. 사본 머리에 정본 링크와 기준 커밋을 적었다.

## 다음

- AI-dashboard PR #128 머지 후 Actions에서 `Weekly LENS sheet cost`를 `dry_run`으로 1회 실행. 첫 정기 실행 10/16(금).
- 호출 수·이미지 수·발행 건수·트래픽 칸은 여전히 수기. 자동화하려면 원천별 수집기를 따로 둔다.
- AI LENS에 새 `Service` 값을 쓰게 되면 `DEFAULT_TAGS` 갱신 요청(체크리스트 반영됨).
- 정본 문서가 바뀌면 이 레포 사본도 갱신.
