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
import { useLatestLetters } from '@/shared/hooks/useLatestLetters';

export function NewsletterCTA() {
  const { cards, loading } = useLatestLetters();
  const letter = cards[0] ?? null;

  // 구독 즉시 발송할 레터 — 가장 최근 발행분 한 통. 요약(excerpt)이 부제와 같으면 본문에서 빼서 메일에 같은 문장이 두 번 나오지 않게 한다.
  const letterPayload: SubscribeLetterPayload | null = letter
    ? {
        editor_name: letter.editorName,
        editor_role: letter.editorRole,
        accent: letter.accent,
        headline: letter.title,
        subtitle: letter.subtitle,
        body: letter.excerpt && letter.excerpt !== letter.subtitle ? [letter.excerpt] : [],
        key_points: [],
        closing_line: null,
      }
    : null;

  const blockedReason = letterPayload
    ? undefined
    : loading
      ? '오늘의 한 통을 불러오는 중이에요'
      : '지금은 오늘의 한 통을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.';

  return (
    <div style={{ marginTop: 24 }}>
      <NewsletterEmailField letter={letterPayload} disabledReason={blockedReason} />
    </div>
  );
}
