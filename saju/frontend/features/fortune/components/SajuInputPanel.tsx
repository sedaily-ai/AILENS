'use client';

import { useCallback, useEffect, useState } from 'react';
import { lunarToSolar } from '@fullstackfamily/manseryeok';
import { trackEvent } from '@saju/shared/lib/trackEvent';
import { useLang } from '@saju/shared/lib/LangContext';
import { formatIlganLabel } from '../lib/formatIlgan';
import {
  calculateSaju, parsePillar, CG_OH,
  buildChongun, buildTodayFortune, calcDaeun, calcYeonun, calcWolun,
  matchSijin,
  type Pillar, type ChongunResult, type TodayFortuneResult,
  type DaeunEntry, type YeonunEntry, type WolunEntry,
} from '../lib/engine';
import { CitySelect } from './CitySelect';

type CalendarType = 'solar' | 'lunar';

export interface SajuCalcResult {
  pillars: Pillar[];
  ilgan: string;
  year: number; month: number; day: number;
  gender: string;
  timeInput: string;
  region: string;
  chongun: ChongunResult | null;
  todayFortune: TodayFortuneResult | null;
  daeuns: DaeunEntry[];
  yeonuns: YeonunEntry[];
  woluns: WolunEntry[];
  correctedTime?: { hour: number; minute: number };
}

interface SavedEntry {
  id: number; name: string; date: string; gender: string;
  time: string; region: string; ilgan: string; createdAt: string;
}

const STORAGE_KEY_SAVED = 'saju_saved';
const STORAGE_KEY_CURRENT = 'saju_current';

function getSaved(): SavedEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED) || '[]'); } catch { return []; }
}

function setSaved(list: SavedEntry[]) {
  localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(list));
}

interface Props {
  /** 이전에 계산된 결과(상위에서 주입) — 프리필 + '현재' 배지 매칭용 */
  initial?: {
    birthdate?: string;
    timeInput?: string;
    noTime?: boolean;
    gender?: '남' | '여';
    region?: string;
  };
  /** 계산 성공 시 호출 — 상위 페이지가 state 업데이트/렌더 트리거 */
  onCalculated?: (saju: SajuCalcResult) => void;
  /** 제출 버튼 라벨 (기본 '운세 보러가기') */
  submitLabel?: string;
  /** GA4 이벤트 이름 — 제출 성공 시 트래킹 (미지정 시 트래킹 안 함) */
  trackEventName?: string;
}

