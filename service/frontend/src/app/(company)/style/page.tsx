import type { Metadata } from 'next';
import StyleClient from './StyleClient';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '나는 신문을 이렇게 읽어요',
  description: '청소하다가, 버스에서, 걸으면서 — AI LENS 독자들의 진짜 뉴스 읽기 스타일을 모아봤어요. 나는 어떤 방식으로 경제 뉴스를 읽고 있는지 비교해 보고 나에게 맞는 형식을 찾아보세요.',
  alternates: { canonical: `${SITE_URL}/style` },
  // 내비게이션·사이트맵에 없는 안내 페이지라 색인하지 않는다. 링크는 따라간다.
  robots: { index: false, follow: true },
};

export default function StylePage() {
  return <StyleClient />;
}
