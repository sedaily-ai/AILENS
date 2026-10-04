'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Image from 'next/image';
import { displayHeadline, seoHeadline } from '@/shared/lib/content/displayHeadline';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import {
  LENS_ACCENT,
  lensFormatAt,
  lensPanelId,
  lensPerspectiveAt,
  parseLensView,
  pickLensPhoto,
  READING_ACCENT,
} from '@/shared/constants/lensPerspectives';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/article/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/article/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/article/ArticlePrintButton';
import { AiDisclaimer } from '@/shared/ui/notice/AiDisclaimer';
import { coreSummaryBullets, FormatPicker, LensFormatPanel } from './components';
import { SITE_URL } from '@/shared/constants/site';
import { lensCategorySlug, lensPath } from '@/shared/lib/content/lensUrl';
import { ArticleChapterNav } from './components/article/ArticleChapterNav';
import { IconStopwatch } from './components/icons/LensIcons';
import { ArticleReveal } from './components/article/ArticleReveal';
import { letterChapters } from './components/format/lensChapters';
import { readMinutes } from './components/format/lensSamples';
import { renderInline } from './components/format/renderInline';
import { ArticleStickyBar } from './components/article/ArticleStickyBar';
import { ArticleToTop } from './components/article/ArticleToTop';
import { ArticleToolRail } from './components/article/ArticleToolRail';
import { ArticleNeighborLinks, ArticleNeighborNav, type ArticleNeighbor } from './components/article/ArticleNeighborNav';
import {
  ArticleFooterStyles,
  ArticleTags,
  MoreInCategory,
  MostRead,
  RelatedArticles,
} from './components/article/ArticleFooterSections';

// "오늘의 이슈, 4가지 시선" 상세.
// 박스 대신 타이포 위계(헤드라인 40 > 질문 32 > 역할명 24 > 리드 18 > 본문 16 > 메타 13)와 헤어라인으로 구조를 만든다.
// 색은 서수·액센트 바·불릿 같은 작은 표식에만 쓰고, 구획은 그림자 카드 대신 헤어라인으로 나눈다.
//
// SEO: 비활성 시선도 DOM에는 항상 렌더하고 hidden으로만 감춘다.
// 조건부 렌더로 빼면 page.tsx의 NewsArticle articleBody / mainEntity(Question+acceptedAnswer 4쌍)와 실제 본문이 어긋난다.

// 대표 사진 그림자 — 가까운(윤곽)·중간·멀리 퍼지는 그림자 3겹으로 사진이 종이 위에 놓인 듯 보이게 한다. 반경은 크고 색은 옅게 쓴다.
const PHOTO_SHADOW =
  '0 1px 2px rgba(17,24,39,0.06), 0 6px 16px -4px rgba(17,24,39,0.12), 0 22px 44px -14px rgba(17,24,39,0.18)';

