'use client';

import { useState } from 'react';
import { unsung, evaluateForYongsin, US_SCORE_MOD, sipsung, JJG, SS_MEANING, SS_DETAIL, US_MEANING, US_DETAIL, type GapjaEntry } from '../lib/engine';
import { useLang } from '@saju/shared/lib/LangContext';

// 흐름 그래프 — "조용한 선 + 지금 순간만 붉은 점" (명패 톤과 같은 팔레트, 텍스처는 절제)
const INK = '#3A3128';       // 먹색 — 선/텍스트
const INK_FAINT = '#B8AD98'; // 옅은 먹색 — 기준선
const PAPER = '#F7F1E3';     // 한지색 — 배경
const SEAL = '#C1272D';      // 인주색 — 지금(현재) 마커 전용

interface GraphCol extends GapjaEntry {
  label: string;
}

interface FlowGraphProps {
  cols: GraphCol[];
  ilgan: string;
  yongsinOh?: string;
  activeIdx: number; // 현재 위치 인덱스
}

export function scoreOf(col: GapjaEntry, ilgan: string, yongsinOh?: string): number {
  const us = ilgan ? unsung(ilgan, col.j) : '';
  const usScore = US_SCORE_MOD[us] || 0;
  const yEval = yongsinOh ? evaluateForYongsin(col.c, col.j, yongsinOh) : null;
  const yScore = (yEval?.score || 0) * 7;
  return usScore + yScore;
}

function bandLabel(score: number, t: (ko: string, en: string) => string): string {
  if (score >= 15) return t('상승기', 'Rising');
  if (score >= 5) return t('순항', 'Steady climb');
  if (score > -5) return t('평온', 'Calm');
  if (score > -15) return t('조정기', 'Adjusting');
  return t('숨고르기', 'Resting');
}

