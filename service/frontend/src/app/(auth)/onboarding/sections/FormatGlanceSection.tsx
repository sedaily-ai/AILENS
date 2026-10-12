'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { LENS_FORMATS, lensPerspectiveAt, type LensFormat } from '@/shared/constants/lensPerspectives';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { OnboardingGlance } from '../OnboardingClient';

// 한눈에 — 오늘 1면 기사 하나가 네 형식에서 각각 어떻게 시작하는지(비교 카드 데이터, 발행본 문장 그대로).
// 제목·보조문·링크 이름·안내 문장은 비교 카드 페이지(card/[id]/page.tsx)의 문구를 그대로 쓴다.
const VIEW_AS: Record<LensFormat, string> = {
  letter: '글로 읽기',
  webtoon: '웹툰으로 보기',
  podcast: '팟캐스트로 듣기',
  video: '영상으로 보기',
};

export function FormatGlanceSection({ glance }: { glance: OnboardingGlance | null }) {
  return (
    <section className="ob-sec" aria-labelledby="ob-glance-title">
      <h2 id="ob-glance-title" className="ob-h2">
        <LayoutGrid className="ob-h2-icon" strokeWidth={1.8} aria-hidden="true" />
        <HandUnderline>같은 뉴스, 4가지로 비교</HandUnderline>
      </h2>
      <p className="ob-lead">형식마다 어떻게 시작하는지 한 장에 모았어요.</p>

      {glance ? (
        <article className="ob-card" aria-labelledby="ob-glance-headline">
          <p className="ob-meta">{[glance.card.category, glance.card.date].filter(Boolean).join(' · ')}</p>
          <p id="ob-glance-headline" className="ob-card-title">
            <Link href={glance.articleHref}>{glance.card.headline}</Link>
          </p>
          <ol className="ob-cmp">
            {glance.card.entries.map((e) => {
              const index = LENS_FORMATS.indexOf(e.format);
              const Icon = lensPerspectiveAt(index).icon;
              return (
                <li key={e.format}>
                  <div className="ob-cmp-head">
                    <span className="ob-fmt">
                      <Icon size={20} strokeWidth={1.8} color={e.color} aria-hidden="true" />
                      {e.label}
                    </span>
                    <span className="ob-who">{e.who}</span>
                  </div>
                  <p className="ob-cmp-text">{e.text}</p>
                  <Link
                    className="ob-cmp-link"
                    href={`${glance.articleHref}?v=${index + 1}`}
                    onClick={() => trackEvent('onboarding_glance_click', { format: e.format })}
                  >
                    {VIEW_AS[e.format]} →
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link
            className="ob-btn ob-btn-ghost"
            href={glance.articleHref}
            onClick={() => trackEvent('onboarding_glance_click', { format: 'all' })}
          >
            이 기사 4가지로 보기
          </Link>
          <p className="ob-note">
            카드의 문장은 발행된 읽기·웹툰·팟캐스트·영상의 첫 부분을 그대로 옮긴 것이며, 네 형식 모두 같은 서울경제 기사를 바탕으로 합니다.
          </p>
        </article>
      ) : (
        <div className="ob-empty" role="status">
          <p>오늘 기사가 아직 없어요.</p>
          <Link href="/">홈으로 가기</Link>
        </div>
      )}
    </section>
  );
}
