'use client';

/**
 * 메인 피드 하단 — 뉴스레터 구독 CTA.
 * 4 페르소나 카드 (한 줄, 다중 선택) + 샘플 미리보기 토글 + 이메일 입력.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { NewsletterEmailField, type SubscribeLetterPayload } from '@/shared/ui/NewsletterEmailField';
import { useLatestLetters } from '@/shared/lib/useLatestLetters';
import { letterHref } from '@/shared/lib/letterHref';

const PERSONAS: {
  group: MbtiGroupId;
  name: string;
  archetype: string;
  avatar: string;
  accent: string;
}[] = [
  { group: 'NT', name: '민철', archetype: '전략 분석가', avatar: '/editors/intj.webp', accent: '#7c3aed' },
  { group: 'NF', name: '하은', archetype: '가치 탐색가', avatar: '/editors/infp.webp', accent: '#e11d48' },
  { group: 'ST', name: '준서', archetype: '실용 큐레이터', avatar: '/editors/istj.webp', accent: '#059669' },
  { group: 'SF', name: '소율', archetype: '공감 캐스터', avatar: '/editors/esfp.webp', accent: '#d97706' },
];

export function NewsletterCTA() {
  const { letters, date } = useLatestLetters();
  const [selected, setSelected] = useState<Set<MbtiGroupId>>(
    () => new Set<MbtiGroupId>(['NT', 'NF', 'ST', 'SF']),
  );
  const [showSample, setShowSample] = useState(false);

  const toggle = (g: MbtiGroupId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const selectedArr = Array.from(selected);
  const submitAccent =
    selectedArr.length === 1
      ? PERSONAS.find((p) => p.group === selectedArr[0])?.accent ?? '#3182F6'
      : '#3182F6';
  const buttonLabel =
    selectedArr.length === 0
      ? '에디터 선택'
      : selectedArr.length === 4
        ? '4명 모두 구독'
        : `${selectedArr.length}명 구독`;

  // 샘플 레터 — 선택된 페르소나 중 첫번째의 가장 최근 발행분.
  const sampleLetter = useMemo(() => {
    const firstSelected = selectedArr[0];
    const target = firstSelected
      ? letters.find((l) => l.mbti_group === firstSelected)
      : letters[0];
    if (!target || !target.mbti_group) return null;
    const persona = PERSONAS.find((p) => p.group === target.mbti_group)!;
    return {
      ...target,
      persona,
      href: date ? letterHref(`${target.mbti_group.toLowerCase()}-${date}`) : '/?tab=feed',
    };
  }, [selectedArr, letters, date]);

  // 구독 즉시 발송할 letter payload 매핑 — 그 페르소나의 최신 발행분 한 통.
  // 백엔드가 letter.headline 있으면 SES 로 즉시 발송.
  const lettersByGroup = useMemo(() => {
    const map: Partial<Record<MbtiGroupId, SubscribeLetterPayload>> = {};
    for (const l of letters) {
      if (!l.mbti_group) continue;
      const persona = PERSONAS.find((p) => p.group === l.mbti_group);
      if (!persona) continue;
      map[l.mbti_group] = {
        editor_name: persona.name,
        editor_role: persona.archetype,
        accent: persona.accent,
        headline: l.headline,
        subtitle: l.subtitle,
        body: l.body,
        key_points: l.key_points,
        closing_line: l.closing_line,
      };
    }
    return map;
  }, [letters]);

  return (
    <section
      aria-labelledby="newsletter-cta-title"
      style={{
        maxWidth: 560,
        margin: '40px auto 0',
        padding: '24px 4px 0',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#9ca3af',
            letterSpacing: '0.2em',
            margin: '0 0 6px',
            textTransform: 'uppercase',
          }}
        >
          Newsletter
        </p>
        <h2
          id="newsletter-cta-title"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          매일 아침, 한 통씩 메일함으로
        </h2>
      </div>

      <div
        role="group"
        aria-label="구독할 에디터 선택"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          marginBottom: 12,
        }}
      >
        {PERSONAS.map((p) => {
          const on = selected.has(p.group);
          return (
            <button
              key={p.group}
              type="button"
              onClick={() => toggle(p.group)}
              aria-pressed={on}
              aria-label={`${p.name} ${p.archetype} ${on ? '선택 해제' : '선택'}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 10,
                padding: '8px 4px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                position: 'relative',
                outline: 'none',
                color: 'inherit',
              }}
            >
              <span
                style={{
                  position: 'relative',
                  display: 'block',
                  width: 44,
                  height: 44,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.avatar}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    background: '#f3f4f6',
                    opacity: on ? 1 : 0.38,
                    transition: 'opacity 0.15s',
                    filter: on ? 'none' : 'grayscale(50%)',
                  }}
                />
                {on && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: p.accent,
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 0 2px #fff',
                    }}
                  >
                    ✓
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: on ? '#111827' : '#9ca3af',
                  transition: 'color 0.15s',
                }}
              >
                {p.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* 샘플 보기 토글 — 카드와 입력 사이의 작은 링크 */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setShowSample((v) => !v)}
          aria-expanded={showSample}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 12.5,
            color: '#6b7280',
            fontWeight: 500,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          {showSample ? '샘플 접기 ↑' : '샘플 한 통 미리보기 ↓'}
        </button>
      </div>

      {/* 샘플 레터 인라인 미리보기 */}
      {showSample && sampleLetter && (
        <article
          style={{
            marginBottom: 16,
            padding: '16px 18px 14px',
            background: '#fafafa',
            borderRadius: 12,
            animation: 'sample-in 0.18s ease-out',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sampleLetter.persona.avatar}
              alt=""
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#f3f4f6',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
              {sampleLetter.persona.name}
            </span>
            <span style={{ fontSize: 11.5, color: sampleLetter.persona.accent, fontWeight: 600 }}>
              {sampleLetter.persona.archetype}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
              {(date ?? '').replace(/-/g, '.')} 발행
            </span>
          </header>
          <h3
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
              lineHeight: 1.45,
              letterSpacing: '-0.01em',
              margin: '0 0 6px',
            }}
          >
            {sampleLetter.headline}
          </h3>
          {sampleLetter.subtitle && (
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                lineHeight: 1.65,
                margin: '0 0 10px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {sampleLetter.subtitle}
            </p>
          )}
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 13.5,
              color: '#4b5563',
              lineHeight: 1.8,
              margin: '0 0 12px',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {sampleLetter.body[0] ?? ''}
          </p>
          <Link
            href={sampleLetter.href}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: sampleLetter.persona.accent,
              textDecoration: 'none',
              letterSpacing: '-0.005em',
            }}
          >
            전체 보기 →
          </Link>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.6 }}>
            매일 아침 이 형식으로 도착해요.
          </p>
        </article>
      )}

      <NewsletterEmailField
        groups={selectedArr}
        lettersByGroup={lettersByGroup}
        accent={submitAccent}
        buttonLabel={buttonLabel}
        disabled={selectedArr.length === 0}
      />

      <style>{`@keyframes sample-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </section>
  );
}
