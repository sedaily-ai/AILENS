'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/shared/config/api';

/**
 * 뉴스 타임머신 — 날짜를 입력하면 '서울경제' 신문이 그 날짜로 되감기는
 * 모션 그래픽이 재생되고, 해당 일자의 기사가 펼쳐진다.
 * 톤: 활자·신문지 — 미색 종이, 세리프 제호, 절제.
 *
 * 예전엔 그날 지면을 4 에디터(MBTI 페르소나)가 각자 고른 묶음으로 갈라 보여줬다
 * (`mode: 'personas'`, `service/backend/services/persona_curation_service.py`).
 * MBTI 페르소나 개념 폐기(2026-08-07)로 백엔드 `/api/timeline` 이 이제
 * `flat`/`issues` 두 모드만 받는다 — `personas` 는 400 이 난다. 에디터별 탭은
 * 제거하고, 기본 목록(flat) + '그날의 이슈' 전환만 남긴다.
 */

/** 그날의 이슈 카드 수 / 이슈별 기사 수. */
const ISSUE_COUNT = 8;
const PER_ISSUE = 3;

interface Article {
  news_id: string;
  title: string;
  published_at: string;
  category: string;
  original_link: string;
  provider?: string;
}

/** 백엔드에서 오는 원본 기사 — 필드가 빠져 올 수 있어 전부 optional. */
interface RawArticle {
  news_id?: string;
  title?: string;
  published_at?: string;
  category?: string;
  original_link?: string;
  provider?: string;
}

/** 그날의 이슈 한 건 (빅카인즈 `/issue_ranking` 클러스터). */
interface Issue {
  topic: string;
  /** 이 이슈를 다룬 기사 수 — 클러스터 크기라 정확한 값. */
  article_count: number;
  /** 제목·언론사를 실제로 채운 표본 수 (전량 조회하지 않는다). */
  resolved_count: number;
  keywords: string[];
  providers: { total: number; top: { name: string; count: number }[] };
  articles: Article[];
  sedaily: Article | null;
}

/**
 * 그 무렵의 경제지표 한 줄.
 *
 * 값을 우리가 계산하지 않는다 — 그 무렵 **실제로 보도된 기사 제목**이다.
 * 제목에 숫자가 들어 있어서("원·달러 1418원") 지표 구실을 한다.
 */
interface Indicator {
  key: string;
  label: string;
  title: string;
  provider: string;
  published_at: string;
  original_link: string;
  has_number: boolean;
}

/** 결과 화면의 보기 방식 — 전체 기사(flat) / 그날의 이슈(issues). */
type View = 'flat' | 'issues';

type Phase = 'input' | 'rewinding' | 'result';

/**
 * 지면을 실제로 어디서 가져왔는지.
 *  bigkinds — 빅카인즈(언론진흥재단) 아카이브
 *  dynamodb — 서울경제 수집분 (빅카인즈 미연결/무응답 시)
 *  mock     — 네트워크 실패 시 오프라인 미리보기
 */
type Source = 'bigkinds' | 'dynamodb' | 'mock';

