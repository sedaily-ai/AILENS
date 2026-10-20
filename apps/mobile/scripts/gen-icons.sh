#!/usr/bin/env bash
# 앱 아이콘·스플래시 이미지 생성. 원본은 웹 브랜드 마크(service/frontend/public/icon.svg — 4 페르소나 4색 원).
# 사용: apps/mobile 에서 `bash scripts/gen-icons.sh` (rsvg-convert 필요: brew install librsvg)
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=../../service/frontend/public/icon.svg
OUT=assets/images
mkdir -p "$OUT"

# 마크 본체(원 + 흰 십자선)만 뽑아 임의 캔버스·배율로 배치한다. viewBox 64 기준, 마크 지름 60.
BODY=$(sed -n '/<defs>/,/<circle cx="32" cy="32" r="30" fill="none"/p' "$SRC" | sed '/<\/svg>/d')
# $1=캔버스 한 변, $2=마크 지름(px), $3=배경색(none 이면 투명)
render() {
  local canvas=$1 dia=$2 bg=$3 out=$4
  local scale; scale=$(python3 -c "print($dia/60)")
  local off; off=$(python3 -c "print(($canvas-$dia)/2 - 2*$scale)")
  {
    echo "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"$canvas\" height=\"$canvas\" viewBox=\"0 0 $canvas $canvas\">"
    [ "$bg" != none ] && echo "<rect width=\"$canvas\" height=\"$canvas\" fill=\"$bg\"/>"
    echo "<g transform=\"translate($off $off) scale($scale)\">$BODY</g></svg>"
  } | rsvg-convert -w "$canvas" -h "$canvas" -o "$out"
}
# 단색(안드로이드 알림·테마 아이콘): 원에서 십자선을 비운 흰색 4조각. $1=캔버스, $2=지름, $3=출력
mono() {
  local canvas=$1 dia=$2 out=$3
  local scale; scale=$(python3 -c "print($dia/60)")
  local off; off=$(python3 -c "print(($canvas-$dia)/2 - 2*$scale)")
  cat <<SVG | rsvg-convert -w "$canvas" -h "$canvas" -o "$out"
<svg xmlns="http://www.w3.org/2000/svg" width="$canvas" height="$canvas" viewBox="0 0 $canvas $canvas">
<defs><clipPath id="c"><circle cx="32" cy="32" r="30"/></clipPath>
<mask id="m"><rect width="64" height="64" fill="#fff"/><line x1="32" y1="0" x2="32" y2="64" stroke="#000" stroke-width="4.5"/><line x1="0" y1="32" x2="64" y2="32" stroke="#000" stroke-width="4.5"/></mask></defs>
<g transform="translate($off $off) scale($scale)"><circle cx="32" cy="32" r="30" fill="#fff" mask="url(#m)"/></g></svg>
SVG
}

render 1024 820 '#FFFFFF' "$OUT/icon.png"                 # iOS·기본 아이콘(불투명)
render 1024 640 none      "$OUT/adaptive-foreground.png"  # 안드로이드 적응형 전경(안전 영역 지름 676 안쪽)
mono   1024 600           "$OUT/adaptive-monochrome.png"  # 안드로이드 13 테마 아이콘
render 1024 1024 none     "$OUT/splash-icon.png"          # 스플래시(플러그인이 imageWidth 로 줄여 표시)
mono   96   88            "$OUT/notification-icon.png"    # 알림 작은 아이콘
echo "생성 완료: $OUT"
