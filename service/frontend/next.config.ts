import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR 전환(2026-08-08, EC2+PM2+nginx) — admin 발행이 재빌드 없이 즉시
  // 반영되려면 매 요청마다 서버가 렌더링해야 한다. 정적 export였던 이전
  // 방식은 docs/archive/ 또는 git 히스토리에서 output:"export" 커밋 참조.
  output: "standalone",
  // 트레이싱 루트를 이 앱 폴더로 **고정**한다(2026-08-25). 지우면 배포가 깨진다.
  //
  // 이 값이 없으면 Next 가 lockfile 을 찾아 위로 올라가며 워크스페이스 루트를
  // 추론한다. 이 개발 환경에는 `C:\Users\<사용자>\package-lock.json` 이 있어서
  // 루트가 **홈 디렉터리**로 잡혔고, standalone 산출물이 그 루트부터의 경로를
  // 그대로 중첩해서 이렇게 나왔다:
  //
  //   .next/standalone/OneDrive/바탕 화면/민영/anbambi/s-e-n/AILENS/service/frontend/server.js
  //
  // deploy.sh 는 `.next/standalone/server.js` 를 검사해서 없으면 배포를
  // 중단하므로(그 스크립트 1/5 단계 직후) 빌드는 성공하는데 배포가 막혔다.
  // 빌드 로그의 "inferred your workspace root ... may not be correct" 경고가
  // 바로 이 신호였다.
  //
  // 2026-08-14 에 이 값을 **레포 루트**로 넓혔다가 산출물이 한 단계 깊어져
  // (.next/standalone/service/frontend/) 같은 문제를 겪고 2026-08-15 에 값을
  // 아예 제거했는데, 제거하면 위처럼 추론에 맡겨져 환경에 따라 달라진다.
  // 앱 폴더로 고정하는 것이 두 실패를 다 막는다 — 산출물이 평평해지고,
  // 다른 사람 머신의 lockfile 배치와 무관해진다.
  outputFileTracingRoot: path.join(__dirname),
  // 로컬 dev 전용 — 레포 경로에 한글이 섞여 있어(회사/서울경제신문/...) Turbopack이
  // 루트 추론을 상위로 올리면 "start byte index N is not a char boundary"
  // TurbopackInternalError로 죽는다. root를 이 앱 폴더로 고정하면 식별자가
  // ASCII(src/...) 상대경로로만 남아 패닉을 피한다(admin/frontend와 동일 조치).
  turbopack: { root: path.join(__dirname) },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // 2026-08-23, "바로바로 이동되면 좋겠다" 요청 — [slug] page.tsx들이
    // generateStaticParams로 <Link> 프리페치는 이미 켜뒀는데, staleTimes를
    // 안 정해두면 Next 기본값이 보수적이라 프리페치해둔 데이터를 두고도
    // 클릭 시 재요청하는 경우가 있다. 이 값만큼은 "이미 받아둔 걸 그냥
    // 써도 되는 시간"으로 인정 — admin 발행 즉시반영은 서버 쪽 fetch
    // revalidate(60~300초)·CloudFront 60초 캐시가 별도로 담당하므로
    // 이 값과 무관하다(이건 브라우저 세션 내 클라이언트 캐시일 뿐).
    staleTimes: { dynamic: 30, static: 180 },
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
    // /lens?page=N, /webtoon?page=N 옛 링크 정리는 여기(has+쿼리) 대신
    // src/middleware.ts에서 한다 — Next의 redirects()+has 조합은 destination
    // 에 캡처값을 써도 원본 쿼리스트링을 지우지 못해 "/lens/page/2?page=2"
    // 처럼 지저분한 URL이 됐다(미들웨어 파일 상단 주석 참조).
    const rules: Array<{ source: string; destination: string; permanent: boolean }> = [
      { source: "/fortune", destination: "/saju", permanent: true },
      { source: "/fortune/:path*", destination: "/saju", permanent: true },
      { source: "/saju-match", destination: "/saju", permanent: true },
      { source: "/saju-match/:path*", destination: "/saju", permanent: true },
      // 2026-09-29 — "/archive(형식별 진입 디렉토리)도 /lens와 겹치니 지워도
      // 된다, 전부 /lens로 가게 하라"는 요청으로 /archive 자체를 폐기하고
      // 여기로 모이던 리다이렉트를 전부 /lens로 재조준. /archive에 nav
      // 진입점이 없었고(헤더에 링크된 적 없음) 웹툰/영상/오디오는 이미
      // 각자 독립 탭이 있어 "형식별 허브"로서 실질 가치가 없었다.
      // "딥다이브"(/trend) 아카이브 폐기(2026-08-17) — 처음엔 "이슈 톡톡"
      // 하나로 흡수해 /issue-talk로 보냈는데, 2026-08-19에 "분류"(형식) 축
      // 자체가 카테고리(주제)로 완전히 대체되면서 /issue-talk도 같이
      // 퇴역했다.
      { source: "/trend", destination: "/lens", permanent: true },
      { source: "/trend/:path*", destination: "/lens", permanent: true },
      // /letters, /column, /issue-talk 아카이브 목록 페이지 전부 폐기
      // (마지막으로 남아있던 /issue-talk은 2026-08-19) — 2026-08-17 상단
      // 탭 개편 이후 형식(브리핑/인사이트/이슈톡톡) 기준 대신 주제(증시/
      // 부동산/산업 등 6개 경제 카테고리) 기준으로 완전히 넘어갔다. 세
      // 페이지 다 그 뒤로 사이트 안 어디서도 링크되지 않는 채로 URL만
      // 살아있었다.
      // ⚠️ /letters/:path* 는 만들지 않는다 — /letters/{id}(개별 레터
      // 상세)·/letters/view 는 지금도 정상 사용 중인 라우트라 그대로 둔다.
      { source: "/letters", destination: "/lens", permanent: true },
      { source: "/column", destination: "/lens", permanent: true },
      { source: "/issue-talk", destination: "/lens", permanent: true },
      // "재테크"(/investing) 카테고리 폐기(2026-09-11) — 원문 최상위
      // 카테고리에 대응 태그가 없어 처음부터 계속 0건이었다(사용자 신고).
      // sitemap에 2026-08-17부터 올라가 있어 구글에 이미 색인됐을 수
      // 있으니 맨 404 대신 리다이렉트로 보낸다.
      { source: "/investing", destination: "/lens", permanent: true },
      // /archive 자체도 sitemap에 2026-08-11부터 올라가 있어 색인됐을 수
      // 있다 — 404 대신 영구 리다이렉트.
      { source: "/archive", destination: "/lens", permanent: true },
      // 2026-09-30 — 기사 상세 URL에서 /lens/ 프리픽스 제거 요청("바로
      // /증시 /부동산처럼 가는 게 깔끔하다"). /lens(목록 허브)·
      // /lens/page/:n(페이지네이션)은 그대로 둔다 — :slug는 정확히 한
      // 세그먼트만 매칭해서 이 둘과 안 겹친다. 기존에 색인·공유된
      // /lens/{slug} 링크가 깨지지 않도록 새 루트 경로(/{slug})로 영구
      // 리다이렉트.
      // /lens/:slug -> /:slug 는 걷어냈다(2026-10-01) — 두 번 이동(옛 주소 -> 평면 주소 -> 정본)하던 걸 app/(content)/lens/[slug]/page.tsx가
      // 정본 주소로 한 번에(308) 보낸다. 카테고리를 알아야 해서 설정 파일이 아니라 라우트에서 처리한다.
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
