'use client';

import { useEffect, useState } from 'react';
import { LENS_PERSPECTIVES, LENS_ACCENT, type LensPerspective } from '@/shared/constants/lensPerspectives';

// 실제 카드 UI를 축소 재현한 목업 무대 — 캐러셀처럼 슬라이드가 옆으로
// 밀려 넘어가며 "지면·형식을 어떻게 고르는지"(0번 슬라이드) → "형식별로
// 실제 뭐가 담기는지 샘플"(1~4번 슬라이드, 레터·웹툰·팟캐스트·영상)을
// 순서대로 보여준다(2026-08-21).
//
// 히스토리 — 요구사항이 3번 더 구체화됐다:
//  1차: 정적 텍스트 카드 4장(설명만).
//  2차: "실제 흐름을 단계로... 동영상처럼" → 커서가 스스로 탭/행을
//       클릭하는 애니메이션 추가.
//  3차: "각 단계들 모두" → 웹툰 하나만 반복하던 데모를 4형식 전부로 확장.
//  4차(이번): "좀 더 자연스럽게... 안에 내용까지 샘플도... 캐러셀처럼
//       넘어가는듯이... 독자를 심심하게 하지 마시죠" → (a) 형식별로 진짜
//       내용처럼 보이는 시각 샘플(레터=문단 줄, 웹툰=4컷 그리드, 팟캐스트=
//       파형+재생버튼, 영상=플레이어 프레임)을 추가하고, (b) 아래 별도
//       캡션 줄이 패널 안 텍스트와 그대로 겹쳐 보이던 중복을 없애 슬라이드
//       하나당 정보를 한 번씩만 보여주게 정리했고, (c) opacity 크로스페이드
//       대신 진짜 가로 슬라이드(translateX) 캐러셀로 전환했다. 겸사겸사
//       "영상로"/"웹툰로"처럼 로/으로 조사가 틀리던 것도 고쳤다(받침 유무로
//       계산하는 ro() 헬퍼).
//
// 실제 라이브 카드를 그대로 끌어오는 대신 절대좌표 목업을 새로 그렸다 —
// LensPreviewSection의 실제 마크업은 반응형 그리드·실 데이터 의존이 커서
// 무대 안에서 크기가 매번 흔들린다. 고정 무대 안에서 좌표를 고정해야
// 캐러셀 이동·커서 이동 애니메이션이 매번 정확히 같은 지점을 짚는다.

/** "레터"/"웹툰"처럼 받침 유무에 따라 로/으로를 바르게 붙인다(ㄹ받침은 "로"). */
function ro(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}로`;
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`;
}

const TAB_LABELS = ['지면', '증권', '산업', '시그널'];
const ACTIVE_TAB = 1; // 데모에서 클릭하는 탭(증권)

const STAGE_W = 420;
const STAGE_H = 264;
const PAD = 16;
const TAB_TOP = PAD;
const TAB_H = 32;
const ROW_TOP = TAB_TOP + TAB_H + 12;
const ROW_H = 40;

function tabCenter(i: number) {
  const w = (STAGE_W - PAD * 2 - 8 * 3) / 4;
  const left = PAD + i * (w + 8);
  return { x: left + w / 2, y: TAB_TOP + TAB_H / 2 };
}

function rowIconCenter(i: number) {
  return { x: PAD + 16, y: ROW_TOP + i * ROW_H + ROW_H / 2 };
}

// 0번 슬라이드(조작법) 내부의 두 하위 단계(탭 클릭 → 행 클릭) — 슬라이드
// 자체는 안 넘어가고 이 안에서만 커서가 움직인다.
type IntroPhase = 'tab' | 'row';
interface TimelineStep {
  slide: number; // 0=조작법, 1~4=형식 샘플(LENS_PERSPECTIVES 인덱스+1)
  introPhase?: IntroPhase;
  ms: number;
}
const TIMELINE: TimelineStep[] = [
  { slide: 0, introPhase: 'tab', ms: 1300 },
  { slide: 0, introPhase: 'row', ms: 1500 },
  { slide: 1, ms: 2800 },
  { slide: 2, ms: 2800 },
  { slide: 3, ms: 2800 },
  { slide: 4, ms: 2800 },
];

