import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 독립 배포(원래 saju.sedaily.ai) 시절 방식 복원 — AILENS 안에 vendoring됐던
  // 동안엔 이 앱 전체에 영향 주지 않으려고 basePath 없이 코드에 /saju를 직접
  // 하드코딩했었다(2026-08-14). 이제 완전히 독립된 Next 앱이라 basePath로
  // 되돌린다.
  basePath: "/saju",
  output: "export",
  images: {
    unoptimized: true,
  },
  // admin/frontend와 동일한 이유로 필요 — 한글이 포함된 레포 경로에서
  // Turbopack이 워크스페이스 루트를 잘못 추론해 패닉하는 문제 방지.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
