#!/usr/bin/env python3
"""PRISM 유튜브 채널 연결(1회) — 채널 관리자가 업로드 권한에 동의하고 refresh token을 받는다(2026-10-22).

준비(구글 클라우드 콘솔, 채널 관리자 계정):
  1. 프로젝트에서 YouTube Data API v3 사용 설정
  2. OAuth 동의 화면 구성 → 사용자 인증 정보 → OAuth 클라이언트 ID(유형: 데스크톱 앱) 생성
  3. 클라이언트 ID·보안 비밀번호를 아래 명령에 넣는다

사용(아무 PC에서, 브라우저가 열린다 — 채널 관리자 계정으로 로그인해 "허용"):
  python3 scripts/prism_youtube_auth.py --client-id <ID> --client-secret <SECRET> [--privacy public|unlisted|private]

끝나면 Secrets Manager ai-labs/prism-youtube 에 넣을 JSON을 출력한다(이 스크립트는 AWS에 쓰지 않는다).
권한 범위는 업로드만(youtube.upload). 표준 라이브러리만 쓴다.
"""
import argparse
import http.server
import json
import secrets
import urllib.parse
import urllib.request
import webbrowser

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--client-secret", required=True)
    parser.add_argument("--privacy", default="public", choices=["public", "unlisted", "private"])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    redirect_uri = f"http://127.0.0.1:{args.port}"
    state = secrets.token_urlsafe(16)
    received: dict = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 — http.server 규약
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            received.update({k: v[0] for k, v in query.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("연결 완료 — 이 창을 닫고 터미널을 확인하세요.".encode("utf-8"))

        def log_message(self, *_):  # 요청 로그 숨김
            pass

    url = _AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": args.client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": _SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
    })
    print("브라우저에서 채널 관리자 계정으로 로그인해 허용해 주세요. 창이 안 열리면 아래 주소를 여세요:\n" + url)
    webbrowser.open(url)
    with http.server.HTTPServer(("127.0.0.1", args.port), Handler) as server:
        while "code" not in received and "error" not in received:
            server.handle_request()

    if received.get("error") or received.get("state") != state:
        raise SystemExit(f"동의 실패: {received.get('error') or 'state 불일치'}")
    data = urllib.parse.urlencode({
        "code": received["code"], "client_id": args.client_id, "client_secret": args.client_secret,
        "redirect_uri": redirect_uri, "grant_type": "authorization_code",
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(_TOKEN_URL, data=data, method="POST"), timeout=30) as res:
        token = json.loads(res.read())
    if not token.get("refresh_token"):
        raise SystemExit("refresh_token을 받지 못했습니다 — 구글 계정 '타사 액세스'에서 이 앱 권한을 지운 뒤 다시 실행하세요.")
    print("\nSecrets Manager ai-labs/prism-youtube 에 아래 JSON을 저장하세요(채팅·문서에 붙여넣지 마세요):")
    print(json.dumps({
        "client_id": args.client_id, "client_secret": args.client_secret,
        "refresh_token": token["refresh_token"], "privacy_status": args.privacy,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
