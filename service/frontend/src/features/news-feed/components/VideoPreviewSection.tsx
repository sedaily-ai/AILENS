'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchVideos, type CmsVideo, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { buildLensVideoItems, mergeByDateDesc } from '@/shared/lib/lensMediaFeed';

// lens 영상은 YouTube/네이버TV 임베드가 아니라 S3에 올린 mp4 원본 파일이라
// resolveVideo()가 못 알아본다(둘 다 URL 패턴 기반 판별). iframe 대신 그냥
// <video> 태그로 재생 — 직접 파일 URL 전반에 쓸 수 있는 범용 분기(2026-08-20).
const DIRECT_FILE_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

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
  // lens("4가지 시선")의 영상 서브포맷도 이 섹션에 섞는다(2026-08-20, 사용자
  // 요청 — shared/lib/lensMediaFeed.ts 참조). video 채널 발행이 뜸해져도
  // 이 섹션이 계속 쌓이도록.
  initialLensPosts?: CmsLens[];
}

export function VideoPreviewSection({ initialVideos, initialLensPosts }: Props) {
  const [channelVideos, setChannelVideos] = useState<CmsVideo[] | null>(initialVideos ?? null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVideos().then((data) => {
      if (!cancelled) setChannelVideos(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const videos = useMemo(() => {
    if (channelVideos === null) return null;
    const lensVideos = buildLensVideoItems(initialLensPosts ?? []);
    return mergeByDateDesc(channelVideos, lensVideos);
  }, [channelVideos, initialLensPosts]);

  // 재생을 카드 안(작은 16:9)이 아니라 모달로 키운다(2026-08-20, 사용자
  // 피드백: "여기서 플레이 되면 좀 작아 보이잖아요, 모달로 커지면 안
  // 되냐"). ArchiveCalendarModal.tsx와 같은 관례(fixed inset-0 flex
  // items-center justify-center, 배경 클릭·Esc로 닫기)를 그대로 따른다.
  useEffect(() => {
    if (!playingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [playingId]);

  if (!videos || videos.length === 0) return null;

  const activeVideo = videos.find((v) => v.id === playingId) ?? null;

  // 홈은 최신 4개만 티저로 — 다른 홈 섹션들과 개수 통일(2026-08-11).
  // fetchVideos()가 /video 전용 목록 페이지를 위해 limit=100까지 받아오게
  // 바뀌면서(2026-08-11), 이 슬라이스가 없으면 홈에 영상이 전부 다 쌓여
  // 나오는 회귀가 있었다.
  const shown = videos.slice(0, 4);

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
            영상
          </p>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            영상으로 보는 이슈
          </h2>
        </div>
        <div className="flex items-center flex-shrink-0" style={{ gap: 14 }}>
          {/* "더보기" — 전용 /video 목록으로(2026-08-11, 영상마다 검색엔진이
              찾을 수 있는 URL이 없던 문제로 /video, /video/[id] 신설하며 함께
              변경 — 예전엔 /letters 아카이브로 보냈었다). CHANNEL_URL(실제
              유튜브 채널)과는 별개다, 채널이 생겨도 이건 유지. */}
          <Link
            href="/video"
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

      {/* 모바일 2열·데스크톱 4열 고정(2026-08-12) — FollowingFeed·TrendingEconomySection과
          같은 이유로 auto-fill(minmax 210px)을 걷어냈다: 실제 모바일 폭에서는
          아예 1열로만 잡히던 문제(210px×2가 모바일 콘텐츠 폭보다 큼)가 있었다
          — 웹툰 섹션과 그리드 통일. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{
          gap: 'clamp(10px, 2vw, 16px)',
        }}
      >
        {shown.map((v) => {
          const resolved = resolveVideo(v.video_url);
          const thumb = v.thumbnail_url || resolved?.autoThumbnailUrl || null;
          const href = v.href ?? `/video/${encodeURIComponent(v.id)}`;
          return (
            <article
              key={v.id}
              className="group"
              style={{
                borderRadius: 10,
                background: '#fff',
                boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 3px 10px rgba(17,24,39,0.05)',
                border: '1px solid rgba(0,0,0,0.06)',
                overflow: 'hidden',
                transition: 'transform .18s ease, box-shadow .18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 22px rgba(17,24,39,0.14)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.04), 0 3px 10px rgba(17,24,39,0.05)';
              }}
            >
              {/* 재디자인(2026-08-20) — 예전엔 썸네일+재생버튼, 그 아래 회색
                  캡션 한 줄이 전부라 "재밌는 콘텐츠"치고 너무 밋밋하다는
                  피드백. 유튜브/넷플릭스류 카드처럼 제목을 썸네일 위에
                  그라데이션 스크림과 함께 얹는다. 재생 버튼은 화면 가운데를
                  가리는 큰 글로우 링(촌스럽다는 피드백) 대신 우상단의 작은
                  플랫 아이콘으로 — 클릭하면 카드 안(16:9라 작아 보인다는
                  지적)이 아니라 모달로 크게 재생한다(아래 참조). 제목(하단
                  스트립)과 재생 버튼(전체 영역)이 각자 독립된 클릭 영역이라
                  <button> 안에 <Link>를 중첩하지 않는다(접근성) — 형제
                  요소로 겹쳐 쌓고 제목 스트립만 자기 영역에서 클릭을
                  가로챈다. */}
              <div className="aspect-video relative overflow-hidden" style={{ background: '#111827' }}>
                <button
                  type="button"
                  onClick={() => setPlayingId(v.id)}
                  className="absolute inset-0 w-full h-full flex items-center justify-center"
                  aria-label={`${v.title} 재생`}
                >
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 25vw, 50vw"
                      className="transition-transform duration-300 group-hover:scale-[1.06]"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full" style={{ background: '#1f2937' }} />
                  )}
                  <span
                    aria-hidden
                    className="absolute flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      top: 8,
                      right: 8,
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'rgba(17,24,39,0.55)',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                    }}
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1.5 }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>

                {/* "영상" 배지 — 이 카드가 재생 가능한 영상이라는 걸 스캔만으로
                    알 수 있게(웹툰 섹션의 배지 패턴과 통일). */}
                <span
                  aria-hidden
                  className="absolute"
                  style={{
                    top: 8,
                    left: 8,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: '#fff',
                    background: 'rgba(17,24,39,0.55)',
                    padding: '3px 8px',
                    borderRadius: 999,
                    letterSpacing: '0.02em',
                    pointerEvents: 'none',
                  }}
                >
                  영상
                </span>

                {/* 하단 그라데이션 스크림 + 제목 오버레이. 스크림은 장식이라
                    클릭을 안 가로채고(pointerEvents:none), 제목 Link만 자기
                    영역(하단 스트립)에서 클릭을 받는다. */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: '62%',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0) 100%)',
                    pointerEvents: 'none',
                  }}
                />
                <Link
                  href={href}
                  prefetch
                  className="absolute inset-x-0 bottom-0 hover:opacity-80 transition-opacity"
                  style={{ padding: 'clamp(10px, 2vw, 14px)', textDecoration: 'none' }}
                >
                  <h3
                    className="font-bold text-white"
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 14.5,
                      lineHeight: 1.4,
                      letterSpacing: '-0.01em',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {v.title}
                  </h3>
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {activeVideo && (
        <VideoLightbox video={activeVideo} onClose={() => setPlayingId(null)} />
      )}
    </section>
  );
}

/** 재생 모달 — ArchiveCalendarModal.tsx와 같은 관례(fixed inset-0 flex
 *  items-center justify-center, 배경 클릭으로 닫기, transform 정렬 안 씀).
 *  영상 콘텐츠라 배경은 카드보다 더 어둡게(black/80). */
function VideoLightbox({ video, onClose }: { video: CmsVideo; onClose: () => void }) {
  const resolved = resolveVideo(video.video_url);
  const isDirectFile = !resolved && DIRECT_FILE_RE.test(video.video_url);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      style={{ padding: 'clamp(16px, 4vw, 40px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full"
        style={{ maxWidth: 960 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ top: -44, right: 0, width: 36, height: 36, borderRadius: '50%', color: '#fff' }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="aspect-video w-full overflow-hidden" style={{ borderRadius: 12, background: '#000' }}>
          {resolved ? (
            <iframe
              src={resolved.embedUrl}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : isDirectFile ? (
            <video src={video.video_url} controls autoPlay className="w-full h-full" style={{ objectFit: 'contain' }} />
          ) : null}
        </div>
        <p
          className="text-white"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 16, fontWeight: 700, marginTop: 14, lineHeight: 1.45 }}
        >
          {video.title}
        </p>
      </div>
    </div>
  );
}
