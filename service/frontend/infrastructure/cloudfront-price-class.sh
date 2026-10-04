#!/usr/bin/env bash
# CloudFront 배포(E1QS7PY350VHF6)의 가격 등급을 PriceClass_200(북미·유럽·아시아 엣지)으로 올린다 — 2026-10-03.
# 왜: PriceClass_100은 북미·유럽 엣지만 써서 한국(부천)에서 접속해도 샌프란시스코 엣지(x-amz-cf-pop: SFO)로 갔다 — 요청마다 태평양 왕복 지연.
# 되돌리기: 같은 방식으로 PriceClass_100 지정. 다른 설정은 건드리지 않는다.
# 사용: bash cloudfront-price-class.sh [PriceClass_200]
set -euo pipefail
DIST="E1QS7PY350VHF6"
CLASS="${1:-PriceClass_200}"
TMP="$(mktemp -d)"
aws cloudfront get-distribution-config --id "$DIST" --output json > "$TMP/cur.json"
python3 - "$TMP" "$CLASS" <<'PY'
import json, sys
tmp, cls = sys.argv[1], sys.argv[2]
d = json.load(open(f"{tmp}/cur.json"))
cfg = d["DistributionConfig"]
print("현재:", cfg["PriceClass"], "->", cls)
cfg["PriceClass"] = cls
json.dump(cfg, open(f"{tmp}/new.json", "w"))
open(f"{tmp}/etag", "w").write(d["ETag"])
PY
aws cloudfront update-distribution --id "$DIST" --if-match "$(cat "$TMP/etag")" --distribution-config "file://$TMP/new.json" --query 'Distribution.[Status,DistributionConfig.PriceClass]' --output text
