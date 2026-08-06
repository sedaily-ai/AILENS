'use client';

import { useEffect, useState } from 'react';
import { fetchVideos, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { extractYouTubeId, youtubeThumbnailUrl, youtubeEmbedUrl } from '@/shared/lib/videoEmbed';

// 영상 콘텐츠 섹션(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
// 여기 자동으로 뜬다. "매거진 고급짐" 톤(TrendingEconomySection과 동일 원칙)
// 을 그대로 따른다 — 이 섹션도 재미보다는 정보 콘텐츠라 톤을 맞췄다.
// 실제 영상이 하나도 없으면 섹션 자체를 숨긴다 — 가짜 썸네일로 채우지 않는다.
export function VideoPreviewSection() {
  const [videos, setVideos] = useState<CmsVideo[] | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVideos().then((data) => {
      if (!cancelled) setVideos(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!videos || videos.length === 0) return null;

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          Video
        </p>
        <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
          영상으로 보는 이슈
        </h2>
      </header>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 280px))',
          justifyContent: 'start',
          gap: 'clamp(10px, 2vw, 16px)',
        }}
      >
        {videos.map((v) => {
          const videoId = extractYouTubeId(v.video_url);
          const thumb = v.thumbnail_url || (videoId ? youtubeThumbnailUrl(videoId) : null);
          const isPlaying = playingId === v.id;
          const cardStyle = {
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
            border: '1px solid rgba(0,0,0,0.06)',
            overflow: 'hidden' as const,
          };
          return (
            <article key={v.id} style={cardStyle}>
              <div className="aspect-video relative overflow-hidden" style={{ background: '#111827' }}>
                {isPlaying && videoId ? (
                  <iframe
                    src={youtubeEmbedUrl(videoId)}
                    title={v.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlayingId(v.id)}
                    className="w-full h-full flex items-center justify-center group"
                    aria-label={`${v.title} 재생`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
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
                      style={{ background: 'rgba(0,0,0,0.15)' }}
                    >
                      <span
                        className="flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.92)' }}
                      >
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="#111827">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </button>
                )}
              </div>
              <div style={{ padding: 'clamp(10px, 2.2vw, 14px)' }}>
                <h3
                  className="font-medium text-gray-900"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 14.5,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    marginBottom: 6,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {v.title}
                </h3>
                {v.excerpt && (
                  <p
                    className="text-gray-500"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.55,
                      marginBottom: 6,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {v.excerpt}
                  </p>
                )}
                {v.date && (
                  <p className="text-gray-400" style={{ fontSize: 11 }}>
                    {v.date.replaceAll('-', '.')}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
