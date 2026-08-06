'use client';

import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

interface Props {
  selectedGroup: MbtiGroupId;
}

interface CheerMeta {
  name: string;
  avatar: string;
  accent: string;
  soft: string;
  message: string;
}

const CHEER_BY_GROUP: Record<MbtiGroupId, CheerMeta> = {
  NT: {
    name: '민철',
    avatar: '/editors/intj.webp',
    accent: '#7c3aed',
    soft: '#ede9fe',
    message: '오늘 챙겨야 할 변수 셋, 챙기셨어요. 내일도 같은 자리에서 봬요.',
  },
  NF: {
    name: '하은',
    avatar: '/editors/infp.webp',
    accent: '#e11d48',
    soft: '#ffe4e6',
    message: '한 사람의 이야기를 함께 읽어주셨어요. 마음이 한 번 멈춘 자리가 있길.',
  },
  ST: {
    name: '준서',
    avatar: '/editors/istj.webp',
    accent: '#059669',
    soft: '#d1fae5',
    message: '결론 챙기셨고, 끝. 내일 또 3분 안에 정리해드릴게요.',
  },
  SF: {
    name: '소율',
    avatar: '/editors/esfp.webp',
    accent: '#d97706',
    soft: '#fef3c7',
    message: '오늘도 함께 챙겨봤네요! 내일은 또 어떤 게 핫할지 가져올게요.',
  },
};

export function CompletionCheer({ selectedGroup }: Props) {
  const cheer = CHEER_BY_GROUP[selectedGroup];

  return (
    <section
      style={{
        maxWidth: 720,
        margin: '40px auto 0',
        padding: 'clamp(24px, 5vw, 36px) clamp(20px, 5vw, 32px)',
        background: cheer.soft,
        borderRadius: 20,
        textAlign: 'center',
      }}
    >
      <div
        className="mx-auto rounded-full overflow-hidden mb-4"
        style={{
          width: 64,
          height: 64,
          background: '#ffffff',
          boxShadow: `0 8px 20px ${cheer.accent}26`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" src={cheer.avatar} alt={cheer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <p
        className="text-gray-700"
        style={{
          fontFamily: '"Noto Serif KR", serif',
          fontSize: 'clamp(15px, 3.8vw, 16.5px)',
          lineHeight: 1.7,
          letterSpacing: '-0.01em',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        “{cheer.message}”
      </p>
      <p
        className="mt-3"
        style={{
          fontSize: 12,
          color: cheer.accent,
          fontWeight: 600,
          letterSpacing: '-0.005em',
        }}
      >
        — {cheer.name}
      </p>
    </section>
  );
}
