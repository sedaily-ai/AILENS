'use client';

import { useEffect, useState } from 'react';

// 이어 읽기(2026-10-01) — 읽다가 나갔다 돌아오면 "읽던 곳이 있어요 · 62%" 안내를 띄워 그 자리로 바로 이동시킨다.
//  · 위치는 이 브라우저(localStorage)에만 저장한다 — 서버·계정과 무관, 외부 전송 없음.
//  · 8%~92% 구간에서만(거의 안 읽었거나 거의 다 읽었으면 안내하지 않음), 7일 안 기록만 쓴다.
//  · 맨 위(스크롤 200px 이내)로 들어왔고 URL에 해시(#)가 없을 때만 묻는다 — 공유 링크의 앵커를 가로채지 않게.
//  · 95% 이상 읽으면 기록을 지운다(다 읽은 글). 9초 뒤 자동으로 사라진다.
//  · localStorage 접근 실패(시크릿 모드 등)는 조용히 기능만 끈다.

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function progressOf(main: HTMLElement): number {
  const m = main.getBoundingClientRect();
  const total = m.height - window.innerHeight;
  return total > 0 ? Math.min(1, Math.max(0, -m.top / total)) : 0;
}

export function ArticleResume({ articleId }: { articleId: string }) {
  const key = `lens-resume:${articleId}`;
  const [offer, setOffer] = useState<{ y: number; pct: number } | null>(null);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;

    // 1) 저장된 위치 확인
    try {
      const raw = localStorage.getItem(key);
      if (raw && window.scrollY < 200 && !window.location.hash) {
        const s = JSON.parse(raw) as { y: number; p: number; t: number };
        if (s.p >= 0.08 && s.p <= 0.92 && Date.now() - s.t < MAX_AGE && s.y > 400) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 localStorage를 읽어 안내를 띄운다
          setOffer({ y: s.y, pct: Math.round(s.p * 100) });
        }
      }
    } catch {
      return;
    }

    // 2) 읽는 동안 위치 저장(스크롤이 멈춘 뒤 0.5초)
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      try {
        const p = progressOf(main);
        if (p >= 0.95) localStorage.removeItem(key);
        else if (p >= 0.04) localStorage.setItem(key, JSON.stringify({ y: Math.round(window.scrollY), p, t: Date.now() }));
      } catch {
        // 저장 실패 무시.
      }
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  // 안내는 9초 뒤 자동으로 닫힌다.
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(() => setOffer(null), 9000);
    return () => clearTimeout(t);
  }, [offer]);

  if (!offer) return null;

  const resume = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: offer.y, behavior: reduce ? 'auto' : 'smooth' });
    setOffer(null);
  };
  const restart = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 무시.
    }
    setOffer(null);
  };

  return (
    <>
      <style>{`
        .rsm { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 120; display: flex; align-items: center; gap: 14px;
          max-width: calc(100vw - 32px); padding: 12px 14px 12px 18px; background: #111827; color: #fff; border-radius: 14px;
          box-shadow: 0 10px 30px rgba(17,24,39,0.22); font-size: 14px; }
        .rsm-t { line-height: 1.4; }
        .rsm-t small { display: block; font-size: 12px; color: #9ca3af; margin-top: 2px; }
        .rsm-go { flex-shrink: 0; padding: 8px 14px; border: none; border-radius: 9px; background: #fff; color: #111827; font-size: 13.5px; font-weight: 700; cursor: pointer; }
        .rsm-no { flex-shrink: 0; padding: 8px 4px; border: none; background: none; color: #d1d5db; font-size: 13px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .rsm-go:focus-visible, .rsm-no:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        @media (prefers-reduced-motion: no-preference) { .rsm { animation: rsm-in .35s cubic-bezier(.22,.85,.2,1); }
          @keyframes rsm-in { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translateX(-50%); } } }
        @media print { .rsm { display: none; } }
      `}</style>
      <div className="rsm" role="status">
        <p className="rsm-t" style={{ margin: 0 }}>
          읽던 곳이 있어요
          <small>{offer.pct}%까지 읽으셨어요</small>
        </p>
        <button type="button" className="rsm-go" onClick={resume}>
          이어 읽기
        </button>
        <button type="button" className="rsm-no" onClick={restart}>
          처음부터
        </button>
      </div>
    </>
  );
}
