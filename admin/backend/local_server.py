#!/usr/bin/env python3
"""admin/backend 로컬 개발 서버.

2026-09-05 신설 — admin/backend는 원래 로컬 실행 방법이 전혀 없었다
(Lambda 전용, `deploy-admin-api.sh`로만 확인 가능). 웹툰 이미지 실험
패널(routes/webtoon_lab.py)을 매 변경마다 재배포 없이 빠르게 반복
테스트하려고 만들었다 — `handler.lambda_handler`를 그대로 감싸서 실제
API Gateway HTTP API v2 이벤트와 같은 모양의 dict를 만들어 넘긴다.
`.env`/AWS 자격증명은 로컬 쉘 것을 그대로 쓴다(`aws sts get-caller-identity`
로 확인 가능한 것) — DynamoDB/S3/Bedrock 전부 진짜 AWS를 호출한다, 가짜
로컬 스택이 아니다.

⚠️ 이건 admin/frontend 로컬 dev(`npm run dev`, localhost:3000)에서만
쓸 CORS 관용적인 서버다 — API Gateway가 원래 하던 CORS 처리를 여기서
직접 흉내낸다. 프로덕션 배포 방식(Lambda + API Gateway)은 안 바뀐다,
이 파일은 배포 대상이 아니다(deploy-admin-api.sh가 안 건드림).

사용법:
    cd admin/backend
    python3 local_server.py            # 기본 포트 8787
    python3 local_server.py --port 9000
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl

sys.path.insert(0, str(Path(__file__).parent))
# admin/backend가 import하는 "common"(shared/response.py의 `from common
# import http` 등)은 deploy-admin-api.sh가 배포 시 service/backend/common/를
# zip에 그대로 복사해넣는 것 — 로컬 실행에선 그 원본 위치의 부모 디렉터리를
# sys.path에 얹어 같은 이름으로 import되게 한다.
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "service" / "backend"))
# pipelines/common/webtoon_image.py를 배포 없이 로컬에서 바로 import하기
# 위한 경로 추가 — deploy-admin-api.sh가 배포 시엔 이 파일을 zip에 직접
# 복사하지만, 로컬 실행에선 저장소의 실제 위치를 그대로 가리켜도 된다.
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "pipelines" / "common"))
# 2026-09-22 추가 — routes/webtoon/generate.py가 bare import하는
# compose_text(pipelines/webtoon/compose_text.py)가 이 줄이 없어서
# ModuleNotFoundError로 로컬 서버 자체가 기동 안 됐다(실측 확인).
# deploy-admin-api.sh도 이 파일을 zip 루트에 개별 flat-copy한다
# (COMPOSE_TEXT_MODULE) — 같은 flat-import 규약을 로컬에서도 맞춘다.
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "pipelines" / "webtoon"))

import handler as admin_handler  # noqa: E402 — sys.path 세팅 후 import

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

# HANDLERS의 라우트 문자열("GET /admin/webtoon-lab/{job_id}")을 정규식으로
# 바꿔서 실제 요청 경로와 매칭한다 — API Gateway가 하던 path-parameter
# 파싱을 로컬에서 대신한다. 세그먼트 단위로 직접 조립한다(경로 문자열
# 전체를 re.escape() 했다가 {}만 되돌리는 방식은 이스케이프 규칙이
# 파이썬 버전마다 미묘하게 달라 깨지기 쉬워서 피했다).
# 리터럴 세그먼트가 {param} 세그먼트보다 항상 먼저 매칭되도록, 매칭 시도
# 순서를 "파라미터 없는 라우트 먼저"로 정렬한다(예: /admin/webtoon-lab/
# history 가 /admin/webtoon-lab/{job_id} 보다 먼저 시도돼야 "history"를
# job_id로 잘못 파싱하지 않는다).


def _segment_pattern(segment: str) -> str:
    if segment.startswith("{") and segment.endswith("}"):
        name = segment[1:-1]
        return f"(?P<{name}>[^/]+)"
    return re.escape(segment)


def _compile_routes():
    compiled = []
    for route_key, handler_info in admin_handler.HANDLERS.items():
        method, path = route_key.split(" ", 1)
        segments = [s for s in path.split("/") if s]
        pattern = "^/" + "/".join(_segment_pattern(s) for s in segments) + "$"
        has_param = any(s.startswith("{") for s in segments)
        compiled.append((method, re.compile(pattern), has_param, handler_info))
    # 파라미터 없는 라우트를 먼저 매칭 — literal 세그먼트 우선순위.
    compiled.sort(key=lambda c: c[2])
    return compiled


_ROUTES = _compile_routes()


def _match(method: str, path: str):
    for m, pattern, _has_param, handler_info in _ROUTES:
        if m != method:
            continue
        match = pattern.match(path)
        if match:
            return handler_info, match.groupdict()
    return None, {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: A003 — BaseHTTPRequestHandler API
        print(f"[local_server] {self.address_string()} - {fmt % args}")

    def _send_cors_preflight(self):
        self.send_response(204)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_OPTIONS(self):  # noqa: N802 — BaseHTTPRequestHandler API
        self._send_cors_preflight()

    def _handle(self, method: str):
        parsed = urlsplit(self.path)
        path = parsed.path
        query_params = dict(parse_qsl(parsed.query))

        length = int(self.headers.get("Content-Length") or 0)
        raw_body = self.rfile.read(length) if length else b""

        handler_info, path_params = _match(method, path)
        if handler_info is None:
            self._respond(404, {"error": "not found"})
            return
        handler_fn, jwt_required = handler_info

        # 로컬 개발 서버는 인증을 생략한다 — JWT는 실제 배포된 API에서만
        # 의미가 있고(SSM SecureString 시크릿이 필요), 여기서 그대로
        # 흉내내려 하면 admin_password 로그인 흐름까지 전부 로컬에서
        # 재현해야 해서 배보다 배꼽이 커진다. 실험 도구 용도라 감수.
        _ = jwt_required

        body: dict = {}
        if raw_body:
            try:
                body = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                self._respond(400, {"error": "invalid JSON body"})
                return

        try:
            result = handler_fn(body, path_params, query_params)
        except Exception as e:  # noqa: BLE001 — 로컬 개발 서버 최상위, 스택트레이스를 그대로 보여준다
            import traceback
            traceback.print_exc()
            self._respond(500, {"error": f"internal error: {e}"})
            return

        status = result.get("statusCode", 200)
        headers = result.get("headers", {})
        raw = result.get("body", "{}")
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw.encode("utf-8") if isinstance(raw, str) else raw)

    def _respond(self, status: int, payload: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def do_GET(self):  # noqa: N802
        self._handle("GET")

    def do_POST(self):  # noqa: N802
        self._handle("POST")

    def do_PUT(self):  # noqa: N802
        self._handle("PUT")

    def do_DELETE(self):  # noqa: N802
        self._handle("DELETE")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()

    print(f"[local_server] admin/backend 로컬 서버 — http://localhost:{args.port}")
    print(f"[local_server] 등록된 라우트 {len(_ROUTES)}개 (인증 생략 — 로컬 전용)")
    print("[local_server] 실제 AWS(DynamoDB/S3/Bedrock)를 호출합니다 — 로컬 쉘의 AWS 자격증명 사용")
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[local_server] 종료")


if __name__ == "__main__":
    main()
