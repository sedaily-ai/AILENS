'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { LENS_ACCENT, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { LensFormatGuide } from './LensFormatGuide';

// 첫 방문자에게 가이드를 자동으로 한 번만 띄운다(2026-08-21, 사용자
// 요청 — "처음 온 사람들이... 왜 그렇게 봐야하고 각 유형은 어떤 내용을
// 담고있는지"). localStorage 플래그 하나로 "이미 봤음"을 기기에 남긴다
// — 서버 저장 없이 충분(재방문마다 다시 뜨면 오히려 방해).
const GUIDE_SEEN_KEY = 'ailens-lens-format-guide-seen';

// "오늘의 이슈, 4가지 시선" 홈 티저 — 지면 특별 코너로 개편(2026-08-21,
// 사용자 요청: "전체 지면 1면, 증권면 1면, 산업면 1면, 시그널 1면 이렇게
// 구성하고, 해당 중요한 기사들을 넣는 탭으로 만들겁니다").
//
// 2단 구조다(세 번째 시도 만에 정리 — 앞선 두 번은 사용자가 스크린샷으로
// 직접 고쳐줬다):
//  1. **탭**(전체/증권/산업/시그널) — 지면을 고른다. 탭마다 최대 4개의
//     기사가 있다("각 유형별로 기사 4개를 뽑아줄거니까").
//  2. **화살표** — 고른 탭 "안의" 기사 4개를 좌우로 넘긴다("이 화살표
//     부분 좌우 누르면 그 유형 안에 있는 기사를 움직인다는거죠"). 탭을
//     바꾸는 게 아니라, 같은 탭 안에서 기사 위치만 바뀐다.
//  각 기사는 예전과 동일한 레이아웃(사진+헤드라인 + 레터/웹툰/팟캐스트/
//  영상 4형식 캐릭터 행)으로 보여준다 — 이 시각 구조 자체는 안 바뀐다.
//
// 지면별 기사는 lens.paper_section 필드로 고른다(2026-08-21, 데이터 모델
// 수정 — 처음엔 lens.category(/markets 등 일반 카테고리 페이지가 쓰는
// 같은 필드, 증시/산업/... 7개 값)를 재사용해서 "전체" 탭은 category
// 무관 최신순으로 구현했었다. 그런데 그러면 산업/증권 카테고리로 새
// 글을 발행할 때마다 그 글이 "전체" 탭에도 자동으로 같이 떠버리는
// 문제가 생겼다(사용자 지적: "산업 1면에만 올라가야 하는데 지면
// 1면에도 들어갔네요... 지면 1면은 지면 1면 기사만 들어가는 겁니다.
// '전체'가 아니예요"). 한 필드를 두 목적(일반 카테고리 페이지 배치 +
// 지면 특별 코너 배치)에 같이 쓴 게 근본 원인이라, 지면 특별 코너
// 전용 필드(paper_section)를 완전히 분리했다 — "전체"/"증권"/"산업"/
// "시그널" 중 하나를 명시적으로 값으로 가진 글만 이 코너에 뜨고,
// category(증시/산업 등)와는 이제 아무 관계가 없다. 즉 어떤 글이
// 지면 특별 코너 어디에도 안 뜨는 게 기본값 — 사람이 명시적으로
// paper_section을 찍어줘야 노출된다. 기사가 없는 지면은 아래 "준비
// 중" 빈 상태로 보여준다.
interface SectionSlot {
  key: string;
  label: string;
  paperSection: string; // lens.paper_section과 매칭 — SECTIONS[0]은 "전체"
}

// 탭 라벨 자체에 "1면"까지 표기(2026-08-21, 사용자 확인 — 처음엔 탭은
// 짧게 두고 "1면"을 배지 쪽으로 뺐었는데, 스크린샷으로 "지면 1면/증권
// 1면/산업 1면/시그널 1면 이라고 표기해주시죠"라고 재요청해 탭 라벨을
// 그대로 "OO 1면"으로 확정. 배지·빈 상태 문구는 label을 그대로 쓰므로
// 별도로 "1면"을 덧붙이지 않는다(중복 방지, 아래 참조).
const SECTIONS: SectionSlot[] = [
  { key: 'all', label: '지면 1면', paperSection: '전체' },
  { key: 'markets', label: '증권 1면', paperSection: '증권' },
  { key: 'industry', label: '산업 1면', paperSection: '산업' },
  { key: 'signal', label: '시그널 1면', paperSection: '시그널' },
];

