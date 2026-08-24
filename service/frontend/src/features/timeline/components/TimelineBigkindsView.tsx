'use client';

// 2026-02-01 이전 날짜의 도착 화면 — S3 지면 아카이브가 없는 구간이라
// TimelineResultView(발행 시각 있는 최근 지면 전용)를 그대로 못 쓴다. 빅카인즈
// 뉴스 검색(날짜 범위 + provider=서울경제)으로 제목·본문 스니펫·바이라인·원본
// 링크까지 가져온다. 발행 "시각"은 이 API 가 어느 시대 기사든 항상 자정 고정이라
// 안 준다.
//
// ══ 2026-08-19 재설계 ══
// 데이터·분기 로직은 그대로 두고 표현만 바꿨다.
//
// ── (A) 톤 ──
// 크림 배경(#faf8f3) + 갈색(#8a6d3f·#b08d57·#c4b48f) + Noto Serif KR 이었다.
// 홈 형제 섹션 중 세리프를 쓰는 곳은 하나도 없고, 홈 타임머신 섹션의 갈색은
// 이미 걷어낸 상태라 **그 버튼을 눌러 도착하는 이 페이지만 갈색**이었다.
// 종이비행기 전환(회색·파랑)에서 크림 페이지로 착지하니 톤이 튀었다.
// lib/tone.ts 의 토큰으로 통일했다.
//
// ── (B) 가시성 ──
// 대비 실측 결과 본문·컨트롤 11건이 미달이었다. 기사 순번 1.93:1,
// 카테고리 2.91:1, 바이라인 2.38:1, EXIT 필 테두리 1.24:1. 카테고리는 이
// 화면의 유일한 분류 정보인데 안 읽혔다. 폰트도 스케일 밖 값이 9종
// (10.5·11·11.5·12.5·13.5·14.5·15·17·34).
//
// ── (C) 균일한 5행 나열을 분야별 지면으로 ──
// 30건 중 앞 5건만 API 순서대로 잘라 아코디언으로 보여줬다. 문제가 둘.
//
//   1) **두 번째 항목이 부고였다** ("金炳柱씨(…) 빙부상"). API 순서에 의미가
//      없어서다 — news_id 뒷부분은 2016년 디지털화 시각이다(lib/rankArticles.ts
//      주석 참조). 30건 중 7건이 부고·인사·공시 토막이었다.
//   2) 그날의 큰 기사와 부고가 **똑같은 크기·똑같은 행 모양**이었다.
//
// 이 서비스에 오는 사람은 기사 30건을 읽으러 오지 않는다. 생일이나 기념일,
// "그때 무슨 일이 있었나"가 궁금해서 와서 **그날의 감을 잡고 공유**한다
// (홈 퀵픽이 "10년 전 오늘/20년 전/30년 전"이고, 뒤에 사주 퍼널과 공유바가
// 붙어 있는 이유). 그래서 화면이 답해야 할 질문은 "무엇을 먼저 읽어야 하나"가
// 아니라 **"그날은 어떤 날이었나"** 다.
//
// 그 질문에는 분야별 묶음이 답한다 — "경제는 이랬고, 정치는 이랬다".
// 신문 지면 자체가 섹션으로 조직돼 있어 현실의 모델과도 맞고, 순서가 고정이라
// (rankArticles.ts BEAT_ORDER) 날마다 같은 자리에 같은 분야가 온다.
//
//   · 분야 섹션 — 제목 18px + 건수. 순서 고정
//   · 각 분야 첫 기사 — 제목 굵게 + 본문 미리보기 2줄 + 바이라인
//   · 나머지 — 제목만
//   · 맨 아래 접힘 — 부고·인사·공시
//
// **크기로 서열을 매기지 않는다.** 처음엔 분량 상위 2건을 큰 카드로 올렸는데,
// 2008-09-16(리먼 파산 다음 날)에서 자동차 기획기사가 금융위기 기사를
// 앞질렀다. 제목이 길어서다. 크게 만드는 것 자체가 "이게 제일 중요하다"는
// 주장인데 쓸 수 있는 필드 다섯 개로는 뒷받침할 수 없었다
// (자세한 근거는 rankArticles.ts buildDayLayout 주석).
// 밀도는 미리보기 유무로만 벌린다.
//
// ── (D) 한 요소는 한 가지 일만 ──
// 제목을 누르면 본문이 펼쳐지고, 원문은 그 안의 또 다른 링크였다. 같은 행에
// "펼치기"와 "원문 보기"가 겹쳐 무엇을 누르는지 예측이 안 됐다. 아코디언을
// 없애고 **제목 = 기사 링크**로 통일했다.
//
// 섹션 제목도 고쳤다. "그날 지면 더 보기"는 이름 자리에 동작을 써서 눌러보게
// 만들었다(사용자 리포트). 지금은 분야 이름만 쓴다.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BigKindsArticle, InvestmentScenario } from '../lib/timelineApi';
import { kdate, isReadableOriginal, resolveArticleLink } from '../lib/timelineApi';
import { buildDayLayout } from '../lib/rankArticles';
import {
  SURFACE, TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT,
  BORDER_HAIRLINE, BORDER_STRONG, FONT, LEADING, SPACE, RADIUS, TOUCH_MIN,
  CONTAINER_MAX, PROSE_MAX, SR_ONLY, yearsAgoLabel,
} from '../lib/tone';
import { InvestmentScenarioCards } from './InvestmentScenarioCards';
import { ShareBar } from './ShareBar';
import { SajuFunnelCard } from './SajuFunnelCard';

