"""주 시작일 계산만 남은 모듈. 완료 판정·완료 기록은 제거됐다(열람 전용 view-only-v1).

notification_inputs의 주간 알림 집계가 week_start를 쓴다. 그 사용처가 정리되면 이 모듈도 지운다.
기존 완료·보상 원장 테이블과 행은 그대로 두며 이 서버는 새 완료 행을 쓰지 않는다.
"""
import datetime as dt


def week_start(day):
    return day-dt.timedelta(days=day.weekday())
