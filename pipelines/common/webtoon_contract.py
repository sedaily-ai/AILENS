"""CMS·배치가 공유하는 스토리보드 및 이미지 옵션 계약. 외부 호출 없음."""
import re
import unicodedata

# 원문 인용(source_excerpt) 비교에서 무시하는 글자. 모델이 옮겨 적으며 따옴표 모양·가운뎃점·쉼표·공백을
# 자주 바꾸지만 사실 내용은 그대로다. ㆍ(U+318D)는 NFKC가 다른 글자로 바꾸므로 정규화 전에도 지운다.
_EXCERPT_IGNORED = re.compile("[\\s,，\"'`´“”„‟‘’‚‛「」『』《》〈〉«»‹›＂＇·‧∙•・･ㆍ]")
_EXCERPT_DASHES = re.compile("[‐‑‒–—―−]")
# 떨어진 구절을 이어 붙인 표시. 조각마다 원문에 있는지 따로 확인한다.
_EXCERPT_GAP = re.compile(r"…|‥|\.{2,}|[(\[]\s*중략\s*[)\]]")
_EXCERPT_EDGE = ".!?;:。"
_HANGUL = re.compile("[가-힣ㄱ-ㅎㅏ-ㅣ]")
_HANGUL_RUN = re.compile("[가-힣ㄱ-ㅎㅏ-ㅣ]+(?:[\\s·,.]+[가-힣ㄱ-ㅎㅏ-ㅣ]+)*")
_EMPTIED_PAIR = re.compile("[\"“‘(\\[]\\s*\x00\\s*[\"”’)\\]]")


SCRIPT_OUTPUT_ADDENDUM = (
    "\n\n---\n### 출력 형식 (코드 보강)\n"
    "지침의 JSON 스키마에 맞춰 컷 8개를 작성한다. 각 cuts 원소의 image_prompt는 "
    "이미지 한 장을 독립적으로 생성할 수 있는 완성된 영어 문단이다. 독자용 자막과 편집 설명은 한국어로 작성한다. "
    "구도와 장소는 기사 내용 및 지침에 맞게 선택한다. "
    "원문 근거가 부족해 8컷을 구성할 수 없으면 사실을 만들지 말고 "
    'generation_status="needs_article", cuts=[], planning에 부족한 정보를 적는다. '
    "다른 설명 없이 JSON 객체 하나만 응답한다."
)


def image_options(data: dict) -> dict:
    """누락 옵션은 명시적으로 비운다. seed=0은 공급자의 무작위 생성 옵션이다."""
    negative = data.get("negative_prompt", "")
    if not isinstance(negative, str) or len(negative) > 8000:
        raise ValueError("negative_prompt는 8000자 이하의 문자열이어야 합니다.")
    seed = data.get("image_seed")
    if seed is not None and (type(seed) is not int or not 0 <= seed <= 4294967294):
        raise ValueError("image_seed는 0~4294967294 정수여야 합니다.")
    return {"negative_prompt": negative, "image_seed": seed}


def _normalize_quote(text: str) -> str:
    text = unicodedata.normalize("NFKC", _EXCERPT_IGNORED.sub("", text))
    return _EXCERPT_IGNORED.sub("", _EXCERPT_DASHES.sub("-", text))


def _excerpt_in_article(excerpt: object, article_norm: str) -> bool:
    if not isinstance(excerpt, str):
        return False
    pieces = [_normalize_quote(p).strip(_EXCERPT_EDGE) for p in _EXCERPT_GAP.split(excerpt)]
    pieces = [p for p in pieces if p]
    return bool(pieces) and all(p in article_norm for p in pieces)


def _strip_hangul(prompt: str) -> str:
    """영어 image_prompt에 섞인 한글을 지운다. 한글만 담겨 있던 따옴표·괄호도 같이 지운다."""
    text = _EMPTIED_PAIR.sub("", _HANGUL_RUN.sub("\x00", prompt)).replace("\x00", "")
    return re.sub(r" +([,.;:])", r"\1", re.sub(r"[ \t]{2,}", " ", text)).strip()


