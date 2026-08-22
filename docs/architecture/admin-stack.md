# Admin Stack

CLAUDE.md 의 Admin track 섹션에서 분리됨 — Backend Admin Lambda / Feature Flags / Thresholds / Prompts / Secrets / Admin Frontend / Admin-5 통합 reference. Admin-1~5 모든 phase 종료 (Admin-5 ✓), 누적 reference 안정화.

본 파일이 admin stack 의 단일 reference. 향후 admin 변경 시 본 파일 업데이트.

CLAUDE.md 본 파일에는 1줄 포인터만 유지.

---

### Backend Admin Lambda

⚠️ **폴더 이동(2026-08-08)**: `service/backend/admin/` → `admin/backend/` (repo 최상위,
`admin/frontend/` 와 짝을 맞추려는 재구조화 — 사용자 요청: "백엔드 폴더랑 프론트 폴더
만들고 정리해주세요"). 아래 본문의 `service/backend/admin/` 언급은 전부 새 경로
`admin/backend/` 로 읽을 것. `common/`(v1/v2/admin 공유 유틸)은 v1/v2 도 같이 쓰는 진짜
공유 코드라 옮기지 않고 `service/backend/common/` 에 그대로 뒀다 — `admin/backend/
deploy-admin-api.sh` 가 상대경로(`../../service/backend/common`)로 참조한다. 테스트
실행은 이제 repo 루트에서 `python3 -m pytest admin/backend/tests -q`.

`service/backend/admin/`(현재 `admin/backend/`) is a **standalone Lambda separate from the 23 production Lambdas** — `sedaily-mbti-admin-api-dev`, deployed but **not built by `deploy.sh` / `deploy-v2.sh`** (its own one-shot zip pattern: `pip install argon2-cffi PyJWT --target /tmp/admin-rebuild && cp -r service/backend/admin/* /tmp/admin-rebuild && zip ...`). Admin-1 skeleton landed in commit `9d94f32`; Admin-2a (commit `0ee43df`) added the feature-flag toggle wire. The admin Lambda intentionally does not share v1's framework:

- **Routing**: dispatches by API Gateway HTTP API `routeKey` directly via `admin/handler.py:HANDLERS`. Does **not** use v1's `@lambda_handler` decorator, `core/response.py`, or `core/exceptions.py` — the admin Lambda has its own minimal `shared/response.py` (no CORS headers; HTTP API handles CORS at the gateway level).
- **Auth**: argon2id password verify + JWT (HS256, 8h expiry); password hash and JWT secret live in SSM Parameter Store at `/sedaily-mbti/admin/password-hash` and `/sedaily-mbti/admin/jwt-secret`. 5 failed logins → 5-minute global lockout, tracked via `pk=AUTH, sk=lockout/global` in the admin config table. `audit_log()` writes a row per mutating action (`pk=AUDIT, sk=<iso-timestamp-ms>`) and is wrapped in try/except so audit failures never block the main flow.
- **Tables (separate from the four v1 tables)**: `sedaily-mbti-admin-config-dev` (auth state, feature flags, audit log) and `sedaily-mbti-admin-prompts-dev` (versioned prompt rows: `pk=PROMPT#<category>/<name>`, `sk=v#N` | `LATEST`). Override via env vars `ADMIN_CONFIG_TABLE` / `ADMIN_PROMPTS_TABLE`.
- **Dependencies**: `argon2-cffi`, `PyJWT` are declared in `service/backend/admin/requirements.txt` only — **not** in the main `service/backend/requirements.txt`, so the regular Lambda zip does not bundle them.
- **Routes (Admin-1 + 2a + 2d)**: `POST /admin/login`, `POST /admin/password-change`, `GET /admin/drivers` (returns `rules` + `feature_flags` + `thresholds`), `POST /admin/drivers/{id}` (EventBridge rule enable/disable/set-cron — driver_id must start with `sedaily-mbti-`), **`POST /admin/drivers/feature-flag/{name}`** (feature flag enable/disable, Admin-2a — separate route + separate handler `drivers.handle_feature_flag_update`, intentionally not folded into `handle_update`), **`POST /admin/drivers/threshold/{name}`** (numeric tunable update, Admin-2d — body `{"value": <int>}`, validation `1..10000`, separate handler `drivers.handle_threshold_update`), `GET /admin/prompts`, `GET|POST /admin/prompts/{category}/{name}`, `GET /admin/cost` (Bedrock token → $ estimate over 7d), `GET /admin/audit`.

Seed script `scripts/import_prompts_to_admin_ddb.py` ports the 13 filesystem prompts under `service/backend/prompts/` into the admin-prompts table as `v#1` + `LATEST` rows; run with `--dry-run` first, then `--apply`. The legacy root-level `service/backend/MBTI_TRANSFORM_PROMPT.md` was excluded from the import; Admin-3 (commit `cb559e6`) confirmed it had no code references and deleted it. Production Lambdas now read those 13 prompts from this table at runtime — see "Prompts" section below.

### Feature Flags (Admin-2a/2b)

Runtime kill-switch for v1 Lambda handlers, backed by the admin DDB table. Pattern established for chatbot in commit `0ee43df` (Admin-2a) and extended to podcast + question in `3cad18f` (Admin-2b — same commit also fixes an Admin-2a OPTIONS-preflight bug, see "Integration point" below). Intended for incremental adoption across more Lambdas. Sibling mechanisms in `common/`: Admin-2c (`secrets.py`, SSM SecureString, fail-closed) for password-shaped secrets, and Admin-2d (`get_threshold` in the same `feature_flag.py`, integer values, see "Thresholds" below) for runtime-tunable knobs.

- **Storage**: `sedaily-mbti-admin-config-dev`, `pk=CONFIG`, `sk=feature-flag/<name>`, `value={"enabled": bool}` (+ `updated_at`, `actor`). Existing flags: `chatbot`, `podcast`, `question` (all enabled by default).
- **Read path** (in any Lambda — v1 / v2 / admin): `from common.feature_flag import is_enabled` then `if not is_enabled('<name>'): return <503>`. The module caches per-flag results for **5 minutes** at module level; Lambda cold start re-fetches. On DDB error: stale cache → `_DEFAULT_ON_MISSING=True` (fail-open — admin must explicitly disable).
- **Write path**: `POST /admin/drivers/feature-flag/{name}` body `{"action": "enable" | "disable"}` → `drivers.handle_feature_flag_update` runs `update_item` + `audit_log("feature-flag-update", ...)`. The single route handles all flags.
- **Cache invalidation**: there is no push-based invalidation. Toggle takes effect within 5 minutes naturally, or immediately by forcing a Lambda cold start (`aws lambda update-function-configuration --environment` with a dummy var like `ROTATION_AT=$(date +%s)`). Two operational gotchas learned in Admin-2b: (1) read existing env vars first and merge — `--environment` replaces the entire dict; (2) Lambdas with no env vars at all (`Environment: null`, e.g. `sedaily-mbti-question-dev` pre-Admin-2b) need `ROTATION_AT` added once before the rotation pattern works. To avoid shell-quoting bugs with `Variables={K=V,...}` syntax for non-trivial values, write a JSON file and pass `--cli-input-json file:///tmp/env.json`.
- **IAM (v1 vs v2 — read carefully)**: v1 Lambdas using the shared role `sedaily-mbti-lambda-execution-dev` (chatbot/podcast/question and most v1 API Lambdas) inherit `AmazonDynamoDBFullAccess` and need no extra policy. **v2 Lambdas use a tighter role (`sedaily-mbti-v2-collector-dev-role-nbf99tic`)** that does NOT have managed DDB access — Admin-2d added an `AdminConfigRead` inline policy (Sid `AdminConfigDDBRead`, `dynamodb:GetItem`+`dynamodb:Query` scoped to the admin-config-dev table only) so the same role covers both `is_enabled` and `get_threshold`. **When wiring `is_enabled` (or `get_threshold`) into a v2 Lambda for the first time, verify the role has DDB read access on this table — otherwise both calls silently degrade to fail-safe defaults** (visible in CloudWatch as a `feature_flag DDB error` / `feature_flag get_threshold error` warning, not a 500). This was the Admin-2d ship blocker — fixed only after the explicit Step 7 verification log surfaced `AccessDeniedException`.
- **Integration point in handlers** ⚠️ **place the `is_enabled(...)` check AFTER the OPTIONS-preflight short-circuit, never before**. Browser CORS preflight requires a 2xx response; if the gate fires on `OPTIONS` and returns 503, the browser refuses the actual request and the user sees only "Failed to fetch" — never the 503 body. This is exactly the bug Admin-2a shipped (chatbot gate placed before the OPTIONS branch) and Admin-2b fixed; the original verification used `curl -X POST` only, so the broken preflight wasn't caught. Correct shape:
  ```python
  def lambda_handler(event, context):
      """docstring"""
      # ... parse method (HTTP API v2 vs REST API v1) ...
      if method == 'OPTIONS':
          return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}
      if not is_enabled('<name>'):
          return {
              'statusCode': 503,
              'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
              'body': json.dumps({'error': '<name> disabled by admin'}),
          }
      # ... rest of handler
  ```
- **Verification checklist** (when integrating a new Lambda): baseline POST/GET → 200; baseline OPTIONS → 200; toggle off + cold start → OPTIONS **still 200** (preflight intact), POST/GET → 503 with friendly body; toggle on + cold start → POST/GET → 200. **Always exercise the OPTIONS preflight explicitly** with browser-style headers (`Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers`) — server-side `curl -X POST` alone misses the failure mode.

### Thresholds (Admin-2d)

Numeric runtime tunables (currently `transform-max-articles`), backed by the same admin DDB table as feature flags but under a separate `sk` prefix. Pattern established for the Core 2 Transform batch size in commit `e172175` (Admin-2d). Sibling to "Feature Flags" above — same module (`common.feature_flag`), same DDB table, same 5-min cache, same fail-safe philosophy. The only differences are the sk prefix (`threshold/<name>` vs `feature-flag/<name>`) and value shape (`{"threshold": <int>}` vs `{"enabled": <bool>}`).

- **Storage**: `sedaily-mbti-admin-config-dev`, `pk=CONFIG`, `sk=threshold/<name>`, `value={"threshold": <int>}` (+ `updated_at`, `actor`). Existing thresholds: `transform-max-articles` (default 20). DDB Number arrives as `Decimal` via boto3 resource — `_load_thresholds` coerces with `int(...)`.
- **Read path**: `from common.feature_flag import get_threshold` then `value = get_threshold('<name>', default=<int>)`. `default` is mandatory — typically the existing module-level constant (e.g. `BATCH_SIZE = 20` in `core2_transform.py`) preserved as the DDB-unavailable fallback so the original sizing comment stays next to the call site. Cache shares the same module dict as `is_enabled` but uses key prefix `_threshold_<name>` to avoid collisions if a flag and threshold ever share a name.
- **Write path**: `POST /admin/drivers/threshold/{name}` body `{"value": <int>}` → `drivers.handle_threshold_update` validates `1 <= int <= 10000`, runs `update_item` + `audit_log("threshold-update", ...)`. Single route handles all thresholds (parallel to `feature-flag/{name}`).
- **IAM**: same caveat as Feature Flags above — v1 lambdas inherit `AmazonDynamoDBFullAccess` and work out of the box; **v2 lambdas need the `AdminConfigRead` inline policy added in Admin-2d**. That policy covers both `is_enabled` and `get_threshold` (single `dynamodb:GetItem`+`dynamodb:Query` grant on the admin-config-dev table).
- **Integration point**: call `get_threshold` **inside the request handler**, not at module-load time. A module-level read happens once at cold start and never refreshes within the 5-min cache window — defeats the whole point. Keep the module-level constant as the `default=` fallback only.
- **Verification log pattern** (recommended for new thresholds): emit a one-line resolved-value log immediately after the `get_threshold` call, e.g. `logger.info(json.dumps({"event": "transform_batch_size_resolved", "batch_size": batch_size, "default_fallback": BATCH_SIZE}))`. The natural per-fire summary log (`transform_run_complete.queue_rows` for transform) can't distinguish "threshold=20, 4 selected rows" from "threshold=4, 20 selected rows" — both yield `queue_rows=4`. After changing the DDB value, force a cold start (`update-function-configuration` env-var rotation) and confirm the resolved-value log line shows the new threshold.

### Prompts (Admin-3)

DDB-backed prompt storage with 5-minute TTL cache and filesystem fallback. Pattern landed by re-implementing `services/prompt_loader.py` in commit `cb559e6` (Admin-3). Sibling to "Feature Flags" / "Thresholds" / "Secrets" — all four use the same module-level cache + 5-min TTL shape; the failure-mode is tuned per concern. Prompts get a **3-tier fallback** (cache → stale cache → filesystem) because shipping an old prompt to a real user reply is strictly better than a 5xx, while admin DDB stays source-of-truth on the happy path.

- **Storage**: `sedaily-mbti-admin-prompts-dev` (Admin-1 seed via `scripts/import_prompts_to_admin_ddb.py`):
  - `pk = 'PROMPT#<category>/<name>'`
  - `sk = 'LATEST'` → `{active_version: <int>, updated_at}` (pointer row)
  - `sk = 'v#<int>'` → `{content, created_at, actor}` (immutable version row)
  13 prompts × 2 rows = 26 total. All start at `active_version=1`. Categories: `chatbot` (nt/nf/st/sf), `transform` (nt/nf/st/sf), `selection/article_scorer`, `question/daily_question`, `supervisor/supervisor_review`, `validation/validator`, `podcast/podcast_script`.
- **Read path**: `from services.prompt_loader import load_prompt` (or wrappers `load_transform_prompt`, `load_chatbot_prompt`, `load_prompt_by_path`). All wrappers funnel through `load_prompt(category, name)`, which:
  1. cache hit (< 5 min in this Lambda container) → return cached content
  2. else two DDB reads: `LATEST.active_version` → `v#<that-version>.content`
  3. on DDB error / row miss: **stale cache if any**, else `prompts/<category>/<name>.md` on disk + warn log
- **Write path**: `POST /admin/prompts/<category>/<name>` (admin Lambda, Admin-1) — writes a new `v#N` row and bumps `LATEST.active_version`. Production Lambdas pick up the change within 5 minutes naturally, or immediately on the next cold start.
- **IAM (v1 vs v2)**: same shape as Feature Flags / Thresholds. v1 shared role inherits `AmazonDynamoDBFullAccess`. v2 shared role got an **`AdminPromptsRead`** inline policy in Admin-3 (Sid `AdminPromptsDDBRead`, scoped to the single `sedaily-mbti-admin-prompts-dev` table). It's intentionally separate from `AdminConfigRead` (Admin-2d) so each policy maps to one logical concern. ⚠️ A v2 Lambda calling `load_prompt` without the policy degrades silently to filesystem (warn-log, not 5xx) — verify the policy is attached when wiring up a new v2 caller.
- **Integration point in handlers** ⚠️ **call `load_prompt` inside the request-processing function, never at module-load time**. A `MODULE_CONST = load_prompt(...)` at import time freezes the prompt for the warm container's lifetime — defeats the 5-min TTL. Admin-3 fixed exactly this in `step1_select.py:147` (a `SCORING_SYSTEM_PROMPT = load_prompt(...)` at module scope, moved inline to `_score_one_batch`).
⚠️ **MBTI 페르소나 폐지(2026-08) 이후 아래 항목 무효**: "13/13"과
`chatbot/{nt,nf,st,sf}` / `transform/{nt,nf,st,sf}` / `mbti_transform_service.py`는
그 폐지로 전부 삭제됐다. `chatbot/`에는 이제 `default.md` 하나만 있고
(`chatbot_prompt_service.py`가 `load_chatbot_prompt('default')` 고정 호출), `transform/`
디렉터리 자체가 없다. 아래는 Admin-3 당시(그 파이프라인이 살아있던 시점)의 히스토리
기록으로 남겨둔다.

- **Coverage — 13/13 prompts after Admin-3 cutover (option B-1)**: 5 prompts (`selection`/`question`/`supervisor`/`validation`/`podcast`) already used `load_prompt` pre-Admin-3. The other 8 (`chatbot/{nt,nf,st,sf}` + `transform/{nt,nf,st,sf}`) had been bypassing prompt_loader entirely and were folded in by Admin-3:
  - `handlers/chatbot_handler.py` — removed the hardcoded `MBTI_SYSTEM_PROMPTS` dict, replaced with `load_chatbot_prompt(group)`. **⚠️ This changed chatbot response style in production**: the dict was a deprecated short persona that had drifted from `prompts/chatbot/<group>.md` (the source-of-truth versions Admin-1 imported). Verified post-deploy: chatbot now returns the fuller "AI LENS의 김시현" persona from the `.md` versions, not the dict's shorter "시현".
  - `clients/mbti_transform_service.py::_load_group_prompt` — was reading `prompts/transform/<group>.md` directly via `open()` (the bare `PROMPT_FILES` dict). Now delegates to `load_transform_prompt`. Content unchanged on the happy path; the read goes through DDB now.
- **Rollback (5-min safety net)**: a regression in a new prompt version → admin writes a corrected `v#N+1` (or rolls `LATEST.active_version` back to a prior `v#`). The active prompt swaps within ≤ 5 min, or instantly on cold start. **Do not delete `service/backend/prompts/<category>/<name>.md` on disk** — those files are the cold-cache filesystem fallback. The only `.md` Admin-3 deleted was the unreferenced root-level `service/backend/MBTI_TRANSFORM_PROMPT.md`.
- **Verification log pattern**: there is no resolved-prompt log by default (prompts are large; logging full content would balloon CloudWatch). To confirm a cutover is live in production, either (a) inject a short instructional marker into the new version (e.g. "응답 첫 토큰을 [TEST] 로 시작하세요") and grep the next response, or (b) tail logs for the warning `"prompt_loader DDB error ... falling back to filesystem"` — its **absence** during normal operation is the success signal.

### Secrets (Admin-2c)

⚠️ **v2 Postgres/pgvector 폐기(2026-08-06) 이후 아래 4개 항목 무효**: v2
Lambda(collector/selector/transform/consolidate) 자체가 삭제됐고 v1/v2
pgvector RDS도 둘 다 계정에서 삭제됐다(경위: `worklog/2026-08/2026-08-06-*`).
`get_pg_password()`/`PG_PASSWORD_SSM_PARAM`/`sedaily-mbti-v2-collector-dev-
role-nbf99tic` 전부 지금 아무도 안 쓴다. `common.secrets` 모듈(SSM
SecureString 읽기, 5분 TTL 캐시, fail-closed 패턴) 자체는 여전히 살아있고
다른 시크릿(OpenAI/ElevenLabs API 키 등, `pipelines/common`)에서 같은
패턴을 쓴다 — 죽은 건 "v2 Postgres 비밀번호"라는 특정 사용처뿐이다.

SSM SecureString reader for v1 / v2 / admin Lambdas, replacing plaintext password env vars. Pattern established for the v2 Postgres password in commit `61b7177` (Admin-2c — `PG_V2_PASSWORD` env var → `/sedaily-mbti/v2/pg-password`). Same module-level 5-min TTL cache shape as `feature_flag.py`, but **opposite failure mode** — see contrast below.

- **Storage**: SSM Parameter Store SecureString, Standard tier, AWS-managed KMS key (`alias/aws/ssm`). Tagged `Project=sedaily-mbti, Component=backend-v2, Phase=admin-2c, ManagedBy=claude-code` (+ Subsystem / Environment / Owner). The admin SSM params from Admin-1 (`/sedaily-mbti/admin/password-hash`, `/sedaily-mbti/admin/jwt-secret`) are the same shape, predating this module — they're read directly via boto3 inside the admin Lambda and not yet routed through `common.secrets`.
- **Read path**: `from common.secrets import get_pg_password` (or the lower-level `get_secret(name)`). 5-min TTL module cache. **Fail-closed** — on SSM error or missing parameter the call raises rather than returning a default. Reasoning: a Lambda that reaches the DB code path without a valid password should crash visibly; a fail-open default would mean silently connecting (or pretending to connect) with garbage.
- **Path override**: `get_pg_password()` reads `PG_PASSWORD_SSM_PARAM` env var, defaulting to `/sedaily-mbti/v2/pg-password`. The 4 v2 Lambdas (collector / selector / transform / consolidate) all set this env var explicitly so the path is visible in their config without grepping code.
- **IAM**: the v2 Lambdas share role `sedaily-mbti-v2-collector-dev-role-nbf99tic`; Admin-2c added a `V2SecretsAccess` inline policy granting `ssm:GetParameter` / `ssm:GetParameters` on `parameter/sedaily-mbti/v2/*` (wildcard so future v2 secrets don't need IAM changes) plus `kms:Decrypt` conditioned on `kms:ViaService = ssm.us-east-1.amazonaws.com`. v1 / admin Lambdas adding their own SSM-backed secret will need similar inline policies on their roles.
- **Migration playbook** (one-shot scripts in `scripts/`):
  1. `scripts/migrate_pg_password_to_ssm.py --dry-run` then `--apply` — copies the password from a Lambda env var into SSM and verifies (length-only output, no value leakage).
  2. Code change: `os.getenv("PG_V2_PASSWORD", "")` → `get_pg_password()`.
  3. Deploy with the new code via `deploy-v2.sh` (or `deploy.sh` for v1).
  4. `scripts/update_v2_lambdas_pg_env.py --apply` — removes `PG_V2_PASSWORD`, adds `PG_PASSWORD_SSM_PARAM`. `update_function_configuration` auto-forces cold start, so the next invoke runs the new SSM path.
- **Fail-closed vs fail-open** (`secrets.py` vs `feature_flag.py`):
  | Module | Store | Cache | On store error | Why |
  |---|---|---|---|---|
  | `feature_flag.py` | DDB `sedaily-mbti-admin-config-dev` | 5 min, stale-cache fallback | Use stale cache if any, else `_DEFAULT_ON_MISSING=True` (enabled) | A flag flap shouldn't take a feature down; admin must explicitly disable. |
  | `secrets.py` | SSM SecureString | 5 min, no fallback | Raise | A DB password the Lambda can't fetch is uniformly worse than crashing — silent fallbacks would hide IAM / KMS / param-name regressions. |
- **Test fallout (known follow-up)**: integration tests under `service/backend/v2/tests/` historically use `monkeypatch.setenv("PG_V2_PASSWORD", "...")` then construct `PgVectorV2Client()` with no args — that path now calls `get_pg_password()` and hits real SSM. Tests that don't already pass `password=` explicitly need to mock `common.secrets.get_pg_password`. Out of scope for the Admin-2c commit; treat as a follow-up.

### Admin Frontend (Admin-4)

⚠️ **도메인 변경(2026-08-08)**: `mbti-admin.sedaily.ai`는 완전히 폐기됐다 — CloudFront
alias·Route53 A/AAAA 레코드·API Gateway CORS 전부 제거. 관리자 콘솔의 실제 도메인은
이제 `lensdb.sedaily.ai`(그리고 `ailens-admin.sedaily.ai`도 병행 유지). 아래 본문에
남아있는 `mbti-admin.sedaily.ai` 언급은 Admin-4/5 당시 기록이라 역사적 맥락으로만
유효하고, 현재 실제 도메인이 아니다.

`admin/` is a **second Next.js app** alongside `service/frontend/`, dedicated to the admin console (originally targeting `mbti-admin.sedaily.ai`, now `lensdb.sedaily.ai` — see note above). Built by Admin-4 in commit `bb0c900` and **not yet deployed** — Admin-5 covers the AWS-side work. The two frontends share **zero source code and zero state**; they are independently versioned, built, and (eventually) hosted.

- **Stack consistency with `frontend`**: Next.js 16.2.4 + React 19.2.4 + Tailwind v4 + TypeScript 5. Generated via `create-next-app@latest --app --src-dir --tailwind --typescript --eslint`. The lockfile and `node_modules` are independent — keep dependency versions intentionally in sync when bumping either app, but do not symlink.
- **Output**: `next.config.ts` sets `output: "export"` + `images: { unoptimized: true }`. `npm run build` writes static HTML/JS/CSS to `admin/out/` — eight routes: `/`, `/login`, `/cost`, `/drivers`, `/prompts`, `/prompts/edit`, `/settings`, `/_not-found`. Admin-5 will `aws s3 sync out/ s3://...` this directory.
- **Tailwind v4 — config-less**: there is no `tailwind.config.{js,ts}`. Theme is declared inside `src/app/globals.css` via `@import "tailwindcss";` followed by a `@theme inline { ... }` block. PostCSS pipeline is one plugin (`@tailwindcss/postcss`) — `autoprefixer` and `postcss-import` are bundled into v4 itself. When porting components between this app and `service/frontend/`, class names work identically but custom CSS variables must be redeclared in this app's `globals.css`.
- **Auth model — localStorage JWT, not Cognito**: Admin-1 chose argon2id + JWT for the admin Lambda specifically. `src/lib/auth.ts` handles save / clear / expiry of `admin_jwt` + `admin_jwt_expires` (8h TTL). `src/components/AuthGuard.tsx` is a client-side gate placed in `src/app/(authenticated)/layout.tsx` so every page in that route group is protected. 401 from any API call → `clearAuth()` + `window.location.href = "/login"`.
- **API client**: `src/lib/adminClient.ts` is the single fetch wrapper for all 9 admin endpoints (`adminApi.login` / `changePassword` / `getDrivers` / `updateRule` / `toggleFeatureFlag` / `updateThreshold` / `listPrompts` / `getPrompt` / `updatePrompt` / `getCost` / `getAudit`). `AdminApiError` carries the HTTP status. Base URL from `NEXT_PUBLIC_ADMIN_API_BASE_URL` env var (`.env.local` for dev, build-env for production).
- **Routing — query params, not dynamic segments**: `/prompts/edit?id=<category>/<name>` instead of `/prompts/[category]/[name]`. Reason: `output: "export"` requires `generateStaticParams` for dynamic routes, and the 13 prompt list is data-driven — hardcoding it in build config would go stale when admin adds new categories. Query params keep the route count fixed at 8 and stay static-export friendly. Trade-off: URLs are slightly less semantic; for a one-admin tool this is fine.
- **Suspense boundary for `useSearchParams`**: any page that reads search params during static export must be wrapped in `<Suspense>` — `prompts/edit/page.tsx` exports a `PromptEditPageWrapper` that wraps the actual editor in `<Suspense>` for this reason. If you add another search-params page, follow the same pattern.
- **Zero-new-dependency policy**: the only npm packages installed are what `create-next-app --tailwind --typescript --eslint` brought in (175 packages, all transitive). Toast notifications are a 30-line custom `ToastProvider` (createContext + setTimeout); the diff preview is a simple line-by-line component (no `diff-match-patch` / Monaco / CodeMirror). The frontend half of `.clauderules` "Frontend 신규 의존성 금지" is enforced via reviewer discretion — when adding features, prefer custom over deps unless the saved code is more than ~100 lines.
- **`set-state-in-effect` exemptions**: React 19's lint rule fires on two legitimate patterns: `AuthGuard.tsx` (mount-detection flag for SSG → CSR handoff) and `drivers/page.tsx` (initial async fetch on mount). Both are annotated with `// eslint-disable-next-line react-hooks/set-state-in-effect` and a comment explaining why. Don't add new exemptions without justifying — most setState-in-effect cases are real anti-patterns.

### Admin-5 — deployment ✓

Admin-5 (commit pending) is the final round in the admin track and is **complete**. It did not change any code in `admin/` or `service/backend/admin/`; it provisioned AWS infrastructure to put `admin/out/` behind `https://mbti-admin.sedaily.ai`. Live resources are listed in the **"Admin Frontend Infrastructure (Admin-5)"** section above. Per-deploy workflow:

```bash
cd admin/frontend
./deploy-admin.sh   # npm build → S3 sync (long cache for /_next/, short for entries) → CloudFront /* invalidation
```

Decisions worth knowing for future maintenance (Admin-5 reconnaissance learnings):

- **`sedaily-mbti-frontend-dev` is in `us-east-1`, not `ap-northeast-2`** — earlier CLAUDE.md notes had this wrong. Admin-5 corrected the record and chose `us-east-1` for `sedaily-mbti-admin-frontend-dev` to keep both frontend buckets in the same region (CloudFront is global; bucket region only affects origin-fetch latency).
- **CustomError = 403 + 404 → /index.html (200)** — both error codes route to the SPA shell because S3 with OAC returns 403 (not 404) for missing objects. This matches the v1 frontend's existing pattern.
- **CORS narrowing must list both domains** — narrowing `chzwwtjtgk` from `["*"]` to a single origin would have broken whichever frontend was excluded. The current allowlist `["https://mbti.sedaily.ai", "https://mbti-admin.sedaily.ai"]` covers both. Adding a third origin (e.g. a future staging frontend) requires `aws apigatewayv2 update-api --cors-configuration ...`.
- **Route53 A + AAAA both aliased** — the v1 frontend's record set has both, so the admin domain mirrors that. CloudFront supports IPv6 by default (`IsIPV6Enabled: true` in distribution config).
- **CloudFront deployment latency**: ~90 seconds end-to-end (modern), not the 15–20 minutes that older docs sometimes quote. ACM DNS validation was similarly fast (~30 seconds once the Route53 record landed).