const MOCK_FALLBACK: Article[] = [
  { news_id: 'm1', title: '한국은행, 기준금리 0.25%p 인하 결정', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm2', title: '반도체 수출 48%↑…회복 흐름 속 고용은 16개월 만 최저', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm3', title: '국고채 3년물 3.766%…정부 구두개입에도 약세', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm4', title: '서울 아파트값 0.28% 상승…강남 12주 만에 플러스', published_at: '', category: '부동산', original_link: '#' },
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function kdate(s: string) {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

function toArticles(raw: unknown): Article[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawArticle[])
    .filter((a) => a && a.title)
    .map((a) => ({
      news_id: a.news_id ?? '',
      title: a.title ?? '',
      published_at: a.published_at ?? '',
      category: a.category ?? '',
      original_link: a.original_link ?? '',
      provider: a.provider,
    }));
}

/**
 * 그 날짜 지면을 가져온다.
 *
 * 1순위 `POST /api/timeline` — 빅카인즈 기반. 백엔드가 빅카인즈 실패 시 자체적으로
 *       DynamoDB 로 내려가며 `source` 로 어느 쪽인지 알려준다.
 * 2순위 `POST /api/search`   — 타임라인 Lambda/라우트가 아직 없을 때를 위한 안전망.
 *       (이 화면이 원래 쓰던 엔드포인트라 최소한 기존 동작은 항상 보장된다.)
 */
interface DayResult {
  list: Article[];
  source: Source;
  /**
   * `/api/timeline` 을 못 써서 구 `/api/search` 로 내려앉은 사유. 예전엔 이
   * 상황을 **아무 표시 없이** 옛 목록으로 렌더해서, 화면만 보고는 기능이
   * 깨진 건지 원래 그런 건지 구분할 수 없었다. 대표적 원인:
   *   · 운영 API Gateway 에 `/api/timeline` 라우트가 아직 없다 (404)
   *   · `NEXT_PUBLIC_API_URL` 은 **빌드 타임에 번들로 인라인**되므로,
   *     `.env.local` 이 반영되지 않은 번들을 받으면 운영 API 로 붙는다
   */
  degraded?: string;
}

async function fetchDayArticles(target: string): Promise<DayResult> {
  let degraded = '';
  try {
    const res = await fetch(`${API_URL}/api/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: target,
        mode: 'flat',
        page_size: 30,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const list = toArticles(data?.articles);
      if (list.length) {
        return {
          list,
          source: data?.source === 'bigkinds' ? 'bigkinds' : 'dynamodb',
        };
      }
      degraded = '타임라인 API가 그 날짜에 기사를 주지 않았어요.';
    } else {
      degraded = `타임라인 API 응답 ${res.status}`;
    }
  } catch (e) {
    degraded = `타임라인 API에 연결하지 못했어요 (${e instanceof Error ? e.message : '네트워크'})`;
  }

  if (process.env.NODE_ENV !== 'production') {
    // 로컬에서 이 경로를 타면 거의 항상 API_URL 이 운영을 가리키는 경우다.
    console.warn(
      `[timeline] /api/timeline 사용 실패 → /api/search 로 폴백. ${degraded}\n` +
      `  API_URL = ${API_URL}\n` +
      `  로컬 백엔드를 쓰려면 service/frontend/.env.local 에 ` +
      `NEXT_PUBLIC_API_URL=http://localhost:8000 을 넣고 dev 서버를 재시작하세요 ` +
      `(이 값은 빌드 타임에 번들로 들어갑니다).`
    );
  }

  const next = new Date(target);
  next.setDate(next.getDate() + 1);
  const res = await fetch(`${API_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '*',
      filters: { published_from: target, published_until: ymd(next) },
      page: 1,
      page_size: 30,
    }),
  });
  const data = await res.json();
  return {
    list: toArticles(data?.articles),
    source: 'dynamodb',
    degraded: degraded || '타임라인 API를 쓸 수 없어요.',
  };
}

/**
 * 그날의 이슈를 가져온다 (B안).
 *
 * 되감기 때 미리 받지 않고 **사용자가 '그날의 이슈' 로 전환할 때** 부른다 —
 * 이슈 모드는 빅카인즈를 2회(`/issue_ranking` + 배치 상세조회) 타므로
 * 안 볼 수도 있는 걸 미리 사올 이유가 없다.
 */
async function fetchIssues(target: string): Promise<{ issues: Issue[]; indicators: Indicator[] }> {
  const res = await fetch(`${API_URL}/api/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: target,
      mode: 'issues',
      issue_count: ISSUE_COUNT,
      per_issue: PER_ISSUE,
    }),
  });
  if (!res.ok) throw new Error(`timeline issues ${res.status}`);
  const data = await res.json();

  const rawIssues = Array.isArray(data?.issues) ? (data.issues as Partial<Issue>[]) : [];
  const issues: Issue[] = rawIssues
    .filter((i) => i && i.topic)
    .map((i) => ({
      topic: i.topic ?? '',
      article_count: i.article_count ?? 0,
      resolved_count: i.resolved_count ?? 0,
      keywords: Array.isArray(i.keywords) ? i.keywords : [],
      providers: {
        total: i.providers?.total ?? 0,
        top: Array.isArray(i.providers?.top) ? i.providers.top : [],
      },
      articles: toArticles(i.articles),
      sedaily: i.sedaily ? toArticles([i.sedaily])[0] ?? null : null,
    }));

  const rawInds = Array.isArray(data?.indicators)
    ? (data.indicators as Partial<Indicator>[])
    : [];
  const indicators: Indicator[] = rawInds
    .filter((i) => i && i.label && i.title)
    .map((i) => ({
      key: i.key ?? '',
      label: i.label ?? '',
      title: i.title ?? '',
      provider: i.provider ?? '',
      published_at: i.published_at ?? '',
      original_link: i.original_link ?? '',
      has_number: Boolean(i.has_number),
    }));

  return { issues, indicators };
}

