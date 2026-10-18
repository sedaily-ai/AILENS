'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BirthdayMarket } from '@/features/news-feed';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TimelineSketch } from '@/shared/ui/icons/VideoSketch';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import styles from './birthdayMarketPage.module.css';

export function BirthdayMarketPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  return <div className={styles.page}>
    <Header searchOpen={searchOpen} onSearch={() => setSearchOpen(open => !open)} tabs={buildHeaderTabs()} frosted />
    <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <nav className={styles.navigation} aria-label="타임머신 탐색">
        <Link href="/#birthday-market"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5-5 5 5 5M3 10h14" /></svg>그날로 떠나요</Link>
        <Link href="/timeline">그날의 기사 보기</Link>
      </nav>
      <h1 className={styles.title}><TimelineSketch className="w-12 h-10" /><HandUnderline>생일 시세 타임머신</HandUnderline></h1>
      <section id="birthday-market" className={styles.panel} aria-label="생일 시세 조회"><BirthdayMarket /></section>
    </main>
  </div>;
}
