"""GA4 → BigQuery 내보내기 테이블 조회 (CMS 홈 "독자 반응", 2026-11-12).

데이터: GA4 속성 ailens.sedaily.ai(측정 ID G-BJZ09B6PB6)의 일 단위 내보내기.
- 위치: `mbti-497410.analytics_538669891.events_YYYYMMDD` (하루 1테이블, 전날분이 다음 날 들어옴)
- ⚠️ BigQuery 샌드박스(결제 미연결)라 테이블이 60일 뒤 자동 삭제된다 → 60일보다 긴 구간은 조회하지 않는다.

공통 규칙(모든 쿼리):
- 실제 사이트 기록만: device.web_info.hostname = 'ailens.sedaily.ai'
- 직원 제외: GA4 내부 트래픽 규칙("서울경제 사무실", 회사 와이파이 IP)이 붙이는
  event_params.traffic_type = 'internal' 인 기록을 뺀다. 규칙은 2026-11-12에 등록돼
  그 이전 기록에는 표시가 없다(= 직원 기록이 섞여 있다). 화면에도 이 사실을 안내한다.
  필터 상태는 "테스트"라 GA4가 기록을 버리지 않고 표시만 붙인다 — "활성"으로 바꾸면
  직원 기록이 영구 삭제되므로 바꾸지 말 것.
- 날짜는 GA4 속성 시간대 기준 event_date(YYYYMMDD 문자열)로 자른다.

여기 함수들은 SQL 실행과 행 반환만 한다(비교·판정·문구는 routes/analytics.py).
"""

from __future__ import annotations

import datetime as dt
import os

from shared import bigquery_client

DATASET = os.environ.get("GA4_BQ_DATASET", "mbti-497410.analytics_538669891")
HOSTNAME = os.environ.get("GA4_HOSTNAME", "ailens.sedaily.ai")
# 기사 상세 경로: /<섹션>/YYYY/MM/DD/<slug> (service/frontend app/(economy)/<섹션>/[year]/[month]/[day]/[slug])
ARTICLE_PATH_RE = r"^/[a-z-]+/\d{4}/\d{2}/\d{2}/[^/]+$"


def _sfx(d: dt.date) -> str:
    return d.strftime("%Y%m%d")


def _base_cte(date_from: dt.date, date_to: dt.date) -> tuple[str, dict]:
    """ev: 기간 안의 기록 한 줄 = 이벤트 하나, 자주 쓰는 값을 칸으로 꺼내 둔다."""
    sql = f"""
    ev AS (
      SELECT
        PARSE_DATE('%Y%m%d', event_date) AS d,
        event_name,
        user_pseudo_id,
        CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS sid,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS eng_ms,
        REGEXP_REPLACE(
          (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'),
          r'^https?://[^/]+|[?#].*$', ''
        ) AS path,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS title,
        traffic_source.source AS first_source,
        traffic_source.medium AS first_medium,
        device.category AS device,
        event_timestamp,
        event_params
      FROM `{DATASET}.events_*`
      WHERE _TABLE_SUFFIX BETWEEN @sfx_from AND @sfx_to
        AND device.web_info.hostname = @hostname
        AND IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'traffic_type'), '') != 'internal'
    )"""
    return sql, {"sfx_from": _sfx(date_from), "sfx_to": _sfx(date_to), "hostname": HOSTNAME}


def latest_export_date() -> dt.date | None:
    """가장 최근에 들어온 일 단위 테이블 날짜(메타데이터만 읽어 비용 0)."""
    rows = bigquery_client.query(
        f"""
        SELECT MAX(table_id) AS t
        FROM `{DATASET}.__TABLES__`
        WHERE REGEXP_CONTAINS(table_id, r'^events_\\d{{8}}$')
        """
    )
    t = rows[0]["t"] if rows else None
    return dt.datetime.strptime(t[len("events_"):], "%Y%m%d").date() if t else None


