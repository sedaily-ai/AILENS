"""video 파이프라인 1단계 — 기사 1건 → 렌더용 각본 JSON.

`pipelines/README.md`의 "아직 없는 것" 항목("기사 → 각본 JSON"이 스크래치
패드 1회성 스크립트로만 존재)을 해소한다 — letters/podcast/webtoon과
같은 방식으로 `pipelines/common`(ddb_prompt, openai_client)을 재사용하는
Python 스크립트로 승격했다. Node 프로젝트(video/) 안에 있지만 렌더
(scripts/render.ts)와는 별개 실행 — GPT 호출은 Python이 더 자연스럽고
common/을 그대로 쓸 수 있어서 언어를 억지로 맞추지 않았다
(pipelines/README.md의 "왜 언어가 섞여 있나"와 같은 이유).

2026-08-21 신설. 같은 날 세션에서 GV90·트럼프北핵·전력망·SK하이닉스·
코스닥급락 5건 전부 GPT가 만든 JSON이 스키마를 위반해(빈 `data` 필드,
화이트리스트 밖 아이콘) 사람이 매번 스크래치패드에서 즉석으로 고쳐야
했던 걸 자동화한 것 — `fix_script()`가 그 후처리를 코드로 흡수한다.

**의도적으로 안 고치는 것**: `stat`/`diagram`/`chart` 컷의 `data`가
비어있거나 `chart.points`가 2개 미만인 경우는 자동으로 채우지 않고
에러로 멈춘다 — 이건 수치·팩트가 빠진 것이라, 임의로 채우면 없는
통계를 지어내는 셈이 되기 때문이다(뉴스 콘텐츠라 이 선은 지킨다).
아이콘·`opening` 컷의 `data.icon`처럼 순수 장식(사실 정보 없음)만
자동으로 채우거나 화이트리스트로 치환한다.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from openai_client import call_text

# src/components/Icon.tsx의 ICON_MAP과 반드시 같이 갱신할 것 — 여기 없는
# 키는 렌더 시 HelpCircle(물음표)로 조용히 폴백되어 화면이 부실해진다.
ICON_WHITELIST = {
    "smartphone", "arrow-right", "arrow-down", "coin", "coins",
    "alert-triangle", "shield-alert", "phone-call", "credit-card",
    "file-warning", "megaphone", "info", "trending-down", "trending-up",
    "landmark", "scale", "users", "building", "croissant", "map-pin", "car",
}

# 화이트리스트 밖 아이콘 키를 만났을 때 쓰는 키워드 휴리스틱 — 이번 세션
# 5건에서 GPT가 실제로 만들어낸 이름들 기준. 아이콘은 장식이라 오탐해도
# 사실관계엔 영향 없음(그래도 최대한 맥락에 맞게).
_ICON_KEYWORD_FALLBACK = [
    ("up", "trending-up"),
    ("down", "trending-down"),
    ("car", "car"),
    ("chip", "building"),
    ("cpu", "building"),
    ("semiconductor", "building"),
    ("factory", "building"),
    ("pill", "trending-down"),
    ("shuffle", "arrow-right"),
    ("swap", "arrow-right"),
    ("money", "coins"),
    ("coin", "coins"),
    ("warn", "alert-triangle"),
    ("alert", "alert-triangle"),
    ("shield", "shield-alert"),
    ("phone", "phone-call"),
    ("bank", "landmark"),
    ("gov", "landmark"),
    ("scale", "scale"),
    ("court", "scale"),
    ("people", "users"),
    ("user", "users"),
]


def _fallback_icon(name: str) -> str:
    lowered = name.lower()
    for keyword, replacement in _ICON_KEYWORD_FALLBACK:
        if keyword in lowered:
            return replacement
    return "info"


def _fix_icon(name: str) -> str:
    return name if name in ICON_WHITELIST else _fallback_icon(name)


def extract_json_block(text: str) -> dict:
    """GPT 응답(각본 텍스트 + ```json 렌더용 JSON``` 두 블록)에서 JSON만 뽑는다."""
    match = re.search(r"```json\s*\n(.*?)```", text, re.DOTALL)
    if match is None:
        # 언어 태그 없이 ``` 만 쓴 마지막 코드블록을 시도
        blocks = re.findall(r"```\s*\n(.*?)```", text, re.DOTALL)
        json_blocks = [b for b in blocks if b.strip().startswith("{")]
        if not json_blocks:
            raise ValueError("GPT 응답에서 JSON 코드블록을 찾지 못했습니다")
        match_text = json_blocks[-1]
    else:
        match_text = match.group(1)
    return json.loads(match_text)


def fix_script(script: dict) -> tuple[dict, list[str]]:
    """안전한 결함(장식성 필드)만 자동 수정. 반환: (수정된 script, 적용된 수정 로그)"""
    applied: list[str] = []
    fixed_cuts = []
    for i, cut in enumerate(script.get("cuts", [])):
        cut_type = cut.get("type")
        tag = f"cut[{i}]({cut_type})"

        if cut_type in ("closing",) and not (cut.get("narration") or "").strip():
            applied.append(f"{tag}: narration 비어있음 → 컷 제거(브랜드 문구가 클로징 역할)")
            continue

        if cut_type in ("highlight", "closing") and "data" not in cut:
            cut["data"] = {}
            applied.append(f"{tag}: 빈 data 필드 추가")

        if cut_type == "opening":
            data = cut.setdefault("data", {})
            if not data.get("icon"):
                data["icon"] = "info"
                applied.append(f"{tag}: data.icon 누락 → 'info' 기본값")
            elif data["icon"] not in ICON_WHITELIST:
                fixed = _fix_icon(data["icon"])
                applied.append(f"{tag}: 아이콘 '{data['icon']}' → '{fixed}'(화이트리스트 밖)")
                data["icon"] = fixed

        if cut_type == "diagram":
            for node in cut.get("data", {}).get("nodes", []):
                if node.get("kind") == "node" and node.get("icon") and node["icon"] not in ICON_WHITELIST:
                    fixed = _fix_icon(node["icon"])
                    applied.append(f"{tag}: 노드 아이콘 '{node['icon']}' → '{fixed}'(화이트리스트 밖)")
                    node["icon"] = fixed

        fixed_cuts.append(cut)

    script["cuts"] = fixed_cuts
    return script, applied


def validate_script(script: dict) -> list[str]:
    """자동으로 못 고치는(=사실 정보가 빠진) 문제만 에러로 남긴다."""
    errors: list[str] = []
    for i, cut in enumerate(script.get("cuts", [])):
        cut_type = cut.get("type")
        tag = f"cut[{i}]({cut_type})"
        data = cut.get("data")

        if not (cut.get("narration") or "").strip():
            errors.append(f"{tag}: narration이 비어있음(자동 제거 대상은 closing뿐)")
        caption = cut.get("caption")
        if isinstance(caption, str) and not caption.strip():
            errors.append(f"{tag}: caption이 빈 문자열")
        elif isinstance(caption, list) and not caption:
            errors.append(f"{tag}: caption 배열이 비어있음")

        if cut_type == "stat":
            if not data or data.get("value") is None or not data.get("unit") or not data.get("label"):
                errors.append(f"{tag}: data.value/unit/label 중 누락 — 수치 정보 직접 확인 필요")
        elif cut_type == "diagram":
            if not data or not data.get("nodes"):
                errors.append(f"{tag}: data.nodes 누락/비어있음")
        elif cut_type == "chart":
            points = (data or {}).get("points") or []
            if len(points) < 2:
                errors.append(
                    f"{tag}: data.points가 {len(points)}개(최소 2개 필요) — "
                    "임의로 두 번째 값을 지어내지 않으므로 원문에서 비교값을 직접 채울 것"
                )

    return errors


def generate_script(
    name: str, article_path: str, output_root: Path = Path("."), resume: bool = True
) -> Path:
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    tag = f"[{name}]"

    json_path = out / "script.json"
    if resume and json_path.exists():
        print(f"{tag} 각본 JSON 재사용 — {json_path}")
        return json_path

    print(f"{tag} video 프롬프트 로드")
    guide = ddb_prompt.load_prompt("video")

    print(f"{tag} 각본 생성 중...")
    raw = call_text(guide, f"다음 기사 원문으로 영상 각본 + 렌더용 JSON을 만들어주세요.\n\n{article}", max_tokens=4000)
    (out / "raw_response.txt").write_text(raw, encoding="utf-8")

    script = extract_json_block(raw)
    script, applied = fix_script(script)
    for line in applied:
        print(f"{tag} [자동수정] {line}")

    errors = validate_script(script)

    # 2026-08-22 — 지면 1면 자동화 첫 실행에서 오늘 5건 중 4건이 이 에러로
    # 멈췄는데, 실제로 원문에 수치가 없어서가 아니라 GPT가 "산업 전반에
    # 어떤 영향을 미칠까요?" 같은 정성적 문장에 stat 타입(숫자 하나)을
    # 잘못 배정한 경우였다(value가 "?"·"상시 추경"·1처럼 숫자가 아닌
    # 걸 넣어놓은 게 증거). 팩트를 지어내라는 요청이 아니라 "컷 타입을
    # 원문에 맞게 다시 고르라"는 재요청이라 §23 원칙(수치를 지어내지
    # 않는다)과 충돌하지 않는다 — 여전히 재시도 후에도 진짜 수치 누락이면
    # 그대로 에러로 멈춘다.
    if errors:
        print(f"{tag} 검증 실패 {len(errors)}건, 1회 재요청 시도...")
        error_text = "\n".join(f"  - {e}" for e in errors)
        retry_message = (
            f"방금 만든 아래 각본 JSON에 문제가 있습니다:\n{error_text}\n\n"
            "이 문제는 대부분 정성적인 문장(수치가 아닌 서술)에 stat이나 chart "
            "타입을 잘못 배정해서 생깁니다. 문제가 된 컷만 고쳐서 전체 JSON을 "
            "다시 주세요 — 원문에 실제 수치가 있으면 그 값을 정확히 채우고, "
            "원문에 애초에 수치가 없는 정성적 내용이면 stat/chart 대신 "
            "highlight나 closing처럼 수치가 필요 없는 타입으로 바꿔주세요. "
            "없는 수치를 지어내지는 마세요.\n\n"
            f"[원문]\n{article}\n\n[방금 만든 JSON]\n{json.dumps(script, ensure_ascii=False)}"
        )
        try:
            retry_raw = call_text(guide, retry_message, max_tokens=4000)
            retry_script = extract_json_block(retry_raw)
            retry_script, retry_applied = fix_script(retry_script)
            for line in retry_applied:
                print(f"{tag} [자동수정·재시도] {line}")
            retry_errors = validate_script(retry_script)
            if not retry_errors:
                print(f"{tag} 재시도로 해결됨")
                script, errors = retry_script, []
            else:
                print(f"{tag} 재시도해도 {len(retry_errors)}건 남음 — 사람 확인 필요")
                errors = retry_errors
        except Exception as e:
            print(f"{tag} 재시도 자체가 실패({e}) — 원래 에러로 처리")

    json_path.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")

    if errors:
        error_text = "\n".join(f"  - {e}" for e in errors)
        raise ValueError(
            f"{tag} 자동 수정+재시도 후에도 사람 확인이 필요한 문제 {len(errors)}건:\n{error_text}\n"
            f"(JSON은 일단 {json_path}에 저장됨 — 직접 고친 뒤 다시 render 하면 됨)"
        )

    print(f"{tag} 완료 — {json_path}")
    return json_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="기사 원문으로 영상 각본 JSON 생성(렌더 전 단계)")
    parser.add_argument("name", help="출력 폴더명")
    parser.add_argument("article_path", help="기사 원문 텍스트 파일 경로")
    parser.add_argument("--output-root", default="output")
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    path = generate_script(
        args.name, args.article_path, Path(args.output_root), resume=not args.no_resume
    )
    print(f"\n다음: npm run render -- --input {path} --format horizontal --output out/{args.name}.mp4")
