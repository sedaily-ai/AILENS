import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_INFO, MBTI_GROUP_ORDER, resultPath } from '../lib/mbtiCorner';

export function GroupSwitcher({ current }: { current: MbtiGroupId }) {
  return (
    <nav aria-label="다른 유형으로 보기" style={{ marginTop: 36 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>다른 유형으로 보기</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MBTI_GROUP_ORDER.filter((g) => g !== current).map((g) => (
          <Link key={g} href={resultPath(g)} style={{ padding: '8px 14px', borderRadius: 999, border: LENS_CARD_BORDER, fontSize: 13, color: '#334155', textDecoration: 'none' }}>
            {g}형 · {MBTI_GROUP_INFO[g].title}
          </Link>
        ))}
      </div>
    </nav>
  );
}
