'use client';

import { useEffect, useRef, useState } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchHomePlayerBySlug, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { useMediaProgress } from '@/shared/lib/tracking/useMediaProgress';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { ACCENT } from '../accent';

/**
 * 오디오 상세(2026-08-21) — video/[slug]/VideoViewClient.tsx와 같은
 * initialItem 패턴. mp3 등 직접 파일이면 네이티브 <audio controls>, YouTube/
 * 네이버TV면 iframe 임베드 — 둘 다 이 페이지 하나에서 처리한다(홈 하단
 * 미니 플레이어와 달리 진행률 폴링·다음 트랙 자동재생 같은 상태 관리가
 * 필요 없어 브라우저 네이티브 컨트롤로 충분하다).
 */
export function ListenViewClient({
  slug,
  initialItem = undefined,
}: {
  slug: string;
  initialItem?: HomePlayerPost | null;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [item, setItem] = useState<HomePlayerPost | null | undefined>(initialItem);

  useEffect(() => {
    if (!slug || initialItem) return;
    let cancelled = false;
    fetchHomePlayerBySlug(slug).then((v) => {
      if (!cancelled) setItem(v);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialItem]);

  // hooks는 아래 early return보다 위에서 무조건 불러야 한다(Rules of Hooks).
  const audioRef = useRef<HTMLAudioElement>(null);
  useMediaProgress(audioRef, item?.id, 'podcast');

  if (!slug || item === null) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('listen')} frosted />
        <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center text-neutral-500">
          <p>오디오를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-neutral-900">
            최신 뉴스로
          </Link>
        </div>
      </div>
    );
  }

  const resolved = item ? resolveVideo(item.mediaEmbedUrl) : null;
  const isAudio = item ? isDirectAudioUrl(item.mediaEmbedUrl) : false;

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('listen')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {item === undefined && (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
          <div style={{ height: 120, background: '#f3f4f6', borderRadius: 16 }} />
        </div>
      )}

      {item && (
        <main style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 32px) 80px' }}>
          <Link
            href="/lens"
            className="text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 600, display: 'inline-block', marginBottom: 20 }}
          >
            ← 최신 뉴스로
          </Link>

          <div style={{ padding: '4px 0 0' }}>
            {item.date && (
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 600 }}>
                {kstDateTimeLabel(item.publishedAt) ?? item.date.replaceAll('-', '.')} · {isAudio ? '팟캐스트' : '영상'}
              </p>
            )}
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(21px, 4vw, 27px)',
                fontWeight: 700,
                color: '#111827',
                marginBottom: 20,
                letterSpacing: '-0.01em',
                lineHeight: 1.4,
              }}
            >
              {displayHeadline(item.title)}
            </h1>
          </div>

          {isAudio ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '20px clamp(16px, 4vw, 24px)',
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 48, height: 48, borderRadius: '50%', background: '#eff6ff', color: ACCENT }}
                aria-hidden
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 13a8 8 0 0 1 16 0" />
                  <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
                  <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
                </svg>
              </span>
              <audio ref={audioRef} controls src={item.mediaEmbedUrl} style={{ flex: 1, minWidth: 0, height: 40 }} />
            </div>
          ) : resolved ? (
            <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 12, background: '#111827' }}>
              <iframe
                src={resolved.embedUrl}
                title={item.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div
              className="aspect-video flex items-center justify-center"
              style={{ borderRadius: 12, background: '#f3f4f6', color: '#9ca3af', fontSize: 13 }}
            >
              재생을 준비 중이에요.
            </div>
          )}

          {item.excerpt && (
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65, marginTop: 20 }}>{item.excerpt}</p>
          )}

          {/* 전체 대본(2026-08-23, 사용자 지적 — "들어갈 때 이것만 있으니까
              너무 허전한데, 텍스트 스크립트 표출하면 어떰?"). 플레이어 +
              한 줄 요약뿐이던 페이지가 실제로 아래가 텅 비어 있었다 —
              lens 팟캐스트 포맷이 이미 갖고 있던 접근성용 transcript를
              그대로 보여준다(타임스탬프 동기화는 없음, LensViewClient.tsx
              와 같은 패턴). */}
          {item.transcript && (
            <div
              style={{
                marginTop: 28,
                padding: 'clamp(18px, 3vw, 24px)',
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 12 }}>
                스크립트 (본문 텍스트)
              </p>
              <div style={{ fontSize: 15, lineHeight: 1.85, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                {item.transcript}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
