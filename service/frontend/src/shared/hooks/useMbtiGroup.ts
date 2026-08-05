'use client';

import { useEffect, useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { getSavedMbtiGroup, saveMbtiGroup } from '@/shared/lib/mbtiGroupStorage';

// localStorage 의 mbti-group 을 마운트 시 하이드레이트하고, setGroup 호출 시
// state 갱신과 localStorage 저장을 함께 처리한다. 여러 페이지/컴포넌트에
// 흩어져 있던 동일 패턴(useState + useEffect + localStorage.getItem/setItem)을 통합.
export function useMbtiGroup(
  defaultGroup: MbtiGroupId,
): [MbtiGroupId, (group: MbtiGroupId) => void] {
  const [group, setGroupState] = useState<MbtiGroupId>(defaultGroup);

  useEffect(() => {
    const saved = getSavedMbtiGroup();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 초기화 (정당한 케이스)
    if (saved) setGroupState(saved);
  }, []);

  const setGroup = (next: MbtiGroupId) => {
    setGroupState(next);
    saveMbtiGroup(next);
  };

  return [group, setGroup];
}
