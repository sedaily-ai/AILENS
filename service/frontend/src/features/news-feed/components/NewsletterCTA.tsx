'use client';

/**
 * /onboarding 메일 섹션의 신청 폼(소개 화면에서만 쓴다).
 * 단일 명의(AI LENS) 체계라 에디터를 고르지 않고 "오늘의 한 통"을 구독한다.
 *
 * ⚠️ letter 페이로드는 반드시 넘긴다. 없으면 서버(handlers/content/subscribe.py)가 daily_letters를 찾고,
 *    없을 때 MOCK 레터(newsletter/today_letter.py)까지 폴백해 실제 구독자에게 가짜 레터가 갈 수 있다.
 *    (2026-10-13 확인: today-letters API가 10/11~10/13 모두 빈 목록) 그래서 보낼 레터를 불러오기 전에는 신청 버튼을 막는다.
 */
import { NewsletterEmailField, type SubscribeLetterPayload } from '@/shared/ui/form/NewsletterEmailField';
import Link from 'next/link';
import { useLatestLetters } from '@/shared/hooks/useLatestLetters';

export function NewsletterCTA() {
  const { cards, loading, date } = useLatestLetters();
  const letter = cards[0] ?? null;

  // 카드 요약임을 명시하고, 실제 발행일·정본 경로를 메일에도 전달한다.
  const summary = (letter?.excerpt || letter?.subtitle || '').trim();
  const letterPayload: SubscribeLetterPayload | null = letter && summary && date
    ? {
        article_path: letter.href,
        published_date: date,
        editor_name: letter.editorName,
        editor_role: letter.editorRole,
        accent: letter.accent,
        headline: letter.title,
        subtitle: '최근 발행 기사 요약',
        body: [summary],
        key_points: [],
        closing_line: null,
      }
    : null;

  const blockedReason = letterPayload
    ? undefined
    : loading
      ? '최근 발행 기사를 불러오는 중이에요'
      : '지금은 기사 요약을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.';

  return (
    <div style={{ marginTop: 24 }}>
      <NewsletterEmailField letter={letterPayload} disabledReason={blockedReason} />
      {letter && date && (
        <div style={{ marginTop: 16, fontSize: 'var(--font-size-14)', lineHeight: 1.7 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>메일로 받을 기사 · {date} 발행</p>
          <Link href={letter.href} className="ob-cmp-link">{letter.title} →</Link>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>위 비교 기사와 다를 수 있어요. 메일에는 요약과 전체 기사 링크를 담아요.</p>
        </div>
      )}
    </div>
  );
}
