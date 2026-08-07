import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR 전환(2026-08-08, EC2+PM2+nginx) — admin 발행이 재빌드 없이 즉시
  // 반영되려면 매 요청마다 서버가 렌더링해야 한다. 정적 export였던 이전
  // 방식은 docs/archive/ 또는 git 히스토리에서 output:"export" 커밋 참조.
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
