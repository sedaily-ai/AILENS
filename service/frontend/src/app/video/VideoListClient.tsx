'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchVideos, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';

// 영상 전용 목록 페이지(2026-08-11) — 그동안 홈 화면 미리보기 섹션
// (VideoPreviewSection.tsx)만 있었고, 영상 하나하나가 검색엔진이 찾을 수
// 있는 자기 URL이 없었다(웹툰 상세처럼). /webtoon 목록과 같은 서버 컴포넌트
// 패턴 — initialItems를 빌드/요청 시점에 미리 채워 SSG/SSR HTML에 실제
// 목록이 바로 박히게 한다.
export function VideoListClient({ initialItems }: { initialItems: CmsVideo[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<CmsVideo[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    fetchVideos().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('video')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 24 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Video
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            영상으로 보는 이슈
          </h1>
          <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>
            요즘 이슈를 짧은 영상으로 정리해드려요.
          </p>
        </header>

        {items.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '60px 0', textAlign: 'center' }}>
            아직 올라온 영상이 없어요. 곧 첫 영상으로 찾아올게요.
          </p>
        )}

        {items.length > 0 && (
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'clamp(14px, 2.6vw, 22px)' }}
          >
            {items.map((v) => {
              const resolved = resolveVideo(v.video_url);
              const thumb = v.thumbnail_url || resolved?.autoThumbnailUrl || null;
              return (
                <Link
                  key={v.id}
                  href={`/video/${encodeURIComponent(v.id)}`}
                  prefetch
                  className="group"
                  style={{
                    display: 'block',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #f1f1f0',
                    textDecoration: 'none',
                    boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 6px 18px rgba(17,24,39,0.05)',
                  }}
                >
                  <div className="aspect-video relative overflow-hidden" style={{ background: '#111827' }}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        src={thumb}
                        alt={v.title}
                        className="w-full h-full transition-transform duration-300 group-hover:scale-[1.04]"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="w-full h-full" style={{ background: '#1f2937' }} />
                    )}
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.12)' }}
                    >
                      <span
                        className="flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.92)' }}
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="#111827">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{v.date.replaceAll('-', '.')}</p>
                    <h2
                      className="text-gray-900"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 14.5,
                        fontWeight: 600,
                        lineHeight: 1.4,
                        letterSpacing: '-0.01em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {v.title}
                    </h2>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
