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
