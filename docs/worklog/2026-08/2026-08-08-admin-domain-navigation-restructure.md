# 2026-08-08 관리자 콘솔 — 도메인 전환·뒤로가기 버그·폴더 재구조화

작성: Claude Code
관련: `docs/architecture/admin-stack.md`(본 세션에서 갱신)

## 배경

같은 날 진행 중이던 SEO/E-E-A-T 작업(`2026-08-08-eeat-footer-legal-pages-security-headers.md`)
과는 별개로, 사용자가 관리자 콘솔 쪽 요청 세 가지를 이어서 주었다: (1) 관리자 도메인이
"어렵다"며 교체 요청, (2) 목록에서 글 하나 열었다가 뒤로가기 하면 필터가 리셋되는
UX 버그, (3) 저장소에서 admin 프론트엔드/백엔드 위치가 흩어져 있는 걸 정리해달라는
요청. 셋 다 실제 코드/인프라 변경이라 하나의 worklog로 묶는다.

## 한 것

### 1. 관리자 도메인 mbti-admin.sedaily.ai → lensdb.sedaily.ai

사용자가 "mbti-admin.sedaily.ai는 어렵다"며 `lensdb.sedaily.ai`로 교체 요청. 확인해보니
`lensdb.sedaily.ai`는 CloudFront alias·인증서(`*.sedaily.ai` 와일드카드)·Route53·API
Gateway CORS까지 이미 전부 준비돼 있었다(이전 세션에서 미리 해둔 것으로 보임) — 실제
접속도 200으로 정상 확인. `mbti-admin.sedaily.ai`는 사용자 확인 후 완전 삭제:
- Route53(`Z07543813V4FC5RK599U0`) A/AAAA 레코드 삭제.
- CloudFront(`E1MITYI58DB9UW`) Aliases에서 제거(`ailens-admin.sedaily.ai`, `lensdb.sedaily.ai`만 남김).
- API Gateway(`chzwwtjtgk`) CORS AllowOrigins에서 `mbti.sedaily.ai`(프론트, 전날 이미
  폐기됐던 도메인의 CORS 잔여물)와 `mbti-admin.sedaily.ai` 둘 다 제거.
- 로그인 페이지에 하드코딩돼 있던 도메인 텍스트, 배포 스크립트 안내 메시지 수정.
- `curl`로 `mbti-admin.sedaily.ai` 연결 실패(예상대로), `lensdb.sedaily.ai` 200 확인.

### 2. 목록 → 편집 → 뒤로가기 시 필터 초기화 버그

사용자 리포트: "레터 탭 누르고 글 클릭해서 들어갔다가 뒤로가기 하면 처음 화면(전체 탭)
으로 돌아간다". 코드 확인 결과 `letters/page.tsx`의 날짜 필터, `posts/page.tsx`의
상태·채널·날짜범위·페이지 필터가 전부 **URL이 아니라 React state에만** 있었다 —
`/posts/edit?id=...`로 이동했다가 뒤로가기 하면 `/posts`(쿼리 없음)로 돌아가 컴포넌트가
새로 마운트되며 필터가 초기값("전체", 1페이지)으로 리셋됐다. 게다가 각 편집 페이지의
"← 목록" 버튼도 `<Link href="/posts">` 처럼 고정 링크라, 브라우저 뒤로가기가 아니라 그
버튼을 눌러도 똑같이 리셋됐다.

수정:
- `letters/page.tsx`, `posts/page.tsx`: 필터·페이지 상태를 `useSearchParams()`로 초기화하고
  변경 시 `router.replace()`로 URL에 동기화(`?status=&channel=&from=&to=&page=` 등).
  `router.push`가 아니라 `replace`를 써서 필터를 만질 때마다 히스토리가 쌓이지 않게 함.
  `output: 'export'` + `useSearchParams()` 조합이라 `<Suspense>` 래핑 필수(기존
  `posts/edit`/`prompts/edit` 패턴과 동일).
- `letters/edit/page.tsx`, `posts/edit/page.tsx`: "← 목록" 고정 링크와 삭제 후 이동을
  전부 `router.back()`으로 교체 — 브라우저 뒤로가기와 동일하게 동작.
- `prompts/page.tsx`는 필터 자체가 없는 단순 목록이라 해당 없음.

### 3. admin/ 저장소 재구조화 — frontend/ + backend/ 로 통합

이전까지 관리자 프론트엔드(`admin/`, 저장소 최상위)와 백엔드(`service/backend/admin/`)가
서로 다른 위치에 있어 메인 서비스의 `service/frontend/` + `service/backend/` 짝과
어긋나 있었다. 사용자 요청으로 `admin/frontend/` + `admin/backend/` 로 통합.

