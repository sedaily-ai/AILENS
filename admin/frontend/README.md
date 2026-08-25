# admin/frontend — AI LENS 관리자 콘솔

Next.js — 프롬프트 드로어, CMS 글 수동 업로드/발행 등 운영자용 화면.

## 개발

```bash
npm run dev
```

`dev`·`build` 스크립트에 `--webpack`이 붙어 있다. **지우지 말 것** — Next 16의
기본 번들러 Turbopack이 경로에 한글이 있으면 Rust 패닉으로 죽는다. 경위와
되돌릴 조건은 `service/frontend/README.md`의 같은 항목에 정리해뒀다
(세 앱이 같은 문제라 근거는 그쪽에 한 번만 적었다).

## 배포 — `./deploy-admin.sh`

```bash
cd admin/frontend
./deploy-admin.sh
```

정적 export → S3 sync → CloudFront invalidation.

1. `npm run build`
2. S3(`sedaily-mbti-admin-frontend-dev`)에 sync
3. CloudFront(`E1MITYI58DB9UW`) invalidation

전제: `.env.local`(또는 `.env.production`)에
`NEXT_PUBLIC_ADMIN_API_BASE_URL` 설정, AWS credential 유효(각 명령이
`--region`을 명시해서 default region은 무관).

백엔드(admin API Lambda)는 별도 스크립트 —
`admin/backend/deploy-admin-api.sh` 참조.
