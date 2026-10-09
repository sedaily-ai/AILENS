#!/bin/bash
# 스모크 테스트 — 주요 주소가 기대한 상태 코드를 주는지 확인한다.
# 홈만 확인하는 배포 후 점검으로는 동적 라우트(/timeline/{날짜} 등)의 500을 잡지 못하며, 로컬 dev 서버에서는 보이지 않는 오류도 있다.
#
# 사용:
#   scripts/smoke.sh                       — 운영(https://ailens.sedaily.ai)
#   scripts/smoke.sh http://localhost:3011 — 로컬 운영 모드(`next build && next start -p 3011`) 확인
# 종료 코드: 모두 통과 0, 하나라도 실패 1. 배포 직후에는 CloudFront 무효화가 끝나기까지 실패할 수 있어 각 주소를 몇 번 다시 시도한다.
set -u

BASE="${1:-https://ailens.sedaily.ai}"
RETRIES="${SMOKE_RETRIES:-6}"
WAIT="${SMOKE_WAIT:-10}"

FAILED=()
PASSED=0

# check <경로> <기대 코드>
check() {
  local path="$1" want="$2" got="" i
  for i in $(seq 1 "$RETRIES"); do
    got=$(curl -s -o /dev/null --max-time 40 -w "%{http_code}" "${BASE}${path}" || true)
    [ "$got" = "$want" ] && break
    [ "$i" -lt "$RETRIES" ] && sleep "$WAIT"
  done
  if [ "$got" = "$want" ]; then
    PASSED=$((PASSED + 1))
    printf "  ok   %s %s\n" "$want" "$path"
  else
    FAILED+=("$path (기대 $want, 실제 ${got:-없음})")
    printf "  FAIL %s %s → %s\n" "$want" "$path" "${got:-없음}"
  fi
}

echo "=== 스모크 테스트: ${BASE} ==="

# 페이지
for p in / /lens /markets /signal /property /industry /finance /international /culture /words /timeline /paper/2026-10-02; do
  check "$p" 200
done

# 날짜 동적 라우트 — 최근(S3 구간)·과거(빅카인즈 구간) 둘 다
check /timeline/2026-10-02 200
check /timeline/2010-05-05 200
check /timeline/era/imf-1997 200
check /timeline/chronicle 200
check /timeline/decade/1990s 200
check /timeline/decade/2020s 200

# 폐기한 주소는 /lens로 영구 이동(308)
for p in /webtoon /video /listen; do
  check "$p" 308
done

# 검색엔진·AI용 파일
for p in /sitemap.xml /robots.txt /llms.txt /rss.xml; do
  check "$p" 200
done

# 실제 기사·상세 — sitemap에서 하나씩 뽑는다(없으면 건너뛴다)
SITEMAP=$(curl -s --max-time 40 "${BASE}/sitemap.xml" || true)
pick() { echo "$SITEMAP" | grep -oE "<loc>[^<]*${1}[^<]*</loc>" | head -1 | sed -E "s#<loc>https?://[^/]+##; s#</loc>##"; }
for kind in "/webtoon/" "/video/" "/listen/"; do
  p=$(pick "$kind")
  [ -n "$p" ] && check "$p" 200
done
ARTICLE=$(echo "$SITEMAP" | grep -oE "<loc>[^<]*/(markets|property|economy|finance|industry|politics|national|international|culture)/20[0-9]{2}/[^<]*</loc>" | head -1 | sed -E "s#<loc>https?://[^/]+##; s#</loc>##")
[ -n "$ARTICLE" ] && check "$ARTICLE" 200

echo ""
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "스모크 테스트 실패 ${#FAILED[@]}건 (통과 ${PASSED}건):" >&2
  printf '  - %s\n' "${FAILED[@]}" >&2
  exit 1
fi
echo "스모크 테스트 통과 (${PASSED}건)"
