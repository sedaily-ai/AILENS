'use client';

import { useEffect, useState } from 'react';
import { LENS_PERSPECTIVES, LENS_ACCENT } from '@/shared/constants/lensPerspectives';

// 실제 카드 UI를 축소 재현한 목업 무대 위에서 커서가 "탭 클릭 → 형식 클릭
// → 내용 펼쳐짐" 순서로 스스로 움직이는 루프 애니메이션(2026-08-21, 사용자
// 요청 — "실제 흐름을 단계로... 동영상처럼 실제 사용자 행동하는게 흐름
// 넘어가는게 보이도록"). 1차 버전은 웹툰 한 형식만 반복 데모했는데,
// "조금 더 구체적으로 길게... 각 단계들 모두 만들어주시죠"라는 재요청으로
// 레터·웹툰·팟캐스트·영상 4형식을 전부 순서대로 돌며 각각 "행 클릭 →
// 그 형식 내용 펼쳐짐"까지 보여주도록 확장했다 — 총 9단계(탭 1 + 형식별
// 선택·펼침 2×4)를 순회하는 더 긴 루프.
//
// 실제 라이브 카드를 iframe/복제로 끌어오는 대신 절대좌표 목업을 새로
// 그렸다 — LensPreviewSection의 실제 마크업은 반응형 그리드·실 데이터
// 의존이 커서 그대로 재사용하면 이 무대 안에서 크기·데이터가 매번
// 흔들린다. 고정 크기 무대 안에서 좌표를 픽셀로 고정해야 커서 이동
// 애니메이션이 프레임마다 정확히 같은 지점을 짚는다.

const TAB_LABELS = ['지면', '증권', '산업', '시그널'];
const ACTIVE_TAB = 1; // 데모에서 클릭하는 탭(증권)

// 무대 고정 크기(px) — 위 주석 참조.
const STAGE_W = 420;
const STAGE_H = 244;
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

// 단계 정의 — kind별로 커서 위치·목록/패널 표시 여부가 갈린다(아래 렌더
// 로직 참조). tab 1단계 뒤, 4형식 각각을 select(행 클릭)→reveal(내용
// 펼쳐짐) 두 단계씩 순회한다.
type StepKind = 'tab' | 'select' | 'reveal';
interface StepDef {
  kind: StepKind;
  row?: number; // select/reveal 전용
  ms: number; // 이 단계가 유지되는 시간
  caption: string;
}

const STEPS: StepDef[] = LENS_PERSPECTIVES.flatMap((p, i) => [
  { kind: 'select' as const, row: i, ms: 1000, caption: `② "${p.short}" 행을 눌러요` },
  { kind: 'reveal' as const, row: i, ms: 1900, caption: `③ ${p.short}로 바로 봐요 — ${p.content}` },
]);
STEPS.unshift({ kind: 'tab', ms: 1500, caption: '① 지면(탭)을 먼저 골라요' });

export function LensGuideAnimation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEPS[step].ms);
    return () => clearTimeout(id);
  }, [step]);

  const s = STEPS[step];
  const cursor = s.kind === 'tab' ? tabCenter(ACTIVE_TAB) : rowIconCenter(s.row!);
  const showList = s.kind !== 'reveal';
  const showCursor = s.kind !== 'reveal';
  const activeRow = s.kind === 'select' ? s.row! : -1;
  const revealFormat = s.kind === 'reveal' ? LENS_PERSPECTIVES[s.row!] : null;
  // 진행 점 5개(탭 1 + 형식 4) — 세부 9단계를 그대로 점으로 찍으면
  // 산만해서, "지금 몇 번째 형식을 보는 중인가"만 묶어서 보여준다.
  const majorStage = s.kind === 'tab' ? 0 : s.row! + 1;

  return (
    <div style={{ marginBottom: 22 }}>
      <style>{`
        @keyframes lz-guide-ripple {
          0% { transform: scale(0.4); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes lz-guide-pop {
          0% { transform: scale(0.92) translateY(4px); opacity: 0; }
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
        {/* 목업 탭 행 */}
        <div style={{ position: 'absolute', top: TAB_TOP, left: PAD, right: PAD, height: TAB_H, display: 'flex', gap: 8 }}>
          {TAB_LABELS.map((label, i) => {
            const on = s.kind === 'tab' && i === ACTIVE_TAB;
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

        {/* 목업 4형식 행 목록 — reveal 단계에서는 페이드아웃하고 내용
            패널로 자리를 내준다. */}
        <div
          style={{
            position: 'absolute',
            top: ROW_TOP,
            left: PAD,
            right: PAD,
            opacity: showList ? 1 : 0,
            transition: 'opacity .3s ease',
          }}
        >
          {LENS_PERSPECTIVES.map((p, i) => {
            const on = i === activeRow;
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

        {/* 내용 펼쳐짐 목업 — reveal 단계에서만, 그 형식(revealFormat)에
            맞춰 매번 다시 뜬다(key로 재마운트시켜 pop 애니메이션 재생). */}
        <div
          style={{
            position: 'absolute',
            top: ROW_TOP,
            left: PAD,
            right: PAD,
            bottom: PAD,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: revealFormat ? 1 : 0,
            pointerEvents: 'none',
            transition: 'opacity .3s ease',
          }}
        >
          {revealFormat && (
            <div key={revealFormat.short} className="flex flex-col items-center" style={{ gap: 6, animation: 'lz-guide-pop .35s ease' }}>
              <span
                className="flex items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: '50%', background: revealFormat.tint, overflow: 'hidden' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                <img
                  src={revealFormat.illustration}
                  alt=""
                  width={40}
                  height={40}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                />
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{revealFormat.short}로 바로 보기</span>
              <span style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', maxWidth: 260, lineHeight: 1.4 }}>{revealFormat.content}</span>
            </div>
          )}
        </div>

        {/* 움직이는 커서 — 클릭 동작이 있는 단계(tab/select)에서만 보이고,
            결과가 펼쳐지는 reveal 단계에서는 할 일이 끝났으니 사라진다. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-6px, -6px)',
            opacity: showCursor ? 1 : 0,
            transition: 'left .5s cubic-bezier(.4,0,.2,1), top .5s cubic-bezier(.4,0,.2,1), opacity .25s ease',
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
      </div>

      {/* 진행 캡션 + 단계 점(5개 — 탭 1 + 형식 4, 세부 9단계 대신 큰 흐름만) */}
      <p style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: LENS_ACCENT, marginTop: 10, minHeight: 18 }}>{s.caption}</p>
      <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 6 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            style={{
              width: majorStage === i ? 16 : 6,
              height: 6,
              borderRadius: 999,
              background: majorStage === i ? LENS_ACCENT : '#e5e7eb',
              transition: 'all .3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
