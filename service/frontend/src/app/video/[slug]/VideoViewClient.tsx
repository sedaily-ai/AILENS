'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchVideoBySlug, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';

/**
 * 영상 상세(2026-08-11) — webtoon/[slug]/WebtoonViewClient.tsx와 같은
 * initialItem 패턴. 유튜브·네이버TV 둘 다 resolveVideo()로 임베드 URL을
 * 계산해 바로 재생되게 한다(이전엔 유튜브만 지원해 네이버TV 링크는
 * 재생 버튼을 눌러도 반응이 없던 버그가 있었다).
 */
export function VideoViewClient({
  slug,
  initialVideo = undefined,
}: {
  slug: string;
  initialVideo?: CmsVideo | null;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [video, setVideo] = useState<CmsVideo | null | undefined>(initialVideo);

  useEffect(() => {
    if (!slug || initialVideo) return;
    let cancelled = false;
    fetchVideoBySlug(slug).then((v) => {
      if (!cancelled) setVideo(v);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialVideo]);

  if (!slug || video === null) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
        <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center text-neutral-500">
          <p>영상을 찾을 수 없어요.</p>
          <Link href="/video" className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-neutral-900">
            영상 목록으로
          </Link>
        </div>
      </div>
    );
  }

  const resolved = video ? resolveVideo(video.video_url) : null;

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {video === undefined && (
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 20px' }}>
          <div style={{ aspectRatio: '16 / 9', background: '#f3f4f6', borderRadius: 12 }} />
        </div>
      )}

      {video && (
        <main style={{ maxWidth: 780, margin: '0 auto', padding: 'clamp(24px, 5vw, 40px) clamp(20px, 5vw, 32px) 80px' }}>
          <Link
            href="/video"
            className="text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 600, display: 'inline-block', marginBottom: 16 }}
          >
            ← 영상 목록으로
          </Link>

          <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 12, background: '#111827' }}>
            {resolved ? (
              <iframe
                src={resolved.embedUrl}
                title={video.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: '#9ca3af', fontSize: 13 }}>
                영상을 준비 중이에요.
              </div>
            )}
          </div>

          <div style={{ padding: '20px 4px 0' }}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>{video.date.replaceAll('-', '.')}</p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(20px, 4vw, 25px)',
                fontWeight: 700,
                color: '#111827',
                marginBottom: 10,
                letterSpacing: '-0.01em',
                lineHeight: 1.35,
              }}
            >
              {video.title}
            </h1>
            {video.excerpt && (
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65 }}>{video.excerpt}</p>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
