'use client';

import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { toLetterIdFromApi, type ApiLetter } from '@/shared/lib/todayLettersApi';

interface Props {
  // 자기 group letter 를 제외한 그날의 다른 3 letter.
  // 빈 배열이면 섹션 숨김.
  otherLetters: ApiLetter[];
  // 현재 보고있는 레터의 날짜 (YYYY-MM-DD) — 다른 시각 카드 클릭 시
  // 같은 날 다른 그룹의 letter 라우트 (/letters/{group}-{date}) 로 보내기 위함.
  letterDate: string;
}

interface PersonaMini {
  group: MbtiGroupId;
  name: string;
  archetype: string;
  avatar: string;
  editorId: string;
  accent: string;
  soft: string;
}

const PERSONAS: Record<MbtiGroupId, PersonaMini> = {
  NT: { group: 'NT', name: '민철', archetype: '분석가',       avatar: '/editors/intj.webp', editorId: 'NT-min', accent: '#7c3aed', soft: '#ede9fe' },
  NF: { group: 'NF', name: '하은', archetype: '이야기꾼',     avatar: '/editors/infp.webp', editorId: 'NF-ha',  accent: '#e11d48', soft: '#ffe4e6' },
  ST: { group: 'ST', name: '준서', archetype: '실용주의자', avatar: '/editors/istj.webp', editorId: 'ST-jun', accent: '#059669', soft: '#d1fae5' },
  SF: { group: 'SF', name: '소율', archetype: '공감러',     avatar: '/editors/esfp.webp', editorId: 'SF-soy', accent: '#d97706', soft: '#fef3c7' },
};

export function EditorCommentsSection({ otherLetters, letterDate }: Props) {
  if (!otherLetters || otherLetters.length === 0) return null;

  return (
    <section
      style={{
        maxWidth: 720,
        margin: '40px auto 0',
        padding: 'clamp(26px, 5vw, 36px) clamp(20px, 5vw, 32px)',
        background: '#fdfcfb',
        borderRadius: 24,
        boxShadow: '0 4px 20px rgba(0,0,0,0.025)',
      }}
    >
      <header className="mb-6">
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
          Another Lens
        </p>
        <h3
          className="font-medium text-gray-900"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(18px, 4.2vw, 20px)',
            letterSpacing: '-0.02em',
            marginBottom: 6,
          }}
        >
          같은 사건, 다른 시각
        </h3>
        <p className="text-gray-500" style={{ fontSize: 13, lineHeight: 1.6 }}>
          내가 받은 글 옆에, 다른 세 사람이 같은 사건을 어떻게 봤는지 옮겨놨어요.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {otherLetters.map((ltr) => {
          // MBTI 4색 비교 섹션 — 에디터가 안 붙은 CMS 글은 애초에 이 비교 대상이 아니다.
          if (!ltr.mbti_group) return null;
          const p = PERSONAS[ltr.mbti_group];
          return (
            <article
              key={ltr.mbti_group}
              style={{
                padding: 'clamp(18px, 4vw, 24px) clamp(20px, 4vw, 26px)',
                background: '#fafaf9',
                borderRadius: 18,
              }}
            >
              <header className="flex items-center gap-2.5 mb-3">
                <div
                  className="rounded-full overflow-hidden"
                  style={{
                    width: 36,
                    height: 36,
                    background: p.soft,
                    boxShadow: `0 2px 8px ${p.accent}22`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="font-medium text-gray-900"
                    style={{ fontSize: 14, letterSpacing: '-0.01em' }}
                  >
                    {p.name}
                  </span>
                  <span
                    className="inline-flex items-center"
                    style={{
                      padding: '2px 8px',
                      background: p.soft,
                      color: p.accent,
                      fontSize: 10.5,
                      fontWeight: 600,
                      borderRadius: 999,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {p.archetype}
                  </span>
                </div>
              </header>
              <h4
                className="text-gray-900"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  letterSpacing: '-0.01em',
                  margin: '0 0 10px',
                }}
              >
                {ltr.headline}
              </h4>
              <div className="flex items-center justify-end">
                <Link
                  href={`/letters/${toLetterIdFromApi(ltr.mbti_group, letterDate)}`}
                  className="inline-flex items-center gap-1 text-xs hover:translate-x-0.5 transition-transform"
                  style={{ color: p.accent, fontWeight: 500 }}
                >
                  {p.name}의 한 통 읽기 →
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <footer
        className="mt-6 pt-5 text-center"
        style={{ borderTop: '1px dashed #f3f4f6' }}
      >
        <p className="text-gray-400" style={{ fontSize: 13, lineHeight: 1.6 }}>
          당신은 어느 시각이 가장 가깝게 느껴졌나요?
        </p>
      </footer>
    </section>
  );
}
