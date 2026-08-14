import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 독립 배포(원래 saju.sedaily.ai) 시절 방식 복원 — AILENS 안에 vendoring됐던
  // 동안엔 이 앱 전체에 영향 주지 않으려고 basePath 없이 코드에 /saju를 직접
  // 하드코딩했었다(2026-08-14). 이제 완전히 독립된 Next 앱이라 basePath로
  // 되돌린다.
  basePath: "/saju",
  output: "export",
  // CloudFront Function sedaily-rewrite-subdir-index(AILENS CDN 마운트가
  // 재사용 중)가 확장자 없는 경로를 항상 `<path>/index.html`로 재작성한다 —
  // 이건 trailingSlash:true 빌드(route/index.html 구조)를 전제로 만들어진
  // 함수라, 기본값(route.html 플랫 파일)으로 export하면 중첩 라우트가 전부
  // CDN에서 404난다(로컬 next dev/export 서버는 이 재작성을 거치지 않아서
  // 로컬 테스트에서는 안 걸렸다). CDN 함수를 새로 바꾸는 대신 여기서 맞춘다.
  trailingSlash: true,
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
