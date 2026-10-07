# 지면 1면 자동 발행 파이프라인 컨테이너 — EventBridge가 매일 아침 Fargate 스케줄 태스크로 실행한다.
# video/generate_script.py -> npm run render 흐름이 프로세스 경계를 넘지 않도록
# Node(Remotion 렌더)와 Python(나머지)을 한 이미지에 둔다.
# 시스템 의존성은 Remotion 공식 Docker 문서(https://www.remotion.dev/docs/docker)를 따른다.
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

# video/의 Node 의존성을 코드 복사보다 먼저 설치해 레이어 캐시를 활용한다.
#
# npm install은 package-lock.json이 있어도 semver 범위에 맞춰 lockfile을 갱신할 수 있어
# remotion과 @remotion/* 버전이 갈라질 위험이 있다. npm ci는 lockfile 기준으로만 설치하고
# 어긋나면 실패시킨다.
COPY video/package.json video/package-lock.json video/
RUN cd video && npm ci

# Remotion 헤드리스 Chromium을 빌드 시점에 받아 두어 실행 시 다운로드 지연·실패를 막는다.
RUN cd video && npx remotion browser ensure

# 파이썬 의존성은 pipelines/*/requirements.txt를 한 venv에 설치한다(common/에는 requirements.txt가
# 없고 필요한 boto3/requests는 아래 파일들이 요구한다). requirements.txt만 먼저 복사해
# 코드 변경 시에도 pip install 레이어가 캐시되도록 한다.
COPY letters/requirements.txt letters/requirements.txt
COPY podcast/requirements.txt podcast/requirements.txt
COPY webtoon/requirements.txt webtoon/requirements.txt
COPY discovery/requirements.txt discovery/requirements.txt
COPY frontpage_auto/requirements.txt frontpage_auto/requirements.txt
COPY mustknow_auto/requirements.txt mustknow_auto/requirements.txt

RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# stdout을 블록 버퍼링하면 로그가 몰아서 찍혀 CloudWatch 타임스탬프가 실제 시점보다 늦는다
# (07:00 시작 태스크의 첫 로그가 07:20에 찍혔다). 단계별 소요시간을 로그로 재려면 즉시 출력해야 한다.
ENV PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir \
    -r letters/requirements.txt \
    -r podcast/requirements.txt \
    -r webtoon/requirements.txt \
    -r discovery/requirements.txt \
    -r frontpage_auto/requirements.txt \
    -r mustknow_auto/requirements.txt

# 나머지 코드는 pip install 레이어 뒤에 복사한다.
COPY . .

WORKDIR /app/pipelines/frontpage_auto
ENTRYPOINT ["python3.11", "run.py"]
