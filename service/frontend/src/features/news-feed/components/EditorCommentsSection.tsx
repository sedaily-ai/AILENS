'use client';

import Link from 'next/link';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import Image from 'next/image';
import { letterHref } from '@/shared/lib/content/letterHref';
import type { ApiLetter } from '@/shared/lib/api/todayLettersApi';

interface Props {
  // 오늘 함께 발행된, 지금 보고 있는 레터를 제외한 다른 레터들. MBTI 4-페르소나
  // 체계 폐지(2026-08-07) 이후 "그날 다른 3명의 에디터" 라는 고정 구조가 없어져
  // 0~N개 어느 쪽도 될 수 있다. 빈 배열이면 섹션 자체를 숨긴다.
  otherLetters: ApiLetter[];
}

// 단일 명의 — todayLettersApi.ts 의 DEFAULT_META 와 같은 톤. 페르소나별 아바타/
// accent lookup 은 폐지, 레터 자체의 cover_image_url 이 있으면 그걸 쓴다.
const ACCENT = '#111827';
const SOFT = '#f3f4f6';

export function EditorCommentsSection({ otherLetters }: Props) {
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
          다른 레터도 읽어보세요
        </h3>
        <p className="text-gray-500" style={{ fontSize: 13, lineHeight: 1.6 }}>
          같은 날 함께 발행된 다른 이야기들이에요.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {otherLetters.map((ltr) => (
          <article
            key={ltr.id}
            style={{
              padding: 'clamp(18px, 4vw, 24px) clamp(20px, 4vw, 26px)',
              background: '#fafaf9',
              borderRadius: 18,
            }}
          >
            {ltr.cover_image_url && (
              <header className="flex items-center gap-2.5 mb-3">
                <div
                  className="rounded-full overflow-hidden"
                  style={{
                    width: 36,
                    height: 36,
                    background: SOFT,
                    boxShadow: `0 2px 8px ${ACCENT}22`,
                  }}
                >
                  <Image src={ltr.cover_image_url} alt="" width={36} height={36} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </header>
            )}
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
              {displayHeadline(ltr.headline)}
            </h4>
            <div className="flex items-center justify-end">
              <Link
                href={letterHref(ltr.id)}
                className="inline-flex items-center gap-1 text-xs hover:translate-x-0.5 transition-transform"
                style={{ color: ACCENT, fontWeight: 500 }}
              >
                이어서 읽기 →
              </Link>
            </div>
          </article>
        ))}
      </div>

      <footer
        className="mt-6 pt-5 text-center"
        style={{ borderTop: '1px dashed #f3f4f6' }}
      >
        <p className="text-gray-400" style={{ fontSize: 13, lineHeight: 1.6 }}>
          오늘 함께 발행된 다른 이야기예요.
        </p>
      </footer>
    </section>
  );
}
