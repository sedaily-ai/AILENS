import type { Metadata } from 'next';
import { TimeMachineClient } from './TimeMachineClient';

export const metadata: Metadata = {
  title: '뉴스 타임머신',
  description: '역사 속 오늘, 투자 시뮬레이션과 함께 과거 뉴스를 탐험해보세요.',
  alternates: { canonical: '/timemachine' },
};

export default function TimeMachinePage() {
  return <TimeMachineClient />;
}
