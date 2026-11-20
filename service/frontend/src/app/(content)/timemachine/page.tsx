import type { Metadata } from 'next';
import { TimemachinePage } from '@/widgets/TimemachinePage';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '타임머신 | AI LENS',
  description: '과거의 사건을 인터랙티브로 다시 읽는 콘텐츠 모음.',
  alternates: { canonical: `${SITE_URL}/timemachine` },
};

export default function Page() {
  return <TimemachinePage />;
}
