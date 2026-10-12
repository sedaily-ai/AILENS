'use client';

import Link from 'next/link';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

// 히어로 — 이게 뭐야? 문구 출처: 헤드라인은 비교 카드 페이지(card/[id]) 설명, 보조문은 홈 첫 화면(LensPreviewSection).
// 앰버 손밑줄은 단어 하나에만(홈 "어려우시죠?"와 같은 규칙). 주 버튼은 메일 섹션(#newsletter)으로, 보조 버튼은 /start로 간다.
export function HeroSection() {
  return (
    <section className="ob-hero" aria-labelledby="ob-hero-title">
      <h1 id="ob-hero-title" className="ob-h1">
        <span className="ob-mark">
          같은 기사
          <svg viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 6 C22 2, 44 8, 64 5 S104 3, 118 6" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
          </svg>
        </span>
        를{' '}<span style={{ display: 'inline-block' }}>읽기·웹툰</span>{' '}<span style={{ display: 'inline-block' }}>팟캐스트·영상으로.</span>
      </h1>
      <p className="ob-sub">당신의 일상에 맞춘 뉴스를 준비했어요.</p>

      <ul className="ob-formats" aria-label="네 가지 형식">
        {LENS_PERSPECTIVES.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.short}>
              <Icon size={20} strokeWidth={1.8} color={p.color} aria-hidden="true" />
              {p.short}
            </li>
          );
        })}
      </ul>

      <div className="ob-cta">
        <a className="ob-btn ob-btn-primary" href="#newsletter" onClick={() => trackEvent('onboarding_intro_click', { target: 'newsletter' })}>
          메일로 받기
        </a>
        <Link className="ob-btn ob-btn-ghost" href="/start" onClick={() => trackEvent('onboarding_intro_click', { target: 'start' })}>
          나에게 맞는 형식 찾기
        </Link>
      </div>
    </section>
  );
}
