'use client';

import { useEffect, useMemo, useState } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import Image from 'next/image';
import { fetchVideos, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { VideoLightbox } from '@/shared/ui/VideoLightbox';

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

// 2026-08-20엔 lens("4가지 시선") 글의 영상 서브포맷을 buildLensVideoItems로
// 이 섹션에 섞어 넣었다. 2026-08-23 — mustknow_auto/frontpage_auto가 이제
// 영상 생성 시 video 채널에도 독립 글을 같이 쓰도록 바뀌면서(웹툰과 같은
// 이유·같은 패턴, WebtoonPreviewSection.tsx 참조), fetchVideos() 하나만으로
// 전부 커버된다 — lens에서 파생해서 섞으면 중복 표시된다. 과거 lens 글도
// 백필 스크립트로 video 채널 글을 만들어뒀다.
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

      {/* 2×2로 확대(2026-08-20, 사용자 요청 — "영상은 좀 더 진지하게 보는
          콘텐츠니까 카드를 키우자"). 예전엔 웹툰과 그리드 폭을 맞추려고
          4열이었는데, 카드 전체가 클릭 영역이 되면서(아래 참조) 작은
          카드에서는 시네마틱한 톤이 잘 안 살아서 2열로 확 키웠다. */}
      <div
        className="grid grid-cols-2"
        style={{
          gap: 'clamp(12px, 2.4vw, 20px)',
        }}
      >
        {shown.map((v) => {
          const resolved = resolveVideo(v.video_url);
          const thumb = v.thumbnail_url || resolved?.autoThumbnailUrl || null;
          return (
            <article
              key={v.id}
              className="group"
              style={{
                borderRadius: 12,
                background: '#000',
                boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 3px 10px rgba(17,24,39,0.05)',
                overflow: 'hidden',
                transition: 'transform .2s ease, box-shadow .2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(17,24,39,0.22)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.04), 0 3px 10px rgba(17,24,39,0.05)';
              }}
            >
              {/* 재디자인(2026-08-20) — 카드 전체가 클릭 영역(사용자 요청:
                  "재생버튼만 말고 카드 누르면 전부 모달 뜨게"). 상세 페이지로
                  리다이렉트하는 대신 항상 모달로 크게 재생 — 그래서 이제
                  <Link>가 아니라 <button> 하나가 카드 전체를 덮는다.
                  시네마틱 톤: 가장자리를 살짝 어둡게 죽이는 비네트, 호버 시
                  글래스모피즘 재생 버튼이 페이드인, 카드가 커진 만큼 제목도
                  키움. */}
              <button
                type="button"
                onClick={() => setPlayingId(v.id)}
                className="relative block w-full text-left"
                aria-label={`${v.title} 재생`}
              >
                <div className="aspect-video relative overflow-hidden" style={{ background: '#111827' }}>
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 45vw, 50vw"
                      className="transition-transform duration-500 group-hover:scale-[1.05]"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="w-full h-full" style={{ background: '#1f2937' }} />
                  )}

                  {/* 비네트 — 가장자리를 살짝 어둡게 죽여서 시네마틱한 톤. */}
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: 'radial-gradient(120% 130% at 50% 42%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* "영상" 배지 — 이 카드가 재생 가능한 영상이라는 걸 스캔만으로
                      알 수 있게(웹툰 섹션의 배지 패턴과 통일). */}
                  <span
                    aria-hidden
                    className="absolute"
                    style={{
                      top: 10,
                      left: 10,
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#fff',
                      background: 'rgba(17,24,39,0.55)',
                      padding: '4px 9px',
                      borderRadius: 999,
                      letterSpacing: '0.02em',
                      pointerEvents: 'none',
                    }}
                  >
                    영상
                  </span>

                  {/* 가운데 재생 아이콘 — 평소엔 숨겨두고 호버 때만 은은하게
                      뜬다(글래스모피즘, 촌스러운 고정 글로우 링 대신). */}
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ pointerEvents: 'none' }}
                  >
                    <span
                      className="flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                      style={{
                        width: 'clamp(44px, 8vw, 60px)',
                        height: 'clamp(44px, 8vw, 60px)',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.14)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        border: '1px solid rgba(255,255,255,0.4)',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                      }}
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>

                  {/* 하단 그라데이션 스크림 + 제목 오버레이. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: '58%',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0" style={{ padding: 'clamp(14px, 2.6vw, 20px)' }}>
                    <h3
                      className="font-bold text-white"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 'clamp(16px, 2.2vw, 20px)',
                        lineHeight: 1.35,
                        letterSpacing: '-0.015em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {displayHeadline(v.title)}
                    </h3>
                  </div>
                </div>
              </button>
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
