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

      {/* 세로 카드형 그리드로 재설계(2026-08-21, 사용자 요청 — "오디오
          부분... 세로 카드형으로... 깔끔한 모던 디자인으로"). 이전 가로
          행 리스트(워싱턴포스트 레퍼런스 1차 적용분)에서, 캐릭터가 매
          행 오른쪽에 반복돼 리스트처럼 보이던 것을 카드마다 위쪽에
          중앙 배치해 하나의 완결된 카드로 바꿨다. 장식(회전·그림자 과다)
          없이 얇은 테두리 + 은은한 그림자만 쓰는 미니멀 톤
          (feedback_frontend_design_tone: 과한 그라데이션·굵은 테두리 금지). */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'clamp(12px, 2vw, 18px)' }}>
        {shown.map((it) => {
          const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
          return (
            <Link
              key={it.id}
              href={`/listen/${encodeURIComponent(it.id)}`}
              prefetch
              className="group flex flex-col"
              style={{
                borderRadius: 14,
                border: '1px solid rgba(17,24,39,0.08)',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 2px 8px rgba(17,24,39,0.04)',
                padding: 'clamp(18px, 2.6vw, 24px) clamp(14px, 2.2vw, 18px)',
                textDecoration: 'none',
                transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 10px 22px rgba(17,24,39,0.09)';
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.28)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.03), 0 2px 8px rgba(17,24,39,0.04)';
                e.currentTarget.style.borderColor = 'rgba(17,24,39,0.08)';
              }}
            >
              <span
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 52, height: 52, borderRadius: '50%', background: '#f3f6fb', overflow: 'hidden', marginBottom: 14 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, LensViewClient.tsx와 동일 패턴 */}
                <img
                  src={PODCAST_PERSPECTIVE.illustration}
                  alt=""
                  width={52}
                  height={52}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                />
              </span>

              <span style={{ fontSize: 11, color: '#9ca3af', marginBottom: 7, fontWeight: 700, letterSpacing: '0.01em' }}>
                {isAudio ? '팟캐스트' : '영상'}
                {it.date && <> · {it.date.replaceAll('-', '.')}</>}
              </span>

              <span
                className="text-gray-900 group-hover:text-blue-700 transition-colors"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 'clamp(14.5px, 2vw, 15.5px)',
                  fontWeight: 700,
                  lineHeight: 1.42,
                  letterSpacing: '-0.01em',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {it.title}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
