import type { Metadata } from 'next';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { SubscriptionResult } from '@/features/letter';

export const metadata: Metadata = {
  title: '레터 메일 | AI LENS',
  robots: { index: false, follow: false },
  referrer: 'no-referrer', // 주소의 토큰이 다른 사이트로 새지 않게 한다
};

export default async function LetterMailUnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <ArticlePageShell activeTab="letter">
      <SubscriptionResult mode="unsubscribe" token={typeof token === 'string' ? token : ''} />
    </ArticlePageShell>
  );
}
