'use client';

import { WebtoonSketch } from '@/shared/ui/icons/VideoSketch';
import { useState, type MouseEvent } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import Link from 'next/link';
import Image from 'next/image';
import { WebtoonWindIllustration } from '@/shared/ui/icons/HandDrawnIcons';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { useServerSeededList } from '@/shared/hooks/useServerSeededList';
import { WebtoonLightbox } from '@/shared/ui/media/WebtoonLightbox';

// 웹툰 홈 섹션 — 동일 크기 4장의 카드 그리드(두꺼운 테두리·하드 섀도·기울기).
// 팔레트는 저채도(ochre·dusty blue·brick·plum)와 조용한 라벨을 사용한다.
// 실제 발행분이 없는 자리는 "연필 스케치" 톤 목업으로 채운다. FALLBACK[0]은 실제 1화와 소재가 겹쳐 쓰지 않고 2~4화만 예고편으로 사용한다.
// 목업 카드는 상세가 없으므로 클릭되지 않게(article, Link 아님) 막는다.
const FALLBACK: CmsWebtoon[] = [
  {
    id: 'webtoon-mock-1',
    editor_id: 'AI LENS',
    title: '금통위, 문이 닫히다',
    excerpt: '회의실 문이 닫히자 여섯 명의 목소리가 갈렸다. "올린다"와 "지켜보자" 사이, 금리 인상의 첫 신호가 새어나온다.',
    date: '2026-08-06',
    cover_image_url: null,
    panels: [],
    is_cms: true,
  },
  {
    id: 'webtoon-mock-2',
    editor_id: 'AI LENS',
    title: '원화는 왜 웃었을까',
    excerpt: '연준의 동결 시그널에 원·달러 환율이 흔들린다. 시장은 벌써 다음 카드를 읽고 있었다.',
    date: '2026-08-07',
    cover_image_url: null,
    panels: [],
    is_cms: true,
  },
  {
    id: 'webtoon-mock-3',
    editor_id: 'AI LENS',
    title: '코스피, 6600을 넘던 날',
    excerpt: '외국인의 8거래일 연속 매수. 축포를 터뜨리는 사람들 뒤로, 밸류에이션을 걱정하는 한 사람이 서 있다.',
    date: '2026-08-08',
    cover_image_url: null,
    panels: [],
    is_cms: true,
  },
  {
    id: 'webtoon-mock-4',
    editor_id: 'AI LENS',
    title: '다음 화율을 정하는 사람들',
    excerpt: '숫자 하나로 갈리는 이해관계. 금리를 둘러싼 네 편의 이야기, 그 결론은 아직이다.',
    date: '2026-08-09',
    cover_image_url: null,
    panels: [],
    is_cms: true,
  },
];

// 카드마다 살짝 다른 기울기 — 인쇄물을 늘어놓은 듯한 코믹 진열대 느낌.
const TILTS = [-1.6, 1.2, -1, 1.8];
const SKETCH_ACCENT = '#a8a29e';

interface Props {
  // 빌드타임(app/page.tsx)에 fetchWebtoons()로 미리 가져온 값 — 정적 HTML에 실제 카드가 바로 포함되게 한다.
  initialItems?: CmsWebtoon[];
}

