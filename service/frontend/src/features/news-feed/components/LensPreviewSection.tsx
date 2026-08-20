'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/archiveItems';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';

// "오늘의 이슈, 4가지 시선" → 지면 특별 코너로 개편(2026-08-21, 사용자
// 요청 — "전체 지면 1면, 증권면 1면, 산업면 1면, 시그널 1면 이렇게
// 구성하고, 해당 중요한 기사들을 넣는 탭으로 만들겁니다").
//
// 이전 버전은 "기사 하나 → 레터/웹툰/팟캐스트/영상 네 형식"을 보여주는
// 박스였다. 그 역할은 /lens 상세 페이지에 그대로 남아있고, 이 홈 박스는
// "전체/증권/산업/시그널" 4개 지면 탭으로 성격이 완전히 바뀐다 — 탭마다
// 그 지면에 해당하는 기사 4개를 보여준다(상단 nav에 새 탭을 만드는 게
// 아니라 이 박스 안의 지면 탭이다).
//
// 데이터는 새 API 호출 없이 NewsFeedTab.tsx가 이미 계산해둔 archiveItems
// (letters+lens 병합, category 필드 포함)를 그대로 받아 category로 필터링
// 한다 — "증권" 탭은 우리 카테고리 체계의 "증시" 라벨에 대응, "산업"은
// 그대로 "산업" 라벨. "시그널"은 아직 이 카테고리 체계에 없는 값이라
// (서울경제 본지의 자본시장 전문 버티컬 — 콘텐츠 소스 별도 결정 대기)
// 탭은 만들어두되 빈 상태로 둔다.
interface Section {
  key: string;
  label: string;
  categoryLabel: string | null; // null = 전체(필터 없음)
}

const SECTIONS: Section[] = [
  { key: 'all', label: '전체', categoryLabel: null },
  { key: 'markets', label: '증권', categoryLabel: '증시' },
  { key: 'industry', label: '산업', categoryLabel: '산업' },
  // 시그널 콘텐츠 소스 미정 — 존재하지 않는 카테고리 라벨을 넣어 항상
  // 빈 배열이 되게 한다(탭은 보이되 "준비 중" 안내로 자연히 빠짐).
  { key: 'signal', label: '시그널', categoryLabel: '__PENDING__' },
];

const ITEMS_PER_SECTION = 4;

export function LensPreviewSection({ archiveItems }: { archiveItems?: ArchiveItem[] }) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (!archiveItems || archiveItems.length === 0) return null;

  const active = SECTIONS[activeIdx];
  const items = active.categoryLabel === null
    ? archiveItems.slice(0, ITEMS_PER_SECTION)
    : archiveItems.filter((it) => it.category === active.categoryLabel).slice(0, ITEMS_PER_SECTION);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        .lz-tab { transition: background .15s ease, color .15s ease; }
        .lz-row2:hover { background: #fafbfc; }
        .lz-row2:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: -2px; }
        .lz-row2 + .lz-row2 { border-top: 1px solid rgba(17,24,39,0.07); }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p className="text-gray-400" style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
          오늘의 지면
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            지면으로 보는 오늘
          </h2>
          <Link href="/lens" className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 14, fontWeight: 600 }}>
            전체 보기 →
          </Link>
        </div>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, wordBreak: 'keep-all' }}>
          지면별 주요 기사를 모아봤어요 — 탭을 눌러 오늘의 지면을 넘겨보세요.
        </p>
      </header>

      <div
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          background: '#fff',
          border: '1px solid rgba(17,24,39,0.09)',
          boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 10px 30px rgba(17,24,39,0.05)',
        }}
      >
        {/* 지면 탭 — "1~5 이슈 캐러셀"을 "1~4 지면 탭"으로 교체(사용자
            요청). 화살표 대신 실제 지면 이름이 보이는 라벨형 탭이 "탭"
            이라는 표현과 더 맞는다고 판단. */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(17,24,39,0.09)' }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActiveIdx(i)}
              className="lz-tab flex-1"
              style={{
                padding: '13px 8px',
                fontSize: 14,
                fontWeight: 800,
                border: 'none',
                borderBottom: i === activeIdx ? `2px solid ${LENS_ACCENT}` : '2px solid transparent',
                marginBottom: -1,
                background: 'transparent',
                color: i === activeIdx ? LENS_ACCENT : '#9ca3af',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#9ca3af', fontWeight: 600 }}>
              {active.label} 지면을 준비하고 있어요.
            </p>
          </div>
        ) : (
          <div>
            {items.map((it) => (
              <Link
                key={it.key}
                href={it.href ?? '#'}
                prefetch
                className="lz-row2 flex items-center"
                style={{ gap: 14, padding: '14px clamp(12px, 2.4vw, 18px)', textDecoration: 'none' }}
              >
                <span
                  className="flex-shrink-0"
                  style={{
                    position: 'relative',
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: it.avatarUrl ? '#f3f4f6' : `${it.accent}14`,
                  }}
                >
                  {it.avatarUrl && (
                    <Image src={it.avatarUrl} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  {it.category && (
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: LENS_ACCENT, marginBottom: 2 }}>
                      {it.category}
                    </span>
                  )}
                  <span
                    style={{
                      display: '-webkit-box',
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#111827',
                      letterSpacing: '-0.015em',
                      lineHeight: 1.4,
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {it.title}
                  </span>
                </span>

                <span aria-hidden style={{ color: '#c0c5cc', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                  ›
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
