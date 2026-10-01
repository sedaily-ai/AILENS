'use client';

import { useEffect, useState } from 'react';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { requestPlayHomePlayerItem } from '@/shared/lib/audioPlayerBus';
import { ListPagination } from '@/shared/ui/ListPagination';
import { usePageSizePagination } from '@/shared/hooks/usePageSizePagination';
import { LISTEN_PAGE_SIZE } from './listenListShared';

const PAGE_SIZE_OPTIONS = [30, 60, 120];

// 홈 오디오 섹션(AudioPreviewSection.tsx)과 캐릭터·재생버튼 시각 언어를
// 통일(2026-08-21, 우선순위 4번 — "/listen 목록 페이지와 시각적 일관성을
// 맞출지는 아직 안 건드림"). 레이아웃 자체(세로 카드 vs 가로 리스트 행)는
// 이 페이지의 목적(빠르게 훑는 목록)에 맞게 그대로 두고, 행마다 있던
// 범용 헤드폰/재생 아이콘 원을 캐릭터 아바타 + 재생 버튼 배지로 교체해
// "어디서 봐도 같은 것"이라는 인상을 준다. 재생 버튼은 홈 카드와 같은
// 이벤트버스(requestPlayHomePlayerItem)로 하단 플레이어를 바로 재생.
const NEUTRAL_ACCENT = '#3b82f6';

// 오디오 전용 목록 페이지(2026-08-21) — /video 목록 페이지와 같은 이유로
// 신설: 홈 하단 미니 플레이어(TodayNewsPlayer.tsx)에만 있던 재생목록이
// 고유 URL이 없어 검색엔진에 전혀 안 걸렸다. 홈 위젯은 admin이 "제목 +
// 링크"로 채우는 home_player 채널을 그대로 쓰지만, thumbnail 필드가 없어
// (해당 콘텐츠 자체가 순수 오디오/짧은 영상이라) 웹툰·영상 목록과 달리
// 텍스트 위주 리스트로 구성한다.
// 페이지네이션 추가(2026-08-28) — fetchHomePlayerPosts()의 limit이
// 100→1000으로 올라가며(homePlayerApi.ts 참조) 캡이 사실상 없어졌다.
// 이 페이지엔 원래 페이지네이션이 아예 없어서, 발행량이 늘수록 목록이
// 한없이 길어지는 문제가 생겨 /lens/page/[n]과 같은 경로 세그먼트
// 패턴을 붙인다.
export function ListenListClient({
  initialItems,
  initialPage,
}: {
  initialItems: HomePlayerPost[];
  initialPage: number;
}) {
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

  const {
    pageItems, currentPage, totalPages, pageHref, isCustomSize, pageSize, onPageChange, onPageSizeChange,
  } = usePageSizePagination(items, LISTEN_PAGE_SIZE, '/listen', initialPage);

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
            {pageItems.map((it, i) => {
              const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
              const p = lensPerspectiveAt(i);
              return (
                <Link
                  key={it.id}
                  href={`/listen/${encodeURIComponent(it.id)}`}
                  prefetch
                  className="group flex items-center hover:bg-gray-50 transition-colors"
                  style={{ gap: 14, padding: '16px 8px', borderRadius: 10, textDecoration: 'none', borderBottom: '1px solid #f1f1f0' }}
                >
                  <span className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
                    <span
                      className="flex items-center justify-center"
                      style={{ width: 44, height: 44, borderRadius: '50%', background: '#f3f4f6', overflow: 'hidden' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, AudioPreviewSection.tsx와 동일 패턴 */}
                      <img
                        src={p.illustration}
                        alt=""
                        width={44}
                        height={44}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                      />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="재생"
                      className="absolute flex items-center justify-center"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: NEUTRAL_ACCENT,
                        border: '2px solid #fff',
                        bottom: -4,
                        right: -4,
                        boxShadow: `0 2px 6px ${NEUTRAL_ACCENT}66`,
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        requestPlayHomePlayerItem(it.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          requestPlayHomePlayerItem(it.id);
                        }
                      }}
                    >
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1.5 }}>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
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
                      {displayHeadline(it.title)}
                    </span>
                    {it.date && (
                      <span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginTop: 3, fontWeight: 600 }}>
                        {kstDateTimeLabel(it.publishedAt) ?? it.date.replaceAll('-', '.')} · {it.category ?? (isAudio ? '팟캐스트' : '영상')}
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

        {items.length > 0 && (
          <ListPagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageHref={pageHref}
            isCustomSize={isCustomSize}
            onPageChange={onPageChange}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={onPageSizeChange}
            accentColor={NEUTRAL_ACCENT}
            totalCount={items.length}
          />
        )}
      </main>
    </div>
  );
}
