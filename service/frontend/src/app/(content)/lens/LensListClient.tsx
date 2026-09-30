'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { LENS_ACCENT, lensFormatCaption, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { buildPageItems } from '@/shared/lib/pagination';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

// "오늘의 이슈, 4가지 시선" 목록.
//
// 2026-08-14 재설계 — 이전 버전은 [썸네일 + 날짜 + 제목] 행을 나열한 일반적인
// 기사 목록이었다. 그러면 이 채널의 정체("한 이슈를 네 사람의 눈으로 읽는다")가
// 목록 어디에도 드러나지 않아서, 브리핑·딥다이브 목록과 구별되지 않았다.
//
// 바뀐 점:
//  1. 최신 이슈(히어로)에 **네 시선의 실제 질문을 모두 노출**한다. 홈 티저와
//     같은 행 패턴을 써서 두 화면의 학습이 이어진다. 목록에 들어온 사람이
//     클릭 전에 "네 개의 다른 질문"을 눈으로 확인하는 지점이다.
//  2. 목록 행에는 **네 인물 아바타**를 붙여, 각 항목이 네 시선을 품고
//     있다는 걸 반복 학습시킨다(제목만 있으면 알 수 없다).
//  3. 고정(fixed) 백 버튼을 문서 흐름으로 내렸다. 예전엔 콘텐츠 위에 떠서
//     그걸 피하려고 상단 패딩을 88~120px 씩 줬는데, 첫 화면의 절반이 빈
//     여백이 되는 낭비였다.
//  4. 카드 그림자를 걷고 헤어라인으로 구획한다(상세 페이지와 같은 방향) —
//     같은 모양 카드가 반복되면 스티어링 §4 "카드 반복의 함정"에 걸린다.
//  5. 목록을 **날짜로 묶는다**. 실제 발행량은 하루 14~18건이라, 행마다 날짜를
//     찍으면 첫 페이지 8줄이 전부 "2026.08.14"가 되어 아무것도 구별해주지
//     못하는 노이즈가 된다. 날짜는 묶음 머리에 한 번만 두고, 행은 제목에
//     폭을 다 내준다.
const PAGE_SIZE = 8;

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// "2026-08-14" → "8월 14일 (금)". 기준 연도(최신 글의 연도)와 다를 때만
// 연도를 붙인다. new Date() 로 '올해'를 구하면 연말 경계에서 서버·클라이언트
// 렌더가 갈려 하이드레이션이 깨질 수 있어서, 데이터에서만 기준을 뽑는다.
function formatDateHeading(iso: string, baseYear: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso.replaceAll('-', '.');
  const [, y, mo, d] = m;
  const weekday = WEEKDAY[new Date(Number(y), Number(mo) - 1, Number(d)).getDay()] ?? '';
  const yearPrefix = y === baseYear ? '' : `${y}년 `;
  return `${yearPrefix}${Number(mo)}월 ${Number(d)}일${weekday ? ` (${weekday})` : ''}`;
}

