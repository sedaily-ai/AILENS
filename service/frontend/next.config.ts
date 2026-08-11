import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR 전환(2026-08-08, EC2+PM2+nginx) — admin 발행이 재빌드 없이 즉시
  // 반영되려면 매 요청마다 서버가 렌더링해야 한다. 정적 export였던 이전
  // 방식은 docs/archive/ 또는 git 히스토리에서 output:"export" 커밋 참조.
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // 사주 기능이 외부 CDN 마운트(/saju*, AI-saju 별도 서비스)로 옮겨간 뒤
  // (2026-05, 2026-08-09) /fortune·/saju-match는 이 Next.js 앱에 더는 없는
  // 라우트다 — 옛 링크·북마크로 들어온 사람이 404를 만나던 걸 발견(2026-08-11)
  // 하고 새 위치로 리다이렉트 추가. /saju* 자체는 CloudFront가 이 앱을
  // 건너뛰고 외부 origin으로 바로 보내므로, 여기서 만든 리다이렉트 응답도
  // 브라우저가 다시 /saju로 요청하면 정상적으로 그쪽에서 처리된다.
  async redirects() {
    return [
      { source: "/fortune", destination: "/saju", permanent: true },
      { source: "/fortune/:path*", destination: "/saju", permanent: true },
      { source: "/saju-match", destination: "/saju", permanent: true },
      { source: "/saju-match/:path*", destination: "/saju", permanent: true },
    ];
  },
};

export default nextConfig;
