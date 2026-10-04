'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchWebtoonBySlug, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { kstDateTimeLabel } from '@/shared/lib/date/date';

/**
 * 웹툰 미리보기 모달 — 홈 "이슈를 웹툰으로" 카드를 누르면 별도 페이지로 넘어가지 않고 화면 가운데에서 컷을 훑어 본다
 * (2026-10-05, 사용자 요청 — 예전 '1000화' 뷰어 페이지가 어색했음). VideoLightbox와 같은 규칙: body 포털(조상 transform 무관),
 * 배경 클릭·Esc로 닫기, transform 정렬 대신 flex 중앙 정렬.
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

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ padding: 'clamp(12px, 3vw, 32px)', zIndex: 200, background: 'rgba(17,24,39,0.62)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`웹툰 미리보기: ${displayHeadline(webtoon.title)}`}
    >
      <div
        className="relative flex flex-col w-full"
        style={{ maxWidth: 560, maxHeight: '100%', borderRadius: 16, background: '#fff', boxShadow: '0 24px 60px -12px rgba(0,0,0,.45)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start" style={{ gap: 12, padding: '16px 18px 14px', borderBottom: '1px solid #e5e7eb' }}>
          <div className="min-w-0 flex-1">
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: '#9ca3af' }}>{when}</p>
            <h2 style={{ margin: '4px 0 0', fontFamily: '"Noto Serif KR", serif', fontSize: 17, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.015em', color: '#1f2937' }}>
              {displayHeadline(webtoon.title)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex items-center justify-center flex-shrink-0 hover:bg-gray-100 transition-colors"
            style={{ width: 32, height: 32, borderRadius: '50%', color: '#6b7280', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div style={{ overflowY: 'auto', background: '#f3f4f6' }}>
          {panels.length > 0 ? (
            panels.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가
              <img key={i} src={p.url} alt={p.caption || `${displayHeadline(webtoon.title)} 컷 ${i + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} loading={i < 2 ? 'eager' : 'lazy'} />
            ))
          ) : webtoon.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- 표지는 컷 로딩 동안만 보여 준다
            <img src={webtoon.cover_image_url} alt={displayHeadline(webtoon.title)} style={{ display: 'block', width: '100%', height: 'auto', opacity: loading ? 0.6 : 1 }} />
          ) : null}
          {!loading && panels.length === 0 && (
            <p style={{ margin: 0, padding: '28px 18px', textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>컷을 불러오지 못했어요.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
