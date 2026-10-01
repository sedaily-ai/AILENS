#!/usr/bin/env bash
# CloudFront에 /_next/image* 동작 추가 (2026-10-01, 이미지 최적화 도입).
#
# 왜: 기본 동작의 캐시 정책(AILens-CachingOptimized-RSC-Aware)은 쿼리스트링을 키에도 원본 전달에도 넣지 않는다.
#     /_next/image?url=...&w=...&q=... 는 쿼리가 전부라서, 이 동작 없이 이미지 최적화를 배포하면 CloudFront가 쿼리를 버려
#     모든 이미지가 깨진다. 그래서 이 스크립트를 프론트 배포보다 먼저 실행한다(순서 중요).
# 무엇: (1) 캐시 정책 AILens-NextImage 생성(쿼리스트링 전체 + Accept 헤더를 키에 포함, 기본 TTL 1일, 최대 1년, gzip/brotli),
#       (2) 배포(E1QS7PY350VHF6)에 PathPattern /_next/image* 동작 추가(GET/HEAD/OPTIONS, 기본 동작과 같은 원본·원본 요청 정책).
# 비용: 새 AWS 리소스 비용 없음(정책·동작은 무료). 이미지는 CloudFront에 캐시되어 서버 부하도 줄어든다.
# 되돌리기: 배포 설정에서 해당 동작을 지우면 된다(프론트 이미지 최적화를 끄지 않으면 이미지가 깨지므로 둘을 같이 되돌릴 것).
set -euo pipefail

DIST_ID="E1QS7PY350VHF6"
POLICY_NAME="AILens-NextImage"
PATTERN="/_next/image*"

echo "=== 1/2 캐시 정책 $POLICY_NAME ==="
POLICY_ID=$(aws cloudfront list-cache-policies --type custom --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='$POLICY_NAME'].CachePolicy.Id | [0]" --output text)
if [ "$POLICY_ID" = "None" ] || [ -z "$POLICY_ID" ]; then
  POLICY_ID=$(aws cloudfront create-cache-policy --cache-policy-config '{
    "Name": "'"$POLICY_NAME"'",
    "Comment": "Next image optimizer - query strings and Accept header in cache key",
    "DefaultTTL": 86400, "MaxTTL": 31536000, "MinTTL": 0,
    "ParametersInCacheKeyAndForwardedToOrigin": {
      "EnableAcceptEncodingGzip": true, "EnableAcceptEncodingBrotli": true,
      "HeadersConfig": {"HeaderBehavior": "whitelist", "Headers": {"Quantity": 1, "Items": ["Accept"]}},
      "CookiesConfig": {"CookieBehavior": "none"},
      "QueryStringsConfig": {"QueryStringBehavior": "all"}
    }}' --query 'CachePolicy.Id' --output text)
  echo "생성: $POLICY_ID"
else
  echo "이미 있음: $POLICY_ID"
fi

echo "=== 2/2 배포 $DIST_ID 에 $PATTERN 동작 추가 ==="
TMP=$(mktemp -d)
aws cloudfront get-distribution-config --id "$DIST_ID" > "$TMP/cfg.json"
ETAG=$(python3 -c "import json;print(json.load(open('$TMP/cfg.json'))['ETag'])")
python3 - "$TMP" "$POLICY_ID" "$PATTERN" <<'PY'
import json,sys
tmp,policy,pattern=sys.argv[1:4]
j=json.load(open(f'{tmp}/cfg.json')); c=j['DistributionConfig']
items=c['CacheBehaviors'].get('Items',[])
if any(b['PathPattern']==pattern for b in items):
    print('이미 동작이 있음 — 변경 없음'); json.dump(c,open(f'{tmp}/new.json','w')); sys.exit(0)
d=c['DefaultCacheBehavior']
b={'PathPattern':pattern,'TargetOriginId':d['TargetOriginId'],'ViewerProtocolPolicy':d['ViewerProtocolPolicy'],
   'AllowedMethods':{'Quantity':3,'Items':['HEAD','GET','OPTIONS'],'CachedMethods':{'Quantity':2,'Items':['HEAD','GET']}},
   'SmoothStreaming':False,'Compress':True,'CachePolicyId':policy,'OriginRequestPolicyId':d['OriginRequestPolicyId'],
   'LambdaFunctionAssociations':{'Quantity':0},'FunctionAssociations':{'Quantity':0},'FieldLevelEncryptionId':''}
# 구체적인 패턴이 먼저 오도록 맨 앞에 둔다
c['CacheBehaviors']={'Quantity':len(items)+1,'Items':[b]+items}
json.dump(c,open(f'{tmp}/new.json','w'))
print('동작 추가 준비 완료')
PY
aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config "file://$TMP/new.json" --query 'Distribution.Status' --output text
echo "완료 — 전파에 수 분 걸린다. 확인: curl -sI 'https://ailens.sedaily.ai/_next/image?url=...&w=640&q=75' (x-cache 헤더)"
