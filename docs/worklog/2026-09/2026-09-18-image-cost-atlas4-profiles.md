# 2026-09-18 이미지 후처리 Bedrock 비용 atlas4 귀속

작성: Kiro
관련: `fix/image-cost-atlas4-profiles`, `pipelines/common/webtoon_image.py`

## 배경

마스터DB COST 시트의 `기타`가 W39~W41에 계속 증가해 BillingON 서비스×태그 원장을 역분해했다. W41 이미지 생성비 $285.95 중 $239.20(83.7%)가 `Not Applicable`이었고, 주원인은 웹툰 파이프라인의 Style Transfer·Remove Background가 SYSTEM inference profile ID를 직접 호출한 경로였다.

## 한 것

- 변경 전 AWS 실조회
  - 두 SYSTEM profile `ACTIVE`: `us.stability.stable-style-transfer-v1:0`, `us.stability.stable-image-remove-background-v1:0`
  - 해당 application profile은 기존 0개.
  - frontpage/mustknow ECS 역할 라이브 인라인 정책과 `origin/main`의 task-policy JSON 해시가 각각 완전 일치.
- us-west-2 application inference profile 2개 생성
  - `lens-webtoon-image-style-transfer` (`tck49g1f12v9`)
  - `lens-webtoon-image-remove-background` (`fo8lxrosnj66`)
  - 둘 다 `ACTIVE`, 기반 SYSTEM profile의 3리전 foundation model 유지.
  - 생성 시 태그 7키 적용·재조회: `Service=atlas4`, `Project=Sedaily-LENS`, `ServiceName=Sedaily-LENS`, `Environment=dev`, `CostCenter=sedaily-ai`, `Model`, `Workload=webtoon-image`.
- 두 ECS task role 인라인 정책의 `WebtoonCrossRegionStabilityInvoke`에 신규 app ARN 2개만 추가.
  - 기존 Statement·system/foundation ARN 제거 0.
  - 적용 전 정책은 `.scratch/*-auto-access.before.json`에 저장.
  - 적용 후 라이브 정책과 로컬 JSON 해시 완전 일치.
  - `simulate-principal-policy`: 두 역할 × 두 app ARN 모두 `bedrock:InvokeModel = allowed`, Organizations 허용.
- 코드 상수 교체
  - `STYLE_TRANSFER_MODEL_ID` → `...application-inference-profile/tck49g1f12v9`
  - `REMOVE_BACKGROUND_MODEL_ID` → `...application-inference-profile/fo8lxrosnj66`
- `py_compile`, JSON 파싱, `git diff --check` 통과.

## 결정

- 기존 Stable Image Core·Style Guide와 같은 `Service=atlas4`·`Workload=webtoon-image` 스키마를 유지했다.
- 호출 리전·요청 body·기반 모델은 바꾸지 않고 SYSTEM profile을 감싼 application profile ARN만 사용한다. 성능·가격이 아니라 비용 귀속만 바뀐다.
- 실제 이미지 추론 호출은 검증 목적으로 새로 만들지 않았다. IAM 시뮬레이션과 프로파일 상태·태그 재조회까지만 수행했다. 실동작 검증은 다음 정상 업무 태스크의 로그·CloudTrail로 한다.

## 다음

- 브랜치 PR 머지 후 frontpage-auto 공용 ECR 이미지를 재빌드하고 두 task definition을 새 리비전으로 등록한다. 머지 전 배포하면 다음 배포가 되돌릴 수 있으므로 아직 배포하지 않았다.
- 첫 정상 업무 태스크에서 로그 오류 0, CloudTrail `modelId`가 신규 app ARN인지 확인한다.
- BillingON T+3~4에서 `Stability AI Image Services`가 `Service=atlas4`로 이동하는지 확인한다.
- 2026-09-30 지원 종료 시 두 프로파일의 `Service`를 `lens`로 원복 대상에 포함한다.
