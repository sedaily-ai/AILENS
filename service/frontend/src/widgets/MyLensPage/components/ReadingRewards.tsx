'use client';

import { Award, ChevronDown, Compass, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { ReadingPeriodView } from './ReadingPeriodView';

const BADGES = [
  { title: '꾸준한 시선', rule: '한 주에 서로 다른 3일 읽기', Icon: Award },
  { title: '새로운 발견', rule: '한 주에 서로 다른 3개 분야 읽기', Icon: Compass },
  { title: '다시 보는 깊이', rule: '한 주에 이미 읽고 저장한 서로 다른 2편 다시 읽기', Icon: RotateCcw },
];

export function ReadingRewards({ example, onExampleChange }: { example: boolean; onExampleChange: (value: boolean) => void }) {
  return (
    <section id="ml-rewards" className="ml-extension" aria-labelledby="ml-rewards-title">
      <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-rewards-title">읽는 날이 쌓이면</h2><p className="ml-helper">나의 속도로 읽고, 관심의 폭을 넓혀보세요.</p></div><span className="ml-pending-label">기록 연동 준비 중</span></div>
      <p className="ml-connection-note">스탬프와 배지는 아직 지급되지 않아요. 읽은 날짜와 완료 기록이 연결되면 나의 기록을 보여드릴게요.</p>
      <ReadingPeriodView example={example} onExitExample={() => onExampleChange(false)} />
      <div className="ml-badge-list">{BADGES.map(({ title, rule, Icon }, index) => <div key={title} className="ml-badge-row"><span className="ml-badge-icon" data-earned={example && index === 0}><Icon size={22} aria-hidden /></span><div><h3>{title}</h3><p>{rule}</p></div><span className="ml-badge-state">{example && index === 0 ? '획득 예시' : '연동 대기'}</span></div>)}</div>
      <div className="ml-reward-actions"><button type="button" className="ml-button ml-button-quiet" aria-pressed={example} onClick={() => onExampleChange(!example)}>{example ? '예시 닫기' : '달성 화면 예시 보기'}</button><Link href="/my-lens#ml-news" className="ml-text-link">오늘의 뉴스 읽으러 가기</Link></div>
      {example && <p className="ml-example-note" role="status">화면 예시예요. 실제 이용 기록이나 획득한 배지가 아니며 저장되지 않아요.</p>}
      <details className="ml-reward-rules">
        <summary><span><strong>스탬프와 배지 기준 보기</strong><small>하루 하나씩, 부담 없이 쌓는 읽기 기록</small></span><ChevronDown size={18} aria-hidden /></summary>
        <div className="ml-rule-content">
          <dl className="ml-rule-list">
            <div><dt>하루에 스탬프 하나</dt><dd>새 콘텐츠를 처음 다 읽은 날, 하루 최대 1개를 받는 방식으로 준비하고 있어요.</dd></div>
            <div><dt>같은 이야기는 한 번만</dt><dd>같은 이슈를 다시 열거나 다른 형식으로 봐도 스탬프를 중복 지급하지 않아요.</dd></div>
            <div><dt>쉬어가도 남는 기록</dt><dd>읽지 않은 날이 있어도 이전 기록과 획득한 배지는 그대로 남아요.</dd></div>
            <div><dt>보상은 읽기 기록으로</dt><dd>북마크·알림 설정만으로 지급하지 않아요. 현금성 포인트나 교환 혜택은 없어요.</dd></div>
          </dl>
          <div className="ml-rule-note"><Info size={15} aria-hidden /><p>열람 표시와 보상용 완료 기준은 달라요. 기존 열람 기록은 주간 스탬프로 자동 전환되지 않아요.</p></div>
        </div>
      </details>
    </section>
  );
}
