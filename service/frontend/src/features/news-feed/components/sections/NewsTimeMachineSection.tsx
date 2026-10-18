'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { TimelineSketch } from '@/shared/ui/icons/VideoSketch';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import { INK, LINE, TIME_MACHINE_CSS } from '../time-machine/tokens';

const BirthdayMarket = dynamic(() => import('../birthday/BirthdayMarket'), {
  loading: () => <p style={{ padding: 24 }} role="status">생일 시세를 준비하고 있어요.</p>,
});
const NewsArchivePanel = dynamic(() => import('../time-machine/NewsArchivePanel').then(module => module.NewsArchivePanel), {
  loading: () => <p style={{ padding: 24 }} role="status">그날의 기사를 불러오고 있어요.</p>,
});

/** 생일 계산과 기사 조회는 별도 상태로 둬 생일이 기사 API에 전송되지 않게 한다. */
export function NewsTimeMachineSection() {
  const id = useId();
  const [view, setView] = useState<'birthday' | 'news'>('birthday');
  return (
    <section id="birthday-market" aria-labelledby={`${id}-heading`} style={{ padding: 'clamp(24px, 4vw, 40px) 0 0', scrollMarginTop: 96 }}>
      <style>{TIME_MACHINE_CSS}</style>
      <header style={{ marginBottom: 16 }}>
        <h2 id={`${id}-heading`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>
          <TimelineSketch className="w-12 h-10 -ml-1" /><HandUnderline>그날로 떠나요</HandUnderline>
        </h2>
      </header>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)' }}>
        <div aria-label="그날로 떠나요 보기 선택" style={{ display: 'flex', gap: 8, padding: '16px 20px', borderBottom: `1px solid ${LINE}` }}>
          <button type="button" className="ntm-chip ntm-focus" aria-pressed={view === 'birthday'} aria-controls={`${id}-birthday`} onClick={() => setView('birthday')}>생일 시세</button>
          <button type="button" className="ntm-chip ntm-focus" aria-pressed={view === 'news'} aria-controls={`${id}-news`} onClick={() => setView('news')}>그날의 기사</button>
        </div>
        <div id={`${id}-birthday`} hidden={view !== 'birthday'}><BirthdayMarket variant="entry" /></div>
        <div id={`${id}-news`} hidden={view !== 'news'}>{view === 'news' && <NewsArchivePanel />}</div>
      </div>
    </section>
  );
}
