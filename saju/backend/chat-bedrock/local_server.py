"""
로컬 테스트 서버 — `npm run dev` 로 챗봇 LLM 을 로컬에서 시험.

Lambda 를 배포하지 않고, 로컬 AWS 자격증명(~/.aws 또는 환경변수)으로 Bedrock 을
직접 호출한다. handler.py 의 로직을 그대로 재사용한다.

실행:
  cd scripts/backend/lambda/chat-bedrock
  # (AWS 자격증명 + Bedrock 모델 액세스 필요)
  BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5 python3 local_server.py

  # 다른 터미널에서 프런트에 엔드포인트 지정 후 dev 실행:
  cd frontend
  echo 'NEXT_PUBLIC_CHAT_API_URL=http://localhost:8787/' >> .env.local
  npm run dev          # http://localhost:3000/chat 에서 자유 입력이 LLM 으로 동작

  # 끝나면 .env.local 의 그 줄을 지우면 다시 템플릿(무비용)으로 폴백.

환경변수: PORT(기본 8787), BEDROCK_MODEL_ID, MAX_TOKENS, AWS_REGION 은 handler.py 와 동일.
ALLOW_ORIGIN 은 로컬 편의를 위해 기본 '*'.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

import handler  # 같은 디렉터리의 Lambda 핸들러 로직 재사용

PORT = int(os.environ.get("PORT", "8787"))
ORIGIN = os.environ.get("ALLOW_ORIGIN", "*")


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send(200, {})

    def do_POST(self):  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") or "{}"
            payload = json.loads(raw)
            task = payload.get("task", "hit")
            lang = "en" if payload.get("lang") == "en" else "ko"
            if task not in ("classify", "predict", "hit", "overlay", "knot", "freeform"):
                return self._send(400, {"error": "invalid task"})
            text = handler._call_bedrock(handler._system(task, lang), handler._user(payload))
            self._send(200, {"text": text})
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})

    def log_message(self, fmt, *args):  # 요청 로그 한 줄
        print("·", self.command, self.path, *args)


if __name__ == "__main__":
    print(f"chat-bedrock local server → http://localhost:{PORT}/  (model={handler.MODEL_ID})")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
