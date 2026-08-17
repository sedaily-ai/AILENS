'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/cmsPostsApi';
import {
  LENS_ACCENT,
  lensPanelId,
  lensPerspectiveAt,
  lensTabId,
  parseLensView,
  pickLensPhoto,
} from '@/shared/constants/lensPerspectives';
import { HomeSideBar } from '@/features/news-feed';

// "오늘의 이슈, 4가지 시선" 상세.
//
// 2026-08-14 재설계(3차) — 박스를 걷어내고 타이포·여백·헤어라인으로 구조를
// 만든다. 직전 버전은 한 카드에 테두리 + 그림자 + 컬러 tint 밴드 + 4px 상단선
// 네 가지 틀이 겹쳐 있어서 기사가 아니라 앱 UI 컴포넌트처럼 보였다.
//
// 바뀐 원칙:
//  · 구조는 **위계**로 만든다 — 헤드라인 40 > 질문 32 > 역할명 24 > 리드 18 >
//    본문 16 > 메타 13. 크기 차이가 충분해야 박스 없이도 덩어리가 읽힌다
//    (스티어링 §4: 강조 우선순위 크기 > 굵기 > 대비 > 색상).
//  · 색은 **작은 표식에만** 쓴다(서수·짧은 액센트 바·불릿 점). 넓은 면을
//    채우면 읽는 데 방해가 되고 "강조는 하나만" 원칙도 깨진다.
//  · 구획은 **헤어라인**으로 나눈다. 그림자 카드를 반복하면 스티어링 §4의
//    "카드 반복의 함정"에 걸린다.
//  · 탭은 알약 칩 대신 **밑줄 탭**(신문 섹션 내비게이션 관습). 칩 안에 이미지를
//    넣으면 선택 컨트롤이 과하게 무거워진다 — 캐릭터는 카드 안에서만 쓴다.
//
// ⚠️ SEO — 비활성 시선도 DOM 에는 항상 렌더하고 hidden 으로만 감춘다.
// 조건부 렌더로 3개를 빼면 page.tsx 의 NewsArticle articleBody / mainEntity
// (Question+acceptedAnswer 4쌍)와 실제 본문이 어긋난다.