// Catmull-Rom → Bezier 변환으로 부드러운 곡선 path 생성
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function FlowGraph({ cols, ilgan, yongsinOh, activeIdx }: FlowGraphProps) {
  const { t } = useLang();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const W = 640;
  const H = 140;
  const PAD_X = 24;
  const PAD_Y = 28;

  const scores = cols.map(c => scoreOf(c, ilgan, yongsinOh));
  const clamped = scores.map(s => Math.max(-30, Math.min(30, s)));
  const points = clamped.map((s, i) => ({
    x: PAD_X + (i / Math.max(1, cols.length - 1)) * (W - PAD_X * 2),
    y: PAD_Y + (1 - (s + 30) / 60) * (H - PAD_Y * 2),
  }));

  const linePath = smoothPath(points);
  const areaPath = points.length > 0 ? `${linePath} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z` : '';
  const baselineY = PAD_Y + (1 - 30 / 60) * (H - PAD_Y * 2);

  const shownIdx = selectedIdx ?? activeIdx;
  const shownCol = cols[shownIdx];
  const shownScore = clamped[shownIdx];
  const shownSS = ilgan && shownCol ? sipsung(ilgan, shownCol.c) : '';
  const shownUS = ilgan && shownCol ? unsung(ilgan, shownCol.j) : '';
  const shownYEval = yongsinOh && shownCol ? evaluateForYongsin(shownCol.c, shownCol.j, yongsinOh) : null;
  const hiddenStems = shownCol ? (JJG[shownCol.j] || []) : [];
  const hiddenItems = hiddenStems.map((h, i) => {
    const weight = hiddenStems.length === 1 ? '본기' : hiddenStems.length === 2 ? (i === 0 ? '여기' : '본기') : (i === 0 ? '여기' : i === 1 ? '중기' : '본기');
    return { hanja: h, ss: ilgan ? sipsung(ilgan, h) : '', weight };
  });

  return (
    <div
      className="rounded-[16px] p-4 mb-4"
      style={{ background: PAPER, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: 'block' }}>
        {/* 기준선 — 평이함(0점) */}
        <line x1={PAD_X} y1={baselineY} x2={W - PAD_X} y2={baselineY} stroke={INK_FAINT} strokeWidth={1} strokeDasharray="3 4" />

        {/* 흐름 아래 은은한 채움 */}
        <defs>
          <linearGradient id="flowGraphFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity={0.12} />
            <stop offset="100%" stopColor={INK} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#flowGraphFade)" />

        {/* 흐름 선 */}
        <path d={linePath} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />

        {/* 탭 가능한 지점들 */}
        {points.map((p, i) => {
          const isActive = i === activeIdx;
          const isSelected = i === shownIdx;
          return (
            <g key={i} onClick={() => setSelectedIdx(i)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              <circle
                cx={p.x} cy={p.y}
                r={isActive ? 5 : isSelected ? 4 : 2.5}
                fill={isActive ? SEAL : isSelected ? INK : PAPER}
                stroke={isActive ? SEAL : INK}
                strokeWidth={isActive ? 0 : 1.5}
              />
              {isActive && (
                <circle cx={p.x} cy={p.y} r={9} fill="none" stroke={SEAL} strokeWidth={1} opacity={0.4} />
              )}
            </g>
          );
        })}
      </svg>

      {/* 하단 라벨 — 네모칸 리스트 (x축 정렬) */}
      <div className="flex mt-2 px-1 gap-[2px] overflow-x-auto">
        {cols.map((c, i) => {
          const isActive = i === activeIdx;
          const isSelected = i === shownIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className="flex flex-col items-center justify-center flex-1 min-w-0 rounded-[6px] py-1.5 px-0.5 transition-all"
              style={{
                background: isActive ? SEAL : isSelected ? `${INK}11` : 'transparent',
                border: `1px solid ${isActive ? SEAL : isSelected ? INK : INK_FAINT}${isActive ? '' : '44'}`,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#FFF' : INK }}>
                {c.c}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#FFF' : INK, marginTop: 1 }}>
                {c.j}
              </span>
              <span style={{ fontSize: 9, color: isActive ? '#FFFFFF99' : INK_FAINT, marginTop: 2 }}>
                {c.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 지점 요약 */}
      {shownCol && (
        <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${INK_FAINT}55` }}>
          <div>
            <span style={{ fontWeight: 700, color: INK }}>{shownCol.label}</span>
            <span style={{ fontSize: 12, color: INK, opacity: 0.7, marginLeft: 6 }}>
              {shownCol.ck}{shownCol.c} {shownCol.jk}{shownCol.j}{shownSS ? ` · ${shownSS}` : ''}
            </span>
          </div>
          <span
            style={{
              fontSize: 12, fontWeight: 700,
              color: shownScore >= 5 ? '#4A7C59' : shownScore <= -5 ? SEAL : INK,
            }}
          >
            {bandLabel(shownScore, t)}
          </span>
        </div>
      )}

      {/* 설명 — 탭한 지점의 십성·12운성·지장간 풀이 */}
      {shownCol && (
        <div className="mt-2 pt-3 space-y-2" style={{ borderTop: `1px solid ${INK_FAINT}33`, fontSize: 12, color: INK, lineHeight: 1.6 }}>
          {shownSS && (
            <p>
              <span style={{ fontWeight: 600 }}>{t('천간 십성', 'Heavenly Stem')} · {shownSS}</span>
              <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>({SS_MEANING[shownSS] || ''})</span>
              <br />{SS_DETAIL[shownSS] || ''}
            </p>
          )}
          {shownUS && (
            <p>
              <span style={{ fontWeight: 600 }}>{t('12운성', '12 Stages')} · {shownUS}</span>
              <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>({US_MEANING[shownUS] || ''})</span>
              <br />{US_DETAIL[shownUS] || ''}
            </p>
          )}
          {hiddenItems.length > 0 && (
            <div style={{ borderTop: `1px solid ${INK_FAINT}33`, paddingTop: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>
                {t(`지지(${shownCol.j}) 속 숨은 기운:`, `Hidden energies in branch (${shownCol.j}):`)}
              </div>
              <div className="flex flex-wrap gap-1">
                {hiddenItems.map((h, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 5,
                      border: `1px solid ${INK_FAINT}55`,
                      background: h.weight === '본기' ? '#FFFFFF88' : 'transparent',
                      fontWeight: h.weight === '본기' ? 600 : 400,
                    }}
                  >
                    <span style={{ opacity: 0.6 }}>{h.weight}</span> {h.hanja} {h.ss}
                    <span style={{ opacity: 0.6, marginLeft: 2 }}>· {SS_MEANING[h.ss] || ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {shownYEval && shownYEval.rating !== 'neutral' && (
            <div style={{ borderTop: `1px solid ${INK_FAINT}33`, paddingTop: 8 }}>
              <span style={{ fontWeight: 700, color: shownYEval.rating === 'favor' ? '#4A7C59' : SEAL }}>
                {shownYEval.rating === 'favor' ? t('✓ 용신 작용', '✓ Yongsin active') : t('! 기신 작용', '! Adverse active')}
              </span>
              <span style={{ opacity: 0.7, marginLeft: 6 }}>{shownYEval.reason}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
