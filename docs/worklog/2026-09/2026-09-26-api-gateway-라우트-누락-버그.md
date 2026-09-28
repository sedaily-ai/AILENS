# 2026-09-26 API Gateway 라우트 누락 — "프로덕션에 적용"·"버전 삭제"·"다운로드" 전부 404였음

작성: 문영광 + Claude Code
관련: `admin/backend/handler.py`, AWS API Gateway `chzwwtjtgk`(HTTP API, us-east-1)

## 1. 문제발견
버전 이름 수정 기능을 새로 추가하면서 라우트를 등록하려고 `aws apigatewayv2 get-routes`로 현재 등록된 라우트 목록을 확인하던 중, 이전 사이클(같은 세션, "테스트카드-생성프롬프트-uiux전면개편" 워크로그 사이클 4)에서 이미 구현·배포했다고 보고했던 기능 3개가 실제로는 AWS 쪽에 라우트가 없어 전부 404였다는 걸 발견했다.
**근거**: `aws apigatewayv2 get-routes` 실측 결과와 `admin/backend/handler.py`의 `HANDLERS` dict를 직접 대조. Lambda 코드에는 핸들러가 있었지만(같은 날 06:08 UTC 배포 확인) API Gateway 라우트 목록엔 없었다.

## 2. 문제정의
`handler.py`에 문자열 키를 추가하는 것만으로는 실제 경로가 뚫리지 않는다 — 이 저장소의 admin Lambda는 HTTP API의 **실제 routeKey**가 AWS 쪽에 별도로 등록돼 있어야 하고(`aws apigatewayv2 create-route`), 그걸 빠뜨리면 코드가 완벽해도 요청이 Lambda까지 도달하지 못한 채 404가 난다. **이 함정은 `handler.py` 안에 이미 경고 주석으로 남아 있었는데도 세 번(버전 삭제, 프로덕션 적용, 다운로드) 연속으로 놓쳤다.**

빠졌던 라우트:
- `DELETE /admin/prompts/{category}/{name}/versions/{version}` (버전 삭제)
- `POST /admin/prompts/{category}/{name}/activate` (프로덕션에 적용)
- `GET /admin/media/download-url` (다운로드)

## 3. Why
- admin 프론트는 로컬 `npm run dev`에서도 배포된 API Gateway(`chzwwtjtgk`)를 직접 호출한다(`.env.local`의 `NEXT_PUBLIC_ADMIN_API_BASE_URL`) — 즉 "로컬에서 테스트 중이니 일단 넘어가도 된다"가 성립하지 않는 구조. 사용자가 실제로 이 버튼들을 눌러보기 전까지는 겉보기엔 정상 배포된 것처럼 보였다.
- 셋 다 이번 세션에서 "완료"로 보고했던 기능이라, 방치하면 사용자가 실제로 눌러보고 실패를 겪을 때까지 아무도 모르는 상태로 남는다.

## 4. How
- API ID(`chzwwtjtgk`) · 리전(`us-east-1`) · 기존 라우트가 재사용하는 integration ID(`lgj4lzl`)를 `get-routes`로 확인.
- `aws apigatewayv2 create-route`로 누락된 라우트 3개 + 이번에 새로 만든 rename 라우트(`PATCH .../versions/{version}/label`) 총 4개를 등록. `dev` 스테이지는 auto-deploy라 별도 배포 스텝 없이 즉시 반영됨.
- Lambda 코드 자체는 이미 당일 배포돼 있어(`aws lambda get-function`으로 확인) 코드 재배포는 불필요했음 — 라우트 등록만으로 해결.

## 판정
수정 완료, 즉시 반영 확인(`get-routes`로 4개 라우트 등록 재확인).

## Next
- **재발 방지책은 아직 없음** — 지금은 "새 라우트를 추가할 때마다 사람이 기억해서 `get-routes`로 대조"하는 수작업에 의존한다. 다음에 이 패턴이 또 반복되면(라우트 3개 이상 빠뜨린 게 벌써 두 번째), `deploy-admin-api.sh`에 "HANDLERS dict의 모든 키가 실제 API Gateway에 등록돼 있는지" 자동 대조하는 스텝을 넣는 걸 검토할 것 — 지금은 별도 스크립트 없이 사람이 `handler.py`와 `get-routes` 결과를 눈으로 비교해야 한다.