def engagement_by_period(cur: tuple[dt.date, dt.date], prev: tuple[dt.date, dt.date]) -> list[dict]:
    """기간(cur/prev)별 방문·머문 시간·페이지 수·기사 끝까지 읽음·여러 기사 읽음·재방문자.

    - 머문 시간: 방문(세션)마다 engagement_time_msec 합 → 중앙값(초). 평균은 오래 켜 둔 탭 하나에 크게 흔들린다.
    - 끝까지 읽음: 기사 페이지를 연 (방문×기사) 중 같은 방문에서 그 기사에 scroll(90%) 기록이 있는 비율.
    - 여러 기사: 기사를 1개 이상 연 방문 중 서로 다른 기사를 2개 이상 연 비율.
    - 돌아온 사람: 기간 안에 first_visit 기록이 없는 사람(= 그 전에 온 적이 있음).
    """
    base, params = _base_cte(prev[0], cur[1])
    params.update({
        "cur_from": cur[0].isoformat(), "cur_to": cur[1].isoformat(),
        "prev_from": prev[0].isoformat(), "prev_to": prev[1].isoformat(),
        "article_re": ARTICLE_PATH_RE,
    })
    sql = f"""
    WITH {base},
    p AS (
      SELECT *,
        CASE
          WHEN d BETWEEN DATE(@cur_from) AND DATE(@cur_to) THEN 'cur'
          WHEN d BETWEEN DATE(@prev_from) AND DATE(@prev_to) THEN 'prev'
        END AS period
      FROM ev
    ),
    sess AS (
      SELECT period, sid,
        SUM(IFNULL(eng_ms, 0)) AS eng_ms,
        COUNTIF(event_name = 'page_view') AS pv,
        COUNT(DISTINCT IF(event_name = 'page_view' AND REGEXP_CONTAINS(path, @article_re), path, NULL)) AS article_pv
      FROM p WHERE period IS NOT NULL AND sid IS NOT NULL
      GROUP BY period, sid
    ),
    reads AS (
      SELECT period, sid, path,
        LOGICAL_OR(event_name = 'page_view') AS viewed,
        LOGICAL_OR(event_name = 'scroll') AS scrolled
      FROM p WHERE period IS NOT NULL AND sid IS NOT NULL AND REGEXP_CONTAINS(path, @article_re)
      GROUP BY period, sid, path
    ),
    users AS (
      SELECT period, user_pseudo_id, LOGICAL_OR(event_name = 'first_visit') AS is_new
      FROM p WHERE period IS NOT NULL
      GROUP BY period, user_pseudo_id
    ),
    s AS (
      SELECT period,
        COUNT(*) AS sessions,
        APPROX_QUANTILES(eng_ms, 2)[OFFSET(1)] / 1000 AS median_engaged_sec,
        AVG(pv) AS pages_per_session,
        COUNTIF(article_pv >= 1) AS article_sessions,
        COUNTIF(article_pv >= 2) AS multi_article_sessions
      FROM sess GROUP BY period
    ),
    r AS (
      SELECT period, COUNTIF(viewed) AS article_reads, COUNTIF(viewed AND scrolled) AS read_to_end
      FROM reads GROUP BY period
    ),
    u AS (
      SELECT period, COUNT(*) AS users, COUNTIF(NOT is_new) AS returning_users
      FROM users GROUP BY period
    )
    SELECT * FROM s LEFT JOIN r USING (period) LEFT JOIN u USING (period)
    """
    return bigquery_client.query(sql, params)


def week_retention(cur_cohort: tuple[dt.date, dt.date], prev_cohort: tuple[dt.date, dt.date]) -> list[dict]:
    """첫 방문 날짜 기준 묶음(cohort)별: 첫 방문 후 1~7일 안에 다른 날 다시 온 사람 수.

    묶음은 첫 방문 뒤 7일이 다 지나 있어야 공정하다 → cur 묶음 끝이 최신 날짜 7일 전이어야 한다(호출부 책임).
    """
    base, params = _base_cte(prev_cohort[0], cur_cohort[1] + dt.timedelta(days=7))
    params.update({
        "cur_from": cur_cohort[0].isoformat(), "cur_to": cur_cohort[1].isoformat(),
        "prev_from": prev_cohort[0].isoformat(), "prev_to": prev_cohort[1].isoformat(),
    })
    sql = f"""
    WITH {base},
    fv AS (
      SELECT user_pseudo_id, MIN(d) AS first_d FROM ev WHERE event_name = 'first_visit' GROUP BY user_pseudo_id
    ),
    visits AS (
      SELECT DISTINCT user_pseudo_id, d FROM ev WHERE event_name = 'session_start'
    ),
    tagged AS (
      SELECT fv.user_pseudo_id, fv.first_d,
        CASE
          WHEN fv.first_d BETWEEN DATE(@cur_from) AND DATE(@cur_to) THEN 'cur'
          WHEN fv.first_d BETWEEN DATE(@prev_from) AND DATE(@prev_to) THEN 'prev'
        END AS period
      FROM fv
    )
    SELECT t.period,
      COUNT(DISTINCT t.user_pseudo_id) AS new_users,
      COUNT(DISTINCT IF(v.d > t.first_d AND v.d <= DATE_ADD(t.first_d, INTERVAL 7 DAY), t.user_pseudo_id, NULL)) AS returned_7d
    FROM tagged t LEFT JOIN visits v USING (user_pseudo_id)
    WHERE t.period IS NOT NULL
    GROUP BY t.period
    """
    return bigquery_client.query(sql, params)