// 웹툰 카드는 fetchWebtoons() 하나로 구성한다. webtoon 채널에 독립 글이 발행되므로 lens 글에서 파생해 섞지 않는다(같은 기사가 중복 표시되기 때문).
export function WebtoonPreviewSection({ initialItems }: Props) {
  const items = useServerSeededList<CmsWebtoon[], null>(initialItems, null, fetchWebtoons);
  // 카드를 누르면 별도 뷰어 페이지 대신 가운데 모달로 미리 본다. 링크(href)는 남겨 검색엔진·새 탭·공유는 그대로 동작한다.
  const [openWebtoon, setOpenWebtoon] = useState<CmsWebtoon | null>(null);

  if (items === null) return null; // 로딩 중에는 자리를 차지하지 않는다(스켈레톤 미사용 방침).

  const neededMocks = Math.max(0, 4 - items.length);
  const mockFillers = FALLBACK.slice(FALLBACK.length - neededMocks);
  const cards = [...items, ...mockFillers].slice(0, 4);
  const hasMock = mockFillers.length > 0;

  // 배경 없는 일반 섹션으로 둔다. 본문 폭만 채우는 색 박스는 우측 사이드바(HotLettersRail)와 균형이 맞지 않아 사용하지 않는다.
  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header style={{ marginBottom: 18 }}>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <h2
            className="text-gray-900"
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(21px, 4.6vw, 25px)', fontWeight: 800, letterSpacing: '-0.02em' }}
          >
            <WebtoonSketch className="w-12 h-10 -ml-1" />
            이슈를 웹툰으로
          </h2>
        </div>
      </header>

      {hasMock && (
        <p style={{ fontSize: 11.5, color: '#8b85a8', marginBottom: 16, fontWeight: 600 }}>
          연필 스케치는 아직 구상 중인 편이에요 — 실제로 나오면 컬러 표지로 바뀌어요.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'clamp(16px, 2.6vw, 24px)', paddingTop: 6 }}>
        {cards.map((w, i) => {
          const mock = i >= items.length;
          const tilt = TILTS[i % TILTS.length];
          const cardStyle = {
            display: 'block' as const,
            borderRadius: 10,
            background: '#fff',
            border: `2.5px solid ${mock ? '#78716c' : '#111827'}`,
            boxShadow: `5px 5px 0 rgba(${mock ? '87,83,78' : '17,24,39'},0.85)`,
            overflow: 'visible' as const,
            textDecoration: 'none' as const,
            opacity: mock ? 0.92 : 1,
            transform: `rotate(${tilt}deg)`,
            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          };
          const cardInner = (
            <>
              <div className="relative overflow-hidden" style={{ aspectRatio: '3 / 2', borderRadius: '7px 7px 0 0' }}>
                {w.cover_image_url ? (
                  <Image
                    src={w.cover_image_url}
                    alt={w.title}
                    fill
                    sizes="(min-width: 640px) 25vw, 50vw"
                    className="transition-transform duration-300 group-hover:scale-[1.05]"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  // 연필 스케치 플레이스홀더 — 크림색 종이 + 옅고 성긴 해칭.
                  <div
                    className="flex items-center justify-center w-full h-full"
                    style={{
                      background: '#faf8f4',
                      backgroundImage:
                        'repeating-linear-gradient(108deg, rgba(120,113,108,0.1) 0px, rgba(120,113,108,0.1) 1px, transparent 1px, transparent 9px)',
                    }}
                  >
                    <WebtoonWindIllustration accent={SKETCH_ACCENT} className="w-2/3 h-2/3 opacity-80" />
                  </div>
                )}
              </div>

              <div style={{ padding: 'clamp(10px, 2.2vw, 14px)' }}>
                <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, fontWeight: 600 }}>
                  {mock ? '구상 중' : kstDateTimeLabel(w.published_at) ?? w.date.replaceAll('-', '.')}
                </p>
                <h3
                  className={mock ? 'text-gray-500' : 'text-gray-900'}
                  style={{
                    fontSize: 14.5,
                    fontWeight: 700,
                    lineHeight: 1.35,
                    letterSpacing: '-0.01em',
                    marginBottom: 6,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {displayHeadline(w.title)}
                </h3>
                {w.excerpt && (
                  <p
                    className="text-gray-500"
                    style={{
                      fontSize: 11.5,
                      lineHeight: 1.55,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {w.excerpt}
                  </p>
                )}
              </div>
            </>
          );
          const hoverProps = {
            onMouseEnter: (e: MouseEvent<HTMLElement>) => {
              e.currentTarget.style.transform = 'rotate(0deg) translate(-2px, -2px)';
              e.currentTarget.style.boxShadow = `6px 6px 0 rgba(${mock ? '169,164,155' : '28,25,23'},0.55)`;
            },
            onMouseLeave: (e: MouseEvent<HTMLElement>) => {
              e.currentTarget.style.transform = `rotate(${tilt}deg)`;
              e.currentTarget.style.boxShadow = `4px 4px 0 rgba(${mock ? '169,164,155' : '28,25,23'},0.55)`;
            },
          };
          return mock ? (
            <article key={w.id} className="relative" style={cardStyle} {...hoverProps}>
              {cardInner}
            </article>
          ) : (
            <Link
              key={w.id}
              href={w.href ?? `/webtoon/${encodeURIComponent(w.id)}`}
              prefetch={false}
              className="group relative"
              style={cardStyle}
              onClick={(e) => {
                // 새 탭·창 열기(Cmd/Ctrl/Shift/가운데 버튼)는 링크 그대로, 일반 클릭만 모달
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                setOpenWebtoon(w);
              }}
              {...hoverProps}
            >
              {cardInner}
            </Link>
          );
        })}
      </div>
      {openWebtoon && <WebtoonLightbox webtoon={openWebtoon} onClose={() => setOpenWebtoon(null)} />}
    </section>
  );
}
