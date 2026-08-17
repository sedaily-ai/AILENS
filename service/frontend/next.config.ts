import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR 전환(2026-08-08, EC2+PM2+nginx) — admin 발행이 재빌드 없이 즉시
  // 반영되려면 매 요청마다 서버가 렌더링해야 한다. 정적 export였던 이전
  // 방식은 docs/archive/ 또는 git 히스토리에서 output:"export" 커밋 참조.
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // 사주(saju/frontend)를 완전히 독립된 Next 앱으로 분리(2026-08-15) —
  // 프로덕션에선 CloudFront가 엣지에서 /saju*를 별도 origin으로 바로
  // 보낸다(이 서버까지 안 옴, docs/worklog/2026-08/2026-08-09-saju-cdn-mount.md).
  //
  // 로컬 dev에서는 rewrites()로 안 보이게 프록시하는 걸 먼저 시도했는데,
  // AILENS(trailingSlash 기본값 false)와 saju/frontend(trailingSlash:true,
  // CDN 함수 때문에 필요)가 서로 반대 방향으로 트레일링 슬래시를 추가/제거하려
  // 들면서 rewrites()로 감싼 응답이 308 무한 루프에 빠졌다(로그로 saju 서버에
  // 요청 자체가 전혀 안 들어가는 것까지 확인 — 원인이 AILENS 쪽 자체 리다이렉트
  // 처리였다). 이 Next 버전은 이런 rewrite-to-external-url + trailingSlash
  // 조합에서 여러 엣지케이스가 있어(admin/frontend/AGENTS.md의 "이 버전은
  // breaking change가 있다" 경고와 일치) 안 보이는 프록시 대신 아래
  // redirects()에 합쳐서 명시적 redirect로 처리한다 — 로컬 dev에서만 URL이
  // localhost:3010으로 실제로 바뀌는 트레이드오프를 감수(개발 환경이라
  // 문제없음, 프로덕션은 CDN이라 이 규칙 자체가 도달 안 함).
  // next/image 컴포넌트 도입(2026-08-13, 속도 개선) — 단 서버 측 리사이즈/포맷
  // 변환(/​_next/image, sharp 필요)은 켜지 않는다: 이 앱은 로컬(macOS)에서
  // standalone 빌드해 EC2(Linux)로 그대로 올리는 구조라 node_modules/sharp가
  // sharp-darwin-arm64 바이너리로 트레이싱돼 EC2에서 로드가 안 된다 — 이미
  // WebtoonListClient.tsx 포스터 이미지에서 2026-08-11에 같은 문제로 next/image를
  // 포기하고 정적 webp로 대체한 전례가 있다(SSM으로 재확인, 2026-08-13). 대신
  // unoptimized: true로 sharp 없이도 next/image의 다른 이점(명시적 width/height로
  // CLS 방지, priority로 LCP 이미지 preload)만 취한다 — 리사이즈/차세대 포맷
  // 변환은 이 배포 구조를 CI 기반으로 바꾸기 전까진 보류.
  images: {
    unoptimized: true,
  },
  // 사주 기능이 외부 CDN 마운트(/saju*, AI-saju 별도 서비스)로 옮겨간 뒤
  // (2026-05, 2026-08-09) /fortune·/saju-match는 이 Next.js 앱에 더는 없는
  // 라우트다 — 옛 링크·북마크로 들어온 사람이 404를 만나던 걸 발견(2026-08-11)
  // 하고 새 위치로 리다이렉트 추가. /saju* 자체는 CloudFront가 이 앱을
  // 건너뛰고 외부 origin으로 바로 보내므로, 여기서 만든 리다이렉트 응답도
  // 브라우저가 다시 /saju로 요청하면 정상적으로 그쪽에서 처리된다.
  async redirects() {
    const rules: Array<{ source: string; destination: string; permanent: boolean }> = [
      { source: "/fortune", destination: "/saju", permanent: true },
      { source: "/fortune/:path*", destination: "/saju", permanent: true },
      { source: "/saju-match", destination: "/saju", permanent: true },
      { source: "/saju-match/:path*", destination: "/saju", permanent: true },
      // "딥다이브"(/trend) 아카이브 폐기(2026-08-17) — "이슈 톡톡"과 독자
      // 입장에서 구분이 안 된다는 판단으로 홈 섹션·아카이브를 통합했다.
      // 검색엔진에 이미 색인된 /trend URL·기존 북마크/공유 링크가 404를
      // 만나지 않도록 영구 리다이렉트.
      { source: "/trend", destination: "/issue-talk", permanent: true },
      { source: "/trend/:path*", destination: "/issue-talk", permanent: true },
    ];
    if (process.env.SAJU_ORIGIN) {
      const origin = process.env.SAJU_ORIGIN;
      rules.push(
        { source: "/saju", destination: `${origin}/saju`, permanent: false },
        { source: "/saju/:path*", destination: `${origin}/saju/:path*`, permanent: false },
      );
    }
    return rules;
  },
};

export default nextConfig;
