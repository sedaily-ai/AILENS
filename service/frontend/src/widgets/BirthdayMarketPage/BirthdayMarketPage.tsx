import { BirthdayMarket } from '@/features/news-feed';
import { ExitPill, GLOBAL_CSS } from '@/features/timeline';
import { TimelineSketch } from '@/shared/ui/icons/VideoSketch';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import styles from './birthdayMarketPage.module.css';

// 그날의 기사(/timeline) 화면들과 같은 몰입형 틀 — 공용 헤더 대신 왼쪽 위 ExitPill 하나로 나가고, 공용 푸터도 숨긴다(ConditionalFooter.tsx).
export function BirthdayMarketPage() {
  return <div className={styles.page}>
    <style>{GLOBAL_CSS}</style>
    {/* 본문은 1200px 컨테이너(좌우 24px) — 알약을 제목 왼쪽 끝(1152px 폭)에 맞춘다. */}
    <ExitPill column={1152} />
    <main id="main-content" tabIndex={-1} className={styles.main}>
      <h1 className={styles.title}><TimelineSketch className="w-12 h-10" /><HandUnderline>내 생일 타임머신</HandUnderline></h1>
      <section id="birthday-market" className={styles.panel} aria-label="내 생일 타임머신"><BirthdayMarket /></section>
    </main>
  </div>;
}