export function SajuInputPanel({ initial, onCalculated, submitLabel = '운세 보러가기', trackEventName }: Props) {
  const { lang, t } = useLang();
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [timeInput, setTimeInput] = useState(initial?.timeInput ?? '');
  const [noTime, setNoTime] = useState(initial?.noTime ?? false);
  const [gender, setGender] = useState<'남' | '여'>(initial?.gender ?? '남');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [calendar, setCalendar] = useState<CalendarType>('solar');
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [error, setError] = useState('');
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [savedExpanded, setSavedExpanded] = useState(false);

  useEffect(() => { setSavedList(getSaved()); }, []);

  const parseDateStr = useCallback((val: string) => {
    const raw = val.replace(/[^0-9]/g, '');
    if (raw.length !== 8) return null;
    const y = parseInt(raw.slice(0, 4));
    const m = parseInt(raw.slice(4, 6));
    const d = parseInt(raw.slice(6, 8));
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const test = new Date(y, m - 1, d);
    if (test.getFullYear() !== y || test.getMonth() !== m - 1 || test.getDate() !== d) return null;
    return { y, m, d };
  }, []);

  const handleDateInput = useCallback((val: string) => {
    let raw = val.replace(/[^0-9]/g, '');
    if (raw.length > 8) raw = raw.slice(0, 8);
    if (raw.length >= 7) setBirthdate(raw.slice(0, 4) + ' / ' + raw.slice(4, 6) + ' / ' + raw.slice(6));
    else if (raw.length >= 5) setBirthdate(raw.slice(0, 4) + ' / ' + raw.slice(4));
    else setBirthdate(raw);
  }, []);

  const handleTimeInput = useCallback((val: string) => {
    let raw = val.replace(/[^0-9]/g, '');
    if (raw.length > 4) raw = raw.slice(0, 4);
    setTimeInput(raw.length >= 3 ? raw.slice(0, 2) + ':' + raw.slice(2) : raw);
    if (raw.length === 4) setNoTime(false);
  }, []);

  const timeSijin = (() => {
    const raw = timeInput.replace(/[^0-9]/g, '');
    if (raw.length !== 4) return undefined;
    const hh = parseInt(raw.slice(0, 2));
    const mm = parseInt(raw.slice(2, 4));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
    return matchSijin(hh, mm);
  })();

  const isDateValid = parseDateStr(birthdate) !== null;

  const doCalculate = useCallback((y: number, m: number, d: number, g: string, timeStr: string, isNoTime: boolean, reg: string) => {
    try {
      const opts: { longitude?: number; applyTimeCorrection?: boolean } = {};
      if (reg) { opts.longitude = parseFloat(reg); opts.applyTimeCorrection = true; }
      let hr: number | undefined;
      let mn = 0;
      if (!isNoTime) {
        const raw = timeStr.replace(/[^0-9]/g, '');
        if (raw.length === 4) {
          const hh = parseInt(raw.slice(0, 2));
          const mm = parseInt(raw.slice(2, 4));
          if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) { hr = hh; mn = mm; }
        }
      }
      const s = calculateSaju(y, m, d, hr, mn, opts);
      const ps = [
        parsePillar(s.hourPillar ?? '', s.hourPillarHanja ?? ''),
        parsePillar(s.dayPillar ?? '', s.dayPillarHanja ?? ''),
        parsePillar(s.monthPillar ?? '', s.monthPillarHanja ?? ''),
        parsePillar(s.yearPillar ?? '', s.yearPillarHanja ?? ''),
      ];
      const il = ps[1].c;
      const chongun = buildChongun(ps);
      const todayFortune = buildTodayFortune(ps);
      const { daeuns } = il ? calcDaeun(s, g, y, m, d) : { daeuns: [] };
      const yeonuns = il ? calcYeonun() : [];
      const woluns = il ? calcWolun() : [];

      const result: SajuCalcResult = {
        pillars: ps, ilgan: il, year: y, month: m, day: d, gender: g,
        timeInput: isNoTime ? '' : timeStr,
        region: reg,
        chongun, todayFortune, daeuns, yeonuns, woluns,
        correctedTime: s.isTimeCorrected && s.correctedTime ? s.correctedTime : undefined,
      };

      try {
        localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
          year: y, month: m, day: d, gender: g,
          timeInput: isNoTime ? '' : timeStr,
          region: reg,
          pillars: ps, ilgan: il,
          correctedTime: result.correctedTime,
          daeuns,
        }));
      } catch {}

      setError('');
      if (trackEventName) {
        trackEvent(trackEventName, {
          gender: g,
          has_time: !isNoTime,
          region_set: !!reg,
        });
      }
      onCalculated?.(result);
    } catch (err) {
      setError(t('계산 오류: ', 'Calculation error: ') + (err instanceof Error ? err.message : String(err)));
    }
  }, [onCalculated, trackEventName, t]);

  const handleCalculate = useCallback(() => {
    const parsed = parseDateStr(birthdate);
    if (!parsed) { setError(t('생년월일을 정확히 입력해주세요.', 'Please enter a valid date of birth.')); return; }
    let { y, m, d } = parsed;
    if (y < 1900 || y > 2050) { setError(t('1900~2050년 범위만 지원합니다.', 'Only years 1900–2050 are supported.')); return; }
    if (calendar === 'lunar') {
      try {
        const solar = lunarToSolar(y, m, d, isLeapMonth).solar;
        y = solar.year; m = solar.month; d = solar.day;
      } catch {
        setError(t('해당 음력 날짜가 유효하지 않습니다. 윤달 여부를 확인해 주세요.', 'Invalid lunar date. Check the leap-month option.'));
        return;
      }
    }
    doCalculate(y, m, d, gender, timeInput, noTime, region);
  }, [birthdate, timeInput, noTime, gender, region, calendar, isLeapMonth, parseDateStr, doCalculate, t]);

  function handleLoad(entry: SavedEntry) {
    const dp = entry.date.replace(/-/g, '');
    setBirthdate(dp.slice(0, 4) + ' / ' + dp.slice(4, 6) + ' / ' + dp.slice(6, 8));
    setGender(entry.gender as '남' | '여');
    if (entry.time) { setTimeInput(entry.time); setNoTime(false); }
    else { setTimeInput(''); setNoTime(true); }
    setRegion(entry.region || '');
    // 저장된 날짜는 항상 양력 기준 — 불러올 때 토글 초기화
    setCalendar('solar');
    setIsLeapMonth(false);
    const y = parseInt(dp.slice(0, 4));
    const m = parseInt(dp.slice(4, 6));
    const d = parseInt(dp.slice(6, 8));
    doCalculate(y, m, d, entry.gender, entry.time || '', !entry.time, entry.region || '');
  }

  function handleDelete(id: number) {
    const list = getSaved().filter(x => x.id !== id);
    setSaved(list); setSavedList(list);
  }

  // 현재 매칭
  const parsedNow = parseDateStr(birthdate);
  const currentSavedId = parsedNow ? savedList.find(it => {
    const parts = it.date.split('-').map(Number);
    return parts[0] === parsedNow.y && parts[1] === parsedNow.m && parts[2] === parsedNow.d
      && it.gender === gender
      && (it.time || '') === (noTime ? '' : timeInput)
      && (it.region || '') === (region || '');
  })?.id ?? null : null;

  return (
    <div>
      {/* 입력 폼 */}
      <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 dark:border-gray-800 rounded-[16px] p-5 mb-4">
        <div className="mb-6">
          <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('성별', 'Gender')}</label>
          <div className="flex shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
            {(['남', '여'] as const).map(g => (
              <button key={g} type="button" onClick={() => setGender(g)}
                className={`flex-1 py-3 text-[15px] transition-all relative ${gender === g ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:text-gray-100 dark:text-gray-300'}`}>
                {g === '남' ? t('남', 'Male') : t('여', 'Female')}
                {gender === g && <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#059669] rounded" />}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('생년월일시', 'Date & Time of Birth')}</label>
          <div className="flex items-stretch gap-2">
            <div className="shrink-0 inline-flex shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
              {(['solar', 'lunar'] as const).map(c => (
                <button key={c} type="button" onClick={() => setCalendar(c)}
                  className={`px-3 text-[13px] font-medium transition-all ${calendar === c ? 'bg-[#059669] text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {c === 'solar' ? t('양력', 'Solar') : t('음력', 'Lunar')}
                </button>
              ))}
            </div>
            <input type="text" inputMode="numeric" maxLength={14} placeholder="YYYY / MM / DD"
              value={birthdate} onChange={e => handleDateInput(e.target.value)}
              className="flex-1 min-w-0 px-3 py-3 text-[15px] bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-[#34D399] focus:ring-1 focus:ring-[#D1FAE5] placeholder:text-gray-300" />
            <div className="relative shrink-0 w-[92px]">
              <input type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM"
                value={timeInput} onChange={e => handleTimeInput(e.target.value)}
                disabled={noTime}
                className={`w-full px-2 py-3 text-[15px] text-center tracking-widest tabular-nums bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-[#34D399] focus:ring-1 focus:ring-[#D1FAE5] placeholder:text-gray-300 ${noTime ? 'opacity-35' : ''}`} />
              {timeSijin && (
                <div className="absolute -bottom-5 left-0 right-0 text-center text-[11px] text-gray-400 dark:text-gray-300">{timeSijin.label}</div>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
            <div>
              {calendar === 'lunar' && (
                <label className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={isLeapMonth} onChange={e => setIsLeapMonth(e.target.checked)}
                    className="w-[15px] h-[15px] accent-[#059669]" />
                  {t('윤달', 'Leap month')}
                </label>
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={noTime} onChange={e => { setNoTime(e.target.checked); if (e.target.checked) setTimeInput(''); }}
                className="w-[15px] h-[15px] accent-[#059669]" />
              {t('시간 모름', 'Time Unknown')}
            </label>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1">
            {t('태어난 도시', 'City of Birth')}
            <span className="ml-1.5 text-[11px] font-normal text-gray-400 dark:text-gray-400">
              {t('(이 중에 없으면 가장 가까운 도시를 선택해주세요.)', "(If your city isn't listed, pick the nearest one.)")}
            </span>
          </label>
          <CitySelect value={region} onChange={setRegion} />
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-300 leading-snug mb-2.5">
          {t(
            '입력 정보는 이 브라우저에만 저장되며, 사주 계산 외 다른 용도로 사용되지 않아요.',
            'Your inputs stay in this browser and are used only to calculate your chart.'
          )}
        </p>
        <button type="button" onClick={handleCalculate}
          className={`w-full py-3.5 text-[15px] font-semibold rounded-xl transition-all ${isDateValid ? 'bg-[#059669] text-white hover:bg-[#047857] cursor-pointer' : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-300 cursor-not-allowed'}`}
          disabled={!isDateValid}>
          {submitLabel === '운세 보러가기' ? t('운세 보러가기', 'See My Fortune') : submitLabel}
        </button>
        {error && <p className="mt-3 text-center text-[13px] text-red-500">{error}</p>}
      </div>

      {/* 저장된 만세력 */}
      {savedList.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-3">{t('저장된 만세력', 'Saved Profiles')}</h3>
          <div className="space-y-2">
            {(savedExpanded ? savedList : savedList.slice(0, 3)).map(item => {
              const isCurrent = item.id === currentSavedId;
              return (
                <div key={item.id} onClick={() => handleLoad(item)}
                  className={`flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 rounded-xl cursor-pointer transition-all ${
                    isCurrent
                      ? 'border-2 border-green-500 bg-green-50/50 dark:bg-green-950/40'
                      : 'shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>
                  {isCurrent && (
                    <span className="shrink-0 mr-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-600 text-white">{t('현재', 'Now')}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 mr-2">{item.name}</span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-300">
                        {item.date.replace(/-/g, '.')} {item.time && `${item.time}`} · {item.gender === '남' ? t('남', 'M') : item.gender === '여' ? t('여', 'F') : item.gender}
                      </span>
                    </div>
                  </div>
                  {item.ilgan && (() => {
                    const hanja = item.ilgan.length >= 2 ? item.ilgan[1] : '';
                    const oh = CG_OH[hanja] || '';
                    const colorMap: Record<string, string> = { '목': 'text-green-600', '화': 'text-red-500', '토': 'text-yellow-600', '금': 'text-gray-500 dark:text-gray-100 dark:text-gray-300', '수': 'text-blue-600' };
                    return <span className={`shrink-0 text-[13px] font-bold ml-2 ${colorMap[oh] || 'text-gray-600 dark:text-gray-100 dark:text-gray-300'}`}>{formatIlganLabel(item.ilgan, lang)}</span>;
                  })()}
                  <button type="button" onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                    className="shrink-0 ml-2 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 text-[16px]">&times;</button>
                </div>
              );
            })}
          </div>
          {savedList.length > 3 && (
            <button type="button" onClick={() => setSavedExpanded(v => !v)}
              className="w-full mt-2 flex items-center justify-center gap-1 py-2 text-[12px] font-semibold text-gray-500 dark:text-gray-100 dark:text-gray-300 hover:text-gray-700 dark:text-gray-300">
              {savedExpanded
                ? t('접기', 'Collapse')
                : t(`${savedList.length - 3}개 더 보기`, `Show ${savedList.length - 3} more`)}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: savedExpanded ? 'rotate(180deg)' : 'none' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Public API: also export for FortuneTab's legacy usage (not used there yet)
export type { SavedEntry };
