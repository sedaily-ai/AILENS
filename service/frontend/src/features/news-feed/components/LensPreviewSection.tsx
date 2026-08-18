'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { LENS_ACCENT, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';

// "오늘의 이슈, 4가지 시선" 홈 티저.
//
// 2026-08-14 재설계(3차) — 4열 병렬 그리드를 **세로 비교 행**으로 바꿨다.
//
// 왜 바꿨나:
//  · 4열로 나누면 한 칸이 모바일 2×2 에서 약 160px 밖에 안 된다. 일러스트를
//    24px 로 줄여야 들어가서 무엇인지 알아볼 수 없었고, 질문은 3줄로 잘려
//    "이 시선이 무엇을 궁금해하는지"가 한눈에 안 읽혔다.
//  · 이 서비스의 핵심은 "기사 하나 → 네 개의 다른 읽기"다. 그 비교는 항목이
//    **같은 축에 정렬**될 때 가장 잘 보인다. 세로로 쌓으면 역할명은 역할명끼리,
//    질문은 질문끼리 열이 맞아서 아래로 훑는 것만으로 네 질문이 대조된다.
//    (4열 병렬은 시각적으로는 대칭이지만 질문 텍스트가 서로 다른 높이에서
//     시작해 실제 비교는 어렵다.)
//  · 행 구조는 375px 에서도 그대로 성립한다 — 2×2 밀집도 없고 가로 스크롤도
//    없다. 일러스트를 44px 로 키울 여유가 생겨 인물이 실제로 보인다.
//  · 행 전체가 링크라 터치 타겟이 크다(56px+).
//
// 각 행은 /lens/{id}?v=N 으로 연결돼, 고른 시선이 상세에서 열린 채 착지한다
// (해시 대신 쿼리 — 해시는 브라우저 자동 스크롤을 일으켜 히어로를 건너뛴다).
const MAX_PREVIEW = 5;

