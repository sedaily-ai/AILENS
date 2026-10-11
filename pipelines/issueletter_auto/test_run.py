"""run.py 전체 흐름을 모델·서버 호출을 가짜로 바꿔 확인한다(실제 호출 없음)."""
import json
import sys
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import core
import run

ARTS = [{"key": str(i), "title": f"라네즈 소식 {i}", "content": f"인도법인 매출은 176억 원, 265억 원이다. 필리핀은 73억 원. 기사{i}", "date": "2026-10-09"} for i in range(1, 5)]
EDITORS = [{"slug": "mincheol", "name": "민철", "role": "전략", "topic_names": ["글로벌 리밸런싱", "인도"]}, {"slug": "soyul", "name": "소율", "role": "트렌드", "topic_names": ["소비"]}]


def good_draft():
    L = lambda k: core.sedaily_url(str(k))
    return {"slug": "2026-10-11-x", "title": "t", "deck": "d", "summary": ["매출 176억 원"], "editor_note": "e", "categories": ["industry"], "topics": ["글로벌 리밸런싱", "인도"],
            "sections": [{"axis": "news", "heading": "h", "key_line": "k", "paragraphs": [["a ", {"text": "x", "href": L(1)}, " 265억 원"]]}],
            "sources": [{"url": L(1), "axes": ["news"]}, {"url": L(2), "axes": ["news"]}, {"url": L(3), "axes": ["other"]}],
            "poll": {"kind": "emotion", "question": "q", "options": [{"key": "unsure", "label": "잘 모르겠어요"}]}}


class Api:
    def __init__(self, reject_first=0, publish_ok=True):
        self.calls = []
        self.saved = 0
        self.reject_first = reject_first
        self.publish_ok = publish_ok

    def __call__(self, method, path, body=None, public=False):
        self.calls.append((method, path))
        if path.startswith("/admin/issue-letters?"):
            return 200, {"letters": []}
        if path == "/admin/issue-letters/archives":
            return 200, {"archived": []}
        if path.endswith("/editors") and public:
            return 200, {"editors": EDITORS}
        if path == "/api/v2/issue-letters/editors":
            return 200, {"editors": EDITORS}
        if path == "/admin/issue-letters":
            self.saved += 1
            if self.saved <= self.reject_first:
                return 422, {"detail": "금지어 포함"}
            return 200, {"letter": {"id": 7, "slug": body["data"]["slug"]}}
        if path.endswith("/submit"):
            return 200, {}
        if path.endswith("/publish"):
            return (200, {"send": {"sent": 2}}) if self.publish_ok else (422, {"detail": "발행 규칙 위반"})
        return 404, {}


def go(api, drafts, clusters=None, live=True, fact_problems=None):
    clusters = clusters if clusters is not None else [{"topic": "라네즈", "keys": ["1", "2", "3", "4"]}]
    it = iter(drafts)
    with mock.patch.object(run, "api", api), mock.patch.object(run, "fetch_recent_articles", lambda: ARTS), \
         mock.patch.object(run, "make_draft", lambda p, f="": next(it, None)), \
         mock.patch.object(run, "call_model", lambda s, u, max_tokens=0: json.dumps(clusters)), \
         mock.patch.object(run, "fact_check", lambda d, c: fact_problems or []), \
         mock.patch.object(run, "WINDOW", (0, 24)):
        return run.run(dry_run=not live)


def test_happy_path_publishes_with_editors():
    api = Api()
    out = go(api, [good_draft()])
    assert out["published"] == 1 and out["letter_id"] == 7
    assert ("POST", "/admin/issue-letters/7/submit") in api.calls and ("POST", "/admin/issue-letters/7/publish") in api.calls


def test_dry_run_saves_draft_but_never_publishes():
    api = Api()
    out = go(api, [good_draft()], live=False)
    assert out["published"] == 0 and "드라이런" in out["stopped"]
    assert not any(p.endswith("/publish") for _, p in api.calls)


def test_invented_number_is_retried_then_stops_without_publish():
    bad = good_draft()
    bad["summary"] = ["매출 999억 원"]
    api = Api()
    out = go(api, [bad, bad, bad])
    assert out["published"] == 0 and "3회" in out["stopped"] and "999" in out["last_feedback"]
    assert api.saved == 0  # 검증을 통과하지 못한 초안은 서버에 저장조차 하지 않는다


def test_outside_link_is_rejected():
    bad = good_draft()
    bad["sections"][0]["paragraphs"][0][1]["href"] = core.sedaily_url("99")
    assert go(Api(), [bad, bad, bad])["published"] == 0


def test_server_rejection_is_fed_back_and_second_try_publishes():
    out = go(Api(reject_first=1), [good_draft(), good_draft()])
    assert out["published"] == 1


def test_no_matching_editor_stops():
    d = good_draft()
    d["topics"] = ["한옥"]
    out = go(Api(), [d])
    assert out["published"] == 0 and "에디터" in out["stopped"]


def test_no_cluster_means_no_post():
    out = go(Api(), [good_draft()], clusters=[{"topic": "작음", "keys": ["1", "2"]}])
    assert out["published"] == 0 and "묶음" in out["stopped"]


def test_publish_rejection_is_reported_not_swallowed():
    out = go(Api(publish_ok=False), [good_draft()])
    assert out["published"] == 0 and "발행 거부" in out["stopped"]


def test_window_blocks_live_publish_outside_hours():
    with mock.patch.object(run, "WINDOW", (25, 26)), mock.patch.object(run, "api", Api()):
        assert "시각 창" in run.run(dry_run=False)["stopped"]


def test_advice_terms_are_rejected_even_when_quoted():
    bad = good_draft()
    bad["sections"][0]["paragraphs"][0].append(" 연구원은 분할 매수로 대응해야 한다고 말했어요")
    api = Api()
    out = go(api, [bad, bad, bad])
    assert out["published"] == 0 and "권유" in out["last_feedback"] and api.saved == 0


def test_fact_check_problem_blocks_publish():
    out = go(Api(), [good_draft()] * 3, fact_problems=["이경민 연구원 직함이 기사와 다름"])
    assert out["published"] == 0 and "3회" in out["stopped"]


def test_key_line_prefix_is_stripped_before_save():
    d = good_draft()
    d["sections"][0]["key_line"] = "핵심: 매출이 늘었어요"
    api = Api()
    seen = {}
    orig = api.__call__

    def spy(method, path, body=None, public=False):
        if path == "/admin/issue-letters":
            seen["kl"] = body["data"]["sections"][0]["key_line"]
        return orig(method, path, body, public)

    assert go(spy, [d])["published"] == 1 and seen["kl"] == "매출이 늘었어요"
