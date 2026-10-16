'use client';

import Link from 'next/link';
import { ReadingPeriodView } from './ReadingPeriodView';

export function ReadingRewards() {
  return (
    <section id="ml-rewards" className="ml-extension" aria-labelledby="ml-rewards-title">
      <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-rewards-title">뉴스를 만난 날이 쌓이면</h2><p className="ml-helper">읽고, 보고, 들으며 쌓은 나의 뉴스 기록이에요.</p></div></div>
      <ReadingPeriodView />
      <p className="ml-helper">읽기는 본문 80%와 화면 노출 30초, 웹툰은 컷 80%와 10초, 듣기·영상은 등록 길이의 재생 구간 80%를 확인하면 완료로 기록해요. 길이를 확인할 수 없는 미디어는 완료 기록을 지원하지 않아요.</p>
      <div className="ml-reward-actions"><Link href="/my-lens#ml-news" className="ml-text-link">오늘의 뉴스 만나러 가기</Link></div>
    </section>
  );
}