**주의점**: `admin/backend/`(구 `service/backend/admin/`)의 `shared/response.py`,
`shared/pg_client.py`가 `from common import http` / `from common.secrets import
get_pg_password`로 **`service/backend/common/`**(v1/v2/admin이 공유하는 유틸)을 참조하고
있었다 — `common/`은 admin 전용이 아니라 v1/v2도 같이 쓰는 진짜 공유 코드라 옮기지 않고
`service/backend/common/`에 그대로 뒀다. 대신:
- `admin/backend/deploy-admin-api.sh`: 스크립트 자신의 위치를 `SCRIPT_DIR`로 계산하고,
  `COMMON_DIR="$SCRIPT_DIR/../../service/backend/common"`로 상대경로 참조하도록 수정.
  기존엔 "service/backend/에서 실행"을 전제로 상대경로를 썼는데, 이제 스크립트가 어느
  위치에서 호출되든(또는 `cd admin/backend && ./deploy-admin-api.sh`로 실행하든) 동작하게
  자기 위치 기준으로 재계산.
- `admin/backend/tests/conftest.py`: `admin/__init__.py` 존재로 pytest의 rootdir 자동탐색이
  이제 `admin/`(repo 최상위)에서 멈춰버려 `common`이 안 잡히는 문제 — `service/backend/`를
  `sys.path`에 명시적으로 추가(`parents[3] / "service" / "backend"`).
- `.gitignore`: `lambda-build-admin/`, `lambda_package_admin.zip` 패턴이 애초에 빠져있던
  걸 발견 — 이번 김에 추가(기존에 커밋된 적은 없었지만 안전장치로).
- 문서 갱신: 루트 `CLAUDE.md`, `service/backend/CLAUDE.md`, `docs/architecture/
  admin-stack.md`, `admin/frontend/CLAUDE.md`(상대경로 `../docs/...` → `../../docs/...`도
  같이 수정 — 한 단계 더 깊어졌으므로)의 `admin/`·`service/backend/admin/` 경로 참조를
  전부 갱신. 과거 결정 서술(커밋 해시, "왜 이렇게 했는지")은 역사적 기록이라 안 건드리고,
  현재 사실과 다른 경로만 고쳤다 — 문서 맨 위에 "⚠️ 폴더 이동(2026-08-08)" 노트를
  추가해 아래 본문의 낡은 경로를 어떻게 읽어야 하는지 안내.
- `service/frontend/CLAUDE.md`의 `admin/` 언급은 건드리지 않았다 — 그건 실제 최상위
  `admin/` 디렉터리가 아니라 FSD 목표 구조의 `pages/admin/` 슬라이스 이름을 가리키는
  별개 개념.

`git mv`로 이동해 히스토리(blame/log)가 보존됐다.

## 검증

- 위 뒤로가기 수정 후 `npm run build`(admin/frontend) + `npx eslint`(수정한 4개 파일만)
  — 정상, 에러 없음.
- 폴더 이동 후: `cd admin/frontend && npm run build` 정상(13 라우트 전부 생성).
  `python3 -m pytest admin/backend/tests -q`(repo 루트에서) — 135개 전부 통과, `common`
  import 정상 확인. `deploy-admin-api.sh`의 `COMMON_DIR` 경로를 수동으로 `cd`해서
  `service/backend/common/`을 정확히 가리키는지 확인, 스크립트가 참조하는 파일들
  (`handler.py`/`auth.py`/`routes/`/`shared/`/`repo/`/`requirements.txt`) 전부 존재
  확인(실제 pip install·AWS 배포는 안 돌림 — 그건 사용자가 실제 배포할 때 자연히 검증됨).
- `mbti-admin.sedaily.ai` curl 연결 실패, `lensdb.sedaily.ai` 200 확인.

## 다음

- `admin/backend/deploy-admin-api.sh`를 실제로 한 번 돌려서(진짜 배포) 새 경로 기준
  파이프라인이 끝까지 정상 동작하는지 확인 필요 — 이번 세션에선 경로 존재만 확인했고
  실제 zip 빌드·업로드·`update-function-code`는 안 돌렸다.
- Cognito User Pool `us-east-1_ZS8PgF3iX`가 `ResourceNotFoundException`을 반환했던 것
  (전날 worklog에 기록) — 아직 안 파봄, 로그인 기능 자체가 깨져있을 가능성 있음.
