'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TIMEMACHINE_CONTENTS } from './contents';

const RECENT_DAYS = 7;

// 사건 발생일 기준 경과일(KST 날짜 단위). 오늘이면 0.
function daysSince(date: string): number {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const d = new Date(`${date}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

// 타임머신 탭: 발행된 인터랙티브 콘텐츠 목록. 버튼을 누르면 해당 HTML(public/timemachine/<slug>/index.html)이 열린다.
export function TimemachinePage() {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header searchOpen={showSearch} onSearch={() => setShowSearch((open) => !open)} tabs={buildHeaderTabs('timemachine')} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main id="main-content" tabIndex={-1} style={{ maxWidth: 840, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 96px' }}>
        <h1 className="font-medium text-gray-900" style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}>
          타임머신
        </h1>
        <p style={{ marginTop: 10, fontSize: 14.5, color: '#6b7280' }}>과거의 사건을 인터랙티브로 다시 읽는 콘텐츠 모음.</p>

        <ul style={{ marginTop: 32, display: 'grid', gap: 16, listStyle: 'none', padding: 0 }}>
          {TIMEMACHINE_CONTENTS.map((c) => {
            const elapsed = daysSince(c.eventDate);
            const recent = elapsed >= 0 && elapsed <= RECENT_DAYS;
            return (
            <li key={c.slug} style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.thumbnail} alt="" style={{ width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '20px 22px 22px' }}>
                <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
                  {recent && (
                    <span style={{ padding: '2px 8px', borderRadius: 4, background: '#dc2626', color: '#fff', fontWeight: 700 }}>
                      {elapsed === 0 ? '오늘 발생' : `발생 D+${elapsed}`}
                    </span>
                  )}
                  <span style={{ fontWeight: 600, color: '#0b3d91' }}>{c.event}</span>
                  <span>{c.period}</span>
                </p>
                <p style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>{c.date} 발행 · {c.kind}</p>
                <h2 style={{ marginTop: 6, fontSize: 20, fontWeight: 700, color: '#111827' }}>{c.title}</h2>
                <p style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.7, color: '#4b5563' }}>{c.description}</p>
                {/* 정적 HTML 파일이라 next/link 대신 일반 a 로 문서 전체를 이동한다. */}
                <a
                  href={c.href}
                  style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 8, background: '#0b3d91', color: '#fff', fontSize: 14, fontWeight: 600 }}
                >
                  콘텐츠 보기
                </a>
              </div>
            </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
