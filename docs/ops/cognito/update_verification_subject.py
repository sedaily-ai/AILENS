"""
Cognito 유저풀의 인증 메일 제목에서 OTP 코드 플레이스홀더({####})를 제거한다.

ISSUE-02 대응. 제목만 바꾸는 작업인데 update_user_pool 이 전체 덮어쓰기라서,
describe 결과를 그대로 되돌려 넣고 제목만 교체하는 방식으로 처리한다.

핵심 설계
---------
허용 필드 목록을 손으로 적지 않는다. boto3 서비스 모델에서 UpdateUserPool 의
입력 shape 을 읽어 describe 결과와 교집합을 취한다. AWS 가 필드를 추가/삭제해도
따라간다. 손으로 적으면 반드시 빠뜨린다 (그게 이 작업의 유일한 실패 모드다).

사용법
------
    python update_verification_subject.py            # dry-run (기본)
    python update_verification_subject.py --apply    # 실제 적용

dry-run 은 AWS 를 읽기만 한다. 페이로드와 변경 리포트를 파일로 떨어뜨린다.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import boto3

POOL_ID = "us-east-1_ZS8PgF3iX"
REGION = "us-east-1"
PLACEHOLDER = "{####}"

# 제목에서 코드를 빼고, 코드는 본문에서만 보이게 한다.
NEW_SUBJECT = "[AI LENS] 이메일 인증 코드를 보냈어요"

# describe 와 update 사이에 이름이 다른 필드.  {update 쪽 이름: describe 쪽 이름}
# describe 는 풀 이름을 Name 으로 주는데 update 는 PoolName 으로 받는다.
# 단순 교집합만 하면 PoolName 이 빠지고, update 는 전체 덮어쓰기라서 풀 이름이
# 날아간다. 이 매핑이 없으면 조용히 사고가 난다 (dry-run 에서 잡았다).
RENAMED = {"PoolName": "Name"}

HERE = Path(__file__).parent


def stamp() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d-%H%M%S")


def allowed_update_fields(client) -> list[str]:
    """UpdateUserPool 이 실제로 받는 필드 목록을 API 모델에서 읽는다."""
    op = client.meta.service_model.operation_model("UpdateUserPool")
    return sorted(op.input_shape.members.keys())


def build_payload(pool: dict, allowed: list[str]) -> tuple[dict, list[str]]:
    """describe 결과에서 update 가 받는 필드만 골라 페이로드를 만든다.

    반환: (payload, notes)
    """
    notes: list[str] = []

    renamed = RENAMED

    payload = {"UserPoolId": POOL_ID}
    for key in allowed:
        if key == "UserPoolId":
            continue
        src = renamed.get(key, key)
        if src in pool:
            payload[key] = copy.deepcopy(pool[src])
            if src != key:
                notes.append(f"필드명 매핑: describe.{src} -> update.{key} (값: {pool[src]!r})")

    # describe 에는 있지만 update 가 안 받는 필드 (기록용)
    consumed = set(renamed.values())
    not_accepted = sorted(k for k in pool if k not in allowed and k not in consumed)
    if not_accepted:
        notes.append(
            "describe 에만 있고 update 가 안 받는 필드 (전달 안 함): "
            + ", ".join(not_accepted)
        )

    # update 가 받는데 describe 에 없는 필드 (설정 안 된 값 — 건드리지 않는다)
    absent = sorted(
        k for k in allowed if renamed.get(k, k) not in pool and k != "UserPoolId"
    )
    if absent:
        notes.append("현재 미설정이라 전달 안 하는 필드: " + ", ".join(absent))

    # TemporaryPasswordValidityDays 와 UnusedAccountValidityDays 를 같이 보내면
    # ValidationException. 전자가 있으면 후자를 뺀다.
    temp_days = (
        payload.get("Policies", {}).get("PasswordPolicy", {}).get("TemporaryPasswordValidityDays")
    )
    unused_days = payload.get("AdminCreateUserConfig", {}).get("UnusedAccountValidityDays")
    if temp_days is not None and unused_days is not None:
        del payload["AdminCreateUserConfig"]["UnusedAccountValidityDays"]
        notes.append(
            f"AdminCreateUserConfig.UnusedAccountValidityDays({unused_days}) 제거 — "
            f"Policies.PasswordPolicy.TemporaryPasswordValidityDays({temp_days}) 와 "
            "동시 전달 시 ValidationException"
        )

    # ---- 여기가 이 스크립트의 유일한 의도적 변경 ----
    if "VerificationMessageTemplate" in payload:
        payload["VerificationMessageTemplate"]["EmailSubject"] = NEW_SUBJECT
    # 레거시 필드도 같이 맞춰야 한다. describe 에서 둘이 동일한 값이었고,
    # 불일치 상태로 보내면 Cognito 가 거부하거나 한쪽이 되살아난다.
    if "EmailVerificationSubject" in payload:
        payload["EmailVerificationSubject"] = NEW_SUBJECT

    return payload, notes


def verify_payload(pool: dict, payload: dict) -> list[str]:
    """페이로드가 의도한 것만 바꾸는지 검사. 문제를 문자열 리스트로 반환."""
    problems: list[str] = []

    vmt = payload.get("VerificationMessageTemplate", {})
    subject = vmt.get("EmailSubject", "")
    message = vmt.get("EmailMessage", "")

    if PLACEHOLDER in subject:
        problems.append(f"제목에 {PLACEHOLDER} 가 아직 있다: {subject!r}")
    if PLACEHOLDER not in message:
        problems.append(f"본문에 {PLACEHOLDER} 가 없다 — Cognito 가 거부한다")
    if payload.get("EmailVerificationSubject") != subject:
        problems.append("EmailVerificationSubject 와 VerificationMessageTemplate.EmailSubject 불일치")

    # 제목 외에 바뀐 필드가 있는지
    expected_changes = {
        ("VerificationMessageTemplate", "EmailSubject"),
        ("EmailVerificationSubject",),
    }
    for key, new_val in payload.items():
        if key == "UserPoolId":
            continue
        old_val = pool.get(RENAMED.get(key, key))
        if old_val == new_val:
            continue
        if key == "EmailVerificationSubject":
            continue
        if key == "VerificationMessageTemplate":
            for sub_key, sub_new in new_val.items():
                if pool.get(key, {}).get(sub_key) != sub_new:
                    if (key, sub_key) not in expected_changes:
                        problems.append(
                            f"의도하지 않은 변경: {key}.{sub_key} "
                            f"{pool.get(key, {}).get(sub_key)!r} -> {sub_new!r}"
                        )
            continue
        if key == "AdminCreateUserConfig":
            continue  # UnusedAccountValidityDays 제거는 의도된 것
        problems.append(f"의도하지 않은 변경: {key} {old_val!r} -> {new_val!r}")

    return problems


def preservation_report(pool: dict, payload: dict) -> list[str]:
    """이슈 완료 조건에 적힌 '보존돼야 하는 값'들을 눈으로 확인할 형태로."""
    lines = []
    checks = [
        ("PoolName", pool.get("Name"), payload.get("PoolName")),
        ("UserPoolTier", pool.get("UserPoolTier"), payload.get("UserPoolTier")),
        (
            "EmailConfiguration.EmailSendingAccount",
            pool.get("EmailConfiguration", {}).get("EmailSendingAccount"),
            payload.get("EmailConfiguration", {}).get("EmailSendingAccount"),
        ),
        (
            "AutoVerifiedAttributes",
            pool.get("AutoVerifiedAttributes"),
            payload.get("AutoVerifiedAttributes"),
        ),
        (
            "AccountRecoverySetting",
            json.dumps(pool.get("AccountRecoverySetting"), ensure_ascii=False, sort_keys=True),
            json.dumps(payload.get("AccountRecoverySetting"), ensure_ascii=False, sort_keys=True),
        ),
        (
            "Policies",
            json.dumps(pool.get("Policies"), ensure_ascii=False, sort_keys=True),
            json.dumps(payload.get("Policies"), ensure_ascii=False, sort_keys=True),
        ),
        ("MfaConfiguration", pool.get("MfaConfiguration"), payload.get("MfaConfiguration")),
    ]
    for name, before, after in checks:
        mark = "same" if before == after else "DIFF"
        lines.append(f"  [{mark}] {name}")
        if before != after:
            lines.append(f"         before: {before}")
            lines.append(f"         after : {after}")

    tags_before = pool.get("UserPoolTags") or {}
    tags_after = payload.get("UserPoolTags") or {}
    mark = "same" if tags_before == tags_after else "DIFF"
    lines.append(f"  [{mark}] UserPoolTags ({len(tags_before)} -> {len(tags_after)})")
    if tags_before != tags_after:
        lines.append(f"         before: {tags_before}")
        lines.append(f"         after : {tags_after}")
    else:
        for k in sorted(tags_before):
            lines.append(f"         {k} = {tags_before[k]}")

    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 적용 (없으면 dry-run)")
    args = ap.parse_args()

    client = boto3.client("cognito-idp", region_name=REGION)

    pool = client.describe_user_pool(UserPoolId=POOL_ID)["UserPool"]

    ts = stamp()
    backup_path = HERE / f"userpool-{POOL_ID}-{ts}-before.json"
    backup_path.write_text(
        json.dumps({"UserPool": pool}, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )

    allowed = allowed_update_fields(client)
    payload, notes = build_payload(pool, allowed)
    problems = verify_payload(pool, payload)

    payload_path = HERE / f"payload-{ts}.json"
    payload_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )

    report: list[str] = []
    report.append("=" * 72)
    report.append(f"MODE          : {'APPLY' if args.apply else 'DRY-RUN'}")
    report.append(f"UserPool      : {POOL_ID} ({pool.get('Name')})  region={REGION}")
    report.append(f"LastModified  : {pool.get('LastModifiedDate')}")
    report.append(f"backup        : {backup_path.name}")
    report.append(f"payload       : {payload_path.name}")
    report.append("=" * 72)
    report.append("")
    report.append(f"UpdateUserPool 이 받는 필드 {len(allowed)}개:")
    report.append("  " + ", ".join(allowed))
    report.append("")
    report.append(f"페이로드에 담은 필드 {len(payload)}개:")
    report.append("  " + ", ".join(sorted(payload)))
    report.append("")
    if notes:
        report.append("처리 메모:")
        for n in notes:
            report.append(f"  - {n}")
        report.append("")
    report.append("의도한 변경:")
    report.append(
        f"  VerificationMessageTemplate.EmailSubject"
    )
    report.append(f"    before: {pool.get('VerificationMessageTemplate', {}).get('EmailSubject')!r}")
    report.append(f"    after : {payload.get('VerificationMessageTemplate', {}).get('EmailSubject')!r}")
    report.append(f"  EmailVerificationSubject (레거시, 동기화)")
    report.append(f"    before: {pool.get('EmailVerificationSubject')!r}")
    report.append(f"    after : {payload.get('EmailVerificationSubject')!r}")
    report.append("")
    report.append("본문은 건드리지 않는다:")
    msg = payload.get("VerificationMessageTemplate", {}).get("EmailMessage", "")
    report.append(f"  EmailMessage 동일? {msg == pool.get('VerificationMessageTemplate', {}).get('EmailMessage')}")
    report.append(f"  EmailMessage 에 {PLACEHOLDER} 있음? {PLACEHOLDER in msg}")
    report.append("")
    report.append("보존 검사:")
    report.extend(preservation_report(pool, payload))
    report.append("")

    if problems:
        report.append("!!! 문제 발견 — 적용하지 않는다 !!!")
        for p in problems:
            report.append(f"  - {p}")
    else:
        report.append("검증 통과: 제목 2개 필드 외에 바뀌는 값 없음")
    report.append("")

    if problems:
        report.append("RESULT: ABORTED (검증 실패)")
    elif not args.apply:
        report.append("RESULT: DRY-RUN — AWS 에 아무것도 쓰지 않았다.")
        report.append("        적용하려면 --apply 를 붙여 다시 실행.")
    else:
        client.update_user_pool(**payload)
        after = client.describe_user_pool(UserPoolId=POOL_ID)["UserPool"]

        after_path = HERE / f"userpool-{POOL_ID}-{ts}-after.json"
        after_path.write_text(
            json.dumps({"UserPool": after}, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

        a_vmt = after.get("VerificationMessageTemplate", {})
        checks = [
            ("제목에 코드 없음", PLACEHOLDER not in a_vmt.get("EmailSubject", "")),
            ("본문에 코드 있음", PLACEHOLDER in a_vmt.get("EmailMessage", "")),
            ("제목 = 의도한 값", a_vmt.get("EmailSubject") == NEW_SUBJECT),
            ("레거시 제목 = 의도한 값", after.get("EmailVerificationSubject") == NEW_SUBJECT),
            ("본문 불변", a_vmt.get("EmailMessage") == pool.get("VerificationMessageTemplate", {}).get("EmailMessage")),
            ("태그 불변", (after.get("UserPoolTags") or {}) == (pool.get("UserPoolTags") or {})),
            ("Tier 불변", after.get("UserPoolTier") == pool.get("UserPoolTier")),
            ("Policies 불변", after.get("Policies") == pool.get("Policies")),
            ("복구설정 불변", after.get("AccountRecoverySetting") == pool.get("AccountRecoverySetting")),
            ("메일발송설정 불변", after.get("EmailConfiguration") == pool.get("EmailConfiguration")),
            ("PoolName 불변", after.get("Name") == pool.get("Name")),
            ("AutoVerified 불변", after.get("AutoVerifiedAttributes") == pool.get("AutoVerifiedAttributes")),
            ("MFA 불변", after.get("MfaConfiguration") == pool.get("MfaConfiguration")),
        ]
        report.append(f"적용 완료. after 스냅샷: {after_path.name}")
        report.append("")
        report.append("적용 후 재검증:")
        failed = []
        for name, ok in checks:
            report.append(f"  [{'PASS' if ok else 'FAIL'}] {name}")
            if not ok:
                failed.append(name)
        report.append("")
        report.append(f"  최종 제목: {a_vmt.get('EmailSubject')!r}")
        report.append("")
        report.append("RESULT: " + ("APPLIED & VERIFIED" if not failed else f"APPLIED BUT {len(failed)} CHECK(S) FAILED"))

    text = "\n".join(report)
    (HERE / f"report-{ts}.txt").write_text(text, encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    print(text)

    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
