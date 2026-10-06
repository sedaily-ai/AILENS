"""그림 속 사람·얼굴 위치 찾기(AWS Rekognition) — 말풍선이 얼굴을 덮지 않게 자리를 고르고 꼬리를 화자 쪽으로 향하게 하는 데 쓴다.

실측(실제 컷 8장): 사람 상자는 두 인물 모두 안정적으로 잡히고, 얼굴은 큰 얼굴만 잡힌다.
필요 권한: rekognition:DetectFaces, rekognition:DetectLabels.

반환(모두 이미지 대비 0~1 비율):
  {"persons": [{"l","t","w","h"}...], "faces": [{"l","t","w","h","gender"(선택: "Male"/"Female")}...]}
실패하면 None — 호출부는 고정 배치로 되돌아가야 한다(발행을 막지 않는다).
"""
from __future__ import annotations

import io

_client = None


def _rk():
    global _client
    if _client is None:
        import boto3

        _client = boto3.client("rekognition", region_name="ap-northeast-2")
    return _client


def detect_people(image_bytes: bytes, min_conf: float = 80.0) -> dict | None:
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        im.thumbnail((1000, 1000))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)
        data = buf.getvalue()
        rk = _rk()
        faces = rk.detect_faces(Image={"Bytes": data}, Attributes=["ALL"])["FaceDetails"]
        labels = rk.detect_labels(
            Image={"Bytes": data}, Features=["GENERAL_LABELS"],
            Settings={"GeneralLabels": {"LabelInclusionFilters": ["Person"]}},
        )["Labels"]
    except Exception as e:  # noqa: BLE001 — 권한·네트워크 어느 쪽이든 고정 배치로 폴백
        print(f"[rekognition_people] 감지 실패 — 고정 배치로 진행: {type(e).__name__}: {str(e)[:120]}")
        return None

    def box(bb):
        return {"l": bb["Left"], "t": bb["Top"], "w": bb["Width"], "h": bb["Height"]}

    persons = [
        box(ins["BoundingBox"])
        for lab in labels if lab["Name"] == "Person"
        for ins in lab.get("Instances", []) if ins["Confidence"] >= min_conf
    ]
    # 같은 사람이 두 번 잡힌 경우(중심이 가깝고 크기가 비슷) 큰 쪽만 남긴다
    persons.sort(key=lambda b: -(b["w"] * b["h"]))
    kept: list[dict] = []
    for p in persons:
        cx = p["l"] + p["w"] / 2
        if all(abs(cx - (k["l"] + k["w"] / 2)) > 0.08 or p["w"] * p["h"] < 0.02 for k in kept):
            kept.append(p)
    out_faces = []
    for f in faces:
        if f["Confidence"] < min_conf:
            continue
        b = box(f["BoundingBox"])
        g = f.get("Gender") or {}
        if g.get("Confidence", 0) >= 85:  # 성별이 확실한 얼굴만 — 화자(A=여성, B=남성)와 인물을 잇는 데 쓴다
            b["gender"] = g.get("Value")
        out_faces.append(b)
    return {"persons": kept, "faces": out_faces}
