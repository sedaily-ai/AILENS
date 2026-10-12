'use client';

import { Check, Mail } from 'lucide-react';
import { NewsletterCTA } from '@/features/news-feed';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';

// 메일로 받기 — 받을까? 약속은 코드로 확인한 사실만 쓴다(신청 즉시 1통: handlers/content/subscribe.py, 해지 링크, 로그인 불필요).
// 매일 정기 발송은 확인되지 않아 "매일"이라고 약속하지 않는다. id="newsletter"는 히어로 버튼과 기존 링크가 쓰는 앵커라 유지한다.
const PROMISES = [
  '최근 발행 기사의 요약과 전체 기사 링크를 메일로 보내요.',
  '메일 하단 링크로 언제든 해지할 수 있어요.',
  '로그인하지 않아도 돼요.',
];

export function NewsletterSection() {
  return (
    <section id="newsletter" className="ob-sec" aria-labelledby="ob-mail-title">
      <h2 id="ob-mail-title" className="ob-h2">
        <Mail className="ob-h2-icon" strokeWidth={1.8} aria-hidden="true" />
        <HandUnderline>최근 발행 기사를 메일로 받아 보세요</HandUnderline>
      </h2>
      <ul className="ob-promise">
        {PROMISES.map((t) => (
          <li key={t}>
            <Check size={16} strokeWidth={2.4} aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
      <NewsletterCTA />
    </section>
  );
}