export function LensViewClient({
  slug,
  initialLens = undefined,
  otherLens = [],
}: {
  slug: string;
  initialLens?: CmsLens | null;
  otherLens?: CmsLens[];
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  // 홈에서 고른 시선(?v=N)을 연다. 스크롤은 건드리지 않는다 — 제목·사진·리드가
  // "무슨 뉴스인지" 주는 맥락이라 항상 최상단부터 보여야 한다.
  useEffect(() => {
    if (count === 0) return;
    const i = parseLensView(window.location.search);
    if (i === null || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
  }, [count]);

  const select = useCallback((i: number) => {
    setActive(i);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(i + 1));
      window.history.replaceState(null, '', url);
    }
  }, []);

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
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </div>
    );
  }

  if (!lens) return <div className="min-h-screen bg-white" />;

  const photo = pickLensPhoto(lens);
  const lenses = lens.lenses ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <style>{`
        /* 폭을 하나로 통일한다(2026-08-14 최종).
           앞서 헤드라인용 넓은 폭(1080)과 본문용 좁은 폭(748)을 나눴는데,
           두 값을 어떻게 배치해도 문제가 났다 — 형제로 두고 각자 중앙 정렬하면
           좌측선이 166px 어긋나고, 자식으로 중첩하고 마진을 없애면 본문이 넓은
           영역의 왼쪽 끝에 붙어 화면 전체가 왼쪽으로 쏠렸다.
           해결: 컬럼은 하나(.lw)만 두고 모든 블록을 그 안에서 **대칭으로**
           중앙 배치한다. 좌우 여백이 같아지므로 "왼쪽으로 쏠린" 느낌이 없다.
           읽기 폭이 필요한 문단만 .lm 으로 좁히되, 그것도 margin:0 auto 로
           중앙에 둬서 양쪽 여백을 대칭으로 유지한다. */
        .lw { max-width: 880px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        /* 본문 폭 = 사진 폭(2026-08-14 요청). 예전엔 읽기 편한 줄 길이를 위해
           680px 로 좁혔는데, 그러면 사진(컬럼 전체 824px)보다 좁아 좌우가 어긋나
           보였다. 이제 컬럼 폭을 그대로 써서 사진·요약·질문·근거의 좌우선이
           완전히 일치한다.
           트레이드오프: 16px 기준 한 줄이 약 50자가 되어 스티어링 권장(25~40자)을
           넘는다. 정렬 일관성을 우선한 선택이다. */
        .lm { max-width: 100%; }
        .rule { height: 1px; background: rgba(17,24,39,0.1); }

        .back { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          color: #6b7280; font-size: 13px; font-weight: 700; text-decoration: none;
          letter-spacing: 0.02em; }
        .back:hover { color: #111827; }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 원문 링크 — 테두리 없는 텍스트 링크. 요약 아래 우측에 붙는다.
           보조 동작이라 시각적 무게를 최소로 두되 밑줄로 링크임을 명확히 한다. */
        .src { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          color: #6b7280; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.25); }
        .src:hover { color: #111827; text-decoration-color: currentColor; }
        .src:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 사람 타일 선택기 — 모바일 2열, 480px 이상 4열.
           네 칸이 완전히 같은 크기·형태라 "넷 중 하나를 고른다"가 즉시 읽힌다. */
        .picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 480px) { .picks { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .pick { position: relative; display: flex; flex-direction: column; align-items: center;
          gap: 6px; padding: 16px 12px 14px; border-radius: 14px; border: 1px solid;
          cursor: pointer; min-height: 148px; text-align: center;
          transition: background .16s ease, border-color .16s ease, transform .12s ease; }
        .pick:hover { transform: translateY(-2px); }
        .pick:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }
        .pick-on { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px;
          border-radius: 999px; display: flex; align-items: center; justify-content: center; }



        @media (prefers-reduced-motion: no-preference) {
          .panel { animation: swap .22s ease-out; }
          @keyframes swap { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
      `}</style>

      {/* 우측 사이드바(2026-08-17, 사용자 확인: "홈페이지와 동일 — 인기글+사주")
          — 홈(NewsFeedTab.tsx)과 같은 HomeSideBar를 재사용. 이 페이지는
          원래 .lw(880px) 하나만 중앙 정렬하는 단일 컬럼이었는데("양옆이
          허전하다"는 피드백), 그 .lw 블록들을 감싸는 그리드를 새로 씌워
          왼쪽 칸(본문)+오른쪽 칸(사이드바) 2열로 바꿨다. .lw 자체는
          이 파일 곳곳에서 그대로 재사용되므로 손 안 댔다 — 이제 왼쪽 칸
          (본문 폭, sidebar 없을 때보다 좁음) 안에서 여전히 margin:0 auto로
          중앙 정렬된다. lg 미만에서는 사이드바가 아예 안 뜬다. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: '0 clamp(20px, 4vw, 28px)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <div style={{ gridColumn: 1, minWidth: 0 }}>
      <div className="lw" style={{ paddingTop: 'clamp(12px, 2.4vw, 18px)' }}>
        <Link href="/lens" className="back" aria-label="시선 목록으로">
          ◀ 시선
        </Link>
      </div>

      <main id="main-content">
        {/* ── 기사 머리 ── 위계: 아이브로우 13 → 헤드라인 40 → 메타 13 */}
        <div className="lw" style={{ paddingTop: 'clamp(8px, 1.6vw, 14px)' }}>
          <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', color: LENS_ACCENT, marginBottom: 12 }}>
            4가지 시선
          </p>
          {/* 헤드라인 — 한 줄에 들어가도록 넓은 폭(.lw)을 쓰고 크기를 38px로
              한 단계 낮췄다. 다만 이 서비스의 헤드라인 길이는 편차가 커서
              (실측 최장 40자 이상) 긴 제목은 결국 줄바꿈된다. 그때 한 줄만
              길고 다음 줄이 짧아지는 어색한 모양을 막으려고 text-wrap: balance
              를 준다. */}
          {/* 컬럼을 880px 로 통일했으므로 가용 폭이 824px 다. 이 기사 제목의
              예상 폭이 38px 에서 856px 였으므로 36px 로 낮춰 한 줄을 유지한다. */}
          <h1
            data-speakable="headline"
            style={{
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              fontWeight: 800,
              color: '#111827',
              letterSpacing: '-0.03em',
              lineHeight: 1.25,
              marginBottom: 14,
              textWrap: 'balance',
              wordBreak: 'keep-all',
            }}
          >
            {lens.headline}
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 'clamp(18px, 3vw, 24px)' }}>
            {lens.date.replaceAll('-', '.')} · 서울경제
          </p>
        </div>

        {/* 사진 — 컬럼 폭을 꽉 채우고 높이는 사진이 정한다(레터박스 없음,
            좌우가 본문 가이드라인과 정확히 일치). 라운드·테두리를 없애 기사
            사진처럼 판면에 얹힌 느낌으로 뒀다. */}
        {/* 사진 — 세로가 길어지는 문제를 두 겹으로 막는다.
            (1) 본문 컬럼(.lw, 880px) 안에 두어 폭을 제한한다. 전체 폭이면
                거의 정사각인 사진이 700px 넘게 높아진다.
            (2) 2:1 컨테이너 + cover 로 높이를 확정한다(약 412px). 원본을 2:1 로
                다시 잘라뒀기 때문에 cover 가 잘라내는 양이 거의 없다.
            aspect-ratio 라 자리를 미리 잡아 레이아웃 이동(CLS)도 없다. */}
        {photo && (
          <div className="lw">
            <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0 }}>
              <Image
                src={photo}
                alt={lens.headline}
                fill
                sizes="(min-width: 920px) 880px, 100vw"
                priority
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
          </div>
        )}

        {/* ── 리드 + 원문 링크 ── 사진과 같은 .lc 폭이라 좌우선이 맞는다. */}
        <div className="lw" style={{ paddingTop: 'clamp(20px, 3.4vw, 28px)' }}>
        <div>
          {lens.context && (
            <p
              data-speakable="summary"
              className="lm"
              style={{ fontSize: 18, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}
            >
              {lens.context}
            </p>
          )}

          {lens.source_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <a href={lens.source_url} target="_blank" rel="noopener noreferrer" className="src">
                기사 원문 보기
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17 17 7" />
                  <path d="M8 7h9v9" />
                </svg>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                  (새 창으로 열립니다)
                </span>
              </a>
            </div>
          )}
        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 'clamp(28px, 4.4vw, 40px)' }}>
          <div>
            <div className="rule" />

            {/* ── 시선 선택 ──
                밑줄 텍스트 탭에서 **사람 타일**로 되돌렸다(2026-08-14).
                이 페이지의 핵심 동작이 "누구의 눈으로 볼지 고르기"인데, 앞선
                버전은 그 컨트롤을 회색 16px 텍스트로 낮춰서 화면에서 가장 약한
                요소가 됐다(눈에 안 들어온다는 피드백). 게다가 선택하는 순간에
                인물 일러스트가 없어서 "네 명 중 고른다"는 것이 직관적으로
                전달되지 않았다.
                네 타일을 같은 크기로 나란히 놓으면 선택지가 넷이라는 사실과
                각자가 누구인지가 한눈에 오고, 선택 상태는 색 채움 + 테두리 +
                체크 3중으로 표시해 색만으로 구분하지 않는다. */}
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', margin: 'clamp(24px, 3.4vw, 32px) 0 6px' }}>
              이 뉴스, 누구의 눈으로 볼까요?
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 'clamp(14px, 2.2vw, 18px)', wordBreak: 'keep-all' }}>
              고르면 아래 내용이 그 사람 기준으로 바뀝니다.
            </p>

            <div role="tablist" aria-label="독자 유형별 시선" className="picks">
              {lenses.map((l, i) => {
                const p = lensPerspectiveAt(i);
                const on = i === active;
                return (
                  <button
                    key={i}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={lensTabId(i)}
                    aria-selected={on}
                    aria-controls={lensPanelId(i)}
                    tabIndex={on ? 0 : -1}
                    onClick={() => select(i)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className="pick"
                    style={{
                      borderColor: on ? p.color : 'rgba(17,24,39,0.12)',
                      background: on ? p.tint : '#fff',
                      boxShadow: on ? `inset 0 0 0 1px ${p.color}` : 'none',
                    }}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 48, height: 48, borderRadius: 999, background: '#fff', overflow: 'hidden' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                      <img
                        src={p.illustration}
                        alt=""
                        width={48}
                        height={48}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                      />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: on ? p.color : '#4b5563', letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
                      {p.short}
                    </span>
                    {/* 이 시선이 무엇을 주는지 — 타일에 역할명만 있으면 무엇을
                        고르는지 모르고 골라야 한다. tagline 을 여기로 올려서
                        선택 전에 판단할 근거를 준다(선택 후 본문에서는 중복이라
                        제거했다). */}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: on ? p.color : '#6b7280',
                        opacity: on ? 0.9 : 1,
                        lineHeight: 1.45,
                        textAlign: 'center',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {p.tagline}
                    </span>
                    {/* 선택 표시 — 색 외에 형태 신호도 함께 준다. */}
                    {on && (
                      <span aria-hidden className="pick-on" style={{ background: p.color }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── 선택된 시선 ── 박스 없이 위계로만 구성 */}
            {lenses.map((l, i) => {
              const p = lensPerspectiveAt(i);
              const on = i === active;
              return (
                <section
                  key={i}
                  id={lensPanelId(i)}
                  role="tabpanel"
                  aria-labelledby={lensTabId(i)}
                  data-speakable="qa"
                  hidden={!on}
                  className={on ? 'panel' : undefined}
                  style={{
                    marginTop: 'clamp(22px, 3.4vw, 30px)',
                    // 선택한 타일의 색을 본문 왼쪽 규칙선으로 이어줘서
                    // "이 내용이 위에서 고른 그 사람의 읽기"라는 연결을 만든다.
                    borderLeft: `3px solid ${p.color}`,
                    paddingLeft: 'clamp(16px, 2.4vw, 24px)',
                  }}
                >
                  {/* 역할 머리 — 압축했다. 52px 일러스트와 액센트 바를 뺀 이유는
                      위 선택 타일에 이미 같은 인물이 강조된 채로 있어서 중복이고,
                      그만큼 질문(이 화면의 실제 보상)이 아래로 밀렸기 때문이다.
                      정체성은 컬러 서수 + 역할명 한 줄로 충분하다. */}
                  {/* tagline 은 위 타일로 옮겼다 — 선택 전에 필요한 정보이고,
                      여기서 반복하면 질문이 아래로 밀린다. 대신 몇 번째 시선인지
                      전체 개수와 함께 보여준다(내가 넷 중 어디에 있는지). */}
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 'clamp(14px, 2.2vw, 18px)' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: p.color, letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
                      시선 {p.ordinal} · {p.full}
                    </p>
                    <span aria-hidden style={{ width: 1, height: 12, background: 'rgba(17,24,39,0.15)' }} />
                    <p style={{ fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {i + 1} / {count}
                    </p>
                  </div>

                  {/* 질문 — 카드 안 시각적 정점(32). 장식 없이 세리프 크기만으로
                      끌어올린다. */}
                  {l.question && (
                    <p
                      className="lm"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 'clamp(24px, 3vw, 32px)',
                        fontWeight: 700,
                        color: '#111827',
                        lineHeight: 1.45,
                        letterSpacing: '-0.03em',
                        marginBottom: 'clamp(22px, 3.4vw, 28px)',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {l.question}
                    </p>
                  )}

                  {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 앞서는 큰
                      질문 다음에 사실이 그냥 나열돼서 둘이 Q&A 한 쌍이라는 게
                      드러나지 않았고, 그래서 구획이 끝났는지도 애매했다.
                      개수를 함께 보여주면 얼마나 읽어야 하는지도 예측된다. */}
                  {l.bullets.length > 0 && (
                    <>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          color: '#6b7280',
                          marginBottom: 14,
                        }}
                      >
                        이 질문에 답하는 사실 {l.bullets.length}
                      </p>
                      <ul className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none', padding: 0, margin: 0 }}>
                        {l.bullets.map((b, bi) => (
                          <li key={bi} style={{ display: 'flex', gap: 12, fontSize: 16, lineHeight: 1.75, color: '#374151', wordBreak: 'keep-all' }}>
                            <span
                              aria-hidden
                              className="flex-shrink-0"
                              style={{ width: 5, height: 5, marginTop: 11, borderRadius: 999, background: p.color }}
                            />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {!l.question && l.bullets.length === 0 && (
                    <p style={{ fontSize: 14, color: '#6b7280' }}>이 시선은 아직 준비 중이에요.</p>
                  )}
                </section>
              );
            })}

            {/* 구획 마감 — 본문이 끝났는데 아무 표시가 없어 브랜드 문구로 바로
                넘어가는 게 갑작스러웠다. 출처 한 줄로 닫는다: 뉴스에서 "이 사실이
                어디서 왔는지"는 신뢰의 마지막 조각이고, 네 시선이 모두 같은
                기사에서 나왔다는 것도 여기서 확인된다. */}
            <p
              style={{
                marginTop: 'clamp(28px, 4vw, 38px)',
                paddingTop: 16,
                borderTop: '1px solid rgba(17,24,39,0.09)',
                fontSize: 13,
                color: '#6b7280',
                lineHeight: 1.6,
                wordBreak: 'keep-all',
              }}
            >
              네 시선 모두 같은 기사를 바탕으로 정리했어요.
              {lens.source_url && (
                <>
                  {' '}
                  <a
                    href={lens.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#374151', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    원문 기사
                  </a>
                  에서 전체 내용을 확인할 수 있어요.
                </>
              )}
            </p>
          </div>
          </div>
        )}

        <div className="lw" style={{ paddingTop: 'clamp(44px, 6vw, 64px)', paddingBottom: 100 }}>
        <div>
          <div className="rule" />

          {/* "다른 시선" 미리보기(2026-08-16) — 마감부가 문구 한 줄 + 링크
              하나뿐이라 "허전하다"는 피드백. page.tsx가 fetchAllLens()
              in-flight 캐시에 편승해 이미 가져온 값 중 현재 글만 뺀 3개를
              넘겨준다(추가 API 호출 없음). */}
          {otherLens.length > 0 && (
            <div style={{ margin: '28px 0 8px' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 }}>
                다른 시선
              </p>
              <div>
                {otherLens.map((l) => {
                  const photo = pickLensPhoto(l);
                  return (
                    <Link
                      key={l.id}
                      href={`/lens/${encodeURIComponent(l.id)}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 0',
                        textDecoration: 'none',
                        borderTop: '1px solid rgba(17,24,39,0.07)',
                      }}
                    >
                      {photo && (
                        <span
                          className="flex-shrink-0"
                          style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}
                        >
                          <Image src={photo} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                        </span>
                      )}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 3 }}>
                          {l.date.replaceAll('-', '.')}
                        </span>
                        <span
                          style={{
                            display: '-webkit-box',
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#111827',
                            lineHeight: 1.4,
                            letterSpacing: '-0.01em',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {l.headline}
                        </span>
                      </span>
                      <span aria-hidden className="flex-shrink-0" style={{ color: '#c0c5cc', fontSize: 16 }}>
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '28px 0 4px', lineHeight: 1.5 }}>
            일상 속의 모든 소식, 신속하고 정확한 전달
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>통찰력 있는 이야기 · 인스타그램 @lens.sedaily</p>
          <Link
            href="/lens"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14, fontWeight: 700, color: LENS_ACCENT, textDecoration: 'none' }}
          >
            다른 시선 보기 →
          </Link>
        </div>
        </div>
      </main>
          </div>

          <HomeSideBar className="hidden lg:block" />
        </div>
      </div>
    </div>
  );
}
