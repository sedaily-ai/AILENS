'use client';

import { WebtoonSketch } from '@/shared/ui/icons/VideoSketch';
import type { MouseEvent } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import Link from 'next/link';
import Image from 'next/image';
import { WebtoonWindIllustration } from '@/shared/ui/icons/HandDrawnIcons';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { useServerSeededList } from '@/shared/hooks/useServerSeededList';

// 홈 상단의 슬림 텍스트 배너로는 "실제 콘텐츠"처럼 안 느껴진다는 피드백
// (2026-08-06) — 4등분 카드 그리드(두꺼운 테두리·하드 섀도·기울기)로 정착.
// 중간에 "히어로+예고 목록" 레이아웃도 시도했으나 나머지 칸이 휑해 보인다는
// 피드백으로 그리드로 원복 — 리듬감은 동일 크기 4장이 더 좋았다. 다만 원색
// candy 스티커·이모지 배지는 "촌스럽다/수제 콘셉트와 안 맞는다"는 지적으로
// 톤 다운된 팔레트(ochre·dusty blue·brick·plum)와 조용한 라벨로 교체했다.
// 1화가 실제로 발행된 뒤 — 남는 자리는 "연필 스케치" 톤 목업으로 채운다.
// FALLBACK[0]은 실제 1화와 소재가 겹쳐서 안 쓰고 2~4화만 예고편으로 사용.
// 목업 카드는 실제 상세가 없으니 클릭은 안 되게(article, Link 아님) 막는다.
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

// 카드마다 살짝 다른 기울기 — 인쇄물을 아무렇게나 늘어놓은 듯한 코믹 진열대 느낌.
const TILTS = [-1.6, 1.2, -1, 1.8];
// 저채도 팔레트로 한 번 톤 다운했다가 "이전(원색) 게 낫다"는 피드백으로 원복.
const ACCENTS = ['#fde047', '#5eead4', '#fca5a5', '#c4b5fd'];
const SKETCH_ACCENT = '#a8a29e';

interface Props {
  // 빌드타임(app/page.tsx)에 fetchWebtoons()로 미리 가져온 값 — 정적 HTML에
  // 실제 카드가 바로 박히게 한다(2026-08-07, 홈 SSG 감사).
  initialItems?: CmsWebtoon[];
}

// 2026-08-20엔 lens("4가지 시선") 글의 웹툰 서브포맷을 buildLensWebtoonItems로
// 이 섹션에 섞어 넣었다(당시 webtoon 채널 발행이 뜸해질 것으로 예상해서).
// 2026-08-23 — mustknow_auto/frontpage_auto가 이제 웹툰 생성 시 webtoon
// 채널에도 독립 글을 같이 쓰도록 바뀌면서(사용자 지적: "웹툰 카드 누르면
// 렌즈 4유형 페이지로 가지 말고 웹툰 전용 페이지로 가면 좋겠다" + "만화방에
// 렌즈발 웹툰이 안 올라온다"), fetchWebtoons() 하나만으로 전부 커버된다 —
// lens에서 파생해서 섞으면 오늘부터는 같은 기사가 두 장으로 중복 표시된다.
// 과거 lens 글도 백필 스크립트로 webtoon 채널 글을 만들어뒀다
// (docs/worklog 2026-08-23 웹툰 채널 분리 참조).
//
// 2026-09-04 — 위 주석이 낡아 있었다: "video 파생 쪽은 아직 정리 안 됐다"고
// 남겨뒀는데, video 쪽(VideoPreviewSection.tsx)도 이미 2026-08-23에 같은
// 방식으로 fetchVideos()로 이관 완료돼 있었다(리팩토링 감사로 발견) —
// lensMediaFeed.ts(buildLensWebtoonItems/buildLensVideoItems 둘 다 호출자
// 0)는 통째로 삭제.
export function WebtoonPreviewSection({ initialItems }: Props) {
  const items = useServerSeededList<CmsWebtoon[], null>(initialItems, null, fetchWebtoons);

  if (items === null) return null; // 로딩 중엔 자리 안 차지(스켈레톤 제거 방침과 동일)

  const neededMocks = Math.max(0, 4 - items.length);
  const mockFillers = FALLBACK.slice(FALLBACK.length - neededMocks);
  const cards = [...items, ...mockFillers].slice(0, 4);
  const hasMock = mockFillers.length > 0;

  // 색 있는 "하이라이트 밴드"로 감싸봤다가(둥근 카드 → 뷰포트 full-bleed
  // → 다시 둥근 카드로, 2026-08-17 여러 번 오간 경위는 아래 커밋 이력
  // 참조) 우측 사이드바(HotLettersRail)가 생긴 뒤로 완전히 걷어냈다 —
  // 사이드바가 그 높이만큼은 비어 있어서, 본문 폭만 채우는 색 박스가
  // "옆에 빈 여백만 남기고 붕 뜬" 것처럼 밸런스가 안 맞아 보였다(사용자
  // 피드백: "보랏빛 박스를 걍 치울까요? 밸런스가 안맞는 느낌이네").
  // 다른 카테고리 섹션들과 똑같이 배경 없는 일반 섹션으로 되돌렸다.
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
          const accent = mock ? SKETCH_ACCENT : ACCENTS[i % ACCENTS.length];
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
              prefetch
              className="group relative"
              style={cardStyle}
              {...hoverProps}
            >
              {cardInner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
