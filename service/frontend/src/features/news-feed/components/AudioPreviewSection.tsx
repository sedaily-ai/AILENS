'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';

// "팟캐스트" 시선 캐릭터(/lens 형식 선택 UI와 동일한 라인아트) — 사용자가
// 워싱턴포스트 레퍼런스를 짚으며 "캐릭터는 기존거 사용"이라 한 건 이걸
// 가리켰다(처음엔 TodayNewsPlayer의 헤드폰 일러스트로 오인해 잘못 넣었음,
// 2026-08-21). 새 캐릭터를 만들지 않고 /lens 상세의 형식 선택 카드가 이미
// 쓰는 4개 라인아트 중 오디오에 해당하는 것(index 2)을 그대로 재사용한다.
const PODCAST_PERSPECTIVE = LENS_PERSPECTIVES[2];

// 오디오 섹션(2026-08-21, 사용자 요청 — "오디오 섹션도 메인 페이지에 걸어주시죠",
// 위치는 "문화 섹션 위에"). TodayNewsPlayer.tsx(하단 고정 미니 플레이어)에만
// 있던 재생목록이 스크롤되는 본문 콘텐츠 목록엔 전혀 안 걸려있던 걸 보완 —
// /listen 목록 페이지(ListenListClient.tsx)와 같은 데이터(home_player 채널)를
// 쓰고 행 디자인도 그대로 가져왔다. thumbnail이 없는 순수 오디오/짧은 영상
// 콘텐츠라 웹툰·영상 섹션처럼 이미지 카드가 아니라 텍스트 위주 리스트.
interface Props {
  initialItems?: HomePlayerPost[];
}

export function AudioPreviewSection({ initialItems }: Props) {
  const [items, setItems] = useState<HomePlayerPost[] | null>(initialItems ?? null);

  useEffect(() => {
    let cancelled = false;
    fetchHomePlayerPosts().then((rows) => {
      if (!cancelled) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;

  const shown = items.slice(0, 4);

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
            오디오
          </p>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            오늘의 뉴스를 귀로
          </h2>
        </div>
        <Link
          href="/listen"
          className="text-gray-500 hover:text-gray-900 flex-shrink-0"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          더 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      {/* 워싱턴포스트 오피니언 섹션 참고(2026-08-21, 사용자가 스크린샷으로
          레퍼런스 제시 — "요런 느낌 어떨까요? 캐릭터는 기존거 사용하고").
          작은 캡션 줄(날짜·포맷) 위, 굵은 세리프 제목이 아래에서 시각적
          무게중심이 되는 구성 + 얇은 구분선 + 행마다 원형 캐릭터. 다만
          레퍼런스의 다크 배경은 이 서비스의 밝은 톤(부드러운 그림자·여백,
          feedback_frontend_design_tone)과 안 맞아 그대로 가져오지 않고
          라이트 톤은 유지했다. 캐릭터는 신규 제작 대신 기존
          ListeningHeadphoneIllustration(TodayNewsPlayer 미니바 아이콘과
          동일)을 재사용 — 사용자 지목대로 "새 인물 아바타"가 아니라 이
          섹션 고유의 리스닝 캐릭터를 반복 노출해 브랜드 일관성을 준다. */}
      <div>
        {shown.map((it, i) => {
          const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
          return (
            <Link
              key={it.id}
              href={`/listen/${encodeURIComponent(it.id)}`}
              prefetch
              className="group flex items-center justify-between hover:bg-gray-50 transition-colors"
              style={{
                gap: 16,
                padding: 'clamp(16px, 2.6vw, 22px) 4px',
                textDecoration: 'none',
                borderBottom: i < shown.length - 1 ? '1px solid rgba(17,24,39,0.08)' : 'none',
              }}
            >
              <span className="min-w-0 flex-1">
                <span style={{ display: 'block', fontSize: 11.5, color: '#9ca3af', marginBottom: 6, fontWeight: 700, letterSpacing: '0.01em' }}>
                  {isAudio ? '팟캐스트' : '영상'}
                  {it.date && <> · {it.date.replaceAll('-', '.')}</>}
                </span>
                <span
                  className="block text-gray-900 group-hover:underline"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 'clamp(17px, 2.6vw, 20px)',
                    fontWeight: 700,
                    lineHeight: 1.4,
                    letterSpacing: '-0.015em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {it.title}
                </span>
              </span>

              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff', overflow: 'hidden' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, LensViewClient.tsx와 동일 패턴 */}
                <img
                  src={PODCAST_PERSPECTIVE.illustration}
                  alt=""
                  width={56}
                  height={56}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