function groupByDate(rows: CmsLens[]): { date: string; rows: CmsLens[] }[] {
  const groups: { date: string; rows: CmsLens[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }
  return groups;
}

export function LensListClient({
  initialItems,
  initialPage,
  initialHotLetters,
}: {
  initialItems: CmsLens[];
  initialPage: number;
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [items, setItems] = useState<CmsLens[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [latest, ...rest] = items;
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const currentPage = Math.min(initialPage, totalPages);
  // 쿼리스트링(?page=N) → 경로(/lens/page/N) 전환(2026-08-23, page.tsx 상단
  // 주석 참조) — 1페이지만 /lens 자체를 가리킨다.
  const lensPageHref = (n: number) => (n <= 1 ? '/lens' : `/lens/page/${n}`);
  const pageItems = rest.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const heroPhoto = latest ? pickLensPhoto(latest) : null;
  const heroRows = (latest?.lenses ?? []).slice(0, 4);
  const baseYear = (latest?.date ?? '').slice(0, 4);
  const dateGroups = groupByDate(pageItems);

  // 2026-09-03 — Header+검색 오버레이+그리드+사이드바 배선이
  // LensViewClient·LetterDetailClient·NewsFeedTab과 100% 동일한 코드로
  // 중복돼 있던 걸 ArticlePageShell로 추출(아래 2026-08-23 결정 이후
  // 두 번 더 불일치가 났던 근본 원인).
  return (
    <ArticlePageShell sidebar={<HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />}>
      <style>{`
        .rule { height: 1px; background: rgba(17,24,39,0.1); }

        /* 히어로 안의 시선 행 — 홈 티저와 동일한 패턴.
           모바일 [아바타][역할명+질문] / 640px+ 에서는 display:contents 로
           역할명과 질문이 각각 독립 열이 되어 네 질문이 같은 x 에서 시작한다. */
        .hrow { display: grid; grid-template-columns: 40px minmax(0,1fr) 14px;
          gap: 12px; align-items: start; min-height: 56px;
          padding: 13px clamp(12px, 2.4vw, 18px); text-decoration: none;
          transition: background .14s ease; }
        .hrow:hover { background: #fafbfc; }
        .hrow:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }
        .hrow + .hrow { border-top: 1px solid rgba(17,24,39,0.07); }
        .ht { min-width: 0; }
        .hname { margin-bottom: 3px; }
        @media (min-width: 640px) {
          .hrow { grid-template-columns: 40px 108px minmax(0,1fr) 14px; gap: 14px; }
          .ht { display: contents; }
          .hname { margin-bottom: 0; padding-top: 1px; }
        }

        /* 목록 행 */
        .prow { display: grid; grid-template-columns: 72px minmax(0,1fr) auto;
          gap: 14px; align-items: start; padding: 14px clamp(4px, 1.2vw, 8px);
          text-decoration: none; border-radius: 12px; transition: background .14s ease; }
        .prow:hover { background: #fafbfc; }
        .prow:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }
        .prow + .prow { border-top: 1px solid rgba(17,24,39,0.07); }

        /* 날짜 묶음 머리 — 행에서 반복되던 날짜를 여기로 올렸다. */
        .dgroup + .dgroup { margin-top: 22px; }
        .dhead { display: flex; align-items: center; gap: 10px; padding: 14px 0 6px;
          font-size: 13px; font-weight: 800; color: #6b7280; letter-spacing: 0.01em;
          font-variant-numeric: tabular-nums; }
        .dhead::after { content: ''; flex: 1; height: 1px; background: rgba(17,24,39,0.08); }
        /* 아바타 묶음은 좁은 화면에서 숨긴다 — 제목 공간을 지키는 쪽이 우선이고,
           섹션 머리에서 이미 "네 시선" 개념을 설명했다. */
        .pav { display: none; }
        @media (min-width: 560px) { .pav { display: flex; } }

        .pg { min-width: 44px; height: 44px; border-radius: 10px; font-size: 14px;
          font-weight: 700; cursor: pointer; font-variant-numeric: tabular-nums;
          border: 1px solid rgba(17,24,39,0.12); background: #fff; color: #374151; }
        .pg:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }
      `}</style>

      {/* 레이아웃의 스킵 링크(<a href="#main-content">본문 바로가기</a>) 대상.
          이 id 가 없으면 키보드/스크린리더 사용자의 첫 탭이 아무 데도 가지 않는다.
          본문 maxWidth:880은 유지(ArticlePageShell의 그리드 1열 폭 안에서). */}
      <main id="main-content" style={{ maxWidth: 880, paddingBottom: 100 }}>
        {/* ── 채널 머리 ── 무엇을 보는 곳인지 한 번에 설명한다. */}
        <header style={{ paddingTop: 'clamp(10px, 2vw, 16px)', marginBottom: 'clamp(28px, 4vw, 40px)' }}>
          <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', color: LENS_ACCENT, marginBottom: 10 }}>
            4가지 시선
          </p>
          <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 36px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1.25, marginBottom: 12, wordBreak: 'keep-all' }}>
            하나의 이슈, 네 가지 형식으로
          </h1>
          <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.7, maxWidth: 680, wordBreak: 'keep-all' }}>
            같은 뉴스도 레터로 읽을 때와 웹툰으로 볼 때, 팟캐스트로 들을 때가 다르게 다가옵니다.
            매일 올라오는 이슈를 네 형식으로 나눠 담아드려요.
          </p>
          {items.length > 0 && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
              지금까지 {items.length}개의 이슈
            </p>
          )}
        </header>

        {items.length === 0 && (
          <div style={{ padding: '64px 24px', textAlign: 'center', background: '#f9fafb', borderRadius: 16 }}>
            <p style={{ fontSize: 16, color: '#374151', fontWeight: 600, marginBottom: 6 }}>아직 발행된 이슈가 없어요.</p>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              새로운 이슈가 올라오면 네 가지 형식으로 정리해 드려요.
            </p>
            <Link
              href="/"
              style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 10, fontSize: 14, fontWeight: 700, color: LENS_ACCENT, textDecoration: 'none' }}
            >
              오늘의 뉴스 보기 →
            </Link>
          </div>
        )}

        {/* ── 최신 이슈(히어로) ── 네 질문을 모두 보여주는 유일한 자리.
            클릭 전에 "네 개의 다른 읽기"를 확인하게 만드는 게 이 목록의
            핵심 역할이다.
            라벨은 "오늘의 시선"이 아니라 "가장 새로운 이슈"다 — 같은 날짜 글이
            하루 14~18건 나오므로, 하나만 "오늘"이라 부르면 아래 목록에 있는
            같은 날 글들이 오늘이 아닌 것처럼 읽힌다. */}
        {latest && (
          <section style={{ marginBottom: 'clamp(36px, 5vw, 52px)' }}>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: LENS_ACCENT, padding: '3px 9px', borderRadius: 4 }}>
                가장 새로운 이슈
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'rgba(17,24,39,0.1)' }} />
            </div>

            <div style={{ border: '1px solid rgba(17,24,39,0.1)', borderRadius: 16, overflow: 'hidden' }}>
              <Link
                href={`/${encodeURIComponent(latest.id)}`}
                prefetch
                className="group"
                style={{ display: 'block', textDecoration: 'none' }}
              >
                {heroPhoto && (
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0 }}>
                    <Image
                      src={heroPhoto}
                      alt=""
                      fill
                      sizes="(min-width: 920px) 880px, 100vw"
                      priority
                      className="transition-transform duration-500 group-hover:scale-[1.03]"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                )}
                <div style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
                  <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>
                    {kstDateTimeLabel(latest.published_at) ?? latest.date.replaceAll('-', '.')} · 서울경제
                  </p>
                  <h2
                    className="group-hover:underline"
                    style={{ fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', lineHeight: 1.35, textUnderlineOffset: 3, wordBreak: 'keep-all' }}
                  >
                    {latest.headline}
                  </h2>
                  {latest.context && (
                    <p
                      style={{
                        marginTop: 8,
                        fontSize: 16,
                        color: '#374151',
                        lineHeight: 1.7,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {latest.context}
                    </p>
                  )}
                </div>
              </Link>

              {heroRows.length > 0 && (
                <>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#6b7280',
                      padding: '10px clamp(12px, 2.4vw, 18px)',
                      borderTop: '1px solid rgba(17,24,39,0.1)',
                      background: '#fcfcfd',
                    }}
                  >
                    같은 이슈, 네 형식으로 이렇게 담았습니다
                  </p>
                  <div style={{ borderTop: '1px solid rgba(17,24,39,0.1)' }}>
                    {heroRows.map((l, i) => {
                      const p = lensPerspectiveAt(i);
                      const preview = (l.bullets ?? []).find((b) => b && b.trim()) ?? '';
                      return (
                        <Link
                          key={i}
                          href={`/${encodeURIComponent(latest.id)}?v=${i + 1}`}
                          prefetch
                          className="hrow"
                        >
                          <span
                            className="flex items-center justify-center flex-shrink-0"
                            style={{ width: 40, height: 40, borderRadius: 999, background: p.tint, overflow: 'hidden' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                            <img
                              src={p.illustration}
                              alt=""
                              width={40}
                              height={40}
                              loading="lazy"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                            />
                          </span>
                          <span className="ht">
                            <span
                              className="hname"
                              style={{ display: 'block', fontSize: 13, fontWeight: 800, color: p.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {p.short}
                            </span>
                            <span style={{ display: 'block', minWidth: 0 }}>
                              {/* l.question 대신 lensFormatCaption(i)만 쓴다(2026-08-23,
                                  사용자 지적 — LensPreviewSection.tsx와 같은 버그: 웹툰만
                                  core_question을 따로 생성하고 레터·팟캐스트·영상은
                                  question이 헤드라인과 동일해서 위 히어로 헤드라인을
                                  그대로 반복해 보였다). 2026-09-03 — 홈페이지 쪽에서
                                  같은 버그가 재발한 걸 발견해, 두 파일이 공용 함수
                                  하나만 거치도록 lensFormatCaption으로 통합했다. */}
                              <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: '#374151', lineHeight: 1.5, letterSpacing: '-0.015em', wordBreak: 'keep-all' }}>
                                {lensFormatCaption(i)}
                              </span>
                              {preview && (
                                <span
                                  style={{
                                    display: '-webkit-box',
                                    marginTop: 3,
                                    fontSize: 13,
                                    color: '#6b7280',
                                    lineHeight: 1.55,
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'keep-all',
                                  }}
                                >
                                  {preview}
                                </span>
                              )}
                            </span>
                          </span>
                          <span aria-hidden style={{ color: '#c0c5cc', fontSize: 16, lineHeight: 1, paddingTop: 4 }}>
                            ›
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── 다른 이슈 ── "지난 이슈"가 아니다. 같은 날 발행분이 14~18건이라
            히어로를 뺀 나머지에도 오늘 글이 그대로 남는다. */}
        {rest.length > 0 && (
          <section style={{ scrollMarginTop: 16 }}>
            <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>다른 이슈</h2>
              <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {rest.length}건
              </span>
            </div>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 14 }}>
              날짜별로 모아뒀어요. 어느 이슈든 네 형식이 모두 담겨 있어요.
            </p>
            <div className="rule" />

            <div>
              {dateGroups.map((g) => (
                <section key={g.date} className="dgroup" aria-labelledby={`lens-d-${g.date}`}>
                  {/* 건수는 일부러 빼둔다 — 한 페이지는 8건이라 16건짜리 날짜가
                      두 페이지로 쪼개진다. 여기에 g.rows.length 를 찍으면
                      그날 전체가 8건인 것처럼 읽히는 거짓 숫자가 된다. */}
                  <h3 id={`lens-d-${g.date}`} className="dhead">
                    {formatDateHeading(g.date, baseYear)}
                  </h3>

                  {g.rows.map((l) => {
                    const thumb = pickLensPhoto(l);
                    const n = (l.lenses ?? []).length;
                    return (
                      <Link key={l.id} href={`/${encodeURIComponent(l.id)}`} prefetch className="prow">
                        <span
                          className="flex-shrink-0"
                          style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: '#f3f4f6', boxShadow: 'inset 0 0 0 1px rgba(17,24,39,0.07)' }}
                        >
                          {thumb ? (
                            <Image src={thumb} alt="" width={72} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span className="flex items-center justify-center w-full h-full" style={{ fontSize: 13, color: '#9ca3af', fontWeight: 700 }}>
                              시선
                            </span>
                          )}
                        </span>

                        {/* 날짜는 묶음 머리로 올라갔다 — 제목이 행 폭을 다 쓴다.
                            2026-08-23, 사용자 지적 — "제목만 있음 좀 아쉬우니
                            본문 미리보기 좀". context(기사 부제)를 제목 아래
                            1줄만 덧붙인다 — 히어로 카드가 이미 context를
                            2줄까지 보여주는데, 이 목록 행은 훨씬 좁아서 1줄로
                            줄였다(3줄 제목 + 2줄 본문이면 행이 과하게 길어짐). */}
                        <span style={{ display: 'block', minWidth: 0 }}>
                          <span
                            style={{
                              display: '-webkit-box',
                              fontSize: 16,
                              fontWeight: 700,
                              color: '#111827',
                              lineHeight: 1.45,
                              letterSpacing: '-0.02em',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'keep-all',
                            }}
                          >
                            {l.headline}
                          </span>
                          {l.context && (
                            <span
                              style={{
                                display: '-webkit-box',
                                marginTop: 4,
                                fontSize: 13.5,
                                color: '#6b7280',
                                lineHeight: 1.55,
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'keep-all',
                              }}
                            >
                              {l.context}
                            </span>
                          )}
                        </span>

                        {/* 네 인물 아바타 — 이 항목도 네 시선을 품고 있다는 신호.
                            제목만 있으면 일반 기사 목록과 구별되지 않는다. */}
                        <span className="pav items-center flex-shrink-0" aria-hidden style={{ alignSelf: 'center' }}>
                          {Array.from({ length: Math.min(n, 4) }, (_, i) => {
                            const p = lensPerspectiveAt(i);
                            return (
                              <span
                                key={i}
                                className="flex items-center justify-center"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 999,
                                  background: p.tint,
                                  overflow: 'hidden',
                                  boxShadow: '0 0 0 2px #fff',
                                  marginLeft: i === 0 ? 0 : -8,
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                                <img
                                  src={p.illustration}
                                  alt=""
                                  width={28}
                                  height={28}
                                  loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                                />
                              </span>
                            );
                          })}
                        </span>
                      </Link>
                    );
                  })}
                </section>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 28, flexWrap: 'wrap' }}>
                <Link
                  href={lensPageHref(currentPage - 1)}
                  aria-label="이전 페이지"
                  aria-disabled={currentPage === 1}
                  className="pg"
                  style={{
                    color: currentPage === 1 ? '#9ca3af' : '#374151',
                    pointerEvents: currentPage === 1 ? 'none' : undefined,
                  }}
                >
                  ‹
                </Link>
                {/* 생략 부호(2026-09-02) — webtoon과 같은 이유. 여기는
                    flexWrap이 이미 있어 화면 밖으로 넘치진 않았지만,
                    페이지가 많아지면 버튼 무더기가 되는 건 마찬가지였다. */}
                {buildPageItems(currentPage, totalPages).map((n, i) => {
                  if (n === 'ellipsis') {
                    return (
                      <span key={`ellipsis-${i}`} aria-hidden style={{ minWidth: 24, textAlign: 'center', color: '#9ca3af' }}>
                        …
                      </span>
                    );
                  }
                  const on = n === currentPage;
                  return (
                    <Link
                      key={n}
                      href={lensPageHref(n)}
                      aria-current={on ? 'page' : undefined}
                      aria-label={`${n}페이지`}
                      className="pg"
                      style={{
                        border: on ? `1px solid ${LENS_ACCENT}` : undefined,
                        background: on ? LENS_ACCENT : undefined,
                        color: on ? '#fff' : '#374151',
                        pointerEvents: on ? 'none' : undefined,
                      }}
                    >
                      {n}
                    </Link>
                  );
                })}
                <Link
                  href={lensPageHref(Math.min(currentPage + 1, totalPages))}
                  aria-label="다음 페이지"
                  aria-disabled={currentPage === totalPages}
                  className="pg"
                  style={{
                    color: currentPage === totalPages ? '#9ca3af' : '#374151',
                    pointerEvents: currentPage === totalPages ? 'none' : undefined,
                  }}
                >
                  ›
                </Link>
              </div>
            )}
          </section>
        )}
      </main>
    </ArticlePageShell>
  );
}
