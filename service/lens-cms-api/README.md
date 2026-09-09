# lens-cms-api

CMS 글 공개 조회(`GET /api/v2/posts`, `GET /api/v2/posts/{slug}`)와
admin 쓰기(`/admin/posts*`, v1.21) 전용 상시 서버. `service/backend`
(Lambda)의 `clients/cms_posts_pg_client.py`+`services/cms_posts_shaping.py`
를 FastAPI+psycopg2 커넥션 풀로 포팅한 것 — Lambda+RDS 조합(호출마다
새 커넥션, VPC 붙이면 NAT/엔드포인트 필요)의 근본 문제를 피하기 위해
v1.20에서 신설했고, v1.21에서 admin의 DynamoDB 쓰기 경로까지 이쪽으로
옮겨 읽기·쓰기 동기화 버그를 해소했다. 배경·경위는
`docs/architecture/db-changelog/postgres/v1.20-상시서버-실전환.md`,
`v1.21-admin-쓰기-전환.md` 참조.

## 배포 대상

EC2 `lens-cms-api-prod`(`i-0e3d04bdb01584833`, RDS와 같은 VPC), PM2로
상시 구동, Nginx가 80→8000 리버스 프록시(`nginx.conf` 참조).
`ailens.sedaily.ai`를 서빙하는 CloudFront(`E1QS7PY350VHF6`)에
`/api/v2/posts*` cache behavior로 연결돼 있다. `/admin/posts*`는 아직
이 CloudFront를 안 거치고 EC2 공인 IP:80으로 평문 HTTP 직접 호출
(admin Lambda가 호출) — HTTPS화는 TODO.

## 로컬 구조

- `main.py` — FastAPI 앱. `/api/v2/posts*`(공개, `handlers/
  cms_posts_public.py`의 Lambda 버전과 계약 동일) + `/admin/posts*`
  (v1.21 신설, `X-Internal-Token` 공유 시크릿으로 보호)
- `db.py` — psycopg2 `ThreadedConnectionPool`
- `cms_posts_repo.py` — 공개 조회 쿼리·로직(`cms_posts_pg_client.py` 포팅)
- `admin_posts_repo.py` — admin 쓰기 CRUD(v1.21 신설). admin_extra
  JSONB가 진실의 원천, renditions 등은 공개 읽기용 파생 프로젝션
- `cms_posts_shaping.py` — 채널별 응답 shaping(Lambda 버전과 완전 동일,
  그대로 복사)
- `ecosystem.config.js` — PM2 프로세스 정의(비밀번호·내부 토큰은
  서버에만 직접 주입)
- `nginx.conf` — 80→8000 리버스 프록시(health/api/v2/posts/admin/posts
  3개 location)
- `provision.sh` — 최초 프로비저닝 스크립트(패키지·venv·nginx·PM2 설정,
  `/admin/posts` location은 아직 반영 안 됨 — 최초 셋업 후 nginx.conf로
  갱신 필요)

## 재배포

```
# 로컬에서 파일 변경 후, EC2로 복사(scp 또는 SSM)
# /opt/lens-cms-api/ 아래 덮어쓰기
pm2 restart lens-cms-api --update-env
```

Lambda 쪽 `clients/cms_posts_pg_client.py`와 쿼리 로직이 갈라지지 않도록,
스키마·쿼리를 바꿀 땐 두 곳 다 같이 고칠 것(`cms_posts_pg_client.py`는
`CMS_DB_BACKEND=postgres`가 켜지면 여전히 쓰일 수 있는 dormant 코드로
남아있다). `admin_posts_repo.py`는 admin/backend가 유일한 소비자라
그런 쌍둥이 파일이 없다.
