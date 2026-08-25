# service/frontend — AI LENS 공개 사이트

Next.js 16(App Router) — `ailens.sedaily.ai`. 아키텍처·FSD 레이어 규칙은
`CLAUDE.md`(이 폴더) 참조. 이 파일은 실행·배포만.

## 개발

```bash
npm run dev          # http://localhost:3000
npx tsc --noEmit      # 타입 체크
npx eslint <files>     # 린트 (next lint 아님 — package.json 참조)
npm run build          # 프로덕션 빌드(standalone)
```

### `dev`·`build`가 `--webpack`을 붙이는 이유

**지우지 말 것.** Next 16의 기본 번들러는 Turbopack인데, **경로에 한글(정확히는
non-ASCII)이 들어간 환경에서 Rust 패닉으로 죽는다.**

```
thread 'tokio-runtime-worker' panicked at turbopack-core/src/ident.rs:354:34:
start byte index 17 is not a char boundary; it is inside '화' (bytes 16..19)
of `OneDrive_바탕 화면_민영_anbambi_s-e-n_AILENS_service_frontend_src_...`
```

Turbopack이 경로로 모듈 식별자를 만들 때 문자열을 **바이트 인덱스로 자른다.**
UTF-8에서 한글은 3바이트라 자르는 위치가 글자 중간에 떨어지면 Rust의 문자열
슬라이싱이 패닉한다. 특정 파일 문제가 아니라 그 위치에 걸리는 아무 모듈에서나
난다. 한국에서 Windows를 쓰면 사용자명이 한글인 게 기본값에 가까워서, 새로
합류한 사람이 클론하고 첫 빌드를 하면 이걸 만난다.

`--webpack`으로 Turbopack을 피하면 정상 통과한다. 같은 이유로 `admin/frontend`,
`saju/frontend`도 같이 붙였다(세 앱 다 Next 16).

트레이드오프와 되돌릴 조건:

- Turbopack의 빌드 속도 이점을 버린다.
- `next build --experimental-analyze`는 Turbopack 전용이라 못 쓴다.
- Next가 webpack 지원을 걷어내면 이 우회가 막힌다. 16.2 시점에는
  `--webpack`이 `dev`·`build` 양쪽 정식 플래그이고 업그레이드 가이드에 폐기
  언급이 없다(2026-08-25 확인).
- **근본 해결은 빌드를 CI(Linux)로 옮기는 것이다.** 경로에 한글이 없으니
  Turbopack이 정상 동작하고, 로컬 macOS에서 빌드해 EC2(Linux)로 올리기 때문에
  생기는 네이티브 바이너리 문제(`next.config.ts`의 `images.unoptimized` 주석
  참조)도 같이 없어진다. 그때 이 플래그를 지우면 된다.

## 배포 — `./deploy.sh`

```bash
cd service/frontend
./deploy.sh
```

SSR(EC2 + PM2) 배포. 정적 export(S3+CloudFront)는 2026-08-08 이후 안 쓴다.

1. `npm run build`(standalone 출력)
2. `.next/standalone` + `.next/static` + `public`을 tar.gz로 묶음
3. S3(`ailens-ssr-releases`)에 업로드
4. SSM RunCommand로 EC2(`i-077eb96afcc2597d4`)에서 압축 해제 + 심볼릭 링크 전환
5. PM2(`ailens-frontend`) 재시작 (fork/1-instance라 재시작 중 수백ms~1초 blip 있음)
6. `https://ailens.sedaily.ai/` 헬스체크

전제: AWS credential 유효, EC2는 SSM 세션 매니저로만 접근(SSH 인바운드 없음,
`ailens-ssr-ec2-role`에 `AmazonSSMManagedInstanceCore`). EC2의
`.env.production.local`(REVALIDATE_SECRET 등)은 새 릴리스로 그대로
복사만 한다 — 이 스크립트가 시크릿 값 자체를 바꾸진 않는다.

발행 즉시 반영이 필요하면(파이프라인이 DDB에 직접 write하고 이 배포
스크립트를 안 거친 경우) `/api/revalidate` 웹훅을 직접 호출한다 —
`docs/worklog/2026-08` 최근 항목에 예시 있음.
