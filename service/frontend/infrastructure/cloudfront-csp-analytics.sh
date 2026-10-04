#!/usr/bin/env bash
# CloudFront 응답 헤더 정책 `ailens-security-headers`의 CSP에 분석 도구 허용 도메인을 더한다 — 2026-10-03.
#
# 왜: CSP의 script-src·connect-src에 Clarity와 GA4의 보조 전송 도메인이 없어서
#   - Clarity 스크립트(https://www.clarity.ms/tag/...)가 브라우저에서 "Refused to load the script"로 막혀 실제로는 동작하지 않았다
#   - GA4가 analytics.google.com / stats.g.doubleclick.net / www.google.com 으로 보내는 collect가 "Refused to connect"로 막혔다
#     (www.google-analytics.com·region1.google-analytics.com 경로만 통과해 일부 이벤트만 도착했을 가능성)
#
# 하는 일: 현재 정책을 읽어(read) CSP 두 지시문에 도메인만 추가하고 update. 다른 헤더는 그대로.
# 사용: bash cloudfront-csp-analytics.sh [--apply]   (인자 없으면 변경 예정 CSP만 출력)
set -euo pipefail
POLICY_ID="2ffbcf45-bf62-4b60-9c15-a79569557629"
TMP="$(mktemp -d)"
aws cloudfront get-response-headers-policy --id "$POLICY_ID" --output json > "$TMP/cur.json"
python3 - "$TMP" <<'PY'
import json, sys
tmp = sys.argv[1]
d = json.load(open(f"{tmp}/cur.json"))
cfg = d["ResponseHeadersPolicy"]["ResponseHeadersPolicyConfig"]
csp = cfg["SecurityHeadersConfig"]["ContentSecurityPolicy"]["ContentSecurityPolicy"]

ADD = {
    "script-src": ["https://www.clarity.ms", "https://scripts.clarity.ms"],
    "connect-src": [
        "https://analytics.google.com", "https://*.analytics.google.com",
        "https://*.google-analytics.com", "https://stats.g.doubleclick.net", "https://www.google.com",
        "https://*.clarity.ms",
    ],
}
parts = [p.strip() for p in csp.split(";") if p.strip()]
out = []
for p in parts:
    name, *vals = p.split()
    for v in ADD.get(name, []):
        if v not in vals:
            vals.append(v)
    out.append(" ".join([name, *vals]))
new = "; ".join(out)
cfg["SecurityHeadersConfig"]["ContentSecurityPolicy"]["ContentSecurityPolicy"] = new
json.dump(cfg, open(f"{tmp}/new.json", "w"), ensure_ascii=False)
open(f"{tmp}/etag", "w").write(d["ETag"])
print("현재:", csp)
print("변경:", new)
PY
if [[ "${1:-}" == "--apply" ]]; then
  aws cloudfront update-response-headers-policy --id "$POLICY_ID" --if-match "$(cat "$TMP/etag")" \
    --response-headers-policy-config "file://$TMP/new.json" --query 'ResponseHeadersPolicy.Id' --output text
  echo "적용 완료 — CloudFront 전파에 몇 분 걸린다. 확인: curl -sI https://ailens.sedaily.ai/ | grep -i content-security"
else
  echo "(미리보기만 — 적용하려면 --apply)"
fi