export function LensViewClient({
  slug,
  initialLens = undefined,
  otherLens = [],
  relatedLens = [],
  neighbors,
  initialHotLetters,
}: {
  slug: string;
  initialLens?: CmsLens | null;
  otherLens?: CmsLens[];
  relatedLens?: CmsLens[];
  neighbors?: { prev: ArticleNeighbor | null; next: ArticleNeighbor | null };
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  // 실제 오디오·영상 길이(초). loadedmetadata에서만 채워 임의의 길이를 표시하지 않는다(lensSamples.ts의 clock() 참조).
  const [mediaDur, setMediaDur] = useState<Record<number, number>>({});
  // 직전 이동 방향(-1 왼쪽 / 0 없음 / +1 오른쪽). 인디케이터와 본문 진입 방향을 맞추는 데만 쓴다.
  const [dir, setDir] = useState(0);
  // 형식 설명(.fmt-toast) 표시 여부. 탭을 고르면 표시되고 다른 탭을 고르기 전까지 유지되어 레이아웃이 저절로 움직이지 않는다.
  const [showDesc, setShowDesc] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const noteDur = useCallback((i: number, raw: number) => {
    if (!Number.isFinite(raw) || raw <= 0) return;
    const sec = Math.round(raw);
    setMediaDur((cur) => (cur[i] === sec ? cur : { ...cur, [i]: sec }));
  }, []);

  useEffect(() => {
    if (!slug || initialLens) return;
    let cancelled = false;
    fetchLensBySlug(slug).then((l) => {
      if (!cancelled) setLens(l);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialLens]);

  const count = lens?.lenses?.length ?? 0;

  // 홈에서 고른 시선(?v=N)을 연다. 제목·사진·리드가 맥락을 주므로 스크롤은 건드리지 않는다.
  useEffect(() => {
    if (count === 0) return;
    const i = parseLensView(window.location.search);
    if (i === null || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
    // 딥링크 진입에서는 설명(showDesc)을 띄우지 않는다. 탭을 직접 누르면(select()) 표시된다.
  }, [count]);

  // KPI 계측(포맷 전환율)과 방향성 전환·형식 설명 토스트. setActive를 함수형 업데이트로 호출해 deps 없이 직전 active를 읽는다.
  // select는 useCallback([])로 유지해야 tabRefs 등의 참조가 깨지지 않는다.
  const select = useCallback((i: number) => {
    setActive((prev) => {
      if (prev !== i && lens) {
        trackEvent('format_switch', {
          article_id: lens.id,
          from_format: lensFormatAt(prev),
          to_format: lensFormatAt(i),
          ...(lens.category ? { category: lens.category } : {}),
        });
      }
      setDir(i > prev ? 1 : i < prev ? -1 : 0);
      return i;
    });
    setShowDesc(true);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(i + 1));
    window.history.replaceState(null, '', url);
    // ⚠️ rAF 안에서 스크롤한다. setActive() 직후 같은 tick에 scrollIntoView를 부르면 대상 패널이 아직 hidden이라 스크롤되지 않는다.
    // 목적지는 패널(lens-N)이 아니라 형식 설명(#lens-desc)이다. 패널 상단까지만 당기면 탭 아래 설명 문구가 화면 밖에 남을 수 있다.
    // block:'nearest'는 이미 보이면 움직이지 않고 밖에 있을 때만 최소한으로 당긴다.
    requestAnimationFrame(() => {
      const el = document.getElementById('lens-desc') ?? document.getElementById(lensPanelId(i));
      if (!el) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    });
  }, [lens]);

  // 좌우 스와이프는 이전/다음 기사 이동(ArticleNeighborNav)이 쓴다. 형식 전환은 상단 탭과 패널 하단 버튼(FormatStepNav)이 맡는다.

  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent, i: number) => {
      if (count === 0) return;
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (i + 1) % count;
      else if (e.key === 'ArrowLeft') next = (i - 1 + count) % count;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      tabRefs.current[next]?.focus();
    },
    [count, select],
  );

  if (!slug || lens === null) {
    return (
      <ArticlePageShell>
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </ArticlePageShell>
    );
  }

  if (!lens) {
    return <ArticlePageShell>{null}</ArticlePageShell>;
  }

  const photo = pickLensPhoto(lens);
  const lenses = lens.lenses ?? [];
  // 레일 "듣기" — 팟캐스트 시선 탭으로 이동(없으면 항목 숨김).
  // 원문 링크 — 사진이 있으면 캡션 줄 오른쪽, 없으면 단독 줄.
  const sourceLink = lens.source_url ? (
    <a
      href={lens.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="lnk"
      style={{ minHeight: 28, fontSize: 13 }}
      onClick={() => trackEvent('source_link_click', { article_id: lens.id, format: lensFormatAt(active), ...(lens.category ? { category: lens.category } : {}) })}
    >
      기사 원문 보기
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        (새 창으로 열립니다)
      </span>
    </a>
  ) : null;
  // 레터 본문의 소제목 → 오른쪽 구간 목차(레터 탭일 때만 보임).
  // 레터 예상 읽기 시간(분) — 형식 탭의 "약 N분"과 같은 계산(readMinutes, 분당 500자).
  const letterParas = lenses.find((l) => l.label === '레터')?.paragraphs;
  const readMin = letterParas && letterParas.length > 0 ? readMinutes(letterParas.join('').length) : null;
  const chapters = letterChapters(lenses.find((l) => l.label === '레터')?.paragraphs);
  const podcastIdx = lenses.findIndex((l) => l.label === '팟캐스트');
  // 지금 고른 형식 — 형식 설명 토스트(#lens-desc)가 쓴다.
  const activeP = lensPerspectiveAt(active);
  const ActiveIcon = activeP.icon;

  // Header·검색 오버레이·그리드·사이드바 배선은 ArticlePageShell에서 공통 처리한다.
  return (
    <ArticlePageShell>
      {/* <style> 내부 주석은 CSS 문자열이라 SSR 응답에 그대로 실리므로 한 줄 힌트만 둔다. 설계 근거는 이 파일과 components/의 JSX 주석에 있다. */}
      <style>{`
        /* 2026-10-01 상세 재설계(영문 사이트 구조) — 사이드바를 걷고 단일 읽기 컬럼(720px)으로.
           ≥1100px에서는 도구(글자 크기·공유·인쇄)가 컬럼 왼쪽 고정 레일로 나가고, 그보다
           좁으면 기존처럼 본문 위 가로 줄(.tools-inline)로 남는다. */
        .lw { max-width: 720px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        .art-main { position: relative; }
        .rail-host { display: none; }
        @media (min-width: 1100px) {
          .tools-inline { display: none !important; }
          .rail-host { display: block; position: absolute; top: 0; bottom: 0; left: calc(50% - 360px - 120px); width: 76px; }
          .rail { position: sticky; top: 110px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
        }
        .rail-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; padding: 6px 0;
          border: none; background: none; cursor: pointer; color: #374151; }
        .rail-btn:hover:not(:disabled) { color: #111827; }
        .rail-btn:disabled { opacity: .35; cursor: default; }
        .rail-btn:focus-visible { outline: 2px solid #111827; outline-offset: 2px; border-radius: 6px; }
        .rail-ico { display: flex; align-items: center; justify-content: center; height: 24px; }
        .rail-ico .sk { transition: transform .25s cubic-bezier(.2,0,0,1); }
        .rail-btn:hover:not(:disabled) .sk { transform: rotate(-6deg) translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .rail-ico .sk { transition: none; } .rail-btn:hover:not(:disabled) .sk { transform: none; } }
        .rail-cap { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .rail-pop { position: absolute; left: calc(100% + 8px); top: 0; z-index: 30; padding: 12px 14px;
          background: #fff; border-radius: 14px; box-shadow: 0 12px 32px rgba(15,23,42,0.14), 0 1px 3px rgba(15,23,42,0.08); }
        .badge { display: inline-block; margin-left: 8px; padding: 2px 9px; border-radius: 999px;
          font-size: 11.5px; font-weight: 700; color: ${LENS_ACCENT}; background: ${LENS_ACCENT}14; vertical-align: 1px; }
        /* "30초 핵심" 요약 카드(2026-10-01 재디자인) — 굵은 윗선·베이지 박스·■ 마커·"AI 요약" 문구를 걷어내고
           Toss식 부드러운 라운드 카드로. 테두리 없이 면(연한 회색)과 여백으로만 구분하고, 번호는 작은 원형 배지.
           AI 고지는 바이라인·하단 AiDisclaimer가 이미 맡으므로 요약 안엔 "AI 요약" 표기를 두지 않는다. */
        .sum { margin-top: 12px; padding: clamp(24px, 3.4vw, 34px) clamp(22px, 3.6vw, 36px) clamp(26px, 3.6vw, 36px);
          background: #f6f7f9; border-radius: 26px 22px 28px 20px / 22px 27px 20px 26px; }
        .sum-head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; }
        /* 제목 아래 한 줄 — 본문과 같은 "~요" 말투로 친근하게, 회색 작은 글씨라 과하지 않게(2026-10-01). */
        .sum-sub { margin: 0 0 22px 31px; font-size: 14px; line-height: 1.5; color: #6b7280; letter-spacing: -0.01em; }
        .sum-ico { flex-shrink: 0; color: var(--sum-accent); }
        .sum-title { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -0.015em; color: #111827; }
        .sum-list { display: flex; flex-direction: column; gap: 18px; list-style: none; padding: 0; margin: 0; }
        .sum-item { display: flex; align-items: flex-start; gap: 14px; word-break: keep-all; }
        .sum-n { flex-shrink: 0; display: grid; place-items: center; width: 26px; height: 26px; margin-top: 1px; border-radius: 52% 48% 55% 45% / 48% 54% 46% 52%;
          background: #fff; color: color-mix(in srgb, var(--sum-accent) 62%, #1f2a44); font-size: 12px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
          box-shadow: 0 1px 3px rgba(17,24,39,0.10); }
        .sum-t { font-size: calc(17px * var(--lens-font-scale, 1)); line-height: 1.7; letter-spacing: -0.01em; color: #1f2937; }
        .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; color: #6b7280; margin: 0 0 12px; }
        .eyebrow a { color: inherit; text-decoration: none; }
        .eyebrow a:hover { color: #111827; text-decoration: underline; text-underline-offset: 3px; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1px solid #d1d5db;
          border-radius: 999px; font-size: 12.5px; font-weight: 600; color: #374151; text-decoration: none; background: #fff; }
        .pill:hover { border-color: #9ca3af; color: #111827; }
        .lm { max-width: 100%; }
        /* 스케치 톤(2026-10-01) — 직선 대신 손으로 그은 획, 반듯한 모서리 대신 살짝 불규칙한 모서리, 글자는 단정하게 두고 선과 모서리만 손맛(손글씨 폰트는 유아틱해서 제외). */
        .rule { height: 8px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.26' stroke-width='1.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* ── 이 페이지의 공통 문법 3개 ───────────────────────────────────
           1. .ovl  구역 이름표. 크기로 소리치지 않고 자간·굵기로만 구분한다.
           2. .rule 구역 경계. 이게 유일한 구분 장치다(카드·컬러 룰 없음).
           3. .lnk  보조 링크. 위치·크기·밑줄이 전부 같아서 서로 경쟁하지 않는다. */
        .ovl { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: #111827; }
        .lnk { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          border: none; background: none; cursor: pointer;
          color: #4b5563; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.28); }
        .lnk:hover { color: #111827; text-decoration-color: currentColor; }
        .lnk:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* padding-bottom 2px = thumb 아래 컬러 룰 두께. 이게 없으면 룰이 바
           밖으로 삐져나와 아래 본문 위에 얹힌다.
           2026-08-24 — 룰을 3 → 2px로 얇혔다(사용자 요청: "스트록이 좀 더
           얇아져야"). 대비는 색 기준이라 두께와 무관(앰버 3.19:1 유지).
           바 높이 = 8(위 패딩) + 60(탭: 8+20+4+20+8) + 2(룰) + 1(경계선) = 71px. */
        /* 형식 선택기(2026-10-01 개편) — 밑줄 탭 → 둥근 회색 트랙 위의 흰색 알약 세그먼트(Toss식).
           테두리 없이 면 + 부드러운 그림자로만 선택을 보여 준다. 선택된 알약이 칸 사이를 미끄러진다.
           바 높이 = 위 패딩 10 + 트랙(4 + 56 + 4) + 아래 패딩 10 = 84px. */
        /* 형식 탭은 더 이상 스크롤을 따라오지 않는다(2026-10-01, 읽는 데 방해) — 제자리에 있는 일반 블록. */
        .fmt-bar { position: static; background: #fff; padding: 10px 0; }
        .fmt-row { position: relative; display: grid; gap: 0; padding: 4px; background: #f2f3f5; border-radius: 16px;
          grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
        .fmt-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; pointer-events: none; z-index: 0;
          width: calc((100% - 8px) / var(--n)); transform: translateX(calc(var(--ai) * 100%));
          background: #fff; border-radius: 12px;
          box-shadow: 0 1px 2px rgba(17,24,39,0.08), 0 4px 12px -2px rgba(17,24,39,0.10);
          transition: transform .3s cubic-bezier(.22,.85,.2,1); }
        .fmt { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          min-height: 56px; padding: 8px 4px; border: none; background: none; border-radius: 12px; cursor: pointer; }
        .fmt-name { font-size: 14px; font-weight: 600; color: #6b7280; letter-spacing: -0.01em; white-space: nowrap; transition: color .2s ease; }
        .fmt-amt { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: #9ca3af; font-variant-numeric: tabular-nums;
          white-space: nowrap; transition: color .2s ease; }
        .fmt-art { display: inline-flex; flex-shrink: 0; color: #9ca3af; transition: color .2s ease; }
        .fmt[aria-selected='true'] .fmt-name { color: #111827; font-weight: 800; }
        .fmt[aria-selected='true'] .fmt-amt { color: #6b7280; }
        .fmt[aria-selected='true'] .fmt-art { color: var(--c); }
        .fmt[aria-selected='false']:hover .fmt-name { color: #111827; }
        .fmt[aria-selected='false']:hover .fmt-art, .fmt[aria-selected='false']:hover .fmt-amt { color: #6b7280; }
        .fmt:focus-visible { outline: 2px solid #111827; outline-offset: -2px; }
        @media (max-width: 359px) {
          .fmt { padding: 8px 2px; }
          .fmt-amt { font-size: 12px; gap: 2px; }
        }
        .fmt-sub { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280; letter-spacing: -0.01em; }

        /* 형식 설명 — 색 면 박스 대신 조용한 한 줄(2026-10-01). 콘텐츠(웹툰 컷·본문)가 먼저 보이게 한다. */
        .fmt-toast { display: flex; align-items: flex-start; gap: 8px;
          margin-top: 10px; padding: 2px 2px; background: none;
          font-size: 14px; line-height: 1.6; color: #6b7280; word-break: keep-all; }
        @media (prefers-reduced-motion: no-preference) {
          .fmt-toast { animation: toast-in .22s ease-out; }
          @keyframes toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        }

        .fmt-note { margin-bottom: clamp(16px, 2.4vw, 24px); font-size: 16px; line-height: 1.6;
          color: #6b7280; word-break: keep-all; }

        .fmt-lede { font-family: "Noto Serif KR", serif;
          font-size: clamp(20px, 2.6vw, 24px); font-weight: 700; color: #111827;
          line-height: 1.5; letter-spacing: -0.02em; word-break: keep-all;
          max-width: 720px; margin-bottom: 24px; }

        /* ── 읽기 지면 ──────────────────────────────────────────────────
           2026-08-24 — 620px → 720px(사용자 요청). 카테고리 탭·상단 요약이
           전체 폭(~824px)이라 620px 본문이 좁아 보였는데, 720px(≈한글 44자)로
           올려 폭 차이를 크게 줄이면서도 긴 산문 가독성(스티어링 25~40자
           권장에 근접)을 지킨다. 왼쪽 기준선은 그대로라 위 요소들과 시작선이
           일치하고, 넓어진 줄은 행간 1.85로 받친다. */
        /* 레터 본문(2026-10-01 개편) — 드롭캡·반복 제목·작은 보라색 소제목을 걷고, 읽기 편한 큰 글씨와 넉넉한 여백으로.
           본문 17px / 줄간격 1.95 / 단락 간격 1.5em, 도입 문단은 한 단계 크게. 소제목은 번호 + 세리프 제목 + 연한 질문
           (잡지식 2단)으로 구획 전환이 또렷하게. 테두리 없이 여백과 타이포로만 구분한다. */
        .lread { max-width: 720px; }
        .lread > p, .lread > ul, .lread > ol, .lread > blockquote { font-size: calc(17px * var(--lens-font-scale, 1));
          line-height: 1.8; letter-spacing: -0.005em; color: #191919; word-break: keep-all; overflow-wrap: anywhere; text-align: left; }
        .lread > p { text-wrap: pretty; }
        .lread > * + * { margin-top: 1.4em; }
        .lread > p.lread-lead { font-size: calc(19.5px * var(--lens-font-scale, 1)); line-height: 1.75; font-weight: 500; color: #111827; }
        .lread strong, .sum-t strong { font-weight: 600; color: #111; }
        .lread > ul { list-style: disc outside; padding-left: 1.35em; }
        .lread > ol { list-style: decimal outside; padding-left: 1.5em; }
        .lread > ul li + li, .lread > ol li + li { margin-top: 0.55em; }
        .lread li::marker { color: var(--lc, #6b7280); font-weight: 700; }
        /* 인용 — 형식 색 6% 면 위의 둥근 카드 + 작은 여는 따옴표(테두리 없음). */
        .lread > blockquote { font-family: "Noto Serif KR", serif; font-size: calc(19px * var(--lens-font-scale, 1)); line-height: 1.7;
          font-weight: 600; color: #111827; margin-top: 1.8em; margin-bottom: 0.4em; padding: 18px 22px 20px; border-radius: 20px 16px 22px 15px / 16px 21px 15px 20px;
          background: color-mix(in srgb, var(--lc, #111827) 11%, #fff); }
        .lread > blockquote::before { content: '\\201C'; display: block; font-size: 38px; line-height: 0.7; color: var(--lc, #111827); margin-bottom: 8px; }
        .lread-hr { width: 84px; height: 8px; margin: 2.2em auto 0.6em; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.26' stroke-width='1.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; font-size: 0; }
        /* 소제목 — 번호 + 세리프 제목 + 연한 질문(2단). 구획 사이는 여백으로만. */
        .lread > .lread-sub { scroll-margin-top: 84px; margin-top: 52px; margin-bottom: 18px; }
        .lread > .lread-sub + * { margin-top: 0; }
        /* 챕터 번호 알약 "02 / 06"(2026-10-01, 에듀테크식 단계감) — 형식 색 8% 면 + 형식 색 글자. 테두리 없음. */
        .lread-sub .ch-no { display: inline-flex; align-items: baseline; gap: 5px; margin-bottom: 12px; padding: 3px 12px 4px; border-radius: 16px 11px 15px 10px / 11px 16px 10px 15px;
          font-size: 12px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.2; color: color-mix(in srgb, var(--lc, #111827) 62%, #1f2a44); font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--lc, #111827) 15%, #fff); }
        .lread-sub .ch-no i { font-style: normal; font-weight: 600; opacity: 0.55; }
        .lread-sub .ch-t, .lread-sub .ch-q { text-wrap: balance; }
        .lread-sub .ch-t { display: block; font-family: "Noto Serif KR", serif; font-size: calc(25px * var(--lens-font-scale, 1));
          font-weight: 700; line-height: 1.35; letter-spacing: -0.02em; color: #111827; word-break: keep-all; }
        /* 질문 — "이 구간이 답할 질문"을 연한 면 위에 두어 독자가 읽기 전에 목적을 잡게 한다. */
        .lread-sub .ch-q { display: block; width: fit-content; max-width: 100%; margin-top: 12px; padding: 8px 15px; border-radius: 15px 12px 16px 11px / 12px 16px 11px 15px;
          background: #f4f5f7; font-size: calc(15.5px * var(--lens-font-scale, 1)); line-height: 1.5; font-weight: 500; color: #4b5563; word-break: keep-all; }
        /* 편지 마무리 — 따뜻한 한 줄 + 발신인. 위쪽 룰 없이 여백만. */
        .lread-sign { margin-top: 48px; }
        .lread-thanks { margin: 0 0 14px; font-size: calc(17px * var(--lens-font-scale, 1)); line-height: 1.7; color: #374151; font-weight: 500; }
        .lread-from { display: flex; align-items: center; gap: 10px; margin: 0; }
        .lread-sign-mark { flex-shrink: 0; width: 30px; height: 7px; border-radius: 0; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='1' stroke-width='2.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='1' stroke-width='2.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
        /* 글 끝 공유(2026-10-01) — 모바일엔 왼쪽 도구 레일이 없어 글을 다 읽고도 공유할 곳이 없었다. */
        .lread-share { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-top: 28px; }
        .lread-share-label { font-size: 13.5px; color: #6b7280; }
        .lread-sign-name { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; color: #6b7280; }

        .hang { display: flex; flex-direction: column; gap: 20px;
          list-style: none; padding: 0; margin: 0; }
        .hang > li { display: flex; align-items: baseline; gap: 14px; word-break: keep-all;
          font-size: calc(16px * var(--lens-font-scale, 1)); line-height: 1.8; color: #374151; }
        .hang-n { flex-shrink: 0; width: 22px; font-size: 14px; font-weight: 800;
          color: #6b7280; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

        .fmt-arrow { display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid #949494; background: #fff; cursor: pointer; }
        .fmt-arrow:disabled { cursor: default; opacity: .4; }
        .fmt-arrow:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* 고정 제목 바(57px) + 여유. 형식 바는 더 이상 고정되지 않는다. */
        .lens-panel { scroll-margin-top: 84px; }

        @media (prefers-reduced-motion: no-preference) {
          .panel[data-dir='1'] { animation: swap-fwd .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='-1'] { animation: swap-back .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='0'] { animation: swap-in .22s ease-out; }
          @keyframes swap-fwd { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-back { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
        @media (prefers-reduced-motion: reduce) {
          .fmt-name, .fmt-amt, .lnk { transition: none; }
          .fmt-thumb { transition: none; }
        }
      `}</style>

      <main id="main-content" className="art-main">
        <ArticleToTop />
        <ArticleStickyBar
          category={lens.category ?? null}
          categoryHref={lens.category ? `/${lensCategorySlug(lens.category)}` : null}
          title={lens.headline}
          readMin={readMin}
        />
        {neighbors && <ArticleNeighborNav articleId={lens.id} prev={neighbors.prev} next={neighbors.next} />}
        <ArticleReveal />
        {/* 왼쪽 도구 레일(≥1100px) — 듣기·글자 크기·공유·인쇄. */}
        {/* 웹툰 탭에서는 도구 레일을 숨겨 이미지에만 집중하게 한다. */}
        <div className="rail-host" hidden={lensFormatAt(active) === 'webtoon'}>
          <nav className="rail" aria-label="기사 도구">
            <ArticleToolRail
              title={seoHeadline(lens.headline)}
              url={`${SITE_URL}${lensPath(lens)}`}
              cssVar="--lens-font-scale"
              storageKey="lens-font-size"
              onListen={podcastIdx >= 0 ? () => select(podcastIdx) : undefined}
            />
          </nav>
        </div>

        <ArticleChapterNav
          chapters={chapters}
          show={lensFormatAt(active) === 'letter'}
          accent={READING_ACCENT}
        />

        {/* ── 기사 머리 ── 카테고리 아이브로우 → 세리프 헤드라인 → 부제 → 바이라인/발행시각 → 헤어라인 */}
        <div className="lw" style={{ paddingTop: 'clamp(8px, 2vw, 16px)' }}>
          <p className="eyebrow">
            {lens.category && <Link href={`/${lensCategorySlug(lens.category)}`}>{lens.category}</Link>}
            {lens.subcategory && <> · {lens.subcategory}</>}
            <span className="badge">4가지 시선</span>
          </p>
          <h1
            id="art-h1"
            data-speakable="headline"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 700,
              color: '#111827',
              letterSpacing: '-0.025em',
              lineHeight: 1.35,
              marginBottom: 14,
              textWrap: 'balance',
              wordBreak: 'keep-all',
            }}
          >
            {displayHeadline(lens.headline)}
          </h1>
          {lens.context && (
            <p
              data-speakable="summary"
              style={{ fontSize: 'calc(18px * var(--lens-font-scale, 1))', lineHeight: 1.65, color: '#374151', margin: '0 0 18px', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}
            >
              {lens.context}
            </p>
          )}
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, paddingBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              <strong style={{ color: '#111827', fontWeight: 700 }}>AI LENS 편집팀</strong>
              <span aria-hidden> · </span>
              입력 {kstDateTimeLabel(lens.published_at) ?? lens.date.replaceAll('-', '.')}
              {readMin && (
                <>
                  <span aria-hidden> · </span>약 {readMin}분 읽기
                </>
              )}
            </p>
            <a
              href={`https://www.google.com/preferences/source?q=${new URL(SITE_URL).host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pill"
            >
              <GoogleIcon className="w-3.5 h-3.5" />
              구글 검색 선호 출처로 추가
            </a>
          </div>

          <div className="rule" />

          {/* 좁은 화면(<1100px) 도구 줄 — 넓은 화면에서는 왼쪽 레일로 대체. */}
          <div
            className="tools-inline flex items-center justify-between flex-wrap"
            style={{ marginTop: 14, gap: 12, paddingBottom: 14 }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
              <ArticleShareButtons title={seoHeadline(lens.headline)} url={`${SITE_URL}${lensPath(lens)}`} />
            </div>
            <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
              <ArticleFontSizeControl cssVar="--lens-font-scale" storageKey="lens-font-size" />
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
              <ArticlePrintButton />
            </div>
          </div>
        </div>

        {photo && (
          <div className="lw" style={{ paddingTop: 20 }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0, borderRadius: 16, boxShadow: PHOTO_SHADOW }}>
              <Image
                src={photo}
                alt={seoHeadline(lens.headline)}
                fill
                sizes="(min-width: 760px) 720px, 100vw"
                priority
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 8 }}>
              <p style={{ fontSize: 11.5, color: '#9ca3af', margin: 0 }}>
                {lens.source_url ? (
                  <>
                    사진 ·{' '}
                    <a href={lens.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      서울경제
                    </a>
                  </>
                ) : (
                  '사진 · 서울경제'
                )}
              </p>
              {sourceLink}
            </div>
          </div>
        )}

        {/* ── 리드 + 원문 링크 + 30초 핵심 ──
            "30초 핵심" 카드는 count > 0 게이트 밖(리드와 같은 .lw 블록)에 둔다. 원문 링크가 게이트 안에 있으면 lenses가 빈 글에서 원문 링크가 사라진다.
            카드 자체는 coreSummaryBullets()가 lenses를 읽으므로 lenses가 비면 그려지지 않는다. */}
        <div className="lw" style={{ paddingTop: 'clamp(20px, 3.4vw, 28px)' }}>
        <div>
          {!photo && sourceLink && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{sourceLink}</div>}

          {coreSummaryBullets(lens).length > 0 && (
            <div data-speakable="summary" className="sum" style={{ ['--sum-accent' as string]: READING_ACCENT }}>
              <div className="sum-head">
                <IconStopwatch size={22} className="sum-ico" />
                <p className="sum-title">30초 핵심</p>
              </div>
              <p className="sum-sub">바쁘시면 여기까지만 읽어도 돼요</p>
              <ol className="sum-list">
                {coreSummaryBullets(lens).map((t, si) => (
                  <li key={si} className="sum-item">
                    <span className="sum-n" aria-hidden>
                      {si + 1}
                    </span>
                    <span className="sum-t">{renderInline(t, [], { numbers: true })}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 32 }}>
          <div>
            <div className="rule" />

            {/* ── 형식 선택 ── sticky 세그먼트 탭 + 실측 분량(FormatPicker.tsx 참조).
                형식 차이 모달(LensFormatGuide)은 탭과 설명줄이 같은 정보를 주므로 이 페이지에서는 쓰지 않는다(홈 티저 LensPreviewSection에서는 사용). */}
            <div style={{ margin: '36px 0 6px' }}>
              <h2 className="ovl" style={{ margin: 0 }}>
                어떻게 볼까요?
              </h2>
              <p className="fmt-sub">취향대로 골라보세요 — 같은 기사를 네 가지 방식으로 만나요</p>
            </div>

            <FormatPicker lens={lens} lenses={lenses} active={active} mediaDur={mediaDur} select={select} onTabKeyDown={onTabKeyDown} tabRefs={tabRefs} />

            {/* 형식 설명 — 탭을 누르면 나타나 다음 탭을 고르기 전까지 유지한다. 자동 소멸시키면 본문이 당겨져 화면이 흔들린다. */}
            {showDesc && (
              <p key={active} id="lens-desc" role="status" className="fmt-toast" style={{ '--c': activeP.color } as CSSProperties}>
                <ActiveIcon size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2, color: activeP.color }} />
                <span>{activeP.content}</span>
              </p>
            )}

            {/* ── 선택된 시선 ── 박스 없이 위계로만 구성 */}
            {lenses.map((l, i) => (
              <LensFormatPanel
                key={i}
                lens={lens}
                l={l}
                i={i}
                active={active}
                photo={photo}
                dir={dir}
                noteDur={noteDur}
              />
            ))}

            {/* 구획 마감 — 네 시선이 같은 기사에서 나왔음을 출처 한 줄로 닫는다. */}
            <div style={{ marginTop: 32 }}>
              <div className="rule" />
              <p style={{ marginTop: 32, fontSize: 14, color: '#4b5563', lineHeight: 1.65, wordBreak: 'keep-all' }}>
                네 형식 모두 같은 기사를 바탕으로 만들었어요. 위에서 형식을 바꿔도 다루는 사실은 같습니다.
              </p>
            </div>

            {/* AI 생성 콘텐츠 고지 */}
            <AiDisclaimer sourceUrl={lens.source_url} articleId={lens.id} format={lensFormatAt(active)} />
          </div>
          </div>
        )}

        {/* ── 하단 구획 ── 태그 → {카테고리} 더 보기 → 관련 기사 → 많이 읽은 기사. */}
        <div className="lw" style={{ paddingTop: 8, paddingBottom: 100 }}>
          <ArticleFooterStyles />
          {neighbors && <ArticleNeighborLinks articleId={lens.id} prev={neighbors.prev} next={neighbors.next} />}
          <ArticleTags lens={lens} />
          <MoreInCategory lens={lens} items={otherLens} />
          <RelatedArticles items={relatedLens} />
          <MostRead items={initialHotLetters ?? []} />

          <div style={{ marginTop: 56, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 4px', lineHeight: 1.5 }}>
              일상 속의 모든 소식, 신속하고 정확한 전달
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>통찰력 있는 이야기 · 인스타그램 @lens.sedaily</p>
          </div>
        </div>
      </main>
    </ArticlePageShell>
  );
}
