'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { ACCENT } from './accent';

// 오디오 전용 목록 페이지(2026-08-21) — /video 목록 페이지와 같은 이유로
// 신설: 홈 하단 미니 플레이어(TodayNewsPlayer.tsx)에만 있던 재생목록이
// 고유 URL이 없어 검색엔진에 전혀 안 걸렸다. 홈 위젯은 admin이 "제목 +
// 링크"로 채우는 home_player 채널을 그대로 쓰지만, thumbnail 필드가 없어
// (해당 콘텐츠 자체가 순수 오디오/짧은 영상이라) 웹툰·영상 목록과 달리
// 텍스트 위주 리스트로 구성한다.
export function ListenListClient({ initialItems }: { initialItems: HomePlayerPost[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<HomePlayerPost[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    fetchHomePlayerPosts().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('listen')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 780, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 24 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Listen
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            오늘의 뉴스를 귀로
          </h1>
          <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>
            오늘의 경제 이슈를 오디오로 정리해드려요.
          </p>
        </header>

        {items.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '60px 0', textAlign: 'center' }}>
            아직 올라온 오디오가 없어요. 곧 첫 편으로 찾아올게요.
          </p>
        )}

        {items.length > 0 && (
          <div>
            {items.map((it) => {
              const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
              return (
                <Link
                  key={it.id}
                  href={`/listen/${encodeURIComponent(it.id)}`}
                  prefetch
                  className="group flex items-center hover:bg-gray-50 transition-colors"
                  style={{ gap: 14, padding: '16px 8px', borderRadius: 10, textDecoration: 'none', borderBottom: '1px solid #f1f1f0' }}
                >
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', color: ACCENT }}
                  >
                    {isAudio ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 13a8 8 0 0 1 16 0" />
                        <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
                        <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                        <path d="M10 9.5 15 12l-5 2.5z" fill="currentColor" stroke="none" />
                      </svg>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-gray-900 group-hover:underline"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 15,
                        fontWeight: 600,
                        lineHeight: 1.45,
                        letterSpacing: '-0.01em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {it.title}
                    </span>
                    {it.date && (
                      <span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>
                        {it.date.replaceAll('-', '.')} · {it.category ?? (isAudio ? '팟캐스트' : '영상')}
                      </span>
                    )}
                  </span>

                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c0c5cc" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
