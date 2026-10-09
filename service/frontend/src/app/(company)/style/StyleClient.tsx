'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

// 이벤트성 갤러리 — 사람들이 신문 읽는 스타일을 공유하는 "전시 공간"이다. 실제 유저 제출 파이프라인이 없어 커뮤니티 탭으로 유도해 거기서 올리게 한다.
// 실제 사진이 없어 문구 자체가 비주얼이 되는 타이포그래피 카드로 구성한다.
// 카드는 특정 인물에 귀속시키지 않고, 다른 카드형 섹션(Trend/Column)과 같은 공용 브랜드 팔레트(brandAccents.ts)를 카드 순서로 순환 배정한다.
interface StylePost {
  situation: string;
  comment: string;
  size: 'tall' | 'short';
}

const POSTS: StylePost[] = [
  { situation: '버스 안, 15분', comment: '정류장 도착 전까지 핵심만 딱 훑어요.', size: 'short' },
  { situation: '청소하다가', comment: '라디오처럼 틀어놓고 손은 계속 움직여요. 귀로 먼저 듣고, 궁금하면 나중에 다시 찾아봐요.', size: 'tall' },
  { situation: '출근길 지하철', comment: '환승 전까지 한 편 정독하는 게 루틴이에요.', size: 'short' },
  { situation: '점심 먹으면서', comment: '동료랑 얘기하다 나온 이슈부터 찾아 읽어요. 밥 먹으면서 정보 하나 건지면 이득이잖아요.', size: 'tall' },
  { situation: '걷다가', comment: '산책할 땐 눈 대신 귀로.', size: 'short' },
  { situation: '잠들기 전', comment: '하루 마무리로 천천히, 오늘 있었던 일들을 다시 읽어봐요.', size: 'tall' },
  { situation: '회의 전 5분', comment: '브리핑처럼 빠르게 체크하고 들어가요.', size: 'short' },
  { situation: '친구랑 토론하며', comment: '같이 읽고 의견 나누는 게 제일 재밌어요. 서로 다르게 읽는 게 신기해요.', size: 'tall' },
  { situation: '카페에서 커피 기다리며', comment: '주문하고 나오기 전까지 딱 한 편.', size: 'short' },
];

export default function StyleClient() {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 32px) 90px' }}>
        <header style={{ textAlign: 'center', marginBottom: 'clamp(28px, 5vw, 44px)' }}>
          <span
            className="inline-flex items-center"
            style={{
              background: '#111827',
              color: '#fde047',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
              padding: '4px 12px',
              borderRadius: 999,
              marginBottom: 14,
            }}
          >
            EVENT
          </span>
          <h1
            className="font-medium text-gray-900"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(26px, 5.5vw, 36px)',
              letterSpacing: '-0.02em',
              marginBottom: 10,
            }}
          >
            나는 신문을 이렇게 읽어요
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 20px' }}>
            청소하다가, 버스에서, 걸으면서 — 저마다 다른 순간에 뉴스를 만나요.
            AI LENS 독자들의 진짜 읽기 스타일을 모아봤어요.
          </p>
          {/* "나도 스타일 올리기"(글쓰기) 목적지가 없으므로, 다른 사람이 담은 문장을 볼 수 있는 내 서랍으로 연결한다. */}
          <Link
            href="/?tab=archive"
            className="inline-flex items-center hover:opacity-85 transition-opacity"
            style={{
              gap: 8,
              background: '#111827',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 700,
              padding: '11px 20px',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            내 서랍 둘러보기 →
          </Link>
        </header>

        <div className="columns-2 sm:columns-3" style={{ columnGap: 12 }}>
          {POSTS.map((p, i) => {
            const { accent } = BRAND_ACCENTS[i % BRAND_ACCENTS.length];
            return (
              <div
                key={i}
                className="break-inside-avoid"
                style={{
                  marginBottom: 12,
                  borderRadius: 18,
                  background: accent,
                  color: '#fff',
                  padding: 'clamp(16px, 3vw, 20px)',
                  minHeight: p.size === 'tall' ? 168 : 116,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: p.size === 'tall' ? 19 : 17,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      letterSpacing: '-0.01em',
                      marginBottom: 8,
                    }}
                  >
                    {p.situation}
                  </p>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>{p.comment}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
