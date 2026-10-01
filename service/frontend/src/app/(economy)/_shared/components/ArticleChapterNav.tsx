'use client';

import { useEffect, useState } from 'react';
import type { LensChapter } from './lensChapters';

// 오른쪽 고정 "이 글의 구간" 목차(2026-10-01, 챕터 내비게이션) — 긴 레터 본문에서 지금 어디를 읽는지,
// 어떤 구간이 있는지 보여 주고 누르면 그 구간으로 부드럽게 이동한다.
//
//  · 본문 오른쪽 여백에 놓는다(≥1240px에서만 — 그보다 좁으면 숨김, 본문 폭을 침범하지 않는다).
//  · 첫 구간 소제목이 화면에 들어온 뒤부터 본문이 끝날 때까지만 나타난다(제목·사진 위에선 안 보임).
//  · 읽은 구간은 진하게, 지금 구간은 형식 색 + 굵게, 앞으로 올 구간은 연하게 — 진행이 한눈에 보인다.
//  · 레터 탭을 보고 있을 때만(show) 의미가 있다 — 다른 형식엔 소제목이 없다.
//  · 모션 줄이기 설정이면 점프도 즉시 이동.

// 항목마다 아주 살짝 다른 기울기 — 반듯한 UI 부품이 아니라 손으로 적어 둔 목록 같은 느낌.
const ROT = [-0.6, 0.4, -0.3, 0.5, -0.5, 0.3];

export function ArticleChapterNav({
  chapters,
  show,
  accent,
}: {
  chapters: LensChapter[];
  show: boolean;
  accent: string;
}) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show || chapters.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 전환 시 목차를 숨기는 단순 동기화
      setVisible(false);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const heads = chapters.map((c) => document.getElementById(c.id));
      if (heads.some((h) => !h)) return;
      const tops = heads.map((h) => (h as HTMLElement).getBoundingClientRect().top);
      // 지금 구간 = 화면 38% 지점(독자의 시선이 머무는 위치)을 지난 마지막 소제목. 아직 첫 소제목 전이면 0.
      // (예전엔 고정 바 아래 150px을 기준으로 해서, 소제목이 화면 중간에 보여도 목차가 한 구간 늦게 바뀌었다.)
      const eye = window.innerHeight * 0.38;
      let cur = 0;
      tops.forEach((t, i) => {
        if (t <= eye) cur = i;
      });
      setActive(cur);
      const body = document.querySelector('[data-letter-body]');
      const bodyBottom = body ? body.getBoundingClientRect().bottom : 0;
      setVisible(tops[0] < window.innerHeight * 0.85 && bodyBottom > 200);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [chapters, show]);

  if (chapters.length < 2) return null;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <>
      <style>{`
        .chn-host { display: none; }
        @media (min-width: 1240px) {
          .chn-host { display: block; position: absolute; top: 0; bottom: 0; left: calc(50% + 360px + 40px); width: 210px; pointer-events: none; }
          .chn { position: sticky; top: 110px; opacity: 0; transform: translateY(6px); pointer-events: none;
            transition: opacity .25s ease, transform .25s ease; }
          .chn[data-visible='true'] { opacity: 1; transform: none; pointer-events: auto; }
        }
        /* 손으로 그린 듯한 톤(2026-10-01) — 세로선·테두리 없이, 현재 구간은 펜으로 그은 밑줄, 읽은 구간은 손으로 쓴 체크. */
        .chn-label { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: #9ca3af; margin: 0 0 14px; }
        .chn-list { list-style: none; margin: 0; padding: 0; }
        .chn-btn { position: relative; display: block; width: 100%; text-align: left; padding: 8px 26px 8px 0; border: none;
          background: none; cursor: pointer; font-size: 13.5px; line-height: 1.4; color: #b4bac3; word-break: keep-all;
          transform: rotate(var(--chn-rot, 0deg)); transform-origin: left center; transition: color .2s ease; }
        .chn-btn:hover { color: #111827; }
        .chn-t { position: relative; display: inline; }
        .chn-line { position: absolute; left: -2px; right: -2px; bottom: -5px; width: calc(100% + 4px); height: 7px; overflow: visible; opacity: 0; pointer-events: none; }
        .chn-line path { fill: none; stroke: var(--chn-accent); stroke-width: 2.2; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
        .chn-btn[data-state='now'] .chn-line { opacity: 0.85; }
        .chn-btn[data-state='now'] .chn-line path { stroke-dashoffset: 0; transition: stroke-dashoffset .45s ease-out; }
        .chn-ck { position: absolute; right: 2px; top: 50%; width: 16px; height: 16px; margin-top: -8px; color: var(--chn-accent); opacity: 0; }
        .chn-ck path { stroke-dasharray: 1; stroke-dashoffset: 1; }
        .chn-btn[data-state='read'] .chn-ck { opacity: 1; }
        .chn-btn[data-state='read'] .chn-ck path { stroke-dashoffset: 0; transition: stroke-dashoffset .4s ease-out; }
        .chn-btn[data-state='read'] { color: #6b7280; }
        .chn-btn[data-state='now'] { color: #111827; font-weight: 700; }
        .chn-btn:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }
        .chn-count { margin: 12px 0 0; font-size: 12px; color: #b4bac3; font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { .chn, .chn-btn, .chn-line path, .chn-ck path { transition: none !important; } }
        @media print { .chn-host { display: none; } }
      `}</style>
      <div className="chn-host" style={{ ['--chn-accent' as string]: accent }}>
        <nav className="chn" data-visible={visible} aria-label="이 글의 구간" aria-hidden={!visible}>
          <p className="chn-label">이 글의 구간</p>
          <ol className="chn-list">
            {chapters.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="chn-btn"
                  data-state={i < active ? 'read' : i === active ? 'now' : 'next'}
                  aria-current={i === active ? 'location' : undefined}
                  tabIndex={visible ? 0 : -1}
                  title={c.full}
                  onClick={() => jump(c.id)}
                  style={{ ['--chn-rot' as string]: `${ROT[i % ROT.length]}deg` }}
                >
                  <span className="chn-t">
                    {c.label}
                    <svg className="chn-line" viewBox="0 0 100 7" preserveAspectRatio="none" aria-hidden>
                      <path pathLength={1} d="M1 4.6 C 14 1.8, 26 6, 44 3.4 S 78 2.2, 99 4.2" />
                    </svg>
                  </span>
                  <svg className="chn-ck" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path pathLength={1} d="M2.2 8.9 C 3.6 9.6, 4.6 10.8, 5.7 12.6 C 8 8.4, 10.8 4.8, 14 2.6" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          <p className="chn-count">
            {active + 1} / {chapters.length}
          </p>
        </nav>
      </div>
    </>
  );
}