def article_stats(date_from: dt.date, date_to: dt.date, min_reads: int) -> list[dict]:
    """기사별 (방문×기사) 읽기 수, 끝까지 읽은 비율, 머문 시간 중앙값(초). 읽기 수 min_reads 이상만."""
    base, params = _base_cte(date_from, date_to)
    params.update({"article_re": ARTICLE_PATH_RE, "min_reads": min_reads})
    sql = f"""
    WITH {base},
    reads AS (
      SELECT path, sid,
        MAX(IF(event_name = 'page_view', title, NULL)) AS title,
        LOGICAL_OR(event_name = 'scroll') AS scrolled,
        SUM(IFNULL(eng_ms, 0)) AS eng_ms
      FROM ev
      WHERE sid IS NOT NULL AND REGEXP_CONTAINS(path, @article_re)
      GROUP BY path, sid
      HAVING LOGICAL_OR(event_name = 'page_view')
    )
    SELECT path,
      MAX(title) AS title,
      COUNT(*) AS reads,
      COUNTIF(scrolled) AS read_to_end,
      APPROX_QUANTILES(eng_ms, 2)[OFFSET(1)] / 1000 AS median_engaged_sec
    FROM reads
    GROUP BY path
    HAVING COUNT(*) >= @min_reads
    ORDER BY reads DESC
    LIMIT 500
    """
    return bigquery_client.query(sql, params)


