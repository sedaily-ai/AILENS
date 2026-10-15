"""모아쓰기 레터 라우트(공개 조회·투표·구독, 관리자 작성·발행·발송).

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
import datetime
import logging
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
from fastapi.responses import JSONResponse
import editors_repo
import post_votes_repo
import interests_repo
import letter_subscriptions_repo
import issue_letters_repo
import topics_repo
from route_guards import _check_admin_token, _letter_call

router = APIRouter()


@router.get("/api/v2/posts/{slug}/vote")
def get_post_vote(slug: str, x_voter_id: Optional[str] = Header(default=None)):
    """1기사 레터 투표: 내 투표 여부(투표한 사람에게만 집계)."""
    return JSONResponse(_letter_call(post_votes_repo.my_vote, slug, x_voter_id or ""), headers={"Cache-Control": "no-store"})


@router.post("/api/v2/posts/{slug}/vote")
def post_post_vote(slug: str, payload: Dict[str, Any] = Body(...), x_voter_id: Optional[str] = Header(default=None)):
    result, changed = _letter_call(post_votes_repo.vote, slug, x_voter_id or "", str(payload.get("option_key") or ""))
    return JSONResponse({**result, "changed": changed}, headers={"Cache-Control": "no-store"})


@router.get("/api/v2/issue-letters")
def list_issue_letters(category: Optional[str] = Query(default=None), limit: int = Query(default=20),
                       before: Optional[str] = Query(default=None)):
    letters = _letter_call(issue_letters_repo.list_published, category, limit, before)
    return JSONResponse({"letters": letters}, headers={"Cache-Control": "public, max-age=60"})


# ── 공개 주제 사전 ─ 정적 경로를 `{slug}`보다 먼저 정의한다.
@router.get("/api/v2/issue-letters/bundles")
def issue_letter_bundles():
    return JSONResponse({"bundles": _letter_call(interests_repo.list_bundles)}, headers={"Cache-Control": "public, max-age=300"})


@router.get("/api/v2/issue-letters/topics")
def issue_letter_topics():
    topics = _letter_call(topics_repo.list_topics, True)
    return JSONResponse({"topics": [{"slug": t["slug"], "name": t["name"], "kind": t["kind"], "category_slug": t["category_slug"]} for t in topics]},
                        headers={"Cache-Control": "public, max-age=300"})


# ── 이메일 구독(Phase 2) ─ 가입 → 메일 확인 → 수신거부. 응답으로 주소의 가입 여부를 알리지 않는다.
@router.post("/api/v2/issue-letters/subscriptions")
def post_letter_subscription(payload: Dict[str, Any] = Body(...), x_voter_id: Optional[str] = Header(default=None)):
    rh = None
    if x_voter_id:
        rh = _letter_call(interests_repo.reader_hash, x_voter_id)
    result = _letter_call(letter_subscriptions_repo.subscribe, payload.get("email"), payload.get("interests"), payload.get("frequency"),
                          payload.get("send_hour"), payload.get("consent"), rh, editors=payload.get("editors"))
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


@router.get("/api/v2/issue-letters/editors")
def issue_letter_editors():
    """레터 에디터 목록(공개). 소개·이미지·음성 경로는 관리자 화면에서 고친다."""
    # 내부 DB 번호(id)는 화면이 쓰지 않으므로 내보내지 않는다.
    editors = [{k: v for k, v in e.items() if k not in ("id", "is_active", "sort_order")} for e in _letter_call(editors_repo.list_editors)]
    return JSONResponse({"editors": editors}, headers={"Cache-Control": "public, max-age=300"})


@router.get("/api/v2/issue-letters/subscriptions/preview")
def get_letter_subscription_preview():
    """구독 대화상자의 "이렇게 와요" 미리보기(가장 최근 레터로 만든 메일 본문). 메일은 보내지 않는다."""
    return JSONResponse(_letter_call(letter_subscriptions_repo.preview_mail), headers={"Cache-Control": "public, max-age=300"})


@router.post("/api/v2/issue-letters/subscriptions/test")
def post_letter_subscription_test(payload: Dict[str, Any] = Body(...)):
    """구독 신청 전에 메일이 실제로 오는지 확인하는 샘플 한 통(가장 최근 레터). 주소당 10분 1회·하루 3회."""
    return JSONResponse(_letter_call(letter_subscriptions_repo.send_test_mail, payload.get("email")), headers={"Cache-Control": "no-store"})


@router.post("/api/v2/issue-letters/subscriptions/confirm")
def post_letter_subscription_confirm(payload: Dict[str, Any] = Body(...)):
    return JSONResponse(_letter_call(letter_subscriptions_repo.confirm, payload.get("token")), headers={"Cache-Control": "no-store"})


@router.post("/api/v2/issue-letters/subscriptions/unsubscribe")
def post_letter_subscription_unsubscribe(payload: Dict[str, Any] = Body(...)):
    return JSONResponse(_letter_call(letter_subscriptions_repo.unsubscribe, payload.get("token")), headers={"Cache-Control": "no-store"})


@router.get("/api/v2/issue-letters/{slug}")
def get_issue_letter(slug: str):
    letter = _letter_call(issue_letters_repo.get_published, slug)
    if not letter:
        raise HTTPException(status_code=404, detail="letter not found")
    return JSONResponse({"letter": letter}, headers={"Cache-Control": "public, max-age=60"})


@router.get("/api/v2/issue-letters/{slug}/vote")
def get_issue_letter_vote(slug: str, x_voter_id: Optional[str] = Header(default=None)):
    return JSONResponse(_letter_call(issue_letters_repo.my_vote, slug, x_voter_id or ""), headers={"Cache-Control": "no-store"})


@router.post("/api/v2/issue-letters/{slug}/vote")
def post_issue_letter_vote(slug: str, payload: Dict[str, Any] = Body(...), x_voter_id: Optional[str] = Header(default=None)):
    result, changed = _letter_call(issue_letters_repo.vote, slug, x_voter_id or "", str(payload.get("option_key") or ""))
    return JSONResponse({**result, "changed": changed}, headers={"Cache-Control": "no-store"})


@router.get("/admin/letter-editors")
def admin_list_letter_editors(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"editors": _letter_call(editors_repo.list_editors, True)}


@router.put("/admin/letter-editors")
def admin_upsert_letter_editors(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return _letter_call(editors_repo.upsert_editors, payload.get("editors"))


@router.put("/admin/issue-letters/{letter_id}/editors")
def admin_set_issue_letter_editors(letter_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """레터의 작성 에디터를 지정한다(구독한 에디터의 글이 발행되면 그 구독자에게 보낸다)."""
    _check_admin_token(x_internal_token)
    return {"editors": _letter_call(editors_repo.set_letter_editors, letter_id, payload.get("editors"))}


@router.post("/admin/letter-sends")
def admin_letter_send(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """다이제스트 발송. dry_run(기본 true)이면 대상과 담길 레터만 보여 주고 아무것도 쓰지·보내지 않는다."""
    _check_admin_token(x_internal_token)
    kst = datetime.timezone(datetime.timedelta(hours=9))
    today = datetime.datetime.now(kst).date()
    try:
        send_date = datetime.date.fromisoformat(payload["date"]) if payload.get("date") else today
    except ValueError:
        raise HTTPException(status_code=400, detail="date 는 YYYY-MM-DD 형식이어야 합니다")
    return _letter_call(letter_subscriptions_repo.run_send, str(payload.get("kind") or "daily"), send_date, int(payload.get("hour") or 8),
                        payload.get("dry_run", True) is not False)


@router.post("/admin/letter-sends/pending")
def admin_letter_send_pending(x_internal_token: Optional[str] = Header(default=None)):
    """야간에 발행돼 못 보낸 최근 24시간 레터를 지금 보낸다(8시 이후 크론 또는 수동 호출)."""
    _check_admin_token(x_internal_token)
    return _letter_call(letter_subscriptions_repo.run_pending_instant)


@router.post("/admin/email-suppressions")
def admin_email_suppression(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return _letter_call(letter_subscriptions_repo.add_suppression, payload.get("email"), str(payload.get("reason") or "manual"))


@router.put("/admin/interest-bundles")
def admin_upsert_interest_bundles(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """관심 묶음(페르소나 기획서의 관심 프리셋)을 저장한다. 항목은 사전·분류와 대조해 검증한다."""
    _check_admin_token(x_internal_token)
    return _letter_call(interests_repo.upsert_bundles, payload.get("bundles"))


@router.get("/admin/topics")
def admin_list_topics(include_inactive: bool = Query(default=False), x_internal_token: Optional[str] = Header(default=None)):
    """주제 사전 조회(레터에 붙이는 통제된 태그 어휘)."""
    _check_admin_token(x_internal_token)
    return {"topics": _letter_call(topics_repo.list_topics, not include_inactive)}


@router.put("/admin/topics")
def admin_upsert_topics(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """주제 사전 항목을 slug 기준으로 추가·갱신한다. 이름·별칭이 겹치면 전체를 거부한다."""
    _check_admin_token(x_internal_token)
    return _letter_call(topics_repo.upsert_topics, payload.get("topics"))


@router.put("/admin/issue-letters/{letter_id}/topics")
def admin_set_issue_letter_topics(letter_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """레터의 주제 태그만 교체(발행 후에도 가능, 본문은 바뀌지 않는다)."""
    _check_admin_token(x_internal_token)
    return {"topics": _letter_call(issue_letters_repo.set_topics, letter_id, payload.get("topics"))}


@router.post("/admin/issue-letters/archives")
def admin_save_issue_letter_archives(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """빅카인즈 검색 결과에서 고른 서울경제 기사를 보관한다(레터 출처 후보)."""
    _check_admin_token(x_internal_token)
    return {"archived": _letter_call(issue_letters_repo.save_archives, payload.get("articles") or [])}


@router.get("/admin/issue-letters")
def admin_list_issue_letters(status: Optional[str] = Query(default=None), limit: int = Query(default=50),
                             x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"letters": _letter_call(issue_letters_repo.list_admin, status, limit)}


@router.get("/admin/issue-letters/{letter_id}")
def admin_get_issue_letter(letter_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    letter = _letter_call(issue_letters_repo.get_admin, letter_id)
    if not letter:
        raise HTTPException(status_code=404, detail="letter not found")
    return {"letter": letter, "publish_problems": issue_letters_repo.publish_problems(letter)}


@router.post("/admin/issue-letters")
def admin_create_issue_letter(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    actor = payload.get("actor") or {}
    return {"letter": _letter_call(issue_letters_repo.create, payload.get("data") or {}, actor.get("employee_no"))}


@router.put("/admin/issue-letters/{letter_id}")
def admin_update_issue_letter(letter_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    letter = _letter_call(issue_letters_repo.update, letter_id, payload.get("data") or {})
    if not letter:
        raise HTTPException(status_code=404, detail="letter not found")
    return {"letter": letter}


@router.put("/admin/issue-letters/{letter_id}/layout")
def admin_relayout_issue_letter(letter_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    letter = _letter_call(issue_letters_repo.relayout, letter_id, payload.get("sections"))
    if not letter:
        raise HTTPException(status_code=404, detail="letter not found")
    return {"letter": letter}


@router.post("/admin/issue-letters/{letter_id}/submit")
def admin_submit_issue_letter(letter_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"letter": _letter_call(issue_letters_repo.submit, letter_id)}


@router.post("/admin/issue-letters/{letter_id}/publish")
def admin_publish_issue_letter(letter_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    actor = payload.get("actor") or {}
    result = {"letter": _letter_call(issue_letters_repo.publish, letter_id, str(actor.get("employee_no") or ""), str(actor.get("role") or ""))}
    # 발행 직후 구독자에게 바로 보낸다("올라올 때마다"). 자동 발송 설정이 꺼져 있으면 대상만 계산하고, 발송 실패가 발행을 막지 않는다.
    try:
        result["send"] = letter_subscriptions_repo.send_for_letter(letter_id)
    except Exception:  # noqa: BLE001
        logging.getLogger("letter_subscriptions").exception("send_for_letter failed")
        result["send"] = {"error": "send failed"}
    return result


@router.post("/admin/issue-letters/{letter_id}/archive")
def admin_archive_issue_letter(letter_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"letter": _letter_call(issue_letters_repo.archive, letter_id)}
