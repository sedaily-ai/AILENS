"""PRISM 썸네일(prism_thumbnail) — 문구 검사·같은 날 기록 읽기·그리기. AWS·AI는 부르지 않는다."""
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

from PIL import Image  # noqa: E402

import prism_thumbnail as pt  # noqa: E402

SCRIPT = ("Foreign investors have sold 223 trillion won of Korean shares this year. "
          "Jensen Huang returned as Nvidia CEO after 11 days. Samsung Electronics and SK Hynix took 85 percent. "
          "The KOSPI fell to 4,300 at one point.")


def test_numbers_must_appear_in_script():
    assert pt.check({"kicker": "FOREIGN SELLING", "headline": "223 TRILLION", "tag": ""}, SCRIPT) == []
    assert pt.check({"kicker": "KOSPI FLOOR?", "headline": "4,300?", "tag": ""}, SCRIPT) == []  # 쉼표 무시
    # "1"은 "11" 속에, "4"는 "4,300" 속에만 있다 — 숫자 일부로 맞추면 안 된다
    problems = pt.check({"kicker": "", "headline": "1 IN 4?", "tag": ""}, SCRIPT)
    assert any('"1"' in p for p in problems) and any('"4"' in p for p in problems)
    # 소수점 뒤를 떼어 낸 반올림도 안 된다
    assert pt.check({"headline": "223 TRILLION"}, "They sold 223.3 trillion won.") != []
    assert pt.check({"headline": "223.3 TRILLION"}, "They sold 223.3 trillion won.") == []
    assert pt.check({"headline": "6.32%"}, "The index rose 6.32 percent.") == []


def test_number_words_are_rejected():
    assert pt.check({"kicker": "BACK AFTER", "headline": "ELEVEN DAYS", "tag": ""}, SCRIPT) == [
        "write numbers as digits, as in the script"]


def test_tag_and_person_must_be_in_script():
    assert pt.check({"headline": "11 DAYS", "tag": "Jensen Huang · Nvidia", "person": "Jensen Huang"}, SCRIPT) == []
    problems = pt.check({"headline": "11 DAYS", "tag": "Nvidia · Seoul Economic Daily", "person": "Andrew Kang"}, SCRIPT)
    assert any("Seoul Economic Daily" in p for p in problems)
    assert any("Andrew Kang" in p for p in problems)


def test_empty_headline_is_rejected():
    assert "headline is empty" in pt.check({"kicker": "KOSPI", "headline": ""}, SCRIPT)


class FakeS3:
    def __init__(self, objects):
        self.objects = objects

    def get_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise Exception("AccessDenied")  # 영상 서버 역할엔 ListBucket이 없어 없는 파일도 403으로 온다
        return {"Body": io.BytesIO(json.dumps(self.objects[Key]).encode())}


def test_used_today_reads_other_jobs_from_daily_manifest():
    import datetime as dt
    day = dt.date(2026, 11, 26)
    s3 = FakeS3({
        "media/prism-auto/20261126.json": {"items": [{"job_id": "a"}, {"job_id": "b"}, {"job_id": "me"}]},
        "media/prism-thumb/20261126/a.json": {"fp": 1, "headline": "11 DAYS"},
        "media/prism-thumb/20261126/me.json": {"fp": 2, "headline": "MINE"},
        # b는 아직 썸네일을 안 만들었다
    })
    used = pt._used_today(s3, day, "me")
    assert used == [{"fp": 1, "headline": "11 DAYS"}]


def test_used_today_without_manifest_skips_check():
    import datetime as dt
    assert pt._used_today(FakeS3({}), dt.date(2026, 11, 26), "me") == []


def test_same_photo_fingerprint():
    im = Image.new("RGB", (400, 300), (30, 30, 30))
    im.paste((220, 220, 220), (0, 0, 200, 300))
    a = io.BytesIO(); im.save(a, "JPEG", quality=95)
    b = io.BytesIO(); im.resize((800, 600)).save(b, "JPEG", quality=60)  # 크기·화질만 다른 같은 사진
    assert pt._same_photo(pt.fingerprint(a.getvalue()), pt.fingerprint(b.getvalue()))


def test_render_sizes():
    im = Image.new("RGB", (1200, 800), (90, 120, 150))
    face = [(0.55, 0.15, 0.85, 0.6, 3.0)]  # 오른쪽 위 얼굴
    hook = {"kicker": "NVIDIA CEO IS BACK", "headline": "11 DAYS", "tag": "Jensen Huang · Nvidia"}
    for W, H, vertical in ((1280, 720, False), (1080, 1920, True)):
        out = Image.open(io.BytesIO(pt.render(im, face, hook, W, H, vertical)))
        assert out.size == (W, H)
        assert out.format == "JPEG"
