'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StyleBenchIllustration } from './StyleBenchIllustration';
import { WebtoonWindIllustration } from '@/shared/ui/icons/HandDrawnIcons';

// "About 배너처럼 존재감 있게" → "점박이(캐러셀 도트) 있어야 배너답다, 3개
// 정도 두고 웹툰·사주도 소개하자"는 요청(2026-08-06)으로, 단일
// StyleEventBanner를 3슬라이드 캐러셀로 확장했다. 자동으로 넘어가고 하단
// 점으로 직접 이동도 가능 — About 배너의 그 패턴 그대로.
const SLIDE_COUNT = 2;
const AUTO_MS = 4500;
// 사주 위젯(SideRail.tsx)이 이미 쓰는 브랜드 블루(#3182F6, Toss 톤)를 그대로 —
// 새 색을 지어내지 않고 기존 사주 브랜딩과 맞췄다.

export function HomeHeroCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % SLIDE_COUNT), AUTO_MS);
    return () => clearInterval(id);
  }, []);

  const slideBase = {
    borderRadius: 20,
    padding: 'clamp(20px, 4vw, 28px) clamp(20px, 4vw, 30px)',
    minHeight: 158,
  };

  const go = (delta: 1 | -1) => setActive((i) => (i + delta + SLIDE_COUNT) % SLIDE_COUNT);

  // 도트 옆에 나란히 — 슬라이드 카드 위에 얹었을 때 제목 텍스트와 겹치던
  // 문제(2026-08-06)를 카드 밖으로 빼서 해결.
  // 22px → 36px(2026-09-30, "오늘의 이슈" 화살표 크기 지적과 같은 문제 —
  // 이쪽이 더 작았다). 44px 터치타겟까진 못 가지만(이 파일은 CSS
  // ::after 트릭을 쓸 별도 <style> 블록이 없어 인라인만으로는 한계),
  // 22px보다는 훨씬 누르기 쉽다.
  const navBtnStyle = {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: '1px solid #e7e2d8',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 700,
    color: '#6b6558',
    lineHeight: 1,
  };

  return (
    <div style={{ marginBottom: 'clamp(14px, 2.8vw, 20px)' }}>
      <div style={{ position: 'relative' }}>
      {/* 슬라이드 1 — 신문 읽는 스타일 이벤트 */}
      <Link
        href="/style"
        className="items-center transition-transform duration-200 hover:-translate-y-0.5"
        style={{
          ...slideBase,
          display: active === 0 ? 'flex' : 'none',
          background: '#faf8f4',
          backgroundImage:
            'repeating-linear-gradient(108deg, rgba(120,113,108,0.07) 0px, rgba(120,113,108,0.07) 1px, transparent 1px, transparent 10px)',
          border: '1px solid #ece5d8',
        }}
      >
        <div className="flex items-center justify-between w-full" style={{ gap: 20 }}>
          <div style={{ minWidth: 0 }}>
            <span
              className="inline-flex items-center"
              style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', color: '#fff', background: '#1c1917', padding: '3px 9px', borderRadius: 999, marginBottom: 12 }}
            >
              EVENT
            </span>
            <h2
              style={{ fontWeight: 800, fontSize: 'clamp(21px, 4.6vw, 27px)', color: '#1c1917', letterSpacing: '-0.02em', lineHeight: 1.3, marginBottom: 8 }}
            >
              나는 신문을
              <br />
              이렇게 읽어요
            </h2>
            <p style={{ fontSize: 12.5, color: '#78716c', lineHeight: 1.6 }}>
              버스에서, 청소하다가, 걸으면서 — 독자들의 진짜 읽기 스타일 구경하기
            </p>
          </div>
          <StyleBenchIllustration className="hidden sm:block flex-shrink-0" />
        </div>
      </Link>

      {/* 슬라이드 2 — 웹툰 파일럿 */}
      <Link
        href="/lens"
        className="items-center transition-transform duration-200 hover:-translate-y-0.5"
        style={{
          ...slideBase,
          display: active === 1 ? 'flex' : 'none',
          background: '#111827',
        }}
      >
        <div className="flex items-center justify-between w-full" style={{ gap: 20 }}>
          <div style={{ minWidth: 0 }}>
            <span
              className="inline-flex items-center"
              style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', color: '#fde047', border: '1px solid rgba(253,224,71,0.5)', padding: '3px 9px', borderRadius: 999, marginBottom: 12 }}
            >
              WEBTOON PILOT
            </span>
            <h2
              style={{ fontWeight: 800, fontSize: 'clamp(21px, 4.6vw, 27px)', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.3, marginBottom: 8 }}
            >
              이슈를
              <br />
              웹툰으로
            </h2>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              오늘의 경제 이슈를 컷으로 이어 보여드려요
            </p>
          </div>
          {/* 색 배경 박스를 없애고 일러스트를 어두운 배경 위에 그대로 띄웠다
              (2026-08-06) — 박스에 가두면 "아이콘"으로, 그냥 떠 있으면
              "일러스트"로 읽힌다는 판단. */}
          <WebtoonWindIllustration
            accent="#fde047"
            base="#fff"
            className="hidden sm:block flex-shrink-0 w-[108px] h-[108px]"
          />
        </div>
      </Link>
      </div>

      {/* 화살표를 슬라이드 위에 얹었더니 제목 글자랑 겹쳐서(2026-08-06 피드백),
          카드 밖으로 빼서 도트와 한 줄로 묶었다 — "‹ • • • ›" 형태. 텍스트를
          가릴 일이 없고, 도트 옆이라 같은 "이동 컨트롤" 묶음으로도 읽힌다. */}
      <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 12 }}>
        <button type="button" aria-label="이전 배너" onClick={() => go(-1)} style={navBtnStyle}>
          ‹
        </button>
        <div className="flex items-center" style={{ gap: 6 }}>
          {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 배너로 이동`}
              onClick={() => setActive(i)}
              style={{
                width: active === i ? 20 : 6,
                height: 6,
                borderRadius: 999,
                background: active === i ? '#1c1917' : '#d8d4cb',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                transition: 'width 0.25s ease, background 0.25s ease',
              }}
            />
          ))}
        </div>
        <button type="button" aria-label="다음 배너" onClick={() => go(1)} style={navBtnStyle}>
          ›
        </button>
      </div>
    </div>
  );
}
