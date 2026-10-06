'use client';

// 2026-02-01 이전 날짜의 도착 화면. S3 지면 아카이브가 없는 구간이라 TimelineResultView를 쓸 수 없고,
// 빅카인즈 뉴스 검색(날짜 범위 + provider=서울경제)으로 제목·본문 스니펫·바이라인·원본 링크를 가져온다.
// 발행 시각은 API가 항상 자정으로 고정해 제공하지 않는다.
//
// 화면 구성: 기사를 분야별 섹션(순서 고정, rankArticles.ts BEAT_ORDER)으로 묶어 "그날은 어떤 날이었나"에 답한다.
// 크기로 서열을 매기지 않으며(근거는 rankArticles.ts buildDayLayout 참조), 제목 = 기사 링크 하나로 통일한다.
// 부고·인사·공시는 맨 아래 접힘 영역에 둔다. 색·타이포 토큰은 lib/tone.ts를 사용한다.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BigKindsArticle, InvestmentScenario } from '@/shared/lib/api/timelineApi';
import { kdate } from '@/shared/lib/date/timelineDates';
import { isReadableOriginal, resolveArticleLink } from '@/features/timeline/lib/articleLinks';
import { buildDayLayout } from '@/features/timeline/lib/rankArticles';
import {
  SURFACE, TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT,
  BORDER_HAIRLINE, BORDER_STRONG, FONT, LEADING, SPACE, RADIUS, TOUCH_MIN,
  CONTAINER_MAX, PROSE_MAX, SR_ONLY, yearsAgoLabel,
} from '@/features/timeline/lib/tone';
import { InvestmentScenarioCards } from './InvestmentScenarioCards';
import { ShareBar } from './ShareBar';

import { SITE_URL } from '@/shared/constants/site';

/** 분야마다 처음 펼쳐 둘 기사 수 — 나머지는 "더 보기"로 접힌다. */
const PREVIEW_PER_SECTION = 3;

/**
 * 기사 한 행 — 제목 + 본문 미리보기 + 바이라인. 모든 행이 같은 모양이다.
 * 오래된 기사의 제목만으로는 내용을 알 수 없으므로 모든 행에 미리보기를 붙이며,
 * 일부 행에만 붙이면 중요도를 암시하게 되므로 사용하지 않는다.
 */