function FormatSample({ p }: { p: LensPerspective }) {
  // 고정 height를 쓰면 콘텐츠가 그보다 크게 렌더될 때(웹툰 그리드 등)
  // 위아래로 넘쳐서 헤더 텍스트와 겹치는 버그가 났다(2026-08-21, 사용자가
  // 스크린샷으로 지적 — "겹치는게 있는듯한데"). minHeight로 바꿔 실제
  // 콘텐츠 크기만큼 자연스럽게 공간을 차지하게 한다.
  const style: React.CSSProperties = { minHeight: 66, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  switch (p.short) {
    case '레터':
      return (
        <div style={style}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: 190 }}>
            {[100, 88, 96, 68].map((w, i) => (
              <div key={i} style={{ height: 7, width: `${w}%`, borderRadius: 4, background: i === 0 ? p.color : '#e5e7eb' }} />
            ))}
          </div>
        </div>
      );
    case '웹툰':
      return (
        <div style={style}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 30px)', gridAutoRows: '30px', gap: 6 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  borderRadius: 7,
                  background: p.tint,
                  border: `1.5px solid ${p.color}55`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, opacity: 0.5 }} />
              </div>
            ))}
          </div>
        </div>
      );
    case '팟캐스트':
      return (
        <div style={style}>
          <div className="flex items-center" style={{ gap: 12 }}>
            <span
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 38, height: 38, borderRadius: '50%', background: p.color }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <div className="flex items-end" style={{ gap: 3, height: 34 }}>
              {[9, 19, 13, 28, 17, 24, 11, 21, 15, 26].map((h, i) => (
                <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: p.color, opacity: 0.35 + (i % 3) * 0.22 }} />
              ))}
            </div>
          </div>
        </div>
      );
    case '영상':
      return (
        <div style={style}>
          <div
            className="relative flex items-center justify-center"
            style={{ width: 140, height: 66, borderRadius: 10, background: '#111827' }}
          >
            <span
              className="flex items-center justify-center"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', border: '1.5px solid rgba(255,255,255,0.55)' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span
              className="absolute"
              style={{ bottom: 7, right: 9, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '1.5px 6px', borderRadius: 4 }}
            >
              0:09
            </span>
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function LensGuideAnimation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].ms);
    return () => clearTimeout(id);
  }, [step]);

  const t = TIMELINE[step];
  const activeFormat = t.slide > 0 ? LENS_PERSPECTIVES[t.slide - 1] : null;

  return (
    <div style={{ marginBottom: 22 }}>
      <style>{`
        @keyframes lz-guide-ripple {
          0% { transform: scale(0.4); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes lz-guide-pop {
          0% { transform: scale(0.94) translateY(4px); opacity: 0; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: STAGE_W,
          height: STAGE_H,
          margin: '0 auto',
          borderRadius: 16,
          background: '#f7f8fa',
          border: '1px solid rgba(17,24,39,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* 캐러셀 트랙 — 슬라이드 0(조작법) + 1~4(형식 샘플)이 가로로
            나란히 놓이고, translateX로 부드럽게 밀려 넘어간다. */}
        <div
          style={{
            display: 'flex',
            width: STAGE_W * 5,
            height: '100%',
            transform: `translateX(-${t.slide * STAGE_W}px)`,
            transition: 'transform .55s cubic-bezier(.4,0,.2,1)',
          }}
        >
          {/* 슬라이드 0 — 조작법: 탭을 고르고 형식 행을 누른다. */}
          <div style={{ width: STAGE_W, height: '100%', flexShrink: 0, position: 'relative' }}>
            <div style={{ position: 'absolute', top: TAB_TOP, left: PAD, right: PAD, height: TAB_H, display: 'flex', gap: 8 }}>
              {TAB_LABELS.map((label, i) => {
                const on = t.introPhase === 'tab' && i === ACTIVE_TAB;
                return (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: on ? LENS_ACCENT : '#9ca3af',
                      background: on ? '#fff' : 'transparent',
                      border: `1.5px solid ${on ? LENS_ACCENT : 'transparent'}`,
                      boxShadow: on ? '0 1px 4px rgba(17,24,39,0.08)' : 'none',
                      transition: 'all .35s ease',
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            <div style={{ position: 'absolute', top: ROW_TOP, left: PAD, right: PAD }}>
              {LENS_PERSPECTIVES.map((p, i) => {
                const on = t.introPhase === 'row' && i === 0;
                return (
                  <div
                    key={p.short}
                    style={{
                      height: ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 10px',
                      borderRadius: 10,
                      background: on ? p.tint : 'transparent',
                      transition: 'background .3s ease',
                    }}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', overflow: 'hidden' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                      <img
                        src={p.illustration}
                        alt=""
                        width={22}
                        height={22}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                      />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? p.color : '#374151' }}>{p.short}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.tagline}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 커서 — 슬라이드 0 안에서만 두 지점을 오간다. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: (t.introPhase === 'tab' ? tabCenter(ACTIVE_TAB) : rowIconCenter(0)).x,
                top: (t.introPhase === 'tab' ? tabCenter(ACTIVE_TAB) : rowIconCenter(0)).y,
                transform: 'translate(-6px, -6px)',
                transition: 'left .5s cubic-bezier(.4,0,.2,1), top .5s cubic-bezier(.4,0,.2,1)',
                pointerEvents: 'none',
              }}
            >
              <span
                key={`ripple-${step}`}
                style={{
                  position: 'absolute',
                  left: -8,
                  top: -8,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: `2px solid ${LENS_ACCENT}`,
                  animation: 'lz-guide-ripple .6s ease-out',
                }}
              />
              <svg width={18} height={18} viewBox="0 0 24 24" fill="#111827" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
                <path d="M4 2l14 8-6 1.5L14 18l-3-1.5-1.5 6L4 2z" />
              </svg>
            </div>

            <p
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 14,
                textAlign: 'center',
                fontSize: 12.5,
                fontWeight: 700,
                color: LENS_ACCENT,
              }}
            >
              {t.introPhase === 'tab' ? '① 지면(탭)을 먼저 골라요' : '② 형식 하나를 눌러요'}
            </p>
          </div>

          {/* 슬라이드 1~4 — 형식별 실제 내용 샘플. */}
          {LENS_PERSPECTIVES.map((p) => (
            <div key={p.short} style={{ width: STAGE_W, height: '100%', flexShrink: 0, padding: `${PAD}px` }}>
              <div className="flex flex-col items-center" style={{ height: '100%', justifyContent: 'center', gap: 14 }}>
                <div
                  key={activeFormat === p ? `pop-${step}` : undefined}
                  className="flex flex-col items-center"
                  style={{ gap: 10, animation: activeFormat === p ? 'lz-guide-pop .4s ease' : undefined }}
                >
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 30, height: 30, borderRadius: '50%', background: p.tint, overflow: 'hidden' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                      <img
                        src={p.illustration}
                        alt=""
                        width={30}
                        height={30}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                      />
                    </span>
                    <div className="flex flex-col items-start" style={{ maxWidth: 220 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: '#111827' }}>{p.short}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: p.color, wordBreak: 'keep-all' }}>{p.tagline}</span>
                    </div>
                  </div>

                  <FormatSample p={p} />

                  <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', lineHeight: 1.5, maxWidth: 260, wordBreak: 'keep-all' }}>
                    {p.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeFormat && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
          {ro(activeFormat.short)} 바로 볼 수 있어요
        </p>
      )}

      <div className="flex items-center justify-center" style={{ gap: 6, marginTop: activeFormat ? 6 : 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              width: t.slide === i ? 16 : 6,
              height: 6,
              borderRadius: 999,
              background: t.slide === i ? LENS_ACCENT : '#e5e7eb',
              transition: 'all .3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
