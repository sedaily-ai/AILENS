"""AWS Rekognition 얼굴 감지 — `pipelines/webtoon` 전용.

2026-09-08 신설 — 말풍선이 인물 얼굴을 가리는 문제 대응. 기존에는 Claude
비전 모델(bedrock_client.call_vision)에게 "얼굴이 어디 있냐"고 좌표를
추정시켰다(1·2단계 QA 호출의 faces_left_to_right_x, x좌표 하나뿐). LLM은
애초에 정밀 좌표 추정용으로 만들어진 게 아니라 정확도가 낮고, 세로
위치·크기 정보가 아예 없어서 "얼굴 위에 말풍선을 딱 맞춰 그리기"가
불가능했다.

Rekognition DetectFaces는 이 용도로 만들어진 전용 서비스라 정확한
바운딩 박스(x/y/width/height, 0~1 정규화)+신뢰도를 준다. 만화 일러스트
(사진이 아님)에도 잘 동작함을 실측 확인(2026-09-08, 우리 웹툰 컷
8장 기준 주요 인물 신뢰도 98~100%). 비용도 이미지당 약 $0.001로
무시할 수준.

Claude 비전 QA(사극 오염·인물 없음 위반 검사, prompts.VALIDATE_SYSTEM)는
그대로 유지한다 — Rekognition은 "얼굴이 어디 있냐"만 답할 수 있고
"사극이냐 아니냐" 같은 의미적 판단은 못 한다. 이 모듈은 그걸 대체하는
게 아니라, 기존 QA 호출의 faces_left_to_right_x 부분만 더 정확한
전용 서비스로 넘기는 것이다.
"""
from __future__ import annotations

_REGION = "us-east-1"
_client = None


def _get_client():
    global _client
    if _client is None:
        import boto3  # noqa: lazy — 얼굴 감지를 실제로 안 쓰는 경로에서 불필요한 초기화 비용을 피한다.
        _client = boto3.client("rekognition", region_name=_REGION)
    return _client


def detect_main_faces(
    image_bytes: bytes,
    min_confidence: float = 95.0,
    min_width_ratio: float = 0.05,
) -> list[dict]:
    """주요 화자로 볼 수 있는 얼굴만 걸러 반환한다.

    신뢰도·크기 기준 미달은 배경 엑스트라로 간주해 제외한다 — 실측
    (2026-09-08, 배경 인물이 섞인 컷 2개)으로 주요 인물은 신뢰도
    99~100%·상대적으로 큰 크기, 배경 엑스트라는 신뢰도 60~90%대·
    훨씬 작은 크기로 뚜렷이 구분되는 걸 확인했다. 기본값(신뢰도 95%,
    폭 5%)은 그 실측 분포를 기준으로 잡았다.

    반환: [{"left":, "top":, "width":, "height":}, ...] (정규화 좌표
    0~1), 화면 오른쪽부터 왼쪽 순서로 정렬 — published.md의 "첫 화자 =
    dialogue[0] = 오른쪽" 규칙과 그대로 매핑하기 위함(compose_text.py::
    draw_dialogue 참고). 호출 자체가 실패하면(자격 증명 문제 등) 빈
    리스트를 반환한다 — 이 함수를 부르는 쪽이 기존 균등분할 폴백으로
    안전하게 후퇴하게 하기 위함이고, 얼굴 감지 실패가 웹툰 생성 자체를
    막으면 안 된다(가용성 우선, pipeline.py의 다른 QA 폴백들과 같은
    원칙)."""
    try:
        resp = _get_client().detect_faces(Image={"Bytes": image_bytes}, Attributes=["DEFAULT"])
    except Exception as e:  # noqa: BLE001 — 얼굴 감지 자체가 생성 파이프라인을 막으면 안 됨
        print(f"    ⚠️  Rekognition 얼굴 감지 실패(균등분할 폴백): {e}")
        return []

    faces = []
    for fd in resp.get("FaceDetails", []):
        bb = fd.get("BoundingBox") or {}
        if fd.get("Confidence", 0) < min_confidence:
            continue
        if bb.get("Width", 0) < min_width_ratio:
            continue
        faces.append({
            "left": bb["Left"],
            "top": bb["Top"],
            "width": bb["Width"],
            "height": bb["Height"],
        })

    faces.sort(key=lambda f: f["left"], reverse=True)
    return faces
