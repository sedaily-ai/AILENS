// PM2 프로세스 정의 — lens-cms-api 전용 EC2(단독, 다른 서비스와 공유 안 함)
//
// ⚠️ LENS_PG_PASSWORD/ADMIN_INTERNAL_TOKEN은 이 파일(git 추적)에 넣지
// 않는다 — 서버 전용 /etc/lens-cms-api.env로 공급한다. deploy.sh는
// 기존 서버 ecosystem.config.js를 덮어쓰지 않고 --update-env로 갱신한다.
// ADMIN_INTERNAL_TOKEN 값은 SSM SecureString
// /sedaily-mbti/admin/lens-cms-api-token 에 같은 값이 저장돼 있다
// (admin/backend/repo/posts_repo.py가 이 파라미터를 읽어 요청 헤더에 싣는다).
module.exports = {
  apps: [
    {
      name: 'lens-cms-api',
      cwd: '/opt/lens-cms-api',
      script: '/opt/lens-cms-api/venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000 --workers 2',
      interpreter: 'none',
      instances: 1,
      max_memory_restart: '400M',
      time: true,
      env: {
        LENS_PG_HOST: 'lens-postgres-migration-dev.cluster-c83iuyksky7r.us-east-1.rds.amazonaws.com',
        LENS_PG_DATABASE: 'lens',
        LENS_PG_USER: 'lens_service_app',
        // LENS_PG_PASSWORD: '<서버에만 직접 추가>',
        // ADMIN_INTERNAL_TOKEN: '<서버에만 직접 추가, SSM 파라미터와 동일 값>',
      },
    },
  ],
}
