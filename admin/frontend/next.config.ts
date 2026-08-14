import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // 프로젝트 경로에 한글(바탕 화면·민영)이 들어 있고, 상위에 lockfile 이 여러 개
  // 보이면 Turbopack 이 더 상위를 워크스페이스 루트로 잡는다. 그러면 청크 식별자
  // 계산에서 한글 경로 구간을 바이트 인덱스로 자르다 문자 경계를 어겨 패닉한다
  // ("start byte index 25 is not a char boundary" → TurbopackInternalError).
  // 루트를 admin/frontend 로 고정하면 식별자가 ASCII(src_...) 로만 남아 피한다.
  // npm 스크립트는 항상 admin/frontend 에서 실행되므로 process.cwd() 가 이 디렉터리다.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
