'use client';

import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { SITE_URL } from '@/shared/constants/site';
import { MBTI_GROUP_INFO, resultPath } from '../lib/mbtiCorner';

// 공유 주소는 ?t를 뺀 그룹 주소 — 미리보기 이미지가 그룹 단위라서다.
// 계측은 공용 ArticleShareButtons를 고치지 않고 감싼 영역의 클릭 캡처로 잡는다(버튼 aria-label이 플랫폼 이름).
export function MbtiShare({ group }: { group: MbtiGroupId }) {
  const info = MBTI_GROUP_INFO[group];
  return (
    <div
      onClickCapture={(e) => {
        const label = (e.target as HTMLElement).closest('button')?.getAttribute('aria-label');
        if (label) trackEvent('mbti_share', { group, platform: label });
      }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 16 }}
    >
      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>내 유형 공유하기</span>
      <ArticleShareButtons title={`나는 ${group}형 — ${info.title} | MBTI로 보는 오늘의 뉴스`} url={`${SITE_URL}${resultPath(group)}`} />
    </div>
  );
}
