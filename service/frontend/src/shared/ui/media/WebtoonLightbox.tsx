'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchWebtoonBySlug, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { kstDateTimeLabel } from '@/shared/lib/date/date';

/**
 * 웹툰 미리보기 모달. 홈 "이슈를 웹툰으로" 카드를 누르면 별도 페이지로 넘어가지 않고 화면 가운데에서 컷을 훑어 본다.
 * VideoLightbox와 같은 규칙: body 포털(조상 transform 무관), 배경 클릭·Esc로 닫기, transform 정렬 대신 flex 중앙 정렬.
 *
 * 홈 목록은 용량 때문에 컷(panels)을 비운 요약본이라, 열릴 때 한 번 전체 글을 불러온다(그동안 표지를 보여 준다).
 */
export function WebtoonLightbox({ webtoon, onClose }: { webtoon: CmsWebtoon; onClose: () => void }) {
  const [panels, setPanels] = useState(webtoon.panels);
  const [loading, setLoading] = useState(webtoon.panels.length === 0);

  useEffect(() => {
    if (webtoon.panels.length > 0) return;
    let cancelled = false;
    fetchWebtoonBySlug(webtoon.id).then((full) => {
      if (cancelled) return;
      setPanels(full?.panels ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [webtoon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const when = kstDateTimeLabel(webtoon.published_at) ?? webtoon.date.replaceAll('-', '.');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };
  const count = panels.length;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ padding: 'clamp(10px, 3vw, 36px)', zIndex: 200, background: 'rgba(8,10,14,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`웹툰 미리보기: ${displayHeadline(webtoon.title)}`}
    >
      <style>{`
        .wl-scroll { scrollbar-width: thin; scrollbar-color: rgba(17,24,39,.22) transparent; }
        .wl-scroll::-webkit-scrollbar { width: 8px; }
        .wl-scroll::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
        .wl-scroll::-webkit-scrollbar-thumb { background: rgba(17,24,39,.2); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
        .wl-scroll::-webkit-scrollbar-thumb:hover { background: rgba(17,24,39,.36); background-clip: padding-box; }
        .wl-close { transition: background .15s ease, color .15s ease, transform .15s ease; }
        .wl-close:hover { background: rgba(17,24,39,.1); color: #111827; transform: rotate(90deg); }
        @keyframes wl-in { from { opacity: 0; transform: translateY(10px) scale(.985); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .wl-panel { animation: none !important; } .wl-close:hover { transform: none; } }
      `}</style>
      <div
        className="wl-panel relative flex flex-col w-full"
        style={{
          maxWidth: 540,
          height: 'min(100%, 920px)',
          borderRadius: 22,
          background: '#f8f8f6',
          boxShadow: '0 40px 90px -20px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08)',
          overflow: 'hidden',
          animation: 'wl-in .22s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 읽기 진행 — 맨 위 가는 선 */}
        <div aria-hidden style={{ height: 2, background: 'rgba(17,24,39,.07)', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: '#3d70de', transition: 'width .12s linear' }} />
        </div>

        <header className="flex items-start" style={{ gap: 14, padding: '20px 22px 16px', flexShrink: 0 }}>
          <div className="min-w-0 flex-1">
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', color: '#3d70de', textTransform: 'uppercase' }}>
              서울경제 웹툰{count > 1 ? ` · ${count}컷` : ''}
            </p>
            <h2 style={{ margin: '8px 0 0', fontFamily: '"Noto Serif KR", serif', fontSize: 19, fontWeight: 700, lineHeight: 1.45, letterSpacing: '-0.02em', color: '#1f2937' }}>
              {displayHeadline(webtoon.title)}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9ca3af' }}>{when}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="wl-close flex items-center justify-center flex-shrink-0"
            style={{ width: 34, height: 34, borderRadius: '50%', color: '#6b7280', border: 'none', background: 'rgba(17,24,39,.06)', cursor: 'pointer' }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="wl-scroll flex-1" style={{ overflowY: 'auto', padding: '4px 22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {panels.length > 0 ? (
            panels.map((p, i) => (
              <figure key={i} style={{ margin: 0, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 2px rgba(60,55,45,.08), 0 10px 26px -14px rgba(60,55,45,.35)', border: '1px solid #e4e4df' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가 */}
                <img src={p.url} alt={p.caption || `${displayHeadline(webtoon.title)} 컷 ${i + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
              </figure>
            ))
          ) : webtoon.cover_image_url ? (
            <figure style={{ margin: 0, flexShrink: 0, borderRadius: 14, overflow: 'hidden', background: '#fff', opacity: loading ? 0.55 : 1, transition: 'opacity .2s ease' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 표지는 컷 로딩 동안만 보여 준다 */}
              <img src={webtoon.cover_image_url} alt={displayHeadline(webtoon.title)} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </figure>
          ) : null}
          {!loading && panels.length === 0 && (
            <p style={{ margin: 0, padding: '28px 0', textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>컷을 불러오지 못했어요.</p>
          )}
          {panels.length > 0 && (
            <p style={{ margin: '10px 0 0', flexShrink: 0, textAlign: 'center', fontSize: 11.5, letterSpacing: '0.12em', color: '#b0b4bb' }}>끝 · AI LENS</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
