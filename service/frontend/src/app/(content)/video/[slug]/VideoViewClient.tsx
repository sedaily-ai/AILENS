'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchVideoBySlug, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { resolveVideo, isDirectVideoUrl } from '@/shared/lib/videoEmbed';
import { useMediaProgress } from '@/shared/lib/tracking/useMediaProgress';

/**
 * 영상 상세(2026-08-11) — webtoon/[slug]/WebtoonViewClient.tsx와 같은
 * initialItem 패턴. 유튜브·네이버TV 둘 다 resolveVideo()로 임베드 URL을
 * 계산해 바로 재생되게 한다(이전엔 유튜브만 지원해 네이버TV 링크는
 * 재생 버튼을 눌러도 반응이 없던 버그가 있었다).
 */
export function VideoViewClient({
  slug,
  initialVideo = undefined,
  supplement,
}: {
  slug: string;
  initialVideo?: CmsVideo | null;
  /** 서버에서 만든 텍스트 보강 섹션(IssueContextSection) — 초기 HTML에 포함시키려고 서버 컴포넌트를 슬롯으로 받는다. */
  supplement?: ReactNode;
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

  // hooks는 아래 early return보다 위에서 무조건 불러야 한다(Rules of
  // Hooks) — video가 아직 null이어도 useMediaProgress 내부가 articleId
  // undefined를 안전하게 처리한다.
  const videoRef = useRef<HTMLVideoElement>(null);
  useMediaProgress(videoRef, video?.id, 'video');

  if (!slug || video === null) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('video')} frosted />
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
  const directVideoUrl = video && !resolved && isDirectVideoUrl(video.video_url) ? video.video_url : null;

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('video')} frosted />
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
            ) : directVideoUrl ? (
              // 2026-08-23 — 유튜브/네이버TV(resolveVideo)만 처리하던 분기라
              // mustknow_auto/frontpage_auto가 자체 렌더링해 S3에 올리는
              // mp4(video 채널 독립 글)는 이 페이지에서 못 틀고 있었다 —
              // 렌즈 4유형 페이지(AutoPlayVideo)는 이미 되는데 여기만
              // 안 됐던 것.
              <video ref={videoRef} controls preload="auto" src={directVideoUrl} className="w-full h-full" style={{ objectFit: 'contain' }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: '#9ca3af', fontSize: 13 }}>
                영상을 준비 중이에요.
              </div>
            )}
          </div>

          <div style={{ padding: '20px 4px 0' }}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>{kstDateTimeLabel(video.published_at) ?? video.date.replaceAll('-', '.')}</p>
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
              {displayHeadline(video.title)}
            </h1>
            {video.excerpt && (
              <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.65 }}>{video.excerpt}</p>
            )}
          </div>
          {supplement}
        </main>
      )}
    </div>
  );
}
