@AGENTS.md

# admin/

Admin console targeting `mbti-admin.sedaily.ai`. The Admin track (Backend Admin Lambda / Feature Flags / Thresholds / Prompts / Secrets / Admin Frontend Admin-4 / Admin-5 deployment) is documented in [`../docs/architecture/admin-stack.md`](../docs/architecture/admin-stack.md) — read that first for any cross-cutting changes.

## Stack

Next.js 16.2.4 + React 19.2.4 + Tailwind v4 + TS, separate `package.json` and lockfile from `service/frontend/`. Static export (`output: "export"` in `next.config.ts`).

Build outputs **13 routes** under `out/`: `/`, `/login`, `/posts`, `/posts/edit`, `/letters`, `/letters/edit`, `/newsletter`, `/cost`, `/drivers`, `/prompts`, `/prompts/edit`, `/settings`, `/_not-found`.

## Conventions

- **Tailwind v4 is config-less** — no `tailwind.config.{js,ts}`. Theme lives in `src/app/globals.css` via `@import "tailwindcss"` + `@theme inline { ... }`. PostCSS pipeline is one plugin (`@tailwindcss/postcss`); v4 bundles `autoprefixer` and `postcss-import` internally.
- **디자인 기준은 서울경제 영문 CMS** (`~/Desktop/ensedaily/cms`) — 흰 카드 + `#F7F8FA` 배경 + 파란 액센트의 평면 디자인. 표면 유틸은 `ui-card` / `ui-card-strong` / `ui-input` / `ui-thead` / `ui-row-hover` / `ui-divider` (2026-07-28 이전의 `glass-*` glassmorphism 은 전부 걷어냈다 — 반투명 위 텍스트 대비 보정이 계속 필요했고 레퍼런스와 결이 달랐다). 텍스트는 `gray-*` 로 통일한다.
- **네비게이션은 240px 좌측 사이드바** (`src/components/Sidebar.tsx`) — 접이식 메뉴 그룹, 활성 항목은 `bg-blue-50` + 우측 점. 모바일은 햄버거 + 오버레이. `SidebarContent` 는 반드시 `Sidebar` **밖**에 둔다 — 안에 정의하면 매 렌더마다 새 컴포넌트 타입이 생겨 하위 트리가 리마운트되고 메뉴 접힘 상태가 초기화된다(Next 16 린트가 `Cannot create components during render` 로 잡는다).
- **아이콘은 인라인 SVG** — 레퍼런스는 `lucide-react` 를 쓰지만 zero-new-dependency 정책 때문에 필요한 것만 `Sidebar.tsx` 안에 직접 그렸다.
- **Auth = localStorage JWT, NOT Cognito** — `src/lib/auth.ts` saves/clears `admin_jwt` + `admin_jwt_expires` (8h TTL). `src/components/AuthGuard.tsx` is a client-side gate placed in `src/app/(authenticated)/layout.tsx`. 401 from any admin endpoint → `clearAuth()` + redirect to `/login`.
- **API client** — single fetch wrapper in `src/lib/adminClient.ts` (`adminApi.login` / `getDrivers` / `updatePrompt` / `getCost` / `getAudit` 등 9 endpoints). `AdminApiError` carries the HTTP status. Base URL from `NEXT_PUBLIC_ADMIN_API_BASE_URL` env var.
- **Routing — query params, not dynamic segments** — `/prompts/edit?id=<category>/<name>` instead of `/prompts/[category]/[name]`. Reason: `output: "export"` requires `generateStaticParams` for dynamic routes; query params keep the route count fixed at 8 and stay static-export friendly. Wrap any `useSearchParams` page in `<Suspense>` (see `prompts/edit/page.tsx`).
- **Zero-new-dependency policy** — only what `create-next-app --tailwind --typescript --eslint` brought in. Custom impl preferred over deps unless saved code > ~100 lines (e.g. `ToastProvider` is 30 lines, diff preview is line-by-line).
- **`set-state-in-effect` exemptions** — `AuthGuard.tsx` (mount-detection flag) + `drivers/page.tsx` (initial async fetch) only. Both annotated. Don't add new exemptions without justifying.

## Deploy

```bash
cd admin
./deploy-admin.sh   # npm build → S3 sync → CloudFront /* invalidation
```

Live infra (Admin-5 provisioning result):
- S3 `sedaily-mbti-admin-frontend-dev` (us-east-1, OAC-only) → CloudFront `E1MITYI58DB9UW` → **`ailens-admin.sedaily.ai`** (2026-07-28 추가) + `mbti-admin.sedaily.ai` (레거시 병행).
- 인증서는 단일도메인 `cdca2fe5…` → 와일드카드 `*.sedaily.ai` (`ae647d30…`) 로 교체했다. 새 alias 가 SSL 검증을 통과하려면 필요했고, 덕분에 앞으로 `*.sedaily.ai` 하위 도메인은 인증서 발급 없이 alias 만 추가하면 된다.
- 403/404 → `/index.html` (200) for SPA fallback on hard reload.
