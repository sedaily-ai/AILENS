import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR 모드: admin 발행이 재빌드 없이 즉시 반영되려면 매 요청마다 서버가 렌더링해야 한다.
  output: "standalone",
  // 트레이싱 루트를 이 앱 폴더로 고정한다. 제거하면 배포가 깨진다.
  // 값이 없으면 Next가 lockfile을 찾아 위로 올라가며 워크스페이스 루트를 추론하므로, 상위 디렉터리에 lockfile이 있는 환경에서는
  // standalone 산출물이 그 루트부터의 경로를 중첩해 `.next/standalone/<중첩 경로>/service/frontend/server.js`가 된다.
  // deploy.sh는 `.next/standalone/server.js`가 없으면 배포를 중단하므로 빌드는 성공해도 배포가 막힌다
  // (빌드 로그의 "inferred your workspace root ... may not be correct" 경고가 신호다).
  // 레포 루트로 잡아도 산출물이 한 단계 깊어지므로, 앱 폴더로 고정해야 산출물이 평평하고 머신별 lockfile 배치와 무관해진다.
  outputFileTracingRoot: path.join(__dirname),
  // 로컬 dev 전용. 레포 경로에 한글이 섞여 있으면(회사/서울경제신문/...) Turbopack이 루트를 상위로 추론할 때
  // "start byte index N is not a char boundary" TurbopackInternalError로 죽는다.
  // root를 이 앱 폴더로 고정하면 식별자가 ASCII(src/...) 상대경로로만 남아 패닉을 피한다(admin/frontend와 동일 조치).
  turbopack: { root: path.join(__dirname) },
  // ISR 페이지의 Cache-Control `stale-while-revalidate` 길이. 기본값은 약 1년이라, 방문자가 적은 사이트에서는
  // CloudFront가 만료된 낡은 HTML을 먼저 보여 주고 뒤에서 갱신하는 경로를 자주 타 첫 방문자가 오래된 화면을 본다.
  // 600초면 s-maxage(홈 300초) + 낡은 채로 허용 300초 = 최대 10분 안에는 새 HTML을 받는다. 원본 재생성 주기·SEO에는 영향이 없다.
  expireTime: 600,
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // [slug] page.tsx들은 generateStaticParams로 <Link> 프리페치가 켜져 있으나, staleTimes를 정하지 않으면 Next 기본값이
    // 보수적이라 프리페치한 데이터가 있어도 클릭 시 재요청한다. 이 값은 브라우저 세션 내 클라이언트 캐시 유지 시간이며,
    // admin 발행 즉시 반영은 서버 fetch revalidate(60~300초)와 CloudFront 60초 캐시가 별도로 담당한다.
    staleTimes: { dynamic: 30, static: 180 },
  },
  // 이미지 최적화. Docker(linux/arm64)에서 빌드해 Fargate로 배포하므로 sharp가 맞는 바이너리로 설치된다.
  // 이미지 서버(서울경제 wimg, 우리 S3 미디어 버킷, 유튜브 썸네일)가 크기 변환을 지원하지 않아 작은 썸네일 칸에도
  // 원본을 받게 되므로, Next 내장 최적화(/_next/image: 필요한 폭으로 줄이고 WebP 변환)를 쓴다.
  // 허용 호스트 밖 이미지는 변환이 거부되므로 새 이미지 호스트를 쓰는 컴포넌트가 생기면 여기에 추가한다.
  // 커스텀 loader를 쓰면 내장 /_next/image 엔드포인트가 꺼져 404가 되므로 기본 로더를 쓴다.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'wimg.sedaily.com' },
      { protocol: 'https', hostname: 'sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
    formats: ['image/webp'],
    qualities: [75, 85], // 75 = 기본, 85 = 웹툰 컷(글자가 많아 조금 더 높게)
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1600],
    imageSizes: [40, 72, 96, 132, 160, 200, 256, 320],
    // 변환 결과를 하루 캐시 — CloudFront가 /_next/image를 같은 키로 캐시하면 서버는 같은 변환을 반복하지 않는다.
    minimumCacheTTL: 86400,
  },
  // 사주는 별도 서비스(saju.sedaily.ai)다. 옛 /fortune·/saju-match 링크·북마크는 그쪽으로 보낸다.
  async redirects() {
    // /lens?page=N, /webtoon?page=N 옛 링크 정리는 has+쿼리 대신 src/middleware.ts에서 한다
    // (redirects()+has 조합은 destination에 캡처값을 써도 원본 쿼리스트링을 지우지 못해 "/lens/page/2?page=2" 같은 URL이 된다).
    const rules: Array<{ source: string; destination: string; permanent: boolean }> = [
      { source: "/fortune", destination: "https://saju.sedaily.ai", permanent: true },
      { source: "/fortune/:path*", destination: "https://saju.sedaily.ai", permanent: true },
      { source: "/saju-match", destination: "https://saju.sedaily.ai", permanent: true },
      { source: "/saju-match/:path*", destination: "https://saju.sedaily.ai", permanent: true },
      // 폐기된 아카이브(/trend)는 /lens로 보낸다.
      { source: "/trend", destination: "/lens", permanent: true },
      { source: "/trend/:path*", destination: "/lens", permanent: true },
      // /letters, /column, /issue-talk 아카이브 목록은 폐기되어 /lens로 보낸다.
      // /letters/{id}·/letters/view 상세 라우트는 유지하므로 /letters/:path*는 만들지 않는다.
      { source: "/letters", destination: "/lens", permanent: true },
      { source: "/column", destination: "/lens", permanent: true },
      { source: "/issue-talk", destination: "/lens", permanent: true },
      // 폐기된 "재테크"(/investing) 카테고리. sitemap으로 색인됐을 수 있어 404 대신 리다이렉트한다.
      { source: "/investing", destination: "/lens", permanent: true },
      // /archive도 색인됐을 수 있어 404 대신 영구 리다이렉트한다.
      { source: "/archive", destination: "/lens", permanent: true },
      // 웹툰·영상·오디오 목록 페이지는 같은 기사의 형식 탭과 중복이라 폐기하고 /lens로 모은다.
      // 개별 상세(/webtoon/{slug}, /video/{slug}, /listen/{slug}, /webtoon/series/{slug})는 색인·공유 링크가 있어 유지한다.
      { source: "/webtoon", destination: "/lens", permanent: true },
      { source: "/webtoon/all", destination: "/lens", permanent: true },
      { source: "/webtoon/page/:n", destination: "/lens", permanent: true },
      { source: "/video", destination: "/lens", permanent: true },
      { source: "/video/page/:n", destination: "/lens", permanent: true },
      { source: "/listen", destination: "/lens", permanent: true },
      { source: "/listen/page/:n", destination: "/lens", permanent: true },
      // /lens/:slug → /:slug 리다이렉트는 두지 않는다. 카테고리를 알아야 정본 주소로 한 번에(308) 보낼 수 있어
      // 설정 파일이 아니라 app/(content)/lens/[slug]/page.tsx 라우트에서 처리한다. /lens·/lens/page/:n은 그대로 유지한다.
    ];
    return rules;
  },
};

export default nextConfig;
