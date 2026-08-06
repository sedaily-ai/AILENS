'use client';

import { useMemo } from 'react';
import { SajuChat } from './SajuChat';
import { OhaengBars, type OhaengKey } from './OhaengBars';
import { voiceFor, STEPS, type PersonaGroup, type Step, type VoiceContext, personaMeta } from '../lib/personaVoice';

interface Props {
  group: PersonaGroup;
  onChangeGroup?: (g: PersonaGroup) => void;
  context: VoiceContext;
  ohaengCounts: Record<OhaengKey, number>;
}

const STEP_VISUAL_HINT: Record<Step, boolean> = {
  greeting: false,
  ilgan: true,
  ohaeng: true,
  gyeokguk: false,
  today: true,
  closing: false,
};

const elementColors: Record<string, { bg: string; ink: string }> = {
  목: { bg: '#dcfce7', ink: '#15803d' },
  화: { bg: '#fee2e2', ink: '#b91c1c' },
  토: { bg: '#fef3c7', ink: '#b45309' },
  금: { bg: '#e5e7eb', ink: '#475569' },
  수: { bg: '#dbeafe', ink: '#1d4ed8' },
};

const accentByGroup: Record<PersonaGroup, { ink: string; line: string; soft: string }> = {
  NT: { ink: '#5b21b6', line: '#ddd6fe', soft: '#f5f3ff' },
  NF: { ink: '#9f1239', line: '#fecdd3', soft: '#fff1f2' },
  ST: { ink: '#065f46', line: '#a7f3d0', soft: '#ecfdf5' },
  SF: { ink: '#92400e', line: '#fde68a', soft: '#fffbeb' },
};

export function SajuStoryReveal({ group, onChangeGroup, context, ohaengCounts }: Props) {
  void onChangeGroup;
  const p = personaMeta[group];
  const c = accentByGroup[group];

  const allVoices = useMemo(
    () => STEPS.map((s) => voiceFor(group, s, context)),
    [group, context]
  );

  return (
    <article>
      {/* 작가 라인 — 한 번만 */}
      <header
        className="flex items-center"
        style={{
          gap: 12,
          paddingBottom: 16,
          marginBottom: 20,
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy"
          src={p.avatar}
          alt={p.name}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            objectFit: 'cover',
            background: c.soft,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10.5,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: c.ink,
              fontWeight: 700,
              marginBottom: 3,
            }}
          >
            오늘의 풀이
          </p>
          <p style={{ fontSize: 14, color: '#111827', letterSpacing: '-0.01em' }}>
            <strong style={{ fontWeight: 600 }}>{p.name}</strong>
            <span className="text-gray-300 mx-1.5">·</span>
            <span style={{ color: c.ink, fontWeight: 500 }}>{p.nickname}</span>
          </p>
        </div>
      </header>

      {/* 본문 — 한 편의 글로 흘러감 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {allVoices.map((voice, i) => {
          const step = STEPS[i];
          const visual = STEP_VISUAL_HINT[step] ? renderVisual(step, context, ohaengCounts) : null;

          return (
            <section key={step}>
              {/* 작은 라벨 */}
              <p
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#9ca3af',
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                {voice.label}
              </p>

              {/* 타이틀 */}
              <h3
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 'clamp(19px, 4.4vw, 23px)',
                  fontWeight: 600,
                  color: '#111827',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.4,
                  marginBottom: 14,
                }}
              >
                {voice.title}
              </h3>

              {/* 본문 단락 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {voice.body.map((para, j) => (
                  <p
                    key={j}
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 'clamp(14.5px, 3.4vw, 15.5px)',
                      color: '#374151',
                      lineHeight: 1.85,
                      letterSpacing: '-0.005em',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>

              {/* 강조 인용 */}
              {voice.highlight && (
                <p
                  style={{
                    marginTop: 16,
                    paddingLeft: 14,
                    borderLeft: `2px solid ${c.line}`,
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 14.5,
                    color: '#4b5563',
                    lineHeight: 1.75,
                    letterSpacing: '-0.005em',
                    fontStyle: 'italic',
                  }}
                >
                  {voice.highlight}
                </p>
              )}

              {/* 시각 요소 */}
              {visual && <div style={{ marginTop: 20 }}>{visual}</div>}
            </section>
          );
        })}
      </div>

      {/* 본문 끝 채팅 */}
      <div style={{ marginTop: 36 }}>
        <SajuChat group={group} context={context} />
      </div>
    </article>
  );
}

function renderVisual(
  step: Step,
  context: VoiceContext,
  ohaengCounts: Record<OhaengKey, number>,
) {
  if (step === 'ilgan') {
    const ilgan = context.ilganHanja || context.ilgan;
    const ohaeng = context.ilganElement;
    const color = elementColors[ohaeng] || elementColors['목'];
    return (
      <div
        style={{
          padding: '18px 20px',
          background: color.bg,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color.ink,
            fontSize: 24,
            fontWeight: 700,
            fontFamily: '"Noto Serif KR", serif',
            flexShrink: 0,
          }}
        >
          {ohaeng}
        </div>
        <div>
          <p style={{ fontSize: 11, color: color.ink, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 2 }}>
            나의 일간
          </p>
          <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 17, color: '#1f2937', fontWeight: 600, letterSpacing: '-0.015em' }}>
            {ilgan}
            <span style={{ color: color.ink, fontWeight: 500, fontSize: 13, marginLeft: 8 }}>
              · {ohaeng} · {context.seasonHint ?? ''}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (step === 'ohaeng') {
    return <OhaengBars counts={ohaengCounts} />;
  }

  if (step === 'today') {
    return null;
  }

  return null;
}