import { SITE_URL } from '@/shared/constants/site';

/** 분야마다 처음 펼쳐 둘 기사 수 — 나머지는 "더 보기"로 접힌다. */
const PREVIEW_PER_SECTION = 3;

/**
 * 기사 한 행 — 제목 + 본문 미리보기 + 바이라인. 모든 행이 같은 모양이다.
 *
 * 처음엔 분야의 첫 기사에만 미리보기를 붙였다. 그게 틀렸다(사용자 리포트:
 * "메인만 서브 글이 있어서 더 헷갈려").
 *
 *   · 왜 저것만 글이 있는지 설명이 없다 → 고장처럼 보인다
 *   · 동시에 "이게 더 중요하다"는 주장은 여전히 하고 있었다 —
 *     없애려던 것을 약하게 유지한 셈이라 일관성도 중립성도 잃었다
 *
 * 그리고 **20년 전 제목은 그 자체로 해독이 안 된다.** "5.37%올라 상승률 올
 * 최고"는 무엇이 올랐는지 알 수 없고, "악사천리(惡事千里)" "저승보다는
 * 이승이"도 그렇다. 의미는 미리보기에 있다 — 제목만 나열하면 이 화면이
 * 답해야 할 "그날은 어떤 날이었나"에 답하지 못한다.
 *
 * 그래서 전부 붙인다. 벽이 되는 것은 분야 섹션 헤딩이 몇 행마다 끊어준다.
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
              {/* 외부 링크 표시. 목적지 설명은 화면 위에 한 번만 두고, 행에는
                  글리프만 붙인다 — "빅카인즈에서 보기"를 23번 반복하면 그게
                  노이즈다. */}
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
        {/* 바이라인은 행에 넣지 않는다. 두세 단어에 한 줄을 쓰는데 그만큼
            미리보기와 경쟁하고, 목록에서 기자명을 보여주는 뉴스 사이트도 없다
            (기사 페이지의 정보다). 출처 신뢰는 지면 머리의 "빅카인즈 보관본"
            이 담당한다. 375px 에서 행 평균 155px → 125px 로 줄었다. */}
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
  // 분야별로 처음 몇 건만 펼쳐 둔다(2026-08-24, "기사들이 너무 길어서 몇 개만
  // 보여주고 접어놓아야 될 것 같다"). 실측: 이 화면은 분야 7개에 23행이고
  // 행마다 제목 2줄 + 미리보기 2줄이라 스크롤이 아주 길었다. 분야 자체를
  // 접지는 않는다 — 이 페이지가 답해야 할 질문이 "그날은 어떤 날이었나"라서
  // 분야 목록(경제는 이랬고 정치는 이랬다)은 한눈에 남아 있어야 한다.
  // 대신 각 분야의 뒷부분만 접고, 접힘 UI는 아래 부고·인사·공시와 같은
  // 관례(.tl-btn + ▾)를 그대로 쓴다.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const yearsAgo = yearsAgoLabel(date);
  const total = articles.length;

  // 빅카인즈는 오래된 기사에 폐기된 sednews.com 주소를 준다 — 지금은 기사가
  // 아니라 서울경제 홈으로 리다이렉트된다(isReadableOriginal 주석의 실측 참조).
  // 그런 날은 링크가 빅카인즈 상세로 향하므로, 목적지가 서울경제가 아니라는
  // 것을 미리 밝힌다. 눌러서 알게 되면 속은 기분이 든다.
  const noOriginals = useMemo(
    () => total > 0 && !articles.some((a) => isReadableOriginal(a.original_link)),
    [articles, total],
  );

  // 공유 카드는 코스피를 최우선으로(가장 널리 이해되는 비교 기준), 없으면
  // 있는 첫 시나리오, 그것도 없으면(예: 1994년 이전) 헤드라인만으로 구성.
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
          {/* ── 지면 머리 ── 굵은 밑줄은 신문 제호의 구조를 남긴 것. 세리프와
              갈색은 걷었지만 이 선은 페이지에 정체성을 준다. */}
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
                그날 지면에서 {total}건을 찾았어요
              </p>
            )}
          </header>

          {total === 0 ? (
            /* ── 빈 상태 ── 왜 비었는지 + 무엇을 하면 되는지. */
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
              {/* ── 분야별 지면 ── 신문이 섹션으로 조직돼 있으니 그 모델을
                  그대로 쓴다. 순서는 고정(BEAT_ORDER)이라 날마다 같은 자리에
                  같은 분야가 온다. 분야마다 첫 기사에만 미리보기를 붙여
                  "그날 경제는 이랬고 정치는 이랬다"를 훑을 수 있게 한다. */}
              {/* 조작 안내와 목적지 안내를 한 덩어리로 둔다. 행마다 "빅카인즈
                  에서 보기"를 반복하는 대신 여기서 한 번 말하고, 행에는 ↗ 만
                  붙인다. 링크가 어디로 가는지 미리 알려야 눌러서 알게 되는
                  일이 없다. */}
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
                      {/* 건수는 제목이 아니라 보조 정보 — 무게를 낮춘다.
                          접힌 동안에도 전체 건수를 그대로 보여준다: 지금 몇
                          개가 안 보이는지 알아야 아래 "더 보기"가 예측된다. */}
                      <span style={{ fontSize: FONT.caption, fontWeight: 600, color: TEXT_MUTED }}>
                        {section.items.length}건
                      </span>
                    </h2>
                    <ul id={listId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {shown.map((a, i) => (
                        <ArticleRow key={a.news_id || `${section.label}-${i}`} article={a} />
                      ))}
                    </ul>
                    {/* 테두리 알약(.tl-btn) 대신 텍스트 + 화살표만
                        (2026-08-24 요청). 분야마다 하나씩 붙는 보조 동작이라
                        알약이 4~5개 쌓이면 목록보다 버튼이 더 눈에 띈다.
                        시각적 테두리는 없애되 터치 타겟(44px)은 패딩으로
                        확보하고, 포커스 링(.tl-focus)은 그대로 둔다. */}
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

              {/* ── 부고·인사·공시 ── 무엇인지 라벨에 그대로 쓴다.
                  버리지 않는다 — 부고를 찾아오는 사람도 있다. */}
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

              <SajuFunnelCard />

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
