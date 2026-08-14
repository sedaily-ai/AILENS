/**
 * 사주 챗봇 대화 흐름 — 순수 로직 (DOM 의존 없음)
 *
 * 규칙 기반 가이드형: 실시간 LLM 호출 없이, 기존 fortune 엔진으로
 * 원국을 계산하고 미리 만든 해석을 말풍선으로 재구성한다.
 */
import {
  calculateSaju,
  parsePillar,
  calcDaeun,
  type Pillar,
  type DaeunEntry,
} from '@saju/features/fortune/lib/engine';
import type { DraftInput, QuickReply } from './types';

const STORAGE_KEY_CURRENT = 'saju_current';

/** "YYYYMMDD" / "YYYY/MM/DD" 등 → {y,m,d} (양력). 유효하지 않으면 null */
export function parseDateStr(val: string): { y: number; m: number; d: number } | null {
  const raw = val.replace(/[^0-9]/g, '');
  if (raw.length !== 8) return null;
  const y = parseInt(raw.slice(0, 4));
  const m = parseInt(raw.slice(4, 6));
  const d = parseInt(raw.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const test = new Date(y, m - 1, d);
  if (test.getFullYear() !== y || test.getMonth() !== m - 1 || test.getDate() !== d) return null;
  return { y, m, d };
}

/** "HHMM" / "HH:MM" → {hour,min}. 유효하지 않으면 null */
export function parseTimeStr(val: string): { hour: number; min: number } | null {
  const raw = val.replace(/[^0-9]/g, '');
  if (raw.length !== 4) return null;
  const hour = parseInt(raw.slice(0, 2));
  const min = parseInt(raw.slice(2, 4));
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  return { hour, min };
}

/** 지역 quick-reply (engine REGION_OPTIONS 중 대표 도시 추림) */
export const REGION_QUICK: { value: string; ko: string; en: string }[] = [
  { value: '126.98', ko: '서울', en: 'Seoul' },
  { value: '129.03', ko: '부산', en: 'Busan' },
  { value: '128.60', ko: '대구', en: 'Daegu' },
  { value: '126.70', ko: '인천', en: 'Incheon' },
  { value: '127.38', ko: '대전', en: 'Daejeon' },
  { value: '126.57', ko: '제주', en: 'Jeju' },
  { value: '', ko: '잘 모르겠어요', en: "I'm not sure" },
];

export function regionQuickReplies(t: (ko: string, en: string) => string): QuickReply[] {
  return REGION_QUICK.map(r => ({ value: r.value, label: t(r.ko, r.en) }));
}

export interface ComputeResult {
  pillars: Pillar[];
  ilgan: string;
  daeuns: DaeunEntry[];
}

/**
 * draft → 원국 계산. 성공 시 localStorage('saju_current') 에도 기록해
 * 기존 /saju 페이지와 상호운용. 실패 시 null.
 */
export function computeSaju(draft: DraftInput): ComputeResult | null {
  const { y, m, d, gender } = draft;
  if (y == null || m == null || d == null || !gender) return null;
  try {
    const opts: { longitude?: number; applyTimeCorrection?: boolean } = {};
    if (draft.region) {
      opts.longitude = parseFloat(draft.region);
      opts.applyTimeCorrection = true;
    }
    const hr = draft.noTime ? undefined : draft.hour;
    const mn = draft.noTime ? 0 : (draft.min ?? 0);

    const s = calculateSaju(y, m, d, hr, mn, opts);
    const pillars: Pillar[] = [
      parsePillar(s.hourPillar ?? '', s.hourPillarHanja ?? ''),
      parsePillar(s.dayPillar ?? '', s.dayPillarHanja ?? ''),
      parsePillar(s.monthPillar ?? '', s.monthPillarHanja ?? ''),
      parsePillar(s.yearPillar ?? '', s.yearPillarHanja ?? ''),
    ];
    const ilgan = pillars[1].c;
    if (!ilgan) return null;

    const correctedTime = s.isTimeCorrected && s.correctedTime ? s.correctedTime : undefined;
    const { daeuns } = calcDaeun(s, gender, y, m, d);

    try {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
        year: y, month: m, day: d, gender,
        timeInput: draft.noTime || draft.hour == null
          ? ''
          : `${String(draft.hour).padStart(2, '0')}:${String(draft.min ?? 0).padStart(2, '0')}`,
        region: draft.region ?? '',
        pillars, ilgan, correctedTime, daeuns,
      }));
    } catch { /* localStorage 불가 환경 무시 */ }

    return { pillars, ilgan, daeuns };
  } catch {
    return null;
  }
}

/** localStorage 에 저장된 직전 사주(saju_current) 를 draft 형태로 로드. 없으면 null */
export function loadSavedDraft(): { draft: DraftInput; pillars: Pillar[]; ilgan: string; daeuns: DaeunEntry[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o?.pillars || !o?.ilgan || o.year == null) return null;
    const tm = parseTimeStr(o.timeInput || '');
    const draft: DraftInput = {
      y: o.year, m: o.month, d: o.day,
      gender: o.gender,
      hour: tm?.hour, min: tm?.min,
      noTime: !o.timeInput,
      region: o.region ?? '',
    };
    return {
      draft,
      pillars: o.pillars as Pillar[],
      ilgan: o.ilgan as string,
      daeuns: (o.daeuns as DaeunEntry[]) ?? [],
    };
  } catch {
    return null;
  }
}

/** 일간 한 글자 → "병(丙)" 형태 라벨 */
export function ilganLabel(pillars: Pillar[]): string {
  const p = pillars[1];
  if (!p?.ck || !p?.c) return p?.c ?? '';
  return `${p.ck}(${p.c})`;
}
