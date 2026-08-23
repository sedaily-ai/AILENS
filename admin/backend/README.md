# admin/backend — AI LENS 관리자 API

Lambda(Python) 단일 함수(`sedaily-mbti-admin-api-dev`) — admin/frontend가
호출하는 프롬프트 CRUD, CMS 글 관리 API.

## 배포 — `./deploy-admin-api.sh`

```bash
cd admin/backend
./deploy-admin-api.sh
```

admin은 **flat import 규약**을 쓴다(`Handler=handler.lambda_handler`) —
zip 루트가 `admin/backend/` 내용 그 자체여야 해서, `service/backend/`의
v1/v2 소스와 섞지 않는다. 공유 유틸(`common/`)만
`service/backend/common/`을 상대경로로 참조해서 zip에 포함한다.

`update-function-code`만 수행한다 — 함수·역할·라우트·env는 이 스크립트가
만들지 않는다(`.clauderules` 준수).

## 관련

- `admin/frontend/deploy-admin.sh` — 프런트엔드(S3+CloudFront) 전용,
  이 스크립트와는 별개.
- `service/backend/README.md` — 공개 API(v1/v2) 배포, admin과 함수도
  스크립트도 완전히 분리돼 있다.
