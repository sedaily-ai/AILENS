"""v1/v2/admin 전부가 공유하는 극소수 상수.

common/ 은 service/backend 자체 zip과 admin/backend 의 zip(admin/backend/
deploy-admin-api.sh 가 service/backend/common/ 을 통째로 복사) 양쪽에 다 들어간다 —
두 Lambda 패키지에서 똑같이 써야 하는 값만 여기 둔다.
"""
import os

# 프런트엔드 배포 도메인. service/frontend 쪽 동등 상수는
# shared/constants/site.ts — 두 레포는 별도 배포 단위라 값을 소스 레벨에서
# 공유할 수 없으니 바뀌면 양쪽 다 고친다.
SITE_URL = os.environ.get("SITE_URL", "https://ailens.sedaily.ai")
