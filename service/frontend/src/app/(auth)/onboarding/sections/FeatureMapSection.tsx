'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { BookMarked, ChevronRight, Clock, Mail, Map, Newspaper, Search } from 'lucide-react';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

// 기능 지도 — 뭘 할 수 있어? 한 줄 설명은 각 페이지에 이미 있는 문구다(지난 지면만 사용자용 한 줄이 없어 새로 썼다).
// 출처: 레터 /letter 제목, 그날로 떠나요 timeline/layout.tsx, 단어장 words/page.tsx, 검색 search/page.tsx.
// 게임·사주는 경제 콘텐츠와 섞지 않으려고 넣지 않는다(홈에서 따로 안내한다). "나에게 맞는 형식 찾기"는 히어로 보조 버튼과 목적이 같아 여기서 뺀다.
const FEATURES: { name: string; desc: string; href: string; icon: LucideIcon }[] = [
  { name: '지난 지면', desc: '날짜를 골라 그날의 지면을 다시 볼 수 있어요.', href: '/paper', icon: Newspaper },
  { name: '레터', desc: '하나의 이슈, 여러 관점', href: '/letter', icon: Mail },
  { name: '그날로 떠나요', desc: '이슈를 따라가는 가장 빠른 방법.', href: '/timeline', icon: Clock },
  { name: '단어장', desc: 'AI LENS 레터에 나온 경제·시사 용어를 모아뒀어요.', href: '/words', icon: BookMarked },
  { name: '검색', desc: 'AI LENS의 이슈를 제목과 요약에서 찾아 보세요.', href: '/search', icon: Search },
];

export function FeatureMapSection() {
  return (
    <section className="ob-sec" aria-labelledby="ob-features-title">
      <h2 id="ob-features-title" className="ob-h2">
        <Map className="ob-h2-icon" strokeWidth={1.8} aria-hidden="true" />
        <HandUnderline>AI LENS에서 할 수 있는 것</HandUnderline>
      </h2>
      <ul className="ob-flist">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <li key={f.href}>
              <Link className="ob-frow" href={f.href} onClick={() => trackEvent('onboarding_feature_click', { target: f.href })}>
                <span className="ob-ficon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <span className="ob-ftext">
                  <span className="ob-fname">{f.name}</span>
                  <span className="ob-fdesc">{f.desc}</span>
                </span>
                <ChevronRight className="ob-chev" size={20} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