function ArticleRow({ article }: { article: BigKindsArticle }) {
  const href = resolveArticleLink(article)?.href;
  const Wrapper = href ? 'a' : 'div';
  return (
    <li style={{ borderTop: `1px solid ${BORDER_HAIRLINE}` }}>
      <Wrapper
        {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
        className={href ? 'tl-row tl-focus' : undefined}
        style={{
          display: 'block',
          padding: `${SPACE.md}px ${SPACE.sm}px`,
          minHeight: TOUCH_MIN,
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <p
          className="tl-row-title tl-clamp2"
          style={{
            fontSize: FONT.body,
            fontWeight: 600,
            color: TEXT_STRONG,
            lineHeight: LEADING.title,
            letterSpacing: '-0.01em',
            wordBreak: 'keep-all',
            transition: 'color .14s ease',
          }}
        >
          {article.title}
          {href && (
            <>
              {/* 외부 링크 표시. 목적지 설명은 화면 위에 한 번만 두고 행에는 글리프만 붙인다. */}
              <span aria-hidden style={{ color: ACCENT, marginLeft: SPACE.xs, fontWeight: 700 }}>↗</span>
              <span style={SR_ONLY}>새 창에서 열립니다</span>
            </>
          )}
        </p>
        {article.content && (
          <p
            className="tl-clamp2"
            style={{
              marginTop: SPACE.xs,
              maxWidth: PROSE_MAX,
              fontSize: FONT.meta,
              color: TEXT_BODY,
              lineHeight: LEADING.body,
              wordBreak: 'keep-all',
            }}
          >
            {article.content}
          </p>
        )}
        {/* 바이라인은 행에 넣지 않는다. 미리보기와 경쟁하며, 출처 신뢰는 지면 머리의 "빅카인즈 보관본"이 담당한다. */}
      </Wrapper>
    </li>
  );
}

export function TimelineBigkindsView({
  date,
  articles,
  investments,
}: {
  date: string;
  articles: BigKindsArticle[];
  investments: InvestmentScenario[];
}) {
  const layout = useMemo(() => buildDayLayout(articles), [articles]);
  const [fillerOpen, setFillerOpen] = useState(false);
  // 분야별로 처음 몇 건만 펼치고 나머지는 접는다. 분야 목록은 한눈에 보여야 하므로 분야 자체는 접지 않으며,
  // 접힘 UI는 부고·인사·공시와 같은 관례(.tl-btn + ▾)를 따른다.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const yearsAgo = yearsAgoLabel(date);
  const total = articles.length;

  // 빅카인즈가 오래된 기사에 주는 폐기된 sednews.com 주소는 서울경제 홈으로 리다이렉트된다(isReadableOriginal 참조).
  // 이 경우 링크가 빅카인즈 상세로 향하므로 목적지를 미리 밝힌다.
  const noOriginals = useMemo(
    () => total > 0 && !articles.some((a) => isReadableOriginal(a.original_link)),
    [articles, total],
  );

  // 공유 카드는 코스피를 우선 사용하고, 없으면 첫 시나리오, 그것도 없으면(예: 1994년 이전) 헤드라인만으로 구성한다.
  const heroScenario = investments.find((s) => s.id === 'kospi') ?? investments[0];
  const shareCardData = {
    date,
    dateLabel: kdate(date),
    heroLabel: heroScenario?.description,
    heroValue: heroScenario?.highlight,
    story: heroScenario?.story,
    headline: layout.sections[0]?.items[0]?.title,
    url: `${SITE_URL}/timeline/${date}`,
  };

  return (
    <div style={{ minHeight: '100vh', background: SURFACE }}>
      <div
        style={{
          maxWidth: CONTAINER_MAX,
          margin: '0 auto',
          padding: 'clamp(32px, 7vw, 72px) clamp(20px, 5vw, 32px) clamp(48px, 8vw, 80px)',
        }}
      >
        <div className="tl-enter">
          {/* ── 지면 머리 ── 굵은 밑줄은 신문 제호의 구조를 나타내며 페이지 정체성을 부여한다. */}
          <header
            style={{
              textAlign: 'center',
              borderBottom: `2px solid ${BORDER_STRONG}`,
              paddingBottom: SPACE.lg,
              marginBottom: SPACE.xl,
            }}
          >
            <p
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: SPACE.sm,
                fontSize: FONT.caption,
                fontWeight: 600,
                color: TEXT_MUTED,
                marginBottom: SPACE.sm,
                flexWrap: 'wrap',
              }}
            >
              {yearsAgo && (
                <span
                  style={{
                    background: TEXT_STRONG,
                    color: SURFACE,
                    borderRadius: RADIUS.pill,
                    padding: '3px 10px',
                    fontWeight: 700,
                  }}
                >
                  {yearsAgo}
                </span>
              )}
              <span>빅카인즈 보관본 · 발행 시각 정보 없음</span>
            </p>
            <h1
              style={{
                fontSize: `clamp(${FONT.pageTitle}px, 5.4vw, ${FONT.pageTitleLg}px)`,
                fontWeight: 800,
                color: TEXT_STRONG,
                letterSpacing: '-0.03em',
                lineHeight: LEADING.tight,
              }}
            >
              {kdate(date)}자 서울경제
            </h1>
            {total > 0 && (
              <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, marginTop: SPACE.sm, lineHeight: LEADING.body }}>
                그날 기사 {total}건을 찾았어요
              </p>
            )}
          </header>

          {total === 0 ? (
            /* ── 빈 상태 ── 비어 있는 이유와 다음 행동을 안내한다. */
            <div style={{ textAlign: 'center', padding: '56px 0' }}>
              <p style={{ fontSize: FONT.sectionTitle, fontWeight: 700, color: TEXT_STRONG, marginBottom: SPACE.sm }}>
                이 날은 보관된 기사가 없어요
              </p>
              <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, marginBottom: SPACE.xl, lineHeight: LEADING.body }}>
                빅카인즈 아카이브가 1990년부터라, 그 사이에도 비어 있는 날이 있어요.
                <br />
                다른 날짜로 다시 떠나볼까요?
              </p>
              <Link href="/timeline" className="tl-btn tl-focus">
                다른 날짜 고르기
              </Link>
            </div>
          ) : (
            <>
              {/* ── 분야별 지면 ── 신문 섹션 구조를 따르며 순서는 고정(BEAT_ORDER)이다. */}
              {/* 조작·목적지 안내를 한 번만 표시하고 각 행에는 ↗ 만 붙인다. */}
              <p
                style={{
                  fontSize: FONT.caption,
                  color: TEXT_MUTED,
                  marginBottom: SPACE.lg,
                  lineHeight: LEADING.body,
                }}
              >
                제목을 누르면 기사로 이동해요
                {noOriginals && (
                  <>
                    {' '}— 이 시기는 서울경제 원문 주소가 끊겨서 뉴스 아카이브(빅카인즈)로 연결됩니다
                  </>
                )}
              </p>

              {layout.sections.map((section) => {
                const isOpen = !!openSections[section.label];
                const restCount = section.items.length - PREVIEW_PER_SECTION;
                const shown = isOpen ? section.items : section.items.slice(0, PREVIEW_PER_SECTION);
                const listId = `tl-beat-list-${section.label}`;
                return (
                  <section
                    key={section.label}
                    aria-labelledby={`tl-beat-${section.label}`}
                    style={{ marginBottom: SPACE.xl }}
                  >
                    <h2
                      id={`tl-beat-${section.label}`}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: SPACE.sm,
                        fontSize: FONT.sectionTitle,
                        fontWeight: 700,
                        color: TEXT_STRONG,
                        letterSpacing: '-0.02em',
                        paddingBottom: SPACE.sm,
                      }}
                    >
                      {section.label}
                      {/* 건수는 보조 정보이므로 무게를 낮춘다. 접힌 동안에도 전체 건수를 표시해 "더 보기"를 예측할 수 있게 한다. */}
                      <span style={{ fontSize: FONT.caption, fontWeight: 600, color: TEXT_MUTED }}>
                        {section.items.length}건
                      </span>
                    </h2>
                    <ul id={listId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {shown.map((a, i) => (
                        <ArticleRow key={a.news_id || `${section.label}-${i}`} article={a} />
                      ))}
                    </ul>
                      {/* 테두리 없는 텍스트 + 화살표 버튼(.tl-more). 터치 타겟(44px)은 패딩으로 확보하고 포커스 링(.tl-focus)은 유지한다. */}
                    {restCount > 0 && (
                      <button
                        type="button"
                        className="tl-more tl-focus"
                        aria-expanded={isOpen}
                        aria-controls={listId}
                        onClick={() =>
                          setOpenSections((s) => ({ ...s, [section.label]: !s[section.label] }))
                        }
                      >
                        {isOpen ? '접기' : `${restCount}건 더 보기`}
                        <span
                          aria-hidden
                          style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s ease' }}
                        >
                          ▾
                        </span>
                      </button>
                    )}
                  </section>
                );
              })}

              {/* ── 부고·인사·공시 ── 제외하지 않고 접어서 제공한다. */}
              {layout.filler.length > 0 && (
                <section style={{ marginBottom: SPACE.xxl }}>
                  <button
                    type="button"
                    className="tl-btn tl-focus"
                    aria-expanded={fillerOpen}
                    aria-controls="tl-filler"
                    onClick={() => setFillerOpen((v) => !v)}
                    style={{ width: '100%' }}
                  >
                    부고 · 인사 · 공시 {layout.filler.length}건
                    <span aria-hidden style={{ transform: fillerOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s ease' }}>
                      ▾
                    </span>
                  </button>
                  {fillerOpen && (
                    <ul id="tl-filler" style={{ listStyle: 'none', margin: `${SPACE.md}px 0 0`, padding: 0 }}>
                      {layout.filler.map((a, i) => {
                        const href = resolveArticleLink(a)?.href;
                        const Wrapper = href ? 'a' : 'div';
                        return (
                          <li key={a.news_id || `filler-${i}`} style={{ borderTop: `1px solid ${BORDER_HAIRLINE}` }}>
                            <Wrapper
                              {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
                              className={href ? 'tl-row tl-focus' : undefined}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                minHeight: TOUCH_MIN,
                                padding: `${SPACE.sm}px`,
                                fontSize: FONT.meta,
                                color: TEXT_BODY,
                                lineHeight: LEADING.title,
                                textDecoration: 'none',
                                wordBreak: 'keep-all',
                              }}
                            >
                              {a.title}
                              {href && <span style={SR_ONLY}>새 창에서 열립니다</span>}
                            </Wrapper>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              <InvestmentScenarioCards scenarios={investments} />

              <ShareBar cardData={shareCardData} />


              <div style={{ textAlign: 'center', marginTop: SPACE.xxl }}>
                <Link href="/timeline" className="tl-btn tl-focus">
                  다른 날짜로 또 떠나기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
