'use client';

// '그 날의 신문' 결과 화면 — NewsTimeMachine.tsx의 'result' 페이즈를 그대로
// 옮겨왔다(2026-08-12, 날짜별 URL 분리). /timeline/[date] 페이지가 서버에서
// 미리 가져온 데이터를 initial*로 내려주면 애니메이션 없이 바로 뜨고,
// '그날의 이슈' 전환은 여기서 그대로 클라이언트 fetch로 처리한다(기존 동작
// 그대로 — 빅카인즈를 2회 타므로 볼 때만 가져온다).
//
// 2026-08-19: 크림·갈색·세리프를 걷고 lib/tone.ts 토큰으로 교체했다.
// **구조는 그대로 둔다** — 이 화면은 '전체 기사 / 그날의 이슈' 두 보기가 있는
// 별개 기능이고, 오늘 요청은 과거 날짜 화면(TimelineBigkindsView)이었다.
// 다만 이걸 안 바꾸면 최근 날짜(2026-02-01~) 페이지만 갈색으로 남아 같은
// URL 패턴에서 톤이 갈린다.
//
// 이 파일에서 고친 대비 미달: 기사 순번·카테고리 #c4b48f(1.93:1)·
// #b08d57(2.91:1), 지표 패널 보조문 #8a8378(3.53:1), 보기 전환 비활성 글자
// (3.53:1). 폰트 스케일 밖 값 10.5·11·11.5·12.5·13.5·14.5·15·19·34 제거.
import { useState } from 'react';
import Link from 'next/link';
import {
  fetchIssues, kdate,
  type Article, type Issue, type Indicator, type View,
} from '../lib/timelineApi';
import {
  SURFACE, SURFACE_SUNKEN, SURFACE_CHIP, TEXT_STRONG, TEXT_BODY, TEXT_MUTED,
  BORDER_HAIRLINE, BORDER_CONTROL, BORDER_STRONG, FONT, SPACE,
} from '../lib/tone';
import { SajuFunnelCard } from './SajuFunnelCard';

