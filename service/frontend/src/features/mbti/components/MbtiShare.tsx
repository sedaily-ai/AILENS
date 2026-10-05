'use client';

import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { SITE_URL } from '@/shared/constants/site';
import { MBTI_GROUP_INFO, resultPath } from '../lib/mbtiCorner';

// GA4 platform 값은 aria-label 문구가 아니라 이 고정 코드로 보낸다 — 라벨은 접근성용 문구라 다듬어질 수 있고,
// 바뀌면 GA 차원 값이 둘로 갈라진다. 키는 shared/ui/ArticleShareButtons의 aria-label과 짝이다(모르는 라벨은 'other').
const SHARE_PLATFORM_BY_LABEL: ReadonlyMap<string, string> = new Map([
  ['카카오톡 공유 (링크 복사)', 'kakao'],
  ['인스타그램 공유 (링크 복사)', 'instagram'],
  ['페이스북에 공유', 'facebook'],
  ['X(트위터)에 공유', 'x'],
  ['링크드인에 공유', 'linkedin'],
  ['링크 복사', 'copy'],
]);

// 공유 주소는 ?t를 뺀 그룹 주소 — 미리보기 이미지가 그룹 단위라서다.
// 계측은 공용 ArticleShareButtons를 고치지 않고 감싼 영역의 클릭 캡처로 잡는다(눌린 버튼의 aria-label을 코드로 바꿔 보낸다).
export function MbtiShare({ group }: { group: MbtiGroupId }) {
  const info = MBTI_GROUP_INFO[group];
  return (
    <div
      onClickCapture={(e) => {
        const label = (e.target as HTMLElement).closest('button')?.getAttribute('aria-label');
        if (label) trackEvent('mbti_share', { group, platform: SHARE_PLATFORM_BY_LABEL.get(label) ?? 'other' });
      }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 16 }}
    >
      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>내 유형 공유하기</span>
      <ArticleShareButtons title={`나는 ${group}형 — ${info.title} | MBTI로 보는 오늘의 뉴스`} url={`${SITE_URL}${resultPath(group)}`} />
    </div>
  );
}
