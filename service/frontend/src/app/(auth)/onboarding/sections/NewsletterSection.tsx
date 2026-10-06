'use client';

import { NewsletterCTA } from "@/features/news-feed";

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
// ── 작동 방식 ──────────────────────────────────────────────────────
// ── 샘플 letter (오늘의 한 통 미리보기) ───────────────────────────
// ── 뉴스레터 구독 ──────────────────────────────────────────────────
export function NewsletterSection() {
  return (
    <section
      id="newsletter"
      style={{ padding: 'clamp(60px, 10vh, 100px) 0 clamp(80px, 12vh, 120px)' }}
    >
      <NewsletterCTA />
    </section>
  );
}
