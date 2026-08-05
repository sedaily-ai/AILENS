import type { Metadata } from 'next';
import { EditorsClient } from './EditorsClient';

export const metadata: Metadata = {
  title: '에디터',
  description: '민철·하은·준서·소율 — MBTI 성향별 4명의 AI 에디터를 만나보세요.',
  alternates: { canonical: '/editors' },
};

export default function EditorsPage() {
  return <EditorsClient />;
}
