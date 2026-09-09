# lens-cms-api

CMS 글 공개 조회(`GET /api/v2/posts`, `GET /api/v2/posts/{slug}`) 전용
상시 서버. `service/backend`(Lambda)의 `clients/cms_posts_pg_client.py`+
`services/cms_posts_shaping.py`를 FastAPI+psycopg2 커넥션 풀로 포팅한
것 — Lambda+RDS 조합(호출마다 새 커넥션, VPC 붙이면 NAT/엔드포인트
필요)의 근본 문제를 피하기 위해 v1.20에서 신설했다. 배경·경위는
`docs/architecture/db-changelog/postgres/v1.20-상시서버-실전환.md` 참조.

## 배포 대상

EC2 `lens-cms-api-prod`(`i-0e3d04bdb01584833`, RDS와 같은 VPC), PM2로
상시 구동, Nginx가 80→8000 리버스 프록시. `ailens.sedaily.ai`를 서빙하는
CloudFront(`E1QS7PY350VHF6`)에 `/api/v2/posts*` cache behavior로 연결돼
있다.

## 로컬 구조

- `main.py` — FastAPI 앱, 라우팅(`handlers/cms_posts_public.py`의 Lambda
  버전과 계약 동일)
- `db.py` — psycopg2 `ThreadedConnectionPool`
- `cms_posts_repo.py` — 쿼리·조회 로직(`cms_posts_pg_client.py` 포팅)
- `cms_posts_shaping.py` — 채널별 응답 shaping(Lambda 버전과 완전 동일,
  그대로 복사)
- `ecosystem.config.js` — PM2 프로세스 정의(비밀번호는 서버에만 직접 주입)
- `provision.sh` — 최초 프로비저닝 스크립트(패키지·venv·nginx·PM2 설정)

## 재배포

```
# 로컬에서 파일 변경 후, EC2로 복사(scp 또는 SSM)
# /opt/lens-cms-api/ 아래 덮어쓰기
pm2 restart lens-cms-api --update-env
```

Lambda 쪽 `clients/cms_posts_pg_client.py`와 쿼리 로직이 갈라지지 않도록,
스키마·쿼리를 바꿀 땐 두 곳 다 같이 고칠 것(`cms_posts_pg_client.py`는
`CMS_DB_BACKEND=postgres`가 켜지면 여전히 쓰일 수 있는 dormant 코드로
남아있다).
