'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';

// "오늘의 이슈, 4가지 시선" 홈 티저(2026-08-12) — 다른 섹션들이 전부 "카드
// 4개씩 나열"인 것과 의도적으로 다르게, 오늘의 이슈 딱 1건만 크게 보여준다
// ("다른 섹션은 4개씩 보여주는데 여기는 1개만 잘 보여줘야 하는 걸로" 요청).
// /lens 상세 페이지의 다크 카드뉴스 톤을 홈 안에서 미리 보여줘서 "여긴 다른
// 콘텐츠"라는 신호를 준다 — TrendingEconomySection처럼 목업으로 채우지 않고,
// VideoPreviewSection과 같은 원칙으로 실제 발행물이 없으면 섹션째 숨긴다.
const BG = '#1c1c1e';
const ACCENT = '#3b82f6';

export function LensPreviewSection() {
  const [items, setItems] = useState<CmsLens[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;
  const latest = items[0];

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <p
        className="text-gray-400"
        style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}
      >
        오늘의 이슈
      </p>

      <Link
        href={`/lens/${encodeURIComponent(latest.id)}`}
        prefetch
        className="group relative block"
        style={{
          display: 'block',
          borderRadius: 16,
          overflow: 'hidden',
          background: BG,
          boxShadow: '0 1px 2px rgba(17,24,39,0.06), 0 14px 40px rgba(17,24,39,0.16)',
          textDecoration: 'none',
        }}
      >
        <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#111114' }}>
          {latest.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- 원격 CMS 이미지, 다른 홈 섹션 카드와 같은 패턴
            <img
              src={latest.cover_image_url}
              alt={latest.headline}
              className="w-full h-full transition-transform duration-500 group-hover:scale-[1.03]"
              style={{ objectFit: 'cover' }}
            />
          ) : null}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: latest.cover_image_url
                ? 'linear-gradient(180deg, rgba(28,28,30,0) 30%, rgba(28,28,30,0.82) 72%, rgba(28,28,30,0.98) 100%)'
                : BG,
            }}
          />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(20px, 4vw, 32px)' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                color: '#fff',
                background: ACCENT,
                padding: '3px 9px',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              4가지 시선
            </span>
            <h2
              style={{
                color: '#fff',
                fontSize: 'clamp(19px, 3.8vw, 25px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.32,
                marginBottom: 10,
                textShadow: '0 2px 16px rgba(0,0,0,0.5)',
              }}
            >
              {latest.headline}
            </h2>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#93c5fd' }}>
              원인·사람·내 일·숫자, 네 갈래로 보기 →
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
