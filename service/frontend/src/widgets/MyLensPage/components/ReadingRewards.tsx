'use client';

import { ChevronDown, Info } from 'lucide-react';
import Link from 'next/link';
import { ReadingPeriodView } from './ReadingPeriodView';

export function ReadingRewards() {
  return (
    <section id="ml-rewards" className="ml-extension" aria-labelledby="ml-rewards-title">
      <div className="ml-section-title ml-extension-heading"><div><h2 id="ml-rewards-title">뉴스를 만난 날이 쌓이면</h2><p className="ml-helper">읽고, 보고, 들으며 쌓은 나의 뉴스 기록이에요.</p></div><span className="ml-pending-label">서버 완료 기록</span></div>
      <ReadingPeriodView />
      <div className="ml-reward-actions"><Link href="/my-lens#ml-news" className="ml-text-link">오늘의 뉴스 만나러 가기</Link></div>
      <details className="ml-reward-rules">
        <summary><span><strong>스탬프와 배지 기준 보기</strong><small>읽기·웹툰·듣기·영상으로 쌓는 완료 기록</small></span><ChevronDown size={18} aria-hidden /></summary>
        <div className="ml-rule-content">
          <p className="ml-connection-note">읽기는 본문 80%와 화면 노출 30초, 웹툰은 컷 80%와 10초, 듣기·영상은 등록 길이의 재생 구간 80%를 확인해요.</p>
          <dl className="ml-rule-list">
            <div><dt>하루에 스탬프 하나</dt><dd>보상 그룹을 확인한 새 콘텐츠를 처음 완료한 날, 하루 최대 1개를 받아요.</dd></div>
            <div><dt>같은 이야기는 한 번만</dt><dd>같은 이슈를 다시 열거나 다른 형식으로 봐도 스탬프를 중복 지급하지 않아요.</dd></div>
            <div><dt>쉬어가도 남는 기록</dt><dd>쉬어간 날이 있어도 이전 기록과 획득한 배지는 그대로 남아요.</dd></div>
            <div><dt>보상은 완료 기록으로</dt><dd>북마크·알림 설정만으로 지급하지 않아요. 현금성 포인트나 교환 혜택은 없어요.</dd></div>
          </dl>
          <div className="ml-rule-note"><Info size={15} aria-hidden /><p>열람 표시와 완료 기준은 달라요. 기존 기록은 소급하지 않아요. 미디어 길이와 보상 그룹을 확인하지 못한 콘텐츠는 완료 또는 보상 대기예요. 꾸준한 시선은 스탬프 3일, 새로운 발견은 최초 완료의 주 분야 3개, 다시 보는 깊이는 이미 완료·저장한 2편을 별도 세션에서 30분 이상 지나 다시 완료하면 받아요.</p></div>
        </div>
      </details>
    </section>
  );
}
