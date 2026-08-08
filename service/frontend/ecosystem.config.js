// PM2 설정 — EC2(SSR, 2026-08-08)에서 `.next/standalone` 서버를 구동한다.
// 배포 절차: /opt/ailens/releases/<timestamp>/ 에 standalone+static+public 을
// 풀고 current 심볼릭 링크를 그 릴리스로 갱신한 뒤 `pm2 reload`(무중단).
// cwd 는 release 디렉터리가 아니라 항상 `current` 심볼릭 링크를 가리켜야
// 새 릴리스로 갈아탈 때 이 파일을 안 건드리고 reload 만으로 끝난다.
//
// instances:1(fork 모드, 2026-08-08) — 원래 2(cluster)였는데, SSE(GET
// /api/events) + 캐시 무효화(POST /api/revalidate, revalidateTag())를 도입하며
// 낮췄다. cluster 모드는 워커 프로세스마다 메모리가 분리돼 있어 (a) 프로세스
// A가 revalidateTag()로 지운 캐시가 프로세스 B에는 안 지워지고, (b) 프로세스
// A에서 발생한 SSE 이벤트가 프로세스 B에 붙은 클라이언트에는 전달이 안 된다
// — Redis 같은 외부 pub/sub 없인 정합성이 깨진다. 이 규모(WAU 목표 1,000+)에서
// 그 인프라를 새로 놓기보다 단일 프로세스로 단순화하는 쪽을 택함. 대가는
// zero-downtime reload를 잃는 것(배포 시 수백ms~1초 재시작 blip) — 배포가
// 드물고 수동이라 감수 가능하다고 판단.
module.exports = {
  apps: [
    {
      name: 'ailens-frontend',
      script: 'server.js',
      cwd: '/opt/ailens/current',
      instances: 1,
      exec_mode: 'fork',
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
