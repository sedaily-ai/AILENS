"""v1/v2/admin 전부가 공유하는 극소수 상수.

common/ 은 service/backend 자체 zip과 admin/backend 의 zip(admin/backend/
deploy-admin-api.sh 가 service/backend/common/ 을 통째로 복사) 양쪽에 다 들어간다 —
두 Lambda 패키지에서 똑같이 써야 하는 값만 여기 둔다.
"""
import os

# 프런트엔드 배포 도메인. service/frontend 의 shared/constants/site.ts 에 동등 상수가 있으며,
# 배포 단위가 별도이므로 값 변경 시 양쪽을 함께 수정해야 한다.
SITE_URL = os.environ.get("SITE_URL", "https://ailens.sedaily.ai")
