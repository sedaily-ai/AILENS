'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchWebtoonBySlug, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';

/**
 * 경로 기반(`/webtoon/[slug]`) 웹툰 상세의 클라이언트 본체(2026-08-07, 쿼리스트링
 * `?id=`에서 전환). 세로 스크롤 하나로 컷을 이어 보여주는 게 전부라 레터
 * 상세보다 훨씬 단순하다.
 *
 * initialWebtoon은 서버(빌드타임)에서 findWebtoon()으로 이미 가져온 값 —
 * SSG 결과물 HTML에 실제 컷·캡션이 바로 박히게(크롤러가 JS 없이도 볼 수 있게)
 * 초기 상태를 이걸로 채운다. letters 쪽과 달리 이 컴포넌트엔 애초에 mount를
 * 기다리는 게이트가 없어서 initialWebtoon만 내려주면 바로 반영된다.
 *
 * 디자인 리뉴얼 4차(2026-08-11, 전면 재설계) — "웹툰 탭에 들어오면 진짜
 * 만화방에 온 것 같았으면" 요청으로 목록 페이지(WebtoonListClient.tsx)와
 * 함께 어두운 톤으로 전면 재설계. 컷 자체는 여전히 꽉 차게 이어붙이되(웹툰
 * 리더 관행 유지), 그 사이 캡션을 조명 받은 필름 캡션처럼 다듬고 배경을
 * 거의 검정에 가깝게 낮춰 컷 이미지에 시선이 집중되게 했다.
 */
export function WebtoonViewClient({
  slug,
  initialWebtoon = undefined,
  episodeLabel,
  nextEpisode,
  prevEpisode,
}: {
  slug: string;
  initialWebtoon?: CmsWebtoon | null;
  episodeLabel?: string;
  nextEpisode?: CmsWebtoon | null;
  prevEpisode?: CmsWebtoon | null;
}) {
  const [webtoon, setWebtoon] = useState<CmsWebtoon | null | undefined>(initialWebtoon);

  useEffect(() => {
    if (!slug || initialWebtoon) return; // 빌드타임에 이미 찾았으면 재조회 불필요.
    let cancelled = false;
    fetchWebtoonBySlug(slug).then((w) => {
      if (!cancelled) setWebtoon(w);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialWebtoon]);

  if (!slug || webtoon === null) {
    return (
      <div className="min-h-screen" style={{ background: '#0b0b0d' }}>
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#71717a' }}>
          <p>웹툰을 찾을 수 없어요.</p>
          <Link
            href="/webtoon"
            className="mt-4 inline-block text-sm underline underline-offset-4"
            style={{ color: '#a1a1aa' }}
          >
            웹툰 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0d' }}>
      {/* 필름 그레인 — 목록 페이지와 동일한 질감(2026-08-11). */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          pointerEvents: 'none',
          opacity: 0.05,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: 'rgba(11,11,13,0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Link
          href="/webtoon"
          aria-label="웹툰 목록으로"
          style={{ fontSize: 18, color: '#f4f4f5', textDecoration: 'none', lineHeight: 1, flexShrink: 0 }}
        >
          ←
        </Link>
        {episodeLabel && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 10.5,
              fontWeight: 800,
              color: '#111827',
              background: '#fde047',
              padding: '3px 8px',
              borderRadius: 999,
              boxShadow: '0 0 14px rgba(253,224,71,0.4)',
            }}
          >
            {episodeLabel}
          </span>
        )}
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#f4f4f5', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {webtoon ? webtoon.title : ''}
        </p>
      </div>

      {webtoon === undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 640, margin: '0 auto' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '3 / 4', background: '#18181b' }} />
          ))}
        </div>
      )}

      {webtoon && (
        <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 60 }}>
          <div style={{ padding: '28px 20px 18px', textAlign: 'center' }}>
            <span
              className="inline-flex items-center"
              style={{
                gap: 6,
                color: '#fde047',
                border: '1px solid rgba(253,224,71,0.4)',
                background: 'rgba(253,224,71,0.08)',
                boxShadow: '0 0 18px rgba(253,224,71,0.15)',
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: '0.06em',
                padding: '4px 10px',
                borderRadius: 999,
                marginBottom: 14,
              }}
            >
              ✦ WEBTOON PILOT
            </span>
            <p style={{ fontSize: 11, color: '#71717a', marginBottom: 6, fontWeight: 600 }}>{webtoon.date.replaceAll('-', '.')}</p>
            <h1
              style={{
                fontSize: 'clamp(22px, 5vw, 28px)',
                fontWeight: 800,
                color: '#f4f4f5',
                marginBottom: 8,
                letterSpacing: '-0.02em',
              }}
            >
              {webtoon.title}
            </h1>
            {webtoon.excerpt && (
              <p style={{ fontSize: 13.5, color: '#a1a1aa', lineHeight: 1.65, maxWidth: 480, margin: '0 auto' }}>{webtoon.excerpt}</p>
            )}
          </div>

          {webtoon.panels.length === 0 && (
            <p style={{ fontSize: 14, color: '#71717a', padding: '40px 20px', textAlign: 'center' }}>
              아직 컷이 준비되지 않았어요.
            </p>
          )}

          {/* 컷을 위에서 아래로 쭉 이어붙인다 — 세로 스크롤 하나로 읽는 웹툰 UX.
              어두운 배경 위에 컷만 도드라지게, 캡션은 조명 받은 필름 캡션처럼. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {webtoon.panels.map((p, i) => (
              <div key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가 */}
                <img src={p.url} alt={`${webtoon.title} 컷 ${i + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
                {p.caption && (
                  <p
                    style={{
                      margin: 0,
                      padding: '16px 22px 16px 26px',
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 14.5,
                      lineHeight: 1.75,
                      color: '#d4d4d8',
                      background: '#18181b',
                      borderLeft: '3px solid #fde047',
                    }}
                  >
                    {p.caption}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {nextEpisode ? (
              <Link
                href={`/webtoon/${encodeURIComponent(nextEpisode.id)}`}
                prefetch
                className="group"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', textDecoration: 'none', background: '#111114' }}
              >
                {nextEpisode.cover_image_url && (
                  <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(253,224,71,0.4)' }}>
                    <Image src={nextEpisode.cover_image_url} alt={nextEpisode.title} width={56} height={56} className="transition-transform duration-300 group-hover:scale-[1.06]" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#71717a', letterSpacing: '0.04em', marginBottom: 2 }}>다음 화</p>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#f4f4f5',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {nextEpisode.title}
                  </p>
                </div>
                <span style={{ fontSize: 18, color: '#fde047', flexShrink: 0 }}>→</span>
              </Link>
            ) : (
              <div style={{ padding: '20px 20px', textAlign: 'center', background: '#111114' }}>
                <p style={{ fontSize: 13, color: '#71717a', marginBottom: 12 }}>최신 화까지 다 보셨어요.</p>
                <Link
                  href="/webtoon"
                  style={{
                    display: 'inline-block',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#111827',
                    background: '#fde047',
                    padding: '8px 18px',
                    borderRadius: 999,
                    textDecoration: 'none',
                    boxShadow: '0 0 18px rgba(253,224,71,0.4)',
                  }}
                >
                  전체 목록 보기
                </Link>
              </div>
            )}
            {prevEpisode && (
              <Link
                href={`/webtoon/${encodeURIComponent(prevEpisode.id)}`}
                prefetch
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#71717a',
                  textDecoration: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  background: '#0b0b0d',
                }}
              >
                ← 이전 화: {prevEpisode.title}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
