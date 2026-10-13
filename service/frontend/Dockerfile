# AI LENS 프런트엔드 — ECS Fargate용 컨테이너 이미지 (모노레포 빌드).
#
# 2026-10-13 모노레포 전환 — 빌드 컨텍스트가 **레포 루트**로 바뀌었다.
# service/frontend 가 @ailens/domain(레포 루트 packages/) 에 의존하므로,
# 예전처럼 service/frontend 만 컨텍스트로 삼으면 npm ci 가 그 워크스페이스
# 패키지를 찾지 못해 빌드가 깨진다. 그래서:
#   - deploy.sh 는 `docker build -f service/frontend/Dockerfile <레포루트>` 로 부른다.
#   - 아래 COPY 경로는 전부 레포 루트 기준이다.
#   - next.config.ts 의 outputFileTracingRoot 가 레포 루트라, standalone 산출물은
#     `.next/standalone/service/frontend/server.js` 로 한 단계 중첩돼 나온다 —
#     runner 스테이지의 COPY 가 이 중첩 경로를 전제한다.
#
# 2026-09-04 — EC2+PM2 배포에서 ECS Fargate 멀티스테이지로 전환(사유는 git 히스토리).

FROM node:20-bookworm AS builder
WORKDIR /repo

# 1) 워크스페이스 매니페스트만 먼저 복사해 의존성 레이어를 캐시한다.
COPY package.json package-lock.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/api-client/package.json packages/api-client/
COPY packages/auth/package.json packages/auth/
COPY service/frontend/package.json service/frontend/
# BuildKit 캐시 마운트 — npm 다운로드 캐시를 빌드 사이에 유지(이미지엔 안 들어감).
# 공유 패키지(@ailens/domain)는 prepare 훅이 없어 install 중 빌드되지 않는다 —
# 소스 복사 후 아래에서 명시적으로 빌드한다(루트 build:packages 와 동일 경로).
RUN --mount=type=cache,target=/root/.npm npm ci

# 2) 전체 소스 복사 후 공유 패키지 빌드 → 프런트 빌드.
COPY packages/ packages/
COPY service/frontend/ service/frontend/
# @ailens/domain 등 공유 패키지의 dist 를 먼저 만든다(프런트가 dist 를 소비).
RUN npm run build --workspace @ailens/domain --if-present
RUN --mount=type=cache,target=/repo/service/frontend/.next/cache \
    npm run build --workspace service/frontend

# ---

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# outputFileTracingRoot=레포루트라 standalone 이 레포루트 기준 구조로 중첩된다:
#   /repo/service/frontend/.next/standalone/ (standalone 루트)
#     └ service/frontend/server.js (실제 엔트리)
#     └ node_modules/ (@ailens/domain 등 공유 패키지가 트레이싱돼 포함됨)
# standalone 트리를 통째로 /app 에 펼친 뒤, 정적 에셋·public 을 중첩 경로에 복사한다.
COPY --from=builder /repo/service/frontend/.next/standalone/ ./
COPY --from=builder /repo/service/frontend/.next/static ./service/frontend/.next/static
COPY --from=builder /repo/service/frontend/public ./service/frontend/public

EXPOSE 3000
# server.js 는 중첩 경로(service/frontend/)에 있다.
CMD ["node", "service/frontend/server.js"]
