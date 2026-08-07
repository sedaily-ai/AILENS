'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchVideos, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { extractYouTubeId, youtubeThumbnailUrl, youtubeEmbedUrl } from '@/shared/lib/videoEmbed';

// 영상 콘텐츠 섹션(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
// 여기 자동으로 뜬다. "매거진 고급짐" 톤(TrendingEconomySection과 동일 원칙)
// 을 그대로 따른다 — 이 섹션도 재미보다는 정보 콘텐츠라 톤을 맞췄다.
// 실제 영상이 하나도 없으면 섹션 자체를 숨긴다 — 가짜 썸네일로 채우지 않는다.
//
// 2026-08-07: 3열 그리드 + "채널로 이동" 헤더 링크로 리디자인(경제 매체
// 홈 화면의 유튜브 섹션 벤치마크 참고). AI LENS 공식 유튜브 채널이 아직
// 없어 CHANNEL_URL을 비워뒀다 — 채널이 생기면 이 값만 채우면 링크가
// 자동으로 나타난다(비어있으면 링크 자체가 렌더되지 않는다).
const CHANNEL_URL = '';

interface Props {
  // 빌드타임(app/page.tsx)에 fetchVideos()로 미리 가져온 값 — 정적 HTML에
  // 실제 영상 목록이 바로 박히게 한다(2026-08-07, 홈 SSG 감사).
  initialVideos?: CmsVideo[];
}

export function VideoPreviewSection({ initialVideos }: Props) {
  const [videos, setVideos] = useState<CmsVideo[] | null>(initialVideos ?? null);
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
      <header
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Video
          </p>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            영상으로 보는 이슈
          </h2>
        </div>
        <div className="flex items-center flex-shrink-0" style={{ gap: 14 }}>
          {/* "더보기" — /letters 아카이브 '영상' 필터로. 다른 섹션들과 동일한
              패턴(2026-08-07, "영상 섹션도 더보기 있어야 할 듯" 피드백) —
              CHANNEL_URL(실제 유튜브 채널)과는 별개다, 채널이 생겨도 이건 유지. */}
          <Link
            href="/letters"
            className="text-gray-500 hover:text-gray-900"
            style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            더 보기
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          {CHANNEL_URL && (
            <a
              href={CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-900"
              style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              채널로 이동
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          )}
        </div>
      </header>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
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
              {/* 캡션은 썸네일 아래 중앙 정렬 — 요약문 없이 제목(최대 2줄)만
                  둬서 그리드가 촘촘한 영상 목록처럼 보이게 한다. */}
              <div style={{ padding: 'clamp(10px, 2.2vw, 14px)', textAlign: 'center' }}>
                <h3
                  className="font-medium text-gray-900"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 14,
                    lineHeight: 1.45,
                    letterSpacing: '-0.02em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {v.title}
                </h3>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
