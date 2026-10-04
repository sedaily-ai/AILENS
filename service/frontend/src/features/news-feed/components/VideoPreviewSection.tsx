'use client';

import { useEffect, useRef, useState } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Image from 'next/image';
import { fetchVideos, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { VideoLightbox } from '@/shared/ui/VideoLightbox';
import { HandUnderline } from '@/shared/ui/HandUnderline';
import { VideoSketch } from '@/shared/ui/icons/VideoSketch';

// 영상 콘텐츠 섹션(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
// 여기 자동으로 뜬다. "매거진 고급짐" 톤(TrendingEconomySection과 동일 원칙)
// 을 그대로 따른다 — 이 섹션도 재미보다는 정보 콘텐츠라 톤을 맞췄다.
// 실제 영상이 하나도 없으면 섹션 자체를 숨긴다 — 가짜 썸네일로 채우지 않는다.
//
// 2026-08-07: 3열 그리드 + "채널로 이동" 헤더 링크로 리디자인(경제 매체
// 홈 화면의 유튜브 섹션 벤치마크 참고). AI LENS 공식 유튜브 채널이 아직
// 없어 CHANNEL_URL을 비워뒀다 — 채널이 생기면 이 값만 채우면 링크가
// 자동으로 나타난다(비어있으면 링크 자체가 렌더되지 않는다).

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
  const trackRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState({ prev: false, next: false });
  const updateNav = () => {
    const t = trackRef.current;
    if (t) setNav({ prev: t.scrollLeft > 4, next: t.scrollLeft + t.clientWidth < t.scrollWidth - 4 });
  };
  const scrollBy = (dir: 1 | -1) => trackRef.current?.scrollBy({ left: dir * (trackRef.current.clientWidth + 14) * 0.98, behavior: 'smooth' });

  useEffect(() => {
  // 서버가 이미 최신 4건을 HTML에 심어 보냈으면 브라우저에서 1000건짜리 전체 목록을 다시 받지 않는다(2026-10-03).
  // 이 섹션은 앞 4건만 그리는데, 마운트 직후 전체 목록(약 350KB)을 받아 같은 내용으로 바꿔 끼우느라 화면이 한 번 더 그려지고 네트워크만 썼다.
  // 새 글은 발행 때 서버가 캐시를 무효화(revalidate)해 HTML에 반영된다.
    if (initialVideos && initialVideos.length > 0) return;
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

  useEffect(() => {
    updateNav();
  }, [videos]);

  if (!videos || videos.length === 0) return null;

  const activeVideo = videos.find((v) => v.id === playingId) ?? null;

  // 홈은 최신 4개만 티저로 — 다른 홈 섹션들과 개수 통일(2026-08-11).
  // fetchVideos()가 /video 전용 목록 페이지를 위해 limit=100까지 받아오게
  // 바뀌면서(2026-08-11), 이 슬라이스가 없으면 홈에 영상이 전부 다 쌓여
  // 나오는 회귀가 있었다.

  return (
    <section>
      {/* NYT "Latest Shows" 구조(2026-10-04, 사용자 제안): 위 가는 선 + 담백한 굵은 구역 제목 → 카드마다 색이 다른 단색 면(왼쪽: 분류·큰 세리프 제목·재생 버튼, 오른쪽 절반: 기사 사진)
          4열, 오른쪽 아래 ‹ › 로 가로 넘김. 읽는 영역은 세로, 보는 영역은 가로로 훑게 해 구조부터 다르게 느껴지게 한다. 눌러서 모달로 재생하는 동작은 그대로. */}
      <header style={{ paddingTop: 2, marginBottom: 14, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(17px, 3.6vw, 20px)', fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>
          <VideoSketch className="w-12 h-10 -ml-1" />
          <HandUnderline>영상으로 보는 이슈</HandUnderline>
        </h2>
      </header>

      <style>{`
        .vs-track { display: grid; grid-auto-flow: column; grid-auto-columns: calc((100% - 3 * 14px) / 4); gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; scroll-behavior: smooth; }
        .vs-track::-webkit-scrollbar { display: none; }
        @media (max-width: 900px) { .vs-track { grid-auto-columns: calc((100% - 14px) / 2); } }
        @media (max-width: 520px) { .vs-track { grid-auto-columns: 86%; } }
        /* 2026-10-04 재디자인(사용자: "글이 많고 트렌디하지 않다") — 숏폼(쇼츠·릴스) 문법: 세로 카드, 사진이 꽉 차게, 글은 아래 두 줄과 작은 태그만, 재생 표시는 유리 질감 원. */
        .vs-card { position: relative; display: block; aspect-ratio: 3 / 4; scroll-snap-align: start; border: none; padding: 0; text-align: left; cursor: pointer; border-radius: 16px; overflow: hidden; color: #fff; background: #1f2937; transition: transform .25s cubic-bezier(.22,.8,.22,1), box-shadow .25s ease; }
        .vs-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -14px rgba(17,24,39,.5); }
        .vs-card:active { transform: scale(.985); }
        .vs-photo { position: absolute; inset: 0; }
        .vs-photo img { transition: transform .6s cubic-bezier(.22,.8,.22,1); }
        .vs-card:hover .vs-photo img { transform: scale(1.06); }
        .vs-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,12,18,.82) 0%, rgba(10,12,18,.38) 38%, rgba(10,12,18,0) 62%), linear-gradient(to bottom, rgba(10,12,18,.28), rgba(10,12,18,0) 26%); }
        .vs-tag { position: absolute; top: 12px; left: 12px; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.2); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.28); }
        .vs-play { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.2); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.28); display: flex; align-items: center; justify-content: center; transition: background .2s ease, transform .2s ease; }
        .vs-card:hover .vs-play { background: #fff; transform: scale(1.1); }
        .vs-card:hover .vs-play svg { fill: #111827; }
        .vs-title { position: absolute; left: 14px; right: 14px; bottom: 14px; margin: 0; font-size: 16.5px; font-weight: 800; line-height: 1.34; letter-spacing: -0.025em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: keep-all; text-wrap: pretty; text-shadow: 0 1px 8px rgba(0,0,0,.35); }
        .vs-nav { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
        .vs-nav button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #d1d5db; background: #fff; color: #111827; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s ease, opacity .15s ease; }
        .vs-nav button:hover:not(:disabled) { background: #f3f4f6; }
        .vs-nav button:disabled { opacity: .35; cursor: default; }
        @media (prefers-reduced-motion: reduce) { .vs-card, .vs-photo img, .vs-play, .vs-track { transition: none; scroll-behavior: auto; } .vs-card:hover, .vs-card:active { transform: none; } }
      `}</style>
      {(() => {
        const poster = (v: CmsVideo) => v.poster_url || v.thumbnail_url || resolveVideo(v.video_url)?.autoThumbnailUrl || null;
        const tag = (v: CmsVideo) => (/^\s*(증권|증시|시그널|부동산|경제|금융|산업|정치|사회|국제|세계|문화|생활)\s*[|｜-]/.exec(v.title)?.[1]) ?? '영상';
        return (
          <>
            <div className="vs-track" ref={trackRef} onScroll={updateNav}>
              {videos.slice(0, 8).map((v) => {
                const p = poster(v);
                return (
                  <button key={v.id} type="button" className="vs-card" onClick={() => setPlayingId(v.id)} aria-label={`${v.title} 재생`}>
                    {p && (
                      <span className="vs-photo">
                        <Image src={p} alt="" fill sizes="(min-width: 900px) 24vw, 46vw" style={{ objectFit: 'cover' }} />
                      </span>
                    )}
                    <span className="vs-shade" aria-hidden />
                    <span className="vs-tag">{tag(v)}</span>
                    <span className="vs-play" aria-hidden>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                    <span className="vs-title">{displayHeadline(v.title)}</span>
                  </button>
                );
              })}
            </div>
            {(nav.prev || nav.next) && (
            <div className="vs-nav">
              <button type="button" aria-label="이전 영상" disabled={!nav.prev} onClick={() => scrollBy(-1)}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" aria-label="다음 영상" disabled={!nav.next} onClick={() => scrollBy(1)}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
            )}
          </>
        );
      })()}

      {activeVideo && (
        <VideoLightbox video={activeVideo} onClose={() => setPlayingId(null)} />
      )}
    </section>
  );
}
