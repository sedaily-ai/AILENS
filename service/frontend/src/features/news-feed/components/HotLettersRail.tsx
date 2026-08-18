'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

const HOT_LETTERS_LIMIT = 5;

// 홈 우측 사이드바(2026-08-17) — SideRail.tsx의 "요즘 가장 많이 읽힌 글"
// 부분만 떼어냈다. 인기글 목록 자체는 원래 무채색이라 손댈 것 없이 그대로
// 재사용. 사주 궁합 파트는 별도로 SajuMiniRail.tsx로 뽑아 톤(violet)만
// 다시 입혔다 — 둘 다 HomeSideBar.tsx가 하나의 컨테이너로 묶는다.
//
// initialItems — 처음엔 이 값 없이 client useEffect로만 불러와서 항상
// 빈 화면 → 딜레이 후 팝인이었다(2026-08-17, 사용자 피드백: "왜 항상
// 늦게 나타나지, 빨리 뜨도록 하는거 안하고 있나요"). 홈의 다른 섹션들처럼
// app/page.tsx 빌드타임 프리페치 값을 받아 초기 렌더부터 채운다 — effect는
// 여전히 돌려 최신 데이터로 갱신(다른 initial* prop 패턴과 동일, 예:
// WebtoonPreviewSection.tsx).
// 5개를 화살표로 한 장씩 넘기게 바꿨다가(2026-08-17, "화살표 눌러 이동
// 하게 해도 되니 너무 길게 하지 말아주시죠") 실제로 보니 "1~5까지 한번에
// 나와야합니다"라는 재요청으로 다시 목록 전체를 한 번에 보여주는 원래
// 방식으로 되돌렸다.
export function HotLettersRail({ initialItems }: { initialItems?: TodayLetterCardLike[] }) {
  const [hotLetters, setHotLetters] = useState<TodayLetterCardLike[]>(initialItems ?? []);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingLetters(HOT_LETTERS_LIMIT).then((cards) => {
      if (!cancelled) setHotLetters(cards);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hotLetters.length === 0) return null;

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <h3
          className="font-medium text-gray-900"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, letterSpacing: '-0.015em' }}
        >
          요즘 가장 많이 읽힌 글
        </h3>
        <Link href="/?tab=archive" className="text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 11.5, fontWeight: 500 }}>
          전체 →
        </Link>
      </header>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {hotLetters.map((l, idx) => (
          <li key={l.letterId}>
            <Link
              href={letterHref(l.letterId)}
              className="group flex items-start transition-opacity"
              style={{
                gap: 12,
                padding: '10px 0',
                borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                textDecoration: 'none',
              }}
            >
              <span
                className="flex-shrink-0"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#9ca3af',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 22,
                  lineHeight: 1.1,
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}>
                <Image
                  src={l.thumbnailUrl ?? l.editorAvatar}
                  alt=""
                  width={40}
                  height={40}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </span>
              <div className="flex-1 min-w-0">
                {/* 5개 항목의 제목 굵기가 서로 다르게 보인다는 피드백
                    (2026-08-18, "그 볼드를 누군 주고 안주고 하지말고
                    동일하게") — 코드상 조건 분기는 없이 전부 같은
                    font-medium 클래스였지만, Tailwind 클래스 대신
                    fontWeight를 인라인 숫자로 못박아 다섯 항목이 정확히
                    같은 값을 쓰도록 확정했다(브라우저·폰트 렌더링 차이로
                    클래스 적용이 흔들릴 여지를 아예 없앤다). */}
                <p
                  className="text-gray-900 group-hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.45,
                    letterSpacing: '-0.015em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {l.title}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