export function LensPreviewSection({ initialItems }: { initialItems?: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [index, setIndex] = useState(0);

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

  if (!items || items.length === 0) return null;
  const preview = items.slice(0, MAX_PREVIEW);
  const total = preview.length;
  const safeIndex = Math.min(index, total - 1);
  const current = preview[safeIndex];
  const href = `/lens/${encodeURIComponent(current.id)}`;
  const photo = pickLensPhoto(current);
  const rows = (current.lenses ?? []).slice(0, 4);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        .lz-arrow { transition: background .15s ease, transform .08s ease; }
        .lz-arrow:not(:disabled):hover { background: #dbeafe; }
        .lz-arrow:not(:disabled):active { transform: scale(.9); }
        .lz-dot { transition: background .15s ease, width .15s ease; }

        .lz-issue:hover .lz-h { text-decoration: underline; text-underline-offset: 3px; }

        /* 비교 행 — 모바일은 [일러스트][역할명+질문][›] 3열,
           640px 이상에서는 .lz-t 를 display:contents 로 풀어 역할명과 질문이
           각각 독립 열이 된다. 그러면 네 행의 질문이 정확히 같은 x 에서
           시작해 아래로 훑는 것만으로 비교가 된다. */
        /* 미리보기가 붙어 두 줄이 되었으므로 세로 정렬을 center → start 로
           바꾼다. center 로 두면 인물 아이콘이 두 줄의 가운데에 떠서 역할명과
           눈높이가 어긋난다. 아이콘은 첫 줄(역할명)에 맞춘다. */
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
        /* 모바일에서는 역할명이 질문 위에 쌓이므로 사이를 띄운다.
           데스크톱에서는 둘이 나란한 열이 되므로 이 간격을 없앤다. */
        .lz-name { margin-bottom: 3px; }
        @media (min-width: 640px) { .lz-name { margin-bottom: 0; } }
        /* 셰브론은 행 높이 가운데가 아니라 첫 줄 눈높이에 맞춘다. */
        .lz-ch { padding-top: 4px; }
        @media (min-width: 640px) {
          .lz-row { grid-template-columns: 44px 116px minmax(0,1fr) 14px; gap: 14px; }
          .lz-t { display: contents; }
          /* 데스크톱에서 역할명이 질문 첫 줄과 같은 눈높이에 오도록 미세 보정 */
          .lz-name { padding-top: 1px; }
        }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p className="text-gray-400" style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          4가지 시선
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            오늘의 이슈, 4가지 시선
          </h2>
          <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 600 }}>
            전체 보기 →
          </Link>
        </div>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'keep-all' }}>
          기사 하나를 네 사람의 눈으로 — 궁금한 쪽을 골라 읽으세요.
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
        {/* ── 하나의 이슈 ── 네 시선이 공유하는 원본. 사진 + 헤드라인 + 요약. */}
        <Link
          href={href}
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
              {/* next/image (2026-08-13 성능 커밋의 방침). priority 는 일부러
                  빼둔다 — 이전 버전은 16:9 풀블리드 히어로였지만 지금은 최대
                  132px 썸네일이라, 프리로드 예산을 여기 쓰면 손해다. */}
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
              <span style={{ fontSize: 13, fontWeight: 800, color: LENS_ACCENT, letterSpacing: '0.04em' }}>오늘의 이슈</span>
              <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>{current.date.replaceAll('-', '.')}</span>
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
            {/* 컨셉을 한 줄로 명시한다 — 아래 네 행이 같은 기사의 서로 다른
                읽기라는 걸 설명 없이 알기 어렵기 때문. */}
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
              같은 이슈, 네 사람은 이렇게 읽습니다
            </p>

            <div style={{ borderTop: '1px solid rgba(17,24,39,0.09)' }}>
              {rows.map((l, i) => {
                const p = lensPerspectiveAt(i);
                // 미리보기 = 첫 번째 근거 문장. 빈 문자열은 걸러낸다
                // (백엔드가 빈 불릿을 제거하지만 방어적으로 한 번 더).
                const preview = (l.bullets ?? []).find((b) => b && b.trim()) ?? '';
                return (
                  <Link key={i} href={`${href}?v=${i + 1}`} prefetch className="lz-row">
                    {/* 일러스트 44px — 4열 그리드에서는 24px 밖에 못 줘서
                        인물이 안 보였다. 행 구조로 바꾸면서 확보한 공간이다.
                        머리·어깨가 오도록 위쪽을 보여준다. */}
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
                      {/* 질문 + 미리보기를 한 덩어리로 묶는다 — 데스크톱에서
                          .lz-t 가 display:contents 로 풀리므로, 묶지 않으면
                          미리보기가 별도 열이 되어 4열 그리드가 깨진다. */}
                      <span className="lz-qw">
                        <span
                          className="lz-q"
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: '#374151',
                            lineHeight: 1.5,
                            letterSpacing: '-0.015em',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {l.question || p.tagline}
                        </span>
                        {/* 미리보기 — 그 시선의 첫 근거 문장. 질문만 한 줄
                            있으면 비어 보인다는 피드백에 대한 답이고, 실제
                            본문 조각을 보여주니 "속이 있다"는 신호가 된다.
                            색은 #6b7280 (흰 배경 대비 약 4.8:1) — 스티어링이
                            요구하는 4.5:1 을 넘긴다. 더 연한 회색은 규정 위반. */}
                        {preview && (
                          <span
                            style={{
                              display: '-webkit-box',
                              marginTop: 3,
                              fontSize: 13,
                              fontWeight: 400,
                              color: '#6b7280',
                              lineHeight: 1.55,
                              letterSpacing: '-0.005em',
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

                    <span aria-hidden className="lz-ch" style={{ color: '#c0c5cc', fontSize: 16, lineHeight: 1, textAlign: 'right' }}>
                      ›
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 14 }}>
          <button
            type="button"
            aria-label="이전 이슈"
            disabled={safeIndex === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="lz-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: LENS_ACCENT,
              cursor: safeIndex === 0 ? 'default' : 'pointer',
              opacity: safeIndex === 0 ? 0.3 : 1,
              pointerEvents: safeIndex === 0 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <span style={{ fontSize: 13, fontWeight: 700, color: LENS_ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {safeIndex + 1}/{total}
          </span>

          <div className="flex items-center" style={{ gap: 6 }}>
            {preview.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-label={`${i + 1}번째 이슈로 이동`}
                onClick={() => setIndex(i)}
                className="lz-dot"
                style={{
                  width: i === safeIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  border: 'none',
                  background: i === safeIndex ? LENS_ACCENT : '#dbeafe',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="다음 이슈"
            disabled={safeIndex === total - 1}
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            className="lz-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: LENS_ACCENT,
              cursor: safeIndex === total - 1 ? 'default' : 'pointer',
              opacity: safeIndex === total - 1 ? 0.3 : 1,
              pointerEvents: safeIndex === total - 1 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
