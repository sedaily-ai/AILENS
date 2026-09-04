import type { Metadata } from 'next';
import StyleClient from './StyleClient';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '나는 신문을 이렇게 읽어요',
  description: '청소하다가, 버스에서, 걸으면서 — AI LENS 독자들의 진짜 뉴스 읽기 스타일을 모아봤어요.',
  alternates: { canonical: `${SITE_URL}/style` },
};

export default function StylePage() {
  return <StyleClient />;
}
