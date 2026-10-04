'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';

// 스크롤하면 상단 메뉴가 "카테고리 + 기사 제목 + 읽기 진행선"의 얇은 바로 바뀐다(영문 사이트 상세 동작을 따름).
// 헤드라인이 화면 위로 지나간 뒤 나타나 sticky 헤더(z-100, 높이 약 57px)를 그대로 덮으므로 아래 형식 탭 바(.fmt-bar)의 top 오프셋이 유효하다.
// 진행선은 기사 본문(main) 기준으로 계산하고 리렌더 없이 transform으로만 갱신한다.

const BAR_HEIGHT = 57;
const MILESTONES = [
  { at: 0.5, text: '절반 읽었어요' },
  { at: 0.85, text: '거의 다 왔어요' },
];

export function ArticleStickyBar({
  category,
  categoryHref,
  title,
  readMin,
}: {
  category: string | null;
  categoryHref: string | null;
  title: string;
  /** 레터 예상 읽기 시간(분). 있으면 레터 본문을 읽는 동안 "남은 약 N분"을 보여 준다. */
  readMin?: number | null;
}) {
  const [show, setShow] = useState(false);
  const [remain, setRemain] = useState<string | null>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const passed = useRef<Set<number> | null>(null);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressRef = useRef<HTMLDivElement>(null);
  // 챕터별 칸 진행 — 레터 본문에 소제목이 2개 이상일 때만, 연속 선 대신 챕터 수만큼 칸을 나눠 읽은 만큼 채운다.
  const [segCount, setSegCount] = useState(0);
  const segRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const h1 = document.getElementById('art-h1');
    const main = document.getElementById('main-content');
    if (!h1 || !main) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      setShow(h1.getBoundingClientRect().bottom < BAR_HEIGHT);
      const m = main.getBoundingClientRect();
      const total = m.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -m.top / total)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
      // 칸 진행: 칸 i = (i=0이면 본문 시작, 아니면 i번째 소제목) ~ 다음 소제목(마지막은 본문 끝). 독자 시선(화면 60%)이 지난 만큼 채운다.
      const bodyEl = document.querySelector('[data-letter-body]');
      const bRect = bodyEl ? bodyEl.getBoundingClientRect() : null;
      const heads = Array.from(document.querySelectorAll('[data-letter-body] .lread > .lread-sub'));
      // 웹툰 탭이 열려 있으면 컷 하나가 한 칸 — 컷마다 읽은 만큼 채워져 몇 컷 봤는지 한눈에 보인다.
      const cuts = Array.from(document.querySelectorAll('[data-cut-index]')).filter((c) => c.getBoundingClientRect().height > 0);
      const letterOn = !!bRect && bRect.height > 0 && heads.length >= 2;
      const cutsOn = !letterOn && cuts.length >= 2;
      const segOn = letterOn || cutsOn;
      setSegCount(letterOn ? heads.length : cutsOn ? cuts.length : 0);
      if (segOn) {
        const eye = window.innerHeight * 0.6;
        const edges = letterOn && bRect
          ? [bRect.top, ...heads.slice(1).map((h) => h.getBoundingClientRect().top), bRect.bottom]
          : [...cuts.map((c) => c.getBoundingClientRect().top), cuts[cuts.length - 1].getBoundingClientRect().bottom];
        segRefs.current.forEach((el, i) => {
          if (!el || i >= edges.length - 1) return;
          const span = edges[i + 1] - edges[i];
          const f = span > 0 ? Math.min(1, Math.max(0, (eye - edges[i]) / span)) : 0;
          el.style.transform = `scaleX(${f})`;
        });
      }
      // 남은 읽기 시간 — 레터 본문(보이는 동안)만. 본문 위치 기준: 화면 60% 지점까지 읽었다고 본다.
      const body = document.querySelector('[data-letter-body]');
      const br = body ? body.getBoundingClientRect() : null;
      if (readMin && br && br.height > 0 && br.top < window.innerHeight) {
        const read = Math.min(br.height, Math.max(0, window.innerHeight * 0.6 - br.top));
        const left = readMin * (1 - read / br.height);
        setRemain(left <= 0.4 ? '다 읽었어요' : `남은 약 ${Math.max(1, Math.ceil(left))}분`);
        // 가벼운 격려 — 절반·거의 끝에 닿는 순간 2.6초만 한 줄. 처음 열 때 이미 지난 구간은 조용히 넘긴다
        // (이어 읽기로 중간에 들어왔을 때 갑자기 격려하지 않게).
        const frac = read / br.height;
        if (!passed.current) {
          passed.current = new Set(MILESTONES.filter((m) => frac >= m.at).map((m) => m.at));
        } else {
          for (const m of MILESTONES) {
            if (frac >= m.at && !passed.current.has(m.at)) {
              passed.current.add(m.at);
              setCheer(m.text);
              if (cheerTimer.current) clearTimeout(cheerTimer.current);
              cheerTimer.current = setTimeout(() => setCheer(null), 2600);
            }
          }
        }
      } else {
        setRemain(null);
      }
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
  }, [readMin]);

  return (
    <>
      <style>{`
        .sbar-cheer { color: #111827; font-weight: 800; }
        @media (prefers-reduced-motion: no-preference) { .sbar-cheer { animation: sbar-cheer-in .35s cubic-bezier(.22,.85,.2,1); }
          @keyframes sbar-cheer-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } } }
        .sbar-remain { flex-shrink: 0; margin-left: 4px; font-size: 12.5px; font-weight: 600; color: #6b7280; font-variant-numeric: tabular-nums; }
        .sbar { position: fixed; top: 0; left: 0; right: 0; height: ${BAR_HEIGHT}px; z-index: 110; background: #fff;
          border-bottom: 1px solid #e5e7eb; transform: translateY(-100%); visibility: hidden;
          transition: transform .22s ease, visibility 0s linear .22s; }
        .sbar[data-show='true'] { transform: none; visibility: visible; transition: transform .22s ease; }
        .sbar-in { max-width: 720px; height: 100%; margin: 0 auto; display: flex; align-items: center; gap: 14px;
          padding: 0 clamp(20px, 4vw, 28px); }
        .sbar-cat { flex-shrink: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.06em; color: #111827; text-decoration: none; }
        .sbar-title { min-width: 0; flex: 1; font-family: "Noto Serif KR", serif; font-size: 17px; font-weight: 700; color: #111827;
          letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: none; background: none;
          padding: 0; text-align: left; cursor: pointer; }
        .sbar[data-segs='true'] .sbar-prog { display: none; }
        .sbar-segs { position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; display: flex; gap: 3px; padding: 0 clamp(20px, 4vw, 28px);
          max-width: 720px; margin: 0 auto; }
        .sbar-seg { position: relative; flex: 1; height: 100%; border-radius: 2px; background: #e5e7eb; overflow: hidden; }
        .sbar-seg > span { position: absolute; inset: 0; background: #111827; transform-origin: left; transform: scaleX(0); }
        .sbar-prog { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #111827;
          transform-origin: left; transform: scaleX(0); }
        @media (prefers-reduced-motion: reduce) { .sbar, .sbar[data-show='true'] { transition: none; } }
        @media print { .sbar { display: none; } }
      `}</style>
      <div className="sbar" data-show={show} data-segs={segCount > 0} aria-hidden={!show}>
        <div className="sbar-in">
          {category &&
            (categoryHref ? (
              <Link href={categoryHref} className="sbar-cat" tabIndex={show ? 0 : -1}>
                {category}
              </Link>
            ) : (
              <span className="sbar-cat">{category}</span>
            ))}
          <button
            type="button"
            className="sbar-title"
            tabIndex={show ? 0 : -1}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="맨 위로"
          >
            {displayHeadline(title)}
          </button>
          {(cheer ?? remain) && (
            <span key={cheer ?? 'remain'} className={cheer ? 'sbar-remain sbar-cheer' : 'sbar-remain'}>
              {cheer ?? remain}
            </span>
          )}
        </div>
        {segCount > 0 && (
          <div className="sbar-segs" aria-hidden>
            {Array.from({ length: segCount }, (_, i) => (
              <span key={i} className="sbar-seg">
                <span ref={(el) => { segRefs.current[i] = el; }} />
              </span>
            ))}
          </div>
        )}
        <div ref={progressRef} className="sbar-prog" aria-hidden />
      </div>
    </>
  );
}
