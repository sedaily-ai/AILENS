import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER, lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_INFO, type MbtiType } from '../lib/mbtiCorner';

// 색은 형식 기준(lensPerspectiveAt) — 사이트 다른 곳의 형식 색과 같게 보인다.
export function ResultCard({ group, type }: { group: MbtiGroupId; type: MbtiType | null }) {
  const info = MBTI_GROUP_INFO[group];
  const p = lensPerspectiveAt(info.formatIndex);
  const Icon = p.icon;
  return (
    <section
      aria-labelledby="mbti-result-title"
      style={{ background: '#ffffff', borderRadius: 20, padding: '28px 24px', border: LENS_CARD_BORDER, boxShadow: '0 12px 28px rgba(17,24,39,0.06)', textAlign: 'center' }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.14em' }}>
        {type ? `${type} · ${group}형` : `${group}형`}
      </p>
      <h2 id="mbti-result-title" style={{ margin: '10px 0 8px', fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>
        {info.title}
      </h2>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: '#6b7280' }}>{info.summary}</p>
      <p style={{ margin: '18px 0 0', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: p.tint, color: p.color, fontSize: 13, fontWeight: 700 }}>
        <Icon size={16} aria-hidden /> 추천 형식: {p.short}
      </p>
    </section>
  );
}