def validate_storyboard(script: dict, article: str | None = None) -> list[str]:
    """이미지 생성 전에 각본을 검사한다. 고칠 수 있는 형식 문제는 script를 제자리에서 고치고 진행한다.

    거절(ValueError): 근거 부족 보류, 8컷이 아님, 빈 image_prompt, 잘못된 이미지 옵션, 근거 목록 없음,
    원문과 맞지 않는 인용이 절반을 넘음. 뉴스 신뢰와 직결되거나 코드가 고칠 수 없는 문제다.
    고치고 진행: 컷 번호(배열 순서대로 1~8), 영어 image_prompt에 섞인 한글(지움), 목록에 없는 컷 근거 번호(뺌).
    기록만: 근거 번호가 없는 컷, 원문과 정확히 맞지 않는 인용 일부.
    2026-10-29 전에는 이 항목들과 자막 70자 초과도 각본 전체를 거절했다. 자막이 그림에 들어가는지는
    합성 단계(compose_text.draw_narration)가 판단한다. 고치거나 기록한 내용을 로그용으로 돌려준다."""
    notes: list[str] = []
    if script.get("generation_status") == "needs_article":
        raise ValueError("기사 근거가 부족합니다. " + str(script.get("planning") or "기사 전문을 보완해 주세요.")[:500])
    cuts = script.get("cuts")
    if not isinstance(cuts, list) or len(cuts) != 8 or any(not isinstance(c, dict) for c in cuts):
        raise ValueError("스토리보드는 정확히 8개의 컷 객체가 필요합니다.")
    if any(not isinstance(c.get("image_prompt"), str) for c in cuts):
        raise ValueError("모든 컷에 완성된 image_prompt가 필요합니다.")
    ready = script.get("generation_status") == "ready"
    if ready and script.get("image_prompt_language") == "en":
        mixed = [n for n, c in enumerate(cuts, 1) if _HANGUL.search(c["image_prompt"])]
        for n in mixed:
            cuts[n - 1]["image_prompt"] = _strip_hangul(cuts[n - 1]["image_prompt"])
        emptied = [str(n) for n in mixed if not cuts[n - 1]["image_prompt"]]
        if emptied:
            raise ValueError(f"이미지 모델용 image_prompt는 영어로 작성해 주세요. 한글을 빼면 비는 컷: {', '.join(emptied)}")
        if mixed:
            notes.append(f"영어 image_prompt에 섞인 한글을 지움(컷 {', '.join(map(str, mixed))})")
    if any(not c["image_prompt"].strip() for c in cuts):
        raise ValueError("모든 컷에 완성된 image_prompt가 필요합니다.")
    image_options(script)
    if not ready:
        return notes
    if [c.get("cut") for c in cuts] != list(range(1, 9)):
        notes.append(f"컷 번호 {[c.get('cut') for c in cuts]}를 순서대로 1~8로 다시 매김")
        for n, c in enumerate(cuts, 1):
            c["cut"] = n
    facts = script.get("selected_facts", [])
    if not isinstance(facts, list) or not facts or any(not isinstance(f, dict) for f in facts):
        raise ValueError("기사 근거 selected_facts가 필요합니다.")
    ids = [f.get("fact_id") for f in facts]
    if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("사실 ID는 비어 있지 않은 고유 문자열이어야 합니다.")
    if article is not None:
        article_norm = _normalize_quote(article)
        bad = [f["fact_id"] for f in facts if not _excerpt_in_article(f.get("source_excerpt"), article_norm)]
        if len(bad) * 2 > len(facts):
            raise ValueError(
                f"기사 원문과 맞지 않는 source_excerpt가 {len(facts)}개 중 {len(bad)}개입니다({', '.join(bad[:5])}). "
                "source_excerpt는 기사 문장을 고치지 말고 그대로 옮겨 적어 주세요."
            )
        if bad:
            notes.append(f"원문과 정확히 맞지 않는 근거 인용 {len(bad)}/{len(facts)}개({', '.join(bad)})")
    known, unlinked = set(ids), []
    for c in cuts:
        raw = c.get("fact_ids")
        raw = [raw] if isinstance(raw, str) else raw if isinstance(raw, list) else []
        kept = [i for i in raw if isinstance(i, str) and i in known]
        if len(kept) != len(raw):
            notes.append(f"컷 {c['cut']}의 목록에 없는 근거 번호를 뺌({raw})")
        c["fact_ids"] = kept
        if not kept:
            unlinked.append(str(c["cut"]))
    if unlinked:
        notes.append(f"근거 번호가 없는 컷: {', '.join(unlinked)}")
    return notes


def cut_metadata(script: dict, cut: dict) -> dict:
    """근거와 이미지 설정을 컷에 함께 보관하여 저장·재개·이미지 요청에도 유지한다."""
    ids = cut.get("fact_ids", [])
    facts = script.get("selected_facts", [])
    if not isinstance(ids, list) or any(not isinstance(i, str) for i in ids):
        raise ValueError("fact_ids는 문자열 배열이어야 합니다.")
    if not isinstance(facts, list) or any(not isinstance(f, dict) for f in facts):
        raise ValueError("selected_facts는 객체 배열이어야 합니다.")
    by_id = {f.get("fact_id"): f for f in facts if isinstance(f.get("fact_id"), str)}
    if any(i not in by_id for i in ids):
        raise ValueError("컷의 fact_ids가 selected_facts에 연결되지 않습니다.")
    return {
        **image_options({**script, **cut}),
        "fact_ids": ids,
        "cut_function": cut.get("cut_function", ""),
        "selected_facts": [by_id[i] for i in ids],
        "location_id": cut.get("location_id", ""),
    }
