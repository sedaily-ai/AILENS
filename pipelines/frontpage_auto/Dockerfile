# 지면 1면 완전 자동 발행 파이프라인용 컨테이너 — Fargate 스케줄 태스크로
# 돈다(EventBridge가 매일 아침 트리거). Node(Remotion 렌더용)+Python
# (나머지 전부)이 한 이미지 안에 같이 있어야 한다 — video/generate_script.py
# → npm run render 흐름이 프로세스 경계를 안 넘고 그대로 이어지기 때문.
#
# Remotion 공식 문서가 권장하는 시스템 의존성(헤드리스 Chromium 실행에
# 필요한 것들) 그대로 따름 — https://www.remotion.dev/docs/docker
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3.11 python3-pip python3.11-venv \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libatk-bridge2.0-0 libcups2 libxss1 libx11-xcb1 libgtk-3-0 \
    fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/pipelines

# video/ 의 Node 의존성 먼저 설치(레이어 캐시 — package.json이 자주 안
# 바뀌니 코드 복사보다 먼저 해서 재빌드 시 npm install을 스킵하게).
#
# 2026-09-02 — npm install → npm ci로 변경(Remotion-인수인계-가이드.pdf
# 11장 권장). npm install은 package-lock.json이 있어도 package.json의
# semver 범위(예: 캐럿)에 맞춰 lockfile을 조용히 갱신할 수 있다 —
# Remotion이 "거의 매일 릴리스"되는 특성상, 재빌드 시점에 remotion과
# @remotion/* 패키지가 서로 다른 버전으로 갈라져 설치될 위험이 있었다
# (같은 날 package.json의 캐럿도 제거해 이중으로 막음). npm ci는
# package-lock.json을 절대 기준으로 삼아 정확히 그 버전만 설치하고,
# lockfile과 어긋나면 설치 자체를 실패시켜 조용한 버전 이탈을 막는다.
COPY video/package.json video/package-lock.json video/
RUN cd video && npm ci

# Remotion 헤드리스 Chromium 바이너리를 빌드 시점에 미리 받아둔다 —
# 실제 실행(하루 1회) 때마다 매번 새로 받으면 태스크 시작이 느려지고,
# 네트워크 상태에 따라 실패 위험도 생긴다.
RUN cd video && npx remotion browser ensure

COPY . .

# 파이썬 의존성 — pipelines/*/requirements.txt 전부 한 venv에(common/은
# requirements.txt가 없다 — 필요한 boto3/requests는 아래 6개 파일이 이미
# 요구하고 있어 커버됨). mustknow_auto/requirements.txt는 2026-08-23 코드
# 리팩토링 감사 전까지 여기 안 걸려 있었다 — mustknow_auto/run.py가 쓰는
# requests가 다른 5개 파일 설치분에 얹혀가서 우연히 동작하던 상태였다.
RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir \
    -r letters/requirements.txt \
    -r podcast/requirements.txt \
    -r webtoon/requirements.txt \
    -r discovery/requirements.txt \
    -r frontpage_auto/requirements.txt \
    -r mustknow_auto/requirements.txt

WORKDIR /app/pipelines/frontpage_auto
ENTRYPOINT ["python3.11", "run.py"]
