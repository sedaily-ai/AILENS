# AI LENS 프런트엔드 — ECS Fargate용 컨테이너 이미지.
#
# 2026-09-04 — EC2+PM2 배포(deploy.sh, git 히스토리 참조)에서 전환. 오늘
# 세션에서 겪은 배포 실패 3종(macOS tar가 만든 xattr을 EC2 GNU tar가
# 못 읽음, pm2 restart가 최초 등록 경로를 영원히 재사용해 배포가
# "성공"해도 코드가 안 바뀌는 버그, 실패한 배포 잔해가 /tmp를 채워
# 다음 배포를 막음)이 전부 "가변 서버에 계속 덧쓰기" 구조의 증상이었다
# — 매 배포가 컨테이너를 통째로 새로 띄우는 이 방식으로 그 문제 클래스
# 자체를 없앤다.
#
# 빌드 컨텍스트는 반드시 service/frontend/ 여야 한다(레포 루트 아님) —
# next.config.ts의 outputFileTracingRoot가 이 폴더(__dirname)로 고정돼
# 있어서, 다른 루트에서 COPY하면 standalone 산출물 경로가 한 단계
# 깊어져 아래 COPY 경로가 깨진다(EC2 배포에서 실제로 겪은 문제,
# next.config.ts 주석 참조).
#
# pipelines/frontpage_auto/Dockerfile과 같은 멀티스테이지 컨벤션 —
# 다만 이쪽은 Node만 필요(Python/Remotion 불필요).

FROM node:20-bookworm AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# BuildKit 캐시 마운트(2026-10-01) — npm 다운로드 캐시(~/.npm)와 Next 웹팩
# 증분 캐시(.next/cache)를 빌드 사이에 유지한다. 이미지 레이어와 달리
# 소스가 바뀌어(COPY . . 무효화) 빌드가 다시 돌아도 캐시 디렉터리는 남아
# 변경분만 다시 컴파일한다. 마운트 내용은 최종 이미지에 들어가지 않는다
# (standalone 산출물은 .next/cache를 쓰지 않는다).
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

# ---

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 산출물은 client 정적 에셋(.next/static)과 public/을 자체적으로
# 포함하지 않는다 — Next 문서대로 별도 복사해야 server.js가 정상 서빙한다
# (deploy.sh의 릴리스 패키징 단계가 하던 cp -r 3줄과 정확히 같은 구조).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