function ArticleList({ items }: { items: Article[] }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>
        그 날은 보관된 기사가 없어요.
      </p>
    );
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((a, i) => (
        <li key={a.news_id || `${i}`} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER_HAIRLINE}` }}>
          <a
            href={a.original_link || '#'}
            target={a.original_link && a.original_link !== '#' ? '_blank' : undefined}
            rel="noopener noreferrer"
            style={{ display: 'flex', gap: 16, padding: '18px 4px', textDecoration: 'none', color: 'inherit', alignItems: 'baseline' }}
          >
            <span
              style={{
                                fontSize: FONT.body,
                fontWeight: 700,
                color: TEXT_MUTED,
                minWidth: 26,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 5 }}>
                {a.category || '뉴스'}
                {a.provider && a.provider !== '서울경제' && ` · ${a.provider}`}
              </p>
              <p
                style={{
                                    fontSize: FONT.body,
                  fontWeight: 600,
                  color: TEXT_STRONG,
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

function IndicatorPanel({ indicators }: { indicators: Indicator[] }) {
  if (indicators.length === 0) return null;
  return (
    <section
      style={{ border: `1px solid ${BORDER_CONTROL}`, background: SURFACE_SUNKEN, borderRadius: 8, padding: '18px 20px', marginBottom: 30 }}
    >
      <p style={{ fontSize: FONT.caption, letterSpacing: '0.16em', color: TEXT_MUTED, marginBottom: 4 }}>
        그 무렵의 지표
      </p>
      <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginBottom: 14, lineHeight: 1.6 }}>
        그 주에 실제로 보도된 기사예요. 제목의 숫자가 당시 수치입니다.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {indicators.map((ind) => (
          <li key={ind.key} style={{ marginBottom: 11 }}>
            <a
              href={ind.original_link || '#'}
              target={ind.original_link ? '_blank' : undefined}
              rel="noopener noreferrer"
              style={{ display: 'flex', gap: 10, textDecoration: 'none', color: 'inherit', alignItems: 'baseline' }}
            >
              <span
                style={{
                  flex: '0 0 auto', fontSize: FONT.caption, fontWeight: 700, color: TEXT_BODY,
                  background: SURFACE_CHIP, borderRadius: 4, padding: '3px 7px', minWidth: 62, textAlign: 'center',
                }}
              >
                {ind.label}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: FONT.meta,
                    fontWeight: ind.has_number ? 600 : 500, color: TEXT_STRONG, lineHeight: 1.5,
                  }}
                >
                  {ind.title}
                </span>
                <span style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginLeft: 6 }}>{ind.provider}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueCard({ issue, index }: { issue: Issue; index: number }) {
  return (
    <li style={{ borderTop: index === 0 ? 'none' : `1px solid ${BORDER_HAIRLINE}`, padding: '22px 4px' }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <span
          style={{
            fontSize: FONT.body, fontWeight: 700,
            color: TEXT_MUTED, minWidth: 26, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: FONT.sectionTitle, fontWeight: 700,
              color: TEXT_STRONG, lineHeight: 1.45, letterSpacing: '-0.015em', marginBottom: 8,
            }}
          >
            {issue.topic}
          </p>
          <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, marginBottom: 10 }}>
            이 이슈로 기사 {issue.article_count}건
          </p>
          {issue.keywords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {issue.keywords.map((kw) => (
                <span key={kw} style={{ fontSize: FONT.caption, color: TEXT_BODY, background: SURFACE_CHIP, borderRadius: 4, padding: '3px 7px' }}>
                  {kw}
                </span>
              ))}
            </div>
          )}
          {issue.sedaily && (
            <div style={{ borderLeft: `2px solid ${BORDER_STRONG}`, paddingLeft: 12, margin: '0 0 12px' }}>
              <p style={{ fontSize: FONT.caption, letterSpacing: '0.1em', color: TEXT_MUTED, marginBottom: 3 }}>
                서울경제는 이렇게 썼습니다
              </p>
              <a
                href={issue.sedaily.original_link || '#'}
                target={issue.sedaily.original_link ? '_blank' : undefined}
                rel="noopener noreferrer"
                style={{ fontSize: FONT.body, fontWeight: 600, color: TEXT_STRONG, textDecoration: 'none', lineHeight: 1.45 }}
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
                    rel="noopener noreferrer"
                    style={{ fontSize: FONT.meta, color: TEXT_BODY, textDecoration: 'none', lineHeight: 1.5 }}
                  >
                    <span style={{ color: TEXT_MUTED, fontSize: FONT.caption, marginRight: 6 }}>{a.provider}</span>
                    {a.title}
                  </a>
                </li>
              ))}
          </ul>
          {issue.providers.top.length > 0 && (
            <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, lineHeight: 1.6 }}>
              많이 다룬 매체 · {issue.providers.top.map((p) => `${p.name} ${p.count}`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function TimelineResultView({
  date,
  initialArticles,
  initialOffline = false,
}: {
  date: string;
  initialArticles: Article[];
  initialOffline?: boolean;
}) {
  const [view, setView] = useState<View>('flat');
  const [issues, setIssues] = useState<{ list: Issue[]; indicators: Indicator[] } | null>(null);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState(false);

  const openIssues = () => {
    setView('issues');
    if (issues || issuesLoading) return;
    setIssuesLoading(true);
    setIssuesError(false);
    fetchIssues(date)
      .then(({ issues: list, indicators }) => setIssues({ list, indicators }))
      .catch(() => setIssuesError(true))
      .finally(() => setIssuesLoading(false));
  };

  return (
    <div style={{ minHeight: '100vh', background: SURFACE }}>
      <style>{`@keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>
        <div style={{ animation: 'tmPaper .5s ease' }}>
          <div style={{ textAlign: 'center', borderBottom: `2px solid ${BORDER_STRONG}`, paddingBottom: 16, marginBottom: 28 }}>
            <p style={{ fontSize: FONT.caption, letterSpacing: '0.2em', color: TEXT_MUTED, marginBottom: 8 }}>
              SEOUL ECONOMIC DAILY · 보관본
            </p>
            <h1
              style={{
                fontSize: `clamp(${FONT.pageTitle}px, 5.4vw, ${FONT.pageTitleLg}px)`,
                fontWeight: 800, color: TEXT_STRONG, letterSpacing: '-0.02em',
              }}
            >
              {kdate(date)}자 서울경제
            </h1>
          </div>

          {initialArticles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: FONT.sectionTitle, fontWeight: 700, color: TEXT_STRONG, marginBottom: 8 }}>
                그 날의 신문은 아직 보관되지 않았어요
              </p>
              <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, marginBottom: 22 }}>다른 날짜로 다시 돌려볼까요?</p>
              <Link
                href="/timeline"
                style={{
                  display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: `1px solid ${BORDER_CONTROL}`,
                  background: 'transparent', color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, textDecoration: 'none',
                }}
              >
                다른 날짜 고르기
              </Link>
            </div>
          ) : (
            <>
              {initialOffline && (
                <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, textAlign: 'center', marginBottom: 18 }}>
                  (오프라인 미리보기 — 실제 보관본은 연결 시 표시됩니다)
                </p>
              )}
              {/* 보기 전환 — 공용 .tl-chip 을 쓴다. 이전에는 padding 7px 로
                  터치 타겟이 31px 이었고(최소 44px), 비활성 글자가 #8a8378
                  (3.53:1)로 대비 미달이었다. */}
              <div
                role="group"
                aria-label="보기 방식"
                style={{ display: 'flex', justifyContent: 'center', gap: SPACE.sm, marginBottom: SPACE.xl }}
              >
                {([
                  ['flat', '전체 기사'],
                  ['issues', '그날의 이슈'],
                ] as [View, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="tl-chip tl-focus"
                    onClick={() => (key === 'issues' ? openIssues() : setView('flat'))}
                    aria-pressed={view === key}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view === 'issues' ? (
                <>
                  <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', marginBottom: 22, lineHeight: 1.7 }}>
                    그 날 여러 언론사가 함께 다룬 이슈를 보도량 순으로 묶었어요.
                  </p>
                  {/* 이 세 상태는 클라이언트 fetch 결과에 따라 나중에 나타난다.
                      aria-live 가 없으면 화면을 못 보는 사용자에게는 "그날의
                      이슈"를 누른 뒤 아무 일도 안 일어난 것과 같다. */}
                  <div role="status" aria-live="polite">
                    {issuesLoading && (
                      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>
                        그날의 이슈를 모으고 있어요…
                      </p>
                    )}
                    {issuesError && (
                      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>
                        이슈를 가져오지 못했어요. 전체 기사 보기로 확인해 주세요.
                      </p>
                    )}
                    {!issuesLoading && !issuesError && issues?.list.length === 0 && (
                      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>
                        그날은 묶을 만한 이슈가 없었어요.
                      </p>
                    )}
                  </div>
                  {!issuesLoading && !issuesError && issues?.indicators && (
                    <IndicatorPanel indicators={issues.indicators} />
                  )}
                  {!issuesLoading && !issuesError && issues?.list && issues.list.length > 0 && (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {issues.list.map((issue, i) => (
                        <IssueCard key={`${issue.topic}-${i}`} issue={issue} index={i} />
                      ))}
                    </ol>
                  )}
                </>
              ) : (
                <ArticleList items={initialArticles} />
              )}

              <SajuFunnelCard />

              <div style={{ textAlign: 'center', marginTop: 36 }}>
                <Link
                  href="/timeline"
                  style={{
                    display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: `1px solid ${BORDER_CONTROL}`,
                    background: 'transparent', color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, textDecoration: 'none',
                  }}
                >
                  다른 날짜로 또 돌아가기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
