import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // SSR 전환(2026-08-08, EC2+PM2+nginx) — admin 발행이 재빌드 없이 즉시
  // 반영되려면 매 요청마다 서버가 렌더링해야 한다. 정적 export였던 이전
  // 방식은 docs/archive/ 또는 git 히스토리에서 output:"export" 커밋 참조.
  output: "standalone",
  // /saju 라우트의 실제 코드(features/shared/widgets)는 이 프로젝트 밖
  // ../../saju/frontend/ 에 산다(2026-08-14, 모노레포 스타일 정리 —
  // service/frontend/src/app/saju/ 안에는 라우트 파일만 남기고, 실제 로직은
  // saju/backend/ 와 나란히 최상위 saju/frontend/ 에 둠). output:"standalone"
  // 빌드가 파일 트레이싱할 때 프로젝트 루트 밖 파일도 포함하도록 트레이싱
  // 루트를 dev2 레포 루트로 넓힌다 — 안 하면 EC2 standalone 산출물에
  // saju/frontend/ 코드가 안 들어가 런타임에 모듈을 못 찾는다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
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
    return [
      { source: "/fortune", destination: "/saju", permanent: true },
      { source: "/fortune/:path*", destination: "/saju", permanent: true },
      { source: "/saju-match", destination: "/saju", permanent: true },
      { source: "/saju-match/:path*", destination: "/saju", permanent: true },
    ];
  },
};

export default nextConfig;
