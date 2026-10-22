"""CMS·배치가 공유하는 스토리보드 및 이미지 옵션 계약. 외부 호출 없음."""
import re


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


def validate_storyboard(script: dict, article: str | None = None) -> None:
    if script.get("generation_status") == "needs_article":
        raise ValueError("기사 근거가 부족합니다. " + str(script.get("planning") or "기사 전문을 보완해 주세요.")[:500])
    cuts = script.get("cuts")
    if not isinstance(cuts, list) or len(cuts) != 8 or any(not isinstance(c, dict) for c in cuts):
        raise ValueError("스토리보드는 정확히 8개의 컷 객체가 필요합니다.")
    if any(not isinstance(c.get("image_prompt"), str) or not c["image_prompt"].strip() for c in cuts):
        raise ValueError("모든 컷에 완성된 image_prompt가 필요합니다.")
    image_options(script)
    if script.get("generation_status") == "ready":
        if [c.get("cut") for c in cuts] != list(range(1, 9)):
            raise ValueError("컷 번호는 1부터 8까지 순서대로 작성해야 합니다.")
        facts = script.get("selected_facts", [])
        if not isinstance(facts, list) or not facts or any(not isinstance(f, dict) for f in facts):
            raise ValueError("기사 근거 selected_facts가 필요합니다.")
        ids = [f.get("fact_id") for f in facts]
        if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
            raise ValueError("사실 ID는 비어 있지 않은 고유 문자열이어야 합니다.")
        if article is not None and any(
            not isinstance(f.get("source_excerpt"), str) or not f["source_excerpt"].strip()
            or f["source_excerpt"] not in article for f in facts
        ):
            raise ValueError("기사 원문에 없는 source_excerpt가 있습니다.")
        for c in cuts:
            if not c.get("fact_ids"):
                raise ValueError("모든 컷은 기사 근거 fact_ids에 연결되어야 합니다.")
            if len(c.get("narration") or "") > 70:
                raise ValueError("설명 자막은 컷당 70자 이내로 작성해야 합니다.")
            if script.get("image_prompt_language") == "en" and re.search(r"[가-힣]", c["image_prompt"]):
                raise ValueError("이미지 모델용 image_prompt에는 영어만 사용해 주세요.")


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
