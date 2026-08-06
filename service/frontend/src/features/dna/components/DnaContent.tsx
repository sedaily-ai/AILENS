'use client';

import { useCountUp } from '@/features/news-feed';
import {
  MOCK_DNA_STATS,
  MOCK_PERSPECTIVE_SHARE,
} from '../data/mockDna';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';

const EDITOR_BY_GROUP: Record<MbtiGroupId, { name: string; archetype: string; avatar: string; accent: string; soft: string }> = {
  NT: { name: '민철', archetype: '분석가',       avatar: '/editors/intj.webp', accent: '#7c3aed', soft: '#ede9fe' },
  NF: { name: '하은', archetype: '이야기꾼',     avatar: '/editors/infp.webp', accent: '#e11d48', soft: '#ffe4e6' },
  ST: { name: '준서', archetype: '팩트 큐레이터', avatar: '/editors/istj.webp', accent: '#059669', soft: '#d1fae5' },
  SF: { name: '소율', archetype: '트렌드 캐스터', avatar: '/editors/esfp.webp', accent: '#d97706', soft: '#fef3c7' },
};

export function DnaContent() {
  const [group] = useMbtiGroup('ST');

  const editor = EDITOR_BY_GROUP[group];
  const letters = useCountUp(MOCK_DNA_STATS.totalLetters);
  const minutes = useCountUp(MOCK_DNA_STATS.totalMinutes, 900, 250);
  const kws = useCountUp(MOCK_DNA_STATS.totalKeywords, 900, 500);

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px)' }}>
      <header style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#9ca3af',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Your DNA
        </p>
        <h1
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(26px, 5.4vw, 32px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#111827',
            lineHeight: 1.35,
          }}
        >
          당신의 시각, 데이터로 보면
        </h1>
        <p className="text-gray-500 mt-2" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          지금까지 쌓아온 읽기 패턴과 사고의 결을 모아봤어요.
        </p>
      </header>


      {/* 분석 콘텐츠 */}

      {/* 내 시각 정체성 */}
      <article
        style={{
          padding: 'clamp(24px, 5vw, 32px)',
          background: editor.soft,
          borderRadius: 22,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy"
          src={editor.avatar}
          alt={editor.name}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            objectFit: 'cover',
            background: '#fff',
            boxShadow: `0 6px 16px ${editor.accent}26`,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: editor.accent, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 4 }}>
            MY LENS
          </p>
          <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(20px, 4.6vw, 24px)', fontWeight: 600, letterSpacing: '-0.02em', color: '#111827', marginBottom: 4 }}>
            {editor.name}의 시각으로 세상을 봐요
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', letterSpacing: '-0.005em' }}>
            {editor.archetype} · {MOCK_PERSPECTIVE_SHARE[0].percent}%의 글을 이 시각으로 읽었어요
          </p>
        </div>
      </article>

      {/* 누적 */}
      <article
        style={{
          padding: 'clamp(24px, 5vw, 32px)',
          background: '#fdfcfb',
          borderRadius: 22,
          marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, marginBottom: 16 }}>
          누적
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { value: letters, label: '편의 글' },
            { value: minutes, label: '분의 사고' },
            { value: kws, label: '개의 단어' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(28px, 7vw, 38px)', fontWeight: 600, color: editor.accent, letterSpacing: '-0.03em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, letterSpacing: '-0.005em' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </article>

      {/* V1.5 단순화 — 키워드 TOP·시간 패턴·시각 비율은 백엔드 추적 필요해서 V2에. */}
    </section>
  );
}