def source_stats(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """처음 들어온 경로(GA4 traffic_source = 첫 방문 기준)별 사람 수, 2일 이상 방문한 사람 수."""
    base, params = _base_cte(date_from, date_to)
    sql = f"""
    WITH {base},
    u AS (
      SELECT user_pseudo_id,
        ANY_VALUE(first_source) AS source,
        ANY_VALUE(first_medium) AS medium,
        COUNT(DISTINCT d) AS active_days
      FROM ev GROUP BY user_pseudo_id
    )
    SELECT IFNULL(source, '(unknown)') AS source, IFNULL(medium, '(unknown)') AS medium,
      COUNT(*) AS users, COUNTIF(active_days >= 2) AS multi_day_users
    FROM u
    GROUP BY source, medium
    ORDER BY users DESC
    LIMIT 50
    """
    return bigquery_client.query(sql, params)


def article_breakdowns(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """기사 읽기(방문×기사)를 네 가지 기준으로 쪼갠 반응. dim 값별로 행이 나온다.

    - section: 경로 첫 칸(markets, industry …) — 화면 이름은 packages/domain ECON_CATEGORIES
    - source: 그 사람이 처음 들어온 곳(GA4 traffic_source.medium) → search / ai / direct / referral / other
    - age: 발행일(경로의 YYYY/MM/DD) 뒤 며칠째 읽혔나 → d0 / d1 / d2_3 / d4_7 / d8p
    - device: desktop / mobile / tablet
    """
    base, params = _base_cte(date_from, date_to)
    params.update({"article_re": ARTICLE_PATH_RE})
    agg = """COUNT(*) AS reads, COUNTIF(scrolled) AS read_to_end,
      APPROX_QUANTILES(eng_s, 2)[OFFSET(1)] AS median_engaged_sec"""
    sql = f"""
    WITH {base},
    art AS (
      SELECT sid, path,
        ANY_VALUE(device) AS device,
        ANY_VALUE(first_medium) AS medium,
        ANY_VALUE(first_source) AS source,
        MIN(IF(event_name = 'page_view', d, NULL)) AS read_d,
        LOGICAL_OR(event_name = 'scroll') AS scrolled,
        SUM(IFNULL(eng_ms, 0)) / 1000 AS eng_s
      FROM ev
      WHERE sid IS NOT NULL AND REGEXP_CONTAINS(path, @article_re)
      GROUP BY sid, path
      HAVING LOGICAL_OR(event_name = 'page_view')
    ),
    tagged AS (
      SELECT *,
        REGEXP_EXTRACT(path, r'^/([a-z-]+)/') AS section,
        CASE
          WHEN medium = 'organic' THEN 'search'
          WHEN medium = 'ai-assistant' THEN 'ai'
          WHEN medium = '(none)' OR source = '(direct)' THEN 'direct'
          WHEN medium IN ('referral', 'widget') THEN 'referral'
          ELSE 'other'
        END AS source_group,
        DATE_DIFF(read_d, PARSE_DATE('%Y/%m/%d', REGEXP_EXTRACT(path, r'^/[a-z-]+/(\\d{{4}}/\\d{{2}}/\\d{{2}})/')), DAY) AS age_days
      FROM art
    )
    SELECT 'section' AS dim, section AS k, {agg} FROM tagged GROUP BY k
    UNION ALL
    SELECT 'source', source_group, {agg} FROM tagged GROUP BY source_group
    UNION ALL
    SELECT 'age',
      CASE WHEN age_days <= 0 THEN 'd0' WHEN age_days = 1 THEN 'd1' WHEN age_days <= 3 THEN 'd2_3'
           WHEN age_days <= 7 THEN 'd4_7' ELSE 'd8p' END,
      {agg} FROM tagged GROUP BY 2
    UNION ALL
    SELECT 'device', IFNULL(device, 'unknown'), {agg} FROM tagged GROUP BY 2
    """
    return bigquery_client.query(sql, params)


def landing_stats(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """방문(세션)을 처음 연 페이지 종류별로: 방문 수, 그 페이지 하나만 보고 나간 방문 수, 방문당 페이지 수."""
    base, params = _base_cte(date_from, date_to)
    params.update({"article_re": ARTICLE_PATH_RE})
    sql = f"""
    WITH {base},
    pv AS (SELECT sid, path, event_timestamp AS ts FROM ev WHERE event_name = 'page_view' AND sid IS NOT NULL),
    first_page AS (
      SELECT sid, ARRAY_AGG(path ORDER BY ts LIMIT 1)[OFFSET(0)] AS lp, COUNT(*) AS pages
      FROM pv GROUP BY sid
    )
    SELECT
      CASE
        WHEN lp = '/' THEN 'home'
        WHEN REGEXP_CONTAINS(lp, @article_re) THEN 'article'
        WHEN STARTS_WITH(lp, '/letter') THEN 'letter'
        WHEN STARTS_WITH(lp, '/webtoon') THEN 'webtoon'
        WHEN STARTS_WITH(lp, '/my-lens') THEN 'my_lens'
        ELSE 'other'
      END AS k,
      COUNT(*) AS sessions,
      COUNTIF(pages = 1) AS one_page,
      AVG(pages) AS pages_per_session
    FROM first_page
    GROUP BY k
    """
    return bigquery_client.query(sql, params)


def hourly_sessions(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """한국 시간 기준 시(0~23)별 방문 시작 수."""
    base, params = _base_cte(date_from, date_to)
    sql = f"""
    WITH {base}
    SELECT EXTRACT(HOUR FROM TIMESTAMP_MICROS(event_timestamp) AT TIME ZONE 'Asia/Seoul') AS hour,
      COUNT(DISTINCT sid) AS sessions
    FROM ev WHERE event_name = 'session_start'
    GROUP BY hour ORDER BY hour
    """
    return bigquery_client.query(sql, params)


# 사이트 기능 이벤트(service/frontend trackEvent 호출부). 화면 이름은 admin/frontend ReaderAnalytics.tsx.
FEATURE_EVENTS = (
    "format_switch", "webtoon_start", "post_vote", "source_link_click",
    "article_neighbor_click", "letter_card_click", "letter_sub_open", "onboarding_result", "game_open",
)


def feature_usage(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """기능별로 그 기능을 한 번이라도 쓴 방문 수. k='_all' 행은 전체 방문 수(분모)."""
    base, params = _base_cte(date_from, date_to)
    names = ", ".join(f"'{n}'" for n in FEATURE_EVENTS)
    sql = f"""
    WITH {base}
    SELECT event_name AS k, COUNT(DISTINCT sid) AS sessions
    FROM ev WHERE event_name IN ({names}) AND sid IS NOT NULL
    GROUP BY k
    UNION ALL
    SELECT '_all', COUNT(DISTINCT sid) FROM ev WHERE sid IS NOT NULL
    """
    return bigquery_client.query(sql, params)


def webtoon_completion(date_from: dt.date, date_to: dt.date) -> list[dict]:
    """웹툰 방식(v1/v2)별 시작·완주 수. 같은 사람이 같은 웹툰을 여러 번 봐도 1번."""
    base, params = _base_cte(date_from, date_to)
    sql = f"""
    WITH {base},
    w AS (
      SELECT user_pseudo_id, event_name,
        (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key = 'article_id') AS article_id,
        (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'variant') AS variant
      FROM ev WHERE event_name IN ('webtoon_start', 'webtoon_complete')
    ),
    per_read AS (
      SELECT user_pseudo_id, article_id,
        ANY_VALUE(variant) AS variant,
        LOGICAL_OR(event_name = 'webtoon_start') AS started,
        LOGICAL_OR(event_name = 'webtoon_complete') AS completed
      FROM w GROUP BY user_pseudo_id, article_id
    )
    SELECT IFNULL(variant, '(none)') AS variant,
      COUNTIF(started) AS starts,
      COUNTIF(started AND completed) AS completes
    FROM per_read GROUP BY variant ORDER BY variant
    """
    return bigquery_client.query(sql, params)
