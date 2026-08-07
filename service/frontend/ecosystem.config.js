// PM2 설정 — EC2(SSR, 2026-08-08)에서 `.next/standalone` 서버를 구동한다.
// 배포 절차: /opt/ailens/releases/<timestamp>/ 에 standalone+static+public 을
// 풀고 current 심볼릭 링크를 그 릴리스로 갱신한 뒤 `pm2 reload`(무중단).
// cwd 는 release 디렉터리가 아니라 항상 `current` 심볼릭 링크를 가리켜야
// 새 릴리스로 갈아탈 때 이 파일을 안 건드리고 reload 만으로 끝난다.
module.exports = {
  apps: [
    {
      name: 'ailens-frontend',
      script: 'server.js',
      cwd: '/opt/ailens/current',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '127.0.0.1',
      },
      max_memory_restart: '400M',
      autorestart: true,
    },
  ],
};
