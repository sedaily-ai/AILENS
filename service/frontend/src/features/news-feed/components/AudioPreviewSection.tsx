'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { requestPlayHomePlayerItem } from '@/shared/lib/audioPlayerBus';

// 카드 4개가 전부 "팟캐스트" 캐릭터 하나만 반복돼 단조로워 보인다는
// 지적(2026-08-21, "캐릭터들이 다 동일하네? 서로 다르게 해야하지
// 않을까요?") — 카드 인덱스로 /lens 형식 선택 UI의 4개 라인아트(레터/
// 웹툰/팟캐스트/영상)를 순환시켜 매 카드가 다른 캐릭터를 갖게 했다.
// 처음엔 캐릭터별 브랜드 색(tint/color)까지 입혔는데, "캐릭터는
// 흑백친구들로 하시죠"라는 후속 피드백으로 아바타·재생 배지 색은
// 다시 중립 톤으로 되돌리고 캐릭터 종류만 다르게 유지한다.
const NEUTRAL_ACCENT = '#3b82f6';

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

      {/* 세로 카드형 그리드(2026-08-21, 사용자 요청 — "세로 카드형으로...
          깔끔한 모던 디자인으로"). 1차 카드형에 대해 "세로가 좀 더
          길게, 오디오 느낌 나게, 재생버튼 있으면 더 예쁘지 않을까"라는
          후속 피드백 반영 — minHeight로 카드를 더 세로로 늘리고, 캐릭터
          원형 아바타 오른쪽 아래에 재생 버튼 배지를 겹쳐 "재생 가능한
          오디오 카드"라는 게 한눈에 보이게 했다(흰 테두리로 아바타 위에
          떠 있는 느낌, Spotify/Apple Music류 관례). 장식(회전·그림자
          과다) 없이 얇은 테두리 + 은은한 그림자만 쓰는 미니멀 톤
          (feedback_frontend_design_tone: 과한 그라데이션·굵은 테두리 금지). */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'clamp(12px, 2vw, 18px)' }}>
        {shown.map((it, i) => {
          const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
          const p = lensPerspectiveAt(i);
          return (
            <Link
              key={it.id}
              href={`/listen/${encodeURIComponent(it.id)}`}
              prefetch
              className="group flex flex-col"
              style={{
                borderRadius: 16,
                border: '1px solid rgba(17,24,39,0.07)',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 2px 8px rgba(17,24,39,0.04)',
                padding: 'clamp(22px, 3vw, 28px) clamp(16px, 2.4vw, 20px) clamp(20px, 2.6vw, 24px)',
                minHeight: 'clamp(210px, 26vw, 248px)',
                textDecoration: 'none',
                transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 10px 22px rgba(17,24,39,0.1)';
                e.currentTarget.style.borderColor = NEUTRAL_ACCENT;
                const title = e.currentTarget.querySelector<HTMLElement>('[data-title]');
                if (title) title.style.color = NEUTRAL_ACCENT;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.03), 0 2px 8px rgba(17,24,39,0.04)';
                e.currentTarget.style.borderColor = 'rgba(17,24,39,0.07)';
                const title = e.currentTarget.querySelector<HTMLElement>('[data-title]');
                if (title) title.style.color = '';
              }}
            >
              <span className="relative flex-shrink-0" style={{ width: 68, height: 68, marginBottom: 18 }}>
                <span
                  className="flex items-center justify-center"
                  style={{ width: 68, height: 68, borderRadius: '50%', background: '#f3f4f6', overflow: 'hidden' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, LensViewClient.tsx와 동일 패턴 */}
                  <img
                    src={p.illustration}
                    alt=""
                    width={68}
                    height={68}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                  />
                </span>
                {/* 재생 버튼 배지 — 클릭하면 카드가 가리키는 /listen 상세로
                    이동하는 대신, 하단 고정 플레이어(TodayNewsPlayer)에서
                    바로 재생을 시작한다(2026-08-21, "재생버튼 누르면 바
                    흘러가게, 해당 페이지로 리다이렉트말구"). <a> 안에
                    실제 <button>을 못 넣어(중첩 인터랙티브 엘리먼트) role=
                    button span + 키보드 핸들러로 대체. stopPropagation으로
                    부모 Link 네비게이션을 막는다. */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="재생"
                  className="absolute flex items-center justify-center"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: NEUTRAL_ACCENT,
                    border: '2.5px solid #fff',
                    bottom: -3,
                    right: -3,
                    boxShadow: `0 2px 5px ${NEUTRAL_ACCENT}59`,
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
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 1.5 }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>

              <span style={{ fontSize: 11, color: '#9ca3af', marginBottom: 7, fontWeight: 700, letterSpacing: '0.01em' }}>
                {isAudio ? '팟캐스트' : '영상'}
                {it.date && <> · {it.date.replaceAll('-', '.')}</>}
              </span>

              <span
                data-title
                className="text-gray-900 transition-colors"
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