const ARTICLES_PER_SECTION = 4;

export function LensPreviewSection({ initialItems }: { initialItems?: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [activeTab, setActiveTab] = useState(0);
  const [articleIndex, setArticleIndex] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((data) => {
      // 빈 응답으로 SSR 프리페치 결과를 덮지 않는다.
      if (!cancelled && data.length > 0) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(NewsTimeMachine.tsx:62와 같은 관례). 렌더 중에는 읽을 수 없다 — 서버에는 localStorage가 없어 하이드레이션이 깨진다.
      if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) setShowGuide(true);
    } catch {
      // localStorage 접근 불가(시크릿 모드 등) — 자동으로는 안 띄우고,
      // ⓘ 버튼으로는 여전히 열 수 있다.
    }
  }, []);

  // useCallback으로 고정한다 — LensFormatGuide가 이 함수를 ESC 리스너
  // 의존성으로 쓰기 때문에(2026-08-21 재설계에서 ESC 처리를 모달 안으로
  // 옮겼다), 매 렌더 재생성되면 리스너가 계속 재구독된다.
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, '1');
    } catch {
      // 저장 실패해도 이번 세션 내 UI 상태는 유지.
    }
  }, []);

  if (!items || items.length === 0) return null;

  function selectTab(i: number) {
    setActiveTab(i);
    setArticleIndex(0); // 탭을 바꾸면 그 탭의 첫 기사부터.
  }

  const activeSection = SECTIONS[activeTab];
  const sectionArticles = items
    .filter((l) => l.paper_section === activeSection.paperSection)
    // display_order가 있는 글은 오름차순으로 우선 배치(1번 자리에 실을
    // 글을 명시적으로 고르는 용도) — 없는 글은 items가 이미 정렬해 온
    // publish_date/published_at 내림차순을 그대로 따른다(정렬 안정성
    // 덕분에 순서 유지). published_at을 정렬 키인 척 수동 재기록하던
    // 임시방편(2026-08-21 이전 지면 4건 전부 이렇게 처리)을 대체한다.
    .slice()
    .sort((a, b) => {
      const orderA = a.display_order;
      const orderB = b.display_order;
      if (orderA != null && orderB != null) return orderA - orderB;
      if (orderA != null) return -1;
      if (orderB != null) return 1;
      return 0;
    })
    .slice(0, ARTICLES_PER_SECTION);
  const total = sectionArticles.length;
  const safeArticleIndex = total > 0 ? Math.min(articleIndex, total - 1) : 0;
  const current = total > 0 ? sectionArticles[safeArticleIndex] : null;
  const href = current ? `/lens/${encodeURIComponent(current.id)}` : null;
  const photo = current ? pickLensPhoto(current) : null;
  const rows = current ? (current.lenses ?? []).slice(0, 4) : [];

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        .lz-tab { transition: background .15s ease, color .15s ease; }
        .lz-arrow { transition: background .15s ease, transform .08s ease; }
        .lz-arrow:not(:disabled):hover { background: #dbeafe; }
        .lz-arrow:not(:disabled):active { transform: scale(.9); }
        .lz-dot { transition: background .15s ease, width .15s ease; }

        /* 가이드 ⓘ 트리거 — 제목 옆이라 시각 크기는 22px로 작게 두되,
           ::after로 히트 영역만 44×44로 넓힌다(레이아웃은 그대로).
           버튼을 실제로 44px로 키우면 h2 옆 여백이 벌어져 제목 정렬이
           깨진다. */
        .lz-info { position: relative; }
        .lz-info::after { content: ''; position: absolute; left: 50%; top: 50%;
          width: 44px; height: 44px; transform: translate(-50%, -50%); }
        .lz-info:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 3px; }

        .lz-issue:hover .lz-h { text-decoration: underline; text-underline-offset: 3px; }

        /* 비교 행 — 모바일은 [일러스트][역할명+질문][›] 3열,
           640px 이상에서는 .lz-t 를 display:contents 로 풀어 역할명과 질문이
           각각 독립 열이 된다. 그러면 네 행의 질문이 정확히 같은 x 에서
           시작해 아래로 훑는 것만으로 비교가 된다. */
        .lz-row { display: grid; grid-template-columns: 44px minmax(0,1fr) 14px;
          gap: 12px; align-items: start; min-height: 56px;
          padding: 14px clamp(12px, 2.4vw, 18px); text-decoration: none;
          transition: background .14s ease; }
        .lz-row:hover { background: #fafbfc; }
        .lz-row:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }
        .lz-row + .lz-row { border-top: 1px solid rgba(17,24,39,0.07); }
        .lz-t { min-width: 0; }
        .lz-q { display: block; }
        .lz-qw { display: block; min-width: 0; }
        .lz-name { margin-bottom: 3px; }
        @media (min-width: 640px) { .lz-name { margin-bottom: 0; } }
        .lz-ch { padding-top: 4px; }
        @media (min-width: 640px) {
          .lz-row { grid-template-columns: 44px 116px minmax(0,1fr) 14px; gap: 14px; }
          .lz-t { display: contents; }
          .lz-name { padding-top: 1px; }
        }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p className="text-gray-400" style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          오늘의 지면
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              오늘의 이슈, 4가지 시선
            </h2>
            {/* 가이드 트리거 — 첫 방문자에겐 자동으로 뜨고, 재방문자는
                이 버튼으로 다시 볼 수 있다(LensFormatGuide.tsx 참조). */}
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              aria-label="4가지 형식 안내 보기"
              className="lz-info flex items-center justify-center flex-shrink-0 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid currentColor', color: '#6b7280', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>i</span>
            </button>
          </div>
          <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 600 }}>
            전체 보기 →
          </Link>
        </div>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'keep-all' }}>
          지면을 고르고, 화살표로 그 지면의 기사를 넘겨보세요.
        </p>
      </header>

      <div
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          background: '#fff',
          border: '1px solid rgba(17,24,39,0.09)',
          boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 10px 30px rgba(17,24,39,0.05)',
        }}
      >
        {/* 지면 탭 — 1단계 선택. 화살표(아래)와 역할이 다르다: 탭은 지면을
            바꾸고, 화살표는 고른 지면 "안의" 기사를 넘긴다. */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(17,24,39,0.09)' }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => selectTab(i)}
              className="lz-tab flex-1"
              style={{
                padding: '13px 8px',
                fontSize: 14,
                fontWeight: 800,
                border: 'none',
                borderBottom: i === activeTab ? `2px solid ${LENS_ACCENT}` : '2px solid transparent',
                marginBottom: -1,
                background: 'transparent',
                color: i === activeTab ? LENS_ACCENT : '#9ca3af',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {!current ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
              {activeSection.label}을 준비하고 있어요.
            </p>
          </div>
        ) : (
          <>
            {/* ── 하나의 이슈 ── 네 시선이 공유하는 원본. 사진 + 헤드라인 + 요약. */}
            <Link
              href={href!}
              prefetch
              className="lz-issue flex"
              style={{ gap: 'clamp(12px, 2.4vw, 18px)', padding: 'clamp(14px, 2.4vw, 18px)', textDecoration: 'none', alignItems: 'center' }}
            >
              {photo && (
                <span
                  className="flex-shrink-0"
                  style={{
                    position: 'relative',
                    width: 'clamp(92px, 17vw, 132px)',
                    aspectRatio: '3 / 2',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#f3f4f6',
                    boxShadow: 'inset 0 0 0 1px rgba(17,24,39,0.07)',
                  }}
                >
                  <Image
                    src={photo}
                    alt=""
                    fill
                    sizes="132px"
                    style={{ objectFit: 'cover', objectPosition: 'center' }}
                  />
                </span>
              )}

              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="flex items-center" style={{ gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: LENS_ACCENT, letterSpacing: '0.04em' }}>
                    {activeSection.label}
                  </span>
                  <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
                    {kstDateTimeLabel(current.published_at) ?? current.date.replaceAll('-', '.')}
                  </span>
                </span>
                <span
                  className="lz-h"
                  style={{
                    display: '-webkit-box',
                    fontSize: 'clamp(16px, 2.4vw, 20px)',
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.025em',
                    lineHeight: 1.35,
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'keep-all',
                  }}
                >
                  {current.headline}
                </span>
                {current.context && (
                  <span
                    className="hidden sm:block"
                    style={{
                      marginTop: 5,
                      fontSize: 14,
                      color: '#6b7280',
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {current.context}
                  </span>
                )}
              </span>
            </Link>

            {rows.length > 0 && (
              <>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#9ca3af',
                    letterSpacing: '0.02em',
                    padding: '10px clamp(12px, 2.4vw, 18px)',
                    borderTop: '1px solid rgba(17,24,39,0.09)',
                    background: '#fcfcfd',
                  }}
                >
                  같은 이슈, 네 형식으로 이렇게 담았습니다
                </p>

                <div style={{ borderTop: '1px solid rgba(17,24,39,0.09)' }}>
                  {rows.map((_l, i) => {
                    const p = lensPerspectiveAt(i);
                    return (
                      <Link key={i} href={`${href}?v=${i + 1}`} prefetch className="lz-row">
                        <span
                          className="flex items-center justify-center flex-shrink-0"
                          style={{ width: 44, height: 44, borderRadius: 999, background: p.tint, overflow: 'hidden' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                          <img
                            src={p.illustration}
                            alt=""
                            width={44}
                            height={44}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                          />
                        </span>

                        <span className="lz-t">
                          <span
                            className="lz-name"
                            style={{
                              display: 'block',
                              fontSize: 13,
                              fontWeight: 800,
                              color: p.color,
                              letterSpacing: '-0.01em',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {p.short}
                          </span>
                          {/* 2026-08-23, 사용자 지적 — l.question이 레터·팟캐스트·
                              영상 행에선 웹툰(core_question 생성)과 달리 헤드라인과
                              동일한 값이라(각 파이프라인이 별도 "훅 질문"을 안 만듦)
                              위에서 이미 보여준 헤드라인을 그대로 3번 반복해 보였다.
                              중복 줄을 없애고 태그라인 한 줄만 남긴다(형식 4개가
                              각각 뭔지는 이 한 줄로도 충분히 설명됨). */}
                          <span
                            className="lz-qw"
                            style={{
                              display: '-webkit-box',
                              fontSize: 15,
                              fontWeight: 600,
                              color: '#374151',
                              lineHeight: 1.5,
                              letterSpacing: '-0.01em',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'keep-all',
                            }}
                          >
                            {p.tagline}
                          </span>
                        </span>

                        <span aria-hidden className="lz-ch" style={{ color: '#c0c5cc', fontSize: 16, lineHeight: 1, textAlign: 'right' }}>
                          ›
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 화살표+점 — 2단계, 고른 탭 "안의" 기사 넘기기(탭 자체를 바꾸지
          않는다). 기사가 1건 이하인 지면은 넘길 게 없어 숨긴다. */}
      {total > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 14 }}>
          <button
            type="button"
            aria-label="이전 기사"
            disabled={safeArticleIndex === 0}
            onClick={() => setArticleIndex((i) => Math.max(0, i - 1))}
            className="lz-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: LENS_ACCENT,
              cursor: safeArticleIndex === 0 ? 'default' : 'pointer',
              opacity: safeArticleIndex === 0 ? 0.3 : 1,
              pointerEvents: safeArticleIndex === 0 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <span style={{ fontSize: 13, fontWeight: 700, color: LENS_ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {activeSection.label} · {safeArticleIndex + 1}/{total}
          </span>

          <div className="flex items-center" style={{ gap: 6 }}>
            {sectionArticles.map((l, i) => (
              <button
                key={l.id}
                type="button"
                aria-label={`${i + 1}번째 기사로 이동`}
                onClick={() => setArticleIndex(i)}
                className="lz-dot"
                style={{
                  width: i === safeArticleIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  border: 'none',
                  background: i === safeArticleIndex ? LENS_ACCENT : '#dbeafe',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="다음 기사"
            disabled={safeArticleIndex === total - 1}
            onClick={() => setArticleIndex((i) => Math.min(total - 1, i + 1))}
            className="lz-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: LENS_ACCENT,
              cursor: safeArticleIndex === total - 1 ? 'default' : 'pointer',
              opacity: safeArticleIndex === total - 1 ? 0.3 : 1,
              pointerEvents: safeArticleIndex === total - 1 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}

      {showGuide && <LensFormatGuide onClose={closeGuide} />}
    </section>
  );
}