/** 그 날짜의 기사 목록 — flat 모드 단일 리스트. */
function ArticleList({ items }: { items: Article[] }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#8a8378', textAlign: 'center', padding: '40px 0' }}>
        그 날은 보관된 기사가 없어요.
      </p>
    );
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((a, i) => (
        <li key={a.news_id || `${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid #ece6d9' }}>
          <a
            href={a.original_link || '#'}
            target={a.original_link && a.original_link !== '#' ? '_blank' : undefined}
            rel="noreferrer"
            style={{ display: 'flex', gap: 16, padding: '18px 4px', textDecoration: 'none', color: 'inherit', alignItems: 'baseline' }}
          >
            <span
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 15,
                fontWeight: 700,
                color: '#c4b48f',
                minWidth: 26,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: '#b08d57', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 5 }}>
                {a.category || '뉴스'}
                {a.provider && a.provider !== '서울경제' && ` · ${a.provider}`}
              </p>
              <p
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 'clamp(16px, 3.4vw, 18px)',
                  fontWeight: 600,
                  color: '#2a2622',
                  lineHeight: 1.5,
                  letterSpacing: '-0.015em',
                }}
              >
                {a.title}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * 그 무렵의 지표 — "그때 물가·금리는 어땠나".
 *
 * 값을 계산해서 보여주지 않는다. 그 무렵 **실제 보도된 기사 제목**을 그대로
 * 싣고 원문으로 링크한다. 제목에 이미 숫자가 있다 ("원·달러 1418원").
 * 출처 없는 숫자를 지면에 싣지 않기 위한 선택이다.
 */
function IndicatorPanel({ indicators }: { indicators: Indicator[] }) {
  if (indicators.length === 0) return null;
  return (
    <section
      style={{
        border: '1px solid #e6e0d4',
        background: '#fffdf7',
        borderRadius: 8,
        padding: '18px 20px',
        marginBottom: 30,
      }}
    >
      <p style={{ fontSize: 10.5, letterSpacing: '0.16em', color: '#b08d57', marginBottom: 4 }}>
        그 무렵의 지표
      </p>
      <p style={{ fontSize: 11.5, color: '#8a8378', marginBottom: 14, lineHeight: 1.6 }}>
        그 주에 실제로 보도된 기사예요. 제목의 숫자가 당시 수치입니다.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {indicators.map((ind) => (
          <li key={ind.key} style={{ marginBottom: 11 }}>
            <a
              href={ind.original_link || '#'}
              target={ind.original_link ? '_blank' : undefined}
              rel="noreferrer"
              style={{
                display: 'flex',
                gap: 10,
                textDecoration: 'none',
                color: 'inherit',
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#6b6459',
                  background: '#f2eee3',
                  borderRadius: 4,
                  padding: '3px 7px',
                  minWidth: 62,
                  textAlign: 'center',
                }}
              >
                {ind.label}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 13.5,
                    fontWeight: ind.has_number ? 600 : 500,
                    color: '#2a2622',
                    lineHeight: 1.5,
                  }}
                >
                  {ind.title}
                </span>
                <span style={{ fontSize: 11, color: '#8a8378', marginLeft: 6 }}>
                  {ind.provider}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 이슈 카드 — 그날 언론이 함께 다룬 한 덩어리.
 *
 * 숫자 표기 주의: `article_count` 는 클러스터 크기라 정확하지만,
 * 언론사 목록은 표본(`resolved_count`) 기준이라 "전체 매체 수"로 읽히게 쓰면
 * 안 된다. 그래서 상위 매체만 보여주고 총 매체 수는 내세우지 않는다.
 */
function IssueCard({ issue, index }: { issue: Issue; index: number }) {
  return (
    <li style={{ borderTop: index === 0 ? 'none' : '1px solid #ece6d9', padding: '22px 4px' }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <span
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 15,
            fontWeight: 700,
            color: '#c4b48f',
            minWidth: 26,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(16px, 3.6vw, 19px)',
              fontWeight: 700,
              color: '#2a2622',
              lineHeight: 1.45,
              letterSpacing: '-0.015em',
              marginBottom: 8,
            }}
          >
            {issue.topic}
          </p>

          <p style={{ fontSize: 11.5, color: '#b08d57', fontWeight: 600, marginBottom: 10 }}>
            이 이슈로 기사 {issue.article_count}건
          </p>

          {issue.keywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {issue.keywords.map((kw) => (
                <span
                  key={kw}
                  style={{
                    fontSize: 11,
                    color: '#6b6459',
                    background: '#f2eee3',
                    borderRadius: 4,
                    padding: '3px 7px',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {issue.sedaily && (
            <div
              style={{
                borderLeft: '2px solid #2a2622',
                paddingLeft: 12,
                margin: '0 0 12px',
              }}
            >
              <p style={{ fontSize: 10.5, letterSpacing: '0.1em', color: '#b08d57', marginBottom: 3 }}>
                서울경제는 이렇게 썼습니다
              </p>
              <a
                href={issue.sedaily.original_link || '#'}
                target={issue.sedaily.original_link ? '_blank' : undefined}
                rel="noreferrer"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: '#2a2622',
                  textDecoration: 'none',
                  lineHeight: 1.45,
                }}
              >
                {issue.sedaily.title}
              </a>
            </div>
          )}

          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
            {issue.articles
              .filter((a) => a.news_id !== issue.sedaily?.news_id)
              .map((a) => (
                <li key={a.news_id} style={{ marginBottom: 6 }}>
                  <a
                    href={a.original_link || '#'}
                    target={a.original_link ? '_blank' : undefined}
                    rel="noreferrer"
                    style={{ fontSize: 13.5, color: '#4a453d', textDecoration: 'none', lineHeight: 1.5 }}
                  >
                    <span style={{ color: '#8a8378', fontSize: 11.5, marginRight: 6 }}>
                      {a.provider}
                    </span>
                    {a.title}
                  </a>
                </li>
              ))}
          </ul>

          {issue.providers.top.length > 0 && (
            <p style={{ fontSize: 11, color: '#8a8378', lineHeight: 1.6 }}>
              많이 다룬 매체 ·{' '}
              {issue.providers.top.map((p) => `${p.name} ${p.count}`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function NewsTimeMachine() {
  const today = ymd(new Date());
  const [phase, setPhase] = useState<Phase>('input');
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  const [tick, setTick] = useState(today); // 되감기 중 표시되는 날짜
  const [articles, setArticles] = useState<Article[]>([]);
  const [offline, setOffline] = useState(false);
  const [source, setSource] = useState<Source>('dynamodb');
  const [degraded, setDegraded] = useState('');
  const [view, setView] = useState<View>('flat');
  // 날짜를 함께 담아둔다 — 되감기로 날짜가 바뀐 뒤 늦게 도착한 응답을
  // 새 날짜의 결과로 오인하지 않게 한다.
  const [issues, setIssues] = useState<
    { date: string; list: Issue[]; indicators: Indicator[] } | null
  >(null);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(false);
  const rafRef = useRef<number | null>(null);

  const fresh = issues && issues.date === target ? issues : null;
  const currentIssues = fresh ? fresh.list : null;
  const currentIndicators = fresh ? fresh.indicators : null;

  /**
   * '그날의 이슈' 로 전환. 이슈 모드는 빅카인즈를 2회 타므로 **이 시점에** 가져온다
   * (effect 로 동기화하지 않는다 — 사용자 행동이 계기이므로).
   */
  const openIssues = () => {
    setView('issues');
    if (currentIssues || issuesLoading) return;
    const requestedDate = target;
    setIssuesLoading(true);
    setIssuesError(false);
    fetchIssues(requestedDate)
      .then(({ issues: list, indicators }) =>
        setIssues({ date: requestedDate, list, indicators }))
      .catch(() => setIssuesError(true))
      .finally(() => setIssuesLoading(false));
  };

  function start() {
    if (!date) return;
    setTarget(date);
    setPhase('rewinding');
  }

  // 홈 "실시간 News" 티저에서 날짜를 미리 고르고 들어온 경우
  // (?date=YYYY-MM-DD) — useSearchParams는 정적 export에서 Suspense
  // 경계가 필요해 대신 window.location.search를 직접 읽는다. 값이 있으면
  // 입력창에 채우는 데서 그치지 않고 곧바로 되감기까지 시작한다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, URL 쿼리 초기화
      setDate(q);
      setTarget(q);
      setPhase('rewinding');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  // 되감기 모션 — 오늘 → 목표일까지 날짜를 거꾸로 흘리고, 그 사이 fetch
  useEffect(() => {
    if (phase !== 'rewinding' || !target) return;
    const from = new Date(today).getTime();
    const to = new Date(target).getTime();
    const DUR = 2200;
    const t0 = performance.now();

    const fetchPromise = (async (): Promise<DayResult & { offline: boolean }> => {
      try {
        const result = await fetchDayArticles(target);
        return { ...result, offline: false };
      } catch {
        return {
          list: MOCK_FALLBACK.map(a => ({ ...a, published_at: target })),
          source: 'mock' as Source,
          offline: true,
        };
      }
    })();

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      setTick(ymd(new Date(from + (to - from) * eased)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fetchPromise.then(({ list, source: src, offline, degraded: why }) => {
          setArticles(list);
          setSource(src);
          setOffline(offline);
          setDegraded(why ?? '');
          setPhase('result');
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, target, today]);

  const reset = () => {
    setPhase('input');
    // target 까지 비운다 — 남겨두면 다음 되감기에서 이전 날짜의 이슈 캐시가
    // 잘못 매칭될 수 있다 (currentIssues 가 target 으로 판정한다).
    setTarget('');
    setArticles([]);
    setOffline(false);
    setSource('dynamodb');
    setDegraded('');
    setView('flat');
    setIssues(null);
    setIssuesError(false);
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#faf8f3' }}>
      <style>{`
        @keyframes tmSheet {
          0%   { opacity: 0; transform: translateY(40px) rotate(.6deg) scale(1); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-120%) rotate(-7deg) scale(.92); }
        }
        @keyframes tmRise { from { opacity:0; transform: translateY(14px);} to {opacity:1; transform:none;} }
        @keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>

        {/* ── 입력 ───────────────────────────── */}
        {phase === 'input' && (
          <div style={{ textAlign: 'center', animation: 'tmRise .4s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', color: '#b08d57', marginBottom: 18 }}>
              NEWS TIME MACHINE
            </p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(26px, 6vw, 38px)',
                fontWeight: 700,
                color: '#2a2622',
                letterSpacing: '-0.025em',
                lineHeight: 1.3,
                marginBottom: 12,
              }}
            >
              그 날의 서울경제로 돌아갑니다
            </h1>
            <p style={{ fontSize: 14, color: '#8a8378', marginBottom: 38, lineHeight: 1.7 }}>
              날짜를 고르면 그 날 신문이 그대로 펼쳐져요.
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 8px 8px 20px',
                background: '#fff',
                border: '1px solid #e6e0d4',
                borderRadius: 9999,
                boxShadow: '0 1px 2px rgba(80,60,30,0.04)',
              }}
            >
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 15,
                  color: '#2a2622',
                  fontFamily: 'inherit',
                  width: 'clamp(140px, 40vw, 180px)',
                }}
              />
              <button
                onClick={start}
                disabled={!date}
                style={{
                  padding: '10px 22px',
                  borderRadius: 9999,
                  border: 'none',
                  background: date ? '#2a2622' : '#d9d3c6',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: date ? 'pointer' : 'default',
                  transition: 'background .2s',
                  whiteSpace: 'nowrap',
                }}
              >
                그 날 신문 펼치기
              </button>
            </div>
          </div>
        )}

        {/* ── 되감기 모션 ───────────────────────────── */}
        {phase === 'rewinding' && (
          <div style={{ textAlign: 'center', position: 'relative', minHeight: 360 }}>
            <div style={{ position: 'relative', height: 240, marginBottom: 28 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: '0 auto',
                    width: 'min(320px, 80%)',
                    height: 220,
                    background: '#fffdf7',
                    border: '1px solid #e6e0d4',
                    borderRadius: 6,
                    boxShadow: '0 10px 30px rgba(80,60,30,0.10)',
                    animation: `tmSheet 1.5s cubic-bezier(.5,0,.7,.4) ${i * 0.28}s infinite`,
                  }}
                >
                  <div style={{ padding: '18px 22px', textAlign: 'left' }}>
                    <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 800, color: '#2a2622', letterSpacing: '-0.02em' }}>
                      서울經濟
                    </p>
                    <div style={{ height: 1, background: '#e6e0d4', margin: '10px 0' }} />
                    {[88, 70, 80].map((w, k) => (
                      <div key={k} style={{ height: 7, width: `${w}%`, background: '#eee7d8', borderRadius: 2, marginBottom: 7 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, letterSpacing: '0.18em', color: '#b08d57', marginBottom: 8 }}>
              REWINDING
            </p>
            <p
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(22px, 5vw, 30px)',
                fontWeight: 700,
                color: '#2a2622',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {kdate(tick)}
            </p>
          </div>
        )}

        {/* ── 결과: 그 날의 신문 ───────────────────────────── */}
        {phase === 'result' && (
          <div style={{ animation: 'tmPaper .5s ease' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #2a2622', paddingBottom: 16, marginBottom: 28 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.2em', color: '#b08d57', marginBottom: 8 }}>
                SEOUL ECONOMIC DAILY · {source === 'bigkinds' ? '빅카인즈 보관본' : '보관본'}
              </p>
              <h1
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 'clamp(24px, 5.4vw, 34px)',
                  fontWeight: 800,
                  color: '#2a2622',
                  letterSpacing: '-0.02em',
                }}
              >
                {kdate(target)}자 서울경제
              </h1>
            </div>

            {articles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 18, fontWeight: 700, color: '#2a2622', marginBottom: 8 }}>
                  그 날의 신문은 아직 보관되지 않았어요
                </p>
                <p style={{ fontSize: 13, color: '#8a8378', marginBottom: 22 }}>다른 날짜로 다시 돌려볼까요?</p>
                <button onClick={reset} style={{ padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622', background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  다른 날짜 고르기
                </button>
              </div>
            ) : (
              <>
                {offline && (
                  <p style={{ fontSize: 11.5, color: '#b08d57', textAlign: 'center', marginBottom: 18 }}>
                    (오프라인 미리보기 — 실제 보관본은 연결 시 표시됩니다)
                  </p>
                )}

                {/* 퇴화 안내 — 예전엔 조용히 옛 목록으로 바뀌어 원인을 알 수 없었다 */}
                {degraded && (
                  <div
                    style={{
                      border: '1px solid #e6d9b8',
                      background: '#fdfaf0',
                      borderRadius: 6,
                      padding: '10px 14px',
                      marginBottom: 20,
                    }}
                  >
                    <p style={{ fontSize: 12, color: '#8a7040', lineHeight: 1.6 }}>
                      타임라인 보관본을 불러오지 못해 기본 목록을 보여주고 있어요. — {degraded}
                    </p>
                  </div>
                )}

                {/* 보기 전환 — 전체 기사 / 그날의 이슈 */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 22 }}>
                  {([
                    ['flat', '전체 기사'],
                    ['issues', '그날의 이슈'],
                  ] as [View, string][]).map(([key, label]) => {
                    const isOn = view === key;
                    return (
                      <button
                        key={key}
                        onClick={() => (key === 'issues' ? openIssues() : setView('flat'))}
                        aria-pressed={isOn}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 9999,
                          border: `1px solid ${isOn ? '#2a2622' : '#e6e0d4'}`,
                          background: isOn ? '#2a2622' : 'transparent',
                          color: isOn ? '#fff' : '#8a8378',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {view === 'issues' ? (
                  <>
                    <p style={{ fontSize: 12.5, color: '#8a8378', textAlign: 'center', marginBottom: 22, lineHeight: 1.7 }}>
                      그 날 여러 언론사가 함께 다룬 이슈를 보도량 순으로 묶었어요.
                    </p>
                    {issuesLoading && (
                      <p style={{ fontSize: 13, color: '#8a8378', textAlign: 'center', padding: '40px 0' }}>
                        그 날의 이슈를 모으고 있어요…
                      </p>
                    )}
                    {issuesError && (
                      <p style={{ fontSize: 13, color: '#8a8378', textAlign: 'center', padding: '40px 0' }}>
                        이슈를 가져오지 못했어요. 전체 기사 보기로 확인해 주세요.
                      </p>
                    )}
                    {!issuesLoading && !issuesError && currentIssues?.length === 0 && (
                      <p style={{ fontSize: 13, color: '#8a8378', textAlign: 'center', padding: '40px 0' }}>
                        그 날은 묶을 만한 이슈가 없었어요.
                      </p>
                    )}
                    {!issuesLoading && !issuesError && currentIndicators && (
                      <IndicatorPanel indicators={currentIndicators} />
                    )}
                    {!issuesLoading && !issuesError && currentIssues && currentIssues.length > 0 && (
                      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {currentIssues.map((issue, i) => (
                          <IssueCard key={`${issue.topic}-${i}`} issue={issue} index={i} />
                        ))}
                      </ol>
                    )}
                  </>
                ) : (
                  <ArticleList items={articles} />
                )}

                <div style={{ textAlign: 'center', marginTop: 36 }}>
                  <button onClick={reset} style={{ padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622', background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    다른 날짜로 또 돌아가기
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
