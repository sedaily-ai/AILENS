'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/cmsPostsApi';

// 연재 웹툰 파일럿(2026-08-06) — 이슈를 텍스트 레터가 아니라 컷(이미지+캡션)
// 나열로 보여준다. 그림은 admin에서 GPT 등으로 미리 만들어 올린다. 우선
// 딱 하나의 핫이슈로 소량 시도해 반응을 보는 단계라 목록도 단순하게.
//
// initialItems는 서버(빌드타임)에서 이미 fetchWebtoons()로 가져온 값 —
// 목록 페이지의 정적 HTML이 빈 스켈레톤만 굽던 문제를 막는다(2026-08-07,
// letters/webtoon 상세 SSG 감사 중 발견 — 홈/목록 페이지 전수 조사).
export function WebtoonListClient({ initialItems }: { initialItems: CmsWebtoon[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<CmsWebtoon[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    fetchWebtoons().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('webtoon')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 24 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Webtoon · Pilot
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            웹툰
          </h1>
          <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>
            요즘 이슈를 컷으로 이어 보여드려요. 아직은 시범 연재예요.
          </p>
        </header>

        {items.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '60px 0', textAlign: 'center' }}>
            아직 연재된 편이 없어요. 곧 첫 편으로 찾아올게요.
          </p>
        )}

        {items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {items.map((w) => (
              <Link
                key={w.id}
                href={`/webtoon/${encodeURIComponent(w.id)}`}
                prefetch
                className="group"
                style={{
                  display: 'block',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid #f1f1f0',
                  textDecoration: 'none',
                  boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px rgba(17,24,39,0.05)',
                }}
              >
                {w.cover_image_url && (
                  <div style={{ aspectRatio: '16 / 9', overflow: 'hidden', background: '#f3f4f6' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      loading="lazy"
                      src={w.cover_image_url}
                      alt={w.title}
                      className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                )}
                <div style={{ padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{w.date}</p>
                  <h2
                    className="text-gray-900"
                    style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 17, fontWeight: 600, marginBottom: 4, letterSpacing: '-0.01em' }}
                  >
                    {w.title}
                  </h2>
                  {w.excerpt && (
                    <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{w.excerpt}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
