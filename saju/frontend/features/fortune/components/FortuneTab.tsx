'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { lunarToSolar } from '@fullstackfamily/manseryeok';
import { trackEvent } from '@saju/shared/lib/trackEvent';
import { ThemeToggle } from '@saju/shared/lib/ThemeToggle';
import { useLang } from '@saju/shared/lib/LangContext';
import {
  calculateSaju, parsePillar, sipsung, unsung, elClass,
  CG_OH, JJ_OH, OH_HJ, JJG,
  buildChongun, buildTodayFortune, buildYearlyFortune, calcDaeun, calcYeonun, calcWolun,
  matchSijin, REGION_OPTIONS, REGION_OPTIONS_EN,
  type Pillar, type ChongunResult, type TodayFortuneResult, type YearlyFortuneResult, type DaeunEntry, type YeonunEntry, type WolunEntry,
} from '../lib/engine';
import { SajuTable } from './SajuTable';
import { FortuneResult } from './FortuneResult';
import { CitySelect } from './CitySelect';
import { formatIlganLabel } from '../lib/formatIlgan';

interface SajuData {
  pillars: Pillar[];
  ilgan: string;
  year: number; month: number; day: number;
  gender: string;
  chongun: ChongunResult | null;
  todayFortune: TodayFortuneResult | null;
  yearlyFortune: YearlyFortuneResult | null;
  daeuns: DaeunEntry[];
  yeonuns: YeonunEntry[];
  woluns: WolunEntry[];
  correctedTime?: { hour: number; minute: number };
}

interface SavedEntry {
  id: number; name: string; date: string; gender: string;
  time: string; region: string; ilgan: string; createdAt: string;
}

const STORAGE_KEY = 'saju_saved';
function getSaved(): SavedEntry[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function setSaved(list: SavedEntry[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

interface FortuneTabProps {
  selectedGroup?: 'NT' | 'NF' | 'ST' | 'SF';
  onMbtiChange?: (group: 'NT' | 'NF' | 'ST' | 'SF') => void;
  mode?: 'full' | 'today' | 'yearly';
  /**
   * phase-04 (2026-05-24): 자체 헤더(흰 헤더 블록 + 날짜 + LangToggle/ThemeToggle + 큰 타이틀 +
   * 크레덴셜 + 마스코트 + 회색 wrapper bg) 를 숨김.
   * 페이지에서 PageShell + PageHeader 로 외곽을 직접 구성할 때 true.
   */
  hideOwnHeader?: boolean;
}

export function FortuneTab({ selectedGroup, onMbtiChange, mode = 'full', hideOwnHeader = false }: FortuneTabProps = {}) {
  const router = useRouter();
  const { t, g, lang, localePath } = useLang();
  const [birthdate, setBirthdate] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [noTime, setNoTime] = useState(false);
  const [gender, setGender] = useState<'남' | '여' | ''>('남');
  const mbtiGroup = selectedGroup ?? 'NF';
  const setMbtiGroup = useCallback((g: 'NT' | 'NF' | 'ST' | 'SF') => {
    if (onMbtiChange) onMbtiChange(g);
  }, [onMbtiChange]);
  const [region, setRegion] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>('solar');
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [result, setResult] = useState<SajuData | null>(null);
  const [error, setError] = useState('');
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');

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

  const getTimeSijin = useCallback(() => {
    const raw = timeInput.replace(/[^0-9]/g, '');
    if (raw.length !== 4) return undefined;
    const hh = parseInt(raw.slice(0, 2));
    const mm = parseInt(raw.slice(2, 4));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
    const m = matchSijin(hh, mm);
    return m ? m.value : undefined;
  }, [timeInput]);

  const timeSijin = getTimeSijin();
  const timeBadgeLabel = timeSijin !== undefined ? matchSijin(
    parseInt(timeInput.replace(/[^0-9]/g, '').slice(0, 2)),
    parseInt(timeInput.replace(/[^0-9]/g, '').slice(2, 4))
  )?.label : undefined;

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
          if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            hr = hh;
            mn = mm;
          }
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
      const yearlyFortune = buildYearlyFortune(ps);
      const { daeuns } = il ? calcDaeun(s, g, y, m, d) : { daeuns: [] };
      const yeonuns = il ? calcYeonun() : [];
      const woluns = il ? calcWolun() : [];

      const newResult = {
        pillars: ps, ilgan: il, year: y, month: m, day: d, gender: g,
        chongun, todayFortune, yearlyFortune, daeuns, yeonuns, woluns,
        correctedTime: s.isTimeCorrected && s.correctedTime ? s.correctedTime : undefined,
      };
      setResult(newResult);
      try {
        localStorage.setItem('saju_current', JSON.stringify({
          year: y, month: m, day: d, gender: g,
          timeInput: isNoTime ? '' : timeStr,
          region: reg,
          pillars: ps, ilgan: il,
          correctedTime: newResult.correctedTime,
          daeuns,
        }));
      } catch {}
      setError('');
    } catch (err) {
      setError(t('계산 오류: ', 'Calculation error: ') + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // 마운트 시 localStorage에 저장된 사주 데이터가 있으면 자동 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem('saju_current');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.year && saved.month && saved.day) {
        const g = saved.gender || '';
        const ti = saved.timeInput || '';
        const reg = saved.region || '';
        setBirthdate(`${saved.year} / ${String(saved.month).padStart(2, '0')} / ${String(saved.day).padStart(2, '0')}`);
        setGender(g as '남' | '여' | '');
        if (ti) { setTimeInput(ti); setNoTime(false); }
        else { setTimeInput(''); setNoTime(true); }
        setRegion(reg);
        doCalculate(saved.year, saved.month, saved.day, g, ti, !ti, reg);
        setShowForm(false);
      }
    } catch {}
  }, [doCalculate]);

  const handleCalculate = useCallback(() => {
    const parsed = parseDateStr(birthdate);
    if (!parsed) { setError(t('생년월일을 정확히 입력해주세요.', 'Please enter a valid birth date.')); return; }
    let { y, m, d } = parsed;
    if (y < 1900 || y > 2050) { setError(t('1900~2050년 범위만 지원합니다.', 'Only 1900–2050 is supported.')); return; }
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
    trackEvent('saju_calculate', {
      gender,
      has_time: !noTime,
      region_set: !!region,
      mbti_group: mbtiGroup,
      calendar,
    });
    setShowForm(false);
  }, [birthdate, timeInput, noTime, gender, region, calendar, isLeapMonth, parseDateStr, doCalculate, mbtiGroup, t]);

  const today = new Date();
  const todayLabel = lang === 'en'
    ? today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  return (
    <div
      className={hideOwnHeader ? 'w-full' : '-my-6 w-full bg-[#F8F9FA] dark:bg-gray-950'}
      style={hideOwnHeader ? undefined : { minHeight: 'calc(100vh + 48px)' }}
    >
      {/* 흰색 헤더 블록 — phase-04: hideOwnHeader 시 숨김 (페이지에서 PageHeader 사용) */}
      {!hideOwnHeader && (
        <div className="bg-white dark:bg-gray-900 w-full">
          <div className="max-w-[480px] lg:max-w-[1080px] mx-auto relative overflow-hidden" style={{ padding: '20px 20px 18px' }}>
            {/* 배경 마스코트 — 우하단 살짝 크롭, 텍스트 뒤 */}
            <img
              src="/saju/fortune-mascot.png"
              alt=""
              aria-hidden="true"
              className="absolute pointer-events-none select-none dark:hidden"
              style={{
                right: 0,
                bottom: 0,
                width: 88,
                height: 88,
                opacity: 0.12,
                objectFit: 'contain',
                zIndex: 0,
              }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="relative z-10">
            {/* 날짜 + 테마/언어 토글 */}
            <div className="flex items-center justify-between mb-1">
              <div className="text-[13px] text-gray-500 dark:text-gray-300 font-medium tracking-tight">{todayLabel}</div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
              </div>
            </div>
            {/* 타이틀 */}
            <h2 className="text-[26px] font-extrabold text-gray-900 dark:text-gray-100 tracking-[-0.04em] leading-none mb-4">
              {mode === 'today'
                ? t('오늘의 사주', "Today's Saju")
                : mode === 'yearly'
                ? t('올해의 사주', "This Year's Saju")
                : t('내 사주', 'My Saju')}
            </h2>
            {/* 크레덴셜 — 모드별 분기 */}
            <div className="text-[10.5px] sm:text-[11.5px] text-gray-500 dark:text-gray-300 leading-[1.55] mb-3">
              {mode === 'today' ? (
                <>
                  <div>{t('오늘 일진과 내 사주의 상호작용을 분석합니다', "Analyzes today's energy interaction with your chart")}</div>
                  <div>{t('십성 · 12운성 · 분야별 운세 한눈에', 'Ten Gods · 12 Stages · Fortune by category at a glance')}</div>
                  <div className="text-gray-700 dark:text-gray-100 font-semibold">{t('매일 달라지는 나의 하루 흐름.', 'Your daily flow, refreshed every day.')}</div>
                </>
              ) : mode === 'yearly' ? (
                <>
                  <div>{t('올해 세운과 내 사주의 상호작용을 분석합니다', "Analyzes this year's energy interaction with your chart")}</div>
                  <div>{t('십성 · 12운성 · 분야별 운세 한눈에', 'Ten Gods · 12 Stages · Fortune by category at a glance')}</div>
                  <div className="text-gray-700 dark:text-gray-100 font-semibold">{t('올해 한 해의 큰 흐름을 읽어드립니다.', 'Your yearly flow at a glance.')}</div>
                </>
              ) : (
                <>
                  <div>{t('궁통보감·삼명통회·자평진전 3대 고전 기반', 'Based on the 3 classical Saju texts (Gungtongbogam · Sammyeongtonghoe · Japyeongjinjeon)')}</div>
                  <div>{t('16종 신살 자동 탐지 · KASI 만세력 연동', '16 Sinsal auto-detection · KASI ephemeris integration')}</div>
                  <div className="text-gray-700 dark:text-gray-100 font-semibold">{t('고전 명리를 데이터로 구현했습니다.', 'Classical Myeongri, rebuilt as data.')}</div>
                </>
              )}
            </div>

            </div>
          </div>
        </div>
      )}

      <div className={hideOwnHeader ? 'w-full' : 'max-w-[480px] lg:max-w-[1080px] mx-auto'}>
      {/* 회색 콘텐츠 영역 */}
      <div className="px-3 sm:px-[14px] pt-[14px] pb-10">
      {/* 입력 폼 — 결과가 있으면 접힘 */}
      {showForm ? (
        <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] p-5 mb-4">
          {/* 성별 */}
          <div className="mb-6">
            <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {t('성별 ', 'Gender ')}
              <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500">
                {t('(선택)', '(optional)')}
              </span>
            </label>
            <div className="flex shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
              {(['남', '여', ''] as const).map(gv => (
                <button key={gv || 'none'} onClick={() => setGender(gv)}
                  className={`flex-1 py-3 text-[15px] transition-all relative ${gender === gv ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:text-gray-400'}`}>
                  {gv === '남' ? t('남', 'Male') : gv === '여' ? t('여', 'Female') : t('선택 안함', 'None')}
                  {gender === gv && <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#059669] rounded" />}
                </button>
              ))}
            </div>
          </div>

          {/* 생년월일시 */}
          <div className="mb-6">
            <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('생년월일시', 'Date & Time of Birth')}</label>
            <div className="flex items-stretch gap-2">
              <div className="shrink-0 inline-flex shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
                {(['solar', 'lunar'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setCalendar(c)}
                    className={`px-3 text-[13px] font-medium transition-all ${calendar === c ? 'bg-[#059669] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                    {c === 'solar' ? t('양력', 'Solar') : t('음력', 'Lunar')}
                  </button>
                ))}
              </div>
              <input type="text" inputMode="numeric" maxLength={14} placeholder="YYYY / MM / DD"
                value={birthdate} onChange={e => handleDateInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-3 text-[15px] bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-[#34D399] focus:ring-1 focus:ring-[#D1FAE5] placeholder:text-gray-300 transition-all" />
              <div className="relative shrink-0 w-[92px]">
                <input type="text" inputMode="numeric" maxLength={5} placeholder="HH:MM"
                  value={timeInput} onChange={e => handleTimeInput(e.target.value)}
                  disabled={noTime}
                  className={`w-full px-2 py-3 text-[15px] text-center tracking-widest tabular-nums bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-[#34D399] focus:ring-1 focus:ring-[#D1FAE5] placeholder:text-gray-300 transition-all ${noTime ? 'opacity-35' : ''}`} />
                {timeBadgeLabel && (
                  <div className="absolute -bottom-5 left-0 right-0 text-center text-[11px] text-gray-400 dark:text-gray-300">{timeBadgeLabel}</div>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 flex-wrap">
              <div>
                {calendar === 'lunar' && (
                  <label className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 dark:text-gray-300 cursor-pointer hover:text-gray-600 dark:text-gray-400 transition-colors">
                    <input type="checkbox" checked={isLeapMonth} onChange={e => setIsLeapMonth(e.target.checked)}
                      className="w-[15px] h-[15px] accent-[#059669] cursor-pointer" />
                    {t('윤달', 'Leap month')}
                  </label>
                )}
              </div>
              <label className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 dark:text-gray-300 cursor-pointer hover:text-gray-600 dark:text-gray-400 transition-colors">
                <input type="checkbox" checked={noTime} onChange={e => { setNoTime(e.target.checked); if (e.target.checked) setTimeInput(''); }}
                  className="w-[15px] h-[15px] accent-[#059669] cursor-pointer" />
                {t('시간 모름', 'Time Unknown')}
              </label>
            </div>
          </div>

          {/* 도시 */}
          <div className="mb-8">
            <label className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1">
              {t('태어난 도시', 'City of Birth')}
              <span className="ml-1.5 text-[11px] font-normal text-gray-400 dark:text-gray-400">
                {t('(이 중에 없으면 가장 가까운 도시를 선택해주세요.)', "(If your city isn't listed, pick the nearest one.)")}
              </span>
            </label>
            <CitySelect value={region} onChange={setRegion} />
          </div>

          {/* 버튼 */}
          <button onClick={handleCalculate}
            className={`w-full py-3.5 text-[15px] font-semibold rounded-xl transition-all ${isDateValid ? 'bg-[#059669] text-white hover:bg-[#047857] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            disabled={!isDateValid}>
            {t('운세 보러가기', 'See My Fortune')}
          </button>
        </div>
      ) : result ? (() => {
        const EL_BG: Record<string, string> = {
          '목': 'bg-emerald-50 text-emerald-700',
          '화': 'bg-red-50 text-red-600',
          '토': 'bg-yellow-50 text-yellow-700',
          '금': 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
          '수': 'bg-gray-100 text-gray-900',
        };
        const ilganOh = CG_OH[result.ilgan] || '';
        const parsed = parseDateStr(birthdate);
        const dateLabel = parsed
          ? (lang === 'en'
              ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
              : `${parsed.y}년 ${parsed.m}월 ${parsed.d}일`)
          : '';
        const timeLabel = noTime || !timeInput ? t('시간 모름', 'Time Unknown') : timeInput;
        const regionLabel = (lang === 'en' ? REGION_OPTIONS_EN : REGION_OPTIONS).find(r => r.value === region)?.label || '';

        // 경도 보정 분 차이
        let offsetLabel = '';
        if (result.correctedTime && !noTime) {
          const raw = timeInput.replace(/[^0-9]/g, '');
          if (raw.length === 4) {
            const inMin = parseInt(raw.slice(0, 2)) * 60 + parseInt(raw.slice(2, 4));
            const outMin = result.correctedTime.hour * 60 + result.correctedTime.minute;
            const diff = outMin - inMin;
            if (diff !== 0) offsetLabel = t(` (경도보정 ${diff > 0 ? '+' : ''}${diff}분)`, ` (longitude ${diff > 0 ? '+' : ''}${diff}m)`);
          }
        }

        const genderLabel = gender === '남' ? t('남', 'Male') : gender === '여' ? t('여', 'Female') : '';
        const subtitle = [genderLabel, regionLabel].filter(Boolean).join(' · ') + offsetLabel;

        return (
          <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0 ${EL_BG[ilganOh] || 'bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-300'}`}>
                {result.ilgan || '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">
                  {dateLabel}{!noTime && timeInput && ` ${timeLabel}`}
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-300 truncate">{subtitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="shrink-0 border-none rounded-lg cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {t('다시 입력', 'Re-enter')}
              </button>
            </div>
          </div>
        );
      })() : null}

      {error && <p className="mt-3 text-center text-[13px] text-red-500">{error}</p>}

      {/* 결과 */}
      {result && (() => {
        const parsedNow = parseDateStr(birthdate);
        const isAlreadySaved = !!(parsedNow && savedList.find((it) => {
          const parts = it.date.split('-').map(Number);
          return parts[0] === parsedNow.y && parts[1] === parsedNow.m && parts[2] === parsedNow.d
            && it.gender === gender
            && (it.time || '') === (noTime ? '' : timeInput)
            && (it.region || '') === (region || '');
        }));
        return (
        <>
          <FortuneResult data={result} mbtiGroup={mbtiGroup} onMbtiChange={setMbtiGroup} mode={mode} />
          <button
            onClick={() => {
              if (isAlreadySaved) return;
              setSaveName(parsedNow ? `${parsedNow.y}.${parsedNow.m}.${parsedNow.d}` : '');
              setShowSaveModal(true);
            }}
            disabled={isAlreadySaved}
            className={`w-full mt-4 mb-8 py-3 text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
              isAlreadySaved
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-default'
                : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 cursor-pointer'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {isAlreadySaved ? t('이미 저장된 프로필', 'Already Saved') : t('만세력 저장하기', 'Save Profile')}
          </button>
        </>
        );
      })()}

      {/* 저장 모달 */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-[360px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 mb-1">{t('만세력 저장', 'Save Profile')}</h3>
            <p className="text-[12px] text-gray-400 dark:text-gray-300 mb-3">{t('저장할 이름을 입력해주세요', 'Enter a name to save')}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4 leading-snug">
              {t('이 기기의 브라우저에만 저장돼요. 서버로 전송되거나 다른 기기에서 보이지 않아요.', 'Saved only in this browser — never sent to a server, never visible on other devices.')}
            </p>
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
              placeholder={t('예) 홍길동', 'e.g. John Doe')} maxLength={20} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { handleSave(); } if (e.key === 'Escape') setShowSaveModal(false); }}
              className="w-full px-3 py-2.5 text-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-lg outline-none focus:border-gray-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-2.5 text-[13px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all">{t('취소', 'Cancel')}</button>
              <button onClick={handleSave} className="flex-1 py-2.5 text-[13px] font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-all">{t('저장', 'Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 저장 목록 */}
      {savedList.length > 0 && (() => {
        // 현재 로드된 엔트리 매칭 (날짜+성별+시간+도시 일치)
        const parsedNow = parseDateStr(birthdate);
        const currentSavedId = result && parsedNow ? savedList.find(it => {
          const parts = it.date.split('-').map(Number);
          return parts[0] === parsedNow.y && parts[1] === parsedNow.m && parts[2] === parsedNow.d
            && it.gender === gender
            && (it.time || '') === (noTime ? '' : timeInput)
            && (it.region || '') === (region || '');
        })?.id ?? null : null;

        return (
        <div className="mt-8">
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
                    <span className="shrink-0 mr-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-600 text-white">
                      {t('현재', 'Current')}
                    </span>
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
                    const colorMap: Record<string, string> = { '목': 'text-green-600', '화': 'text-red-500', '토': 'text-yellow-600', '금': 'text-gray-500 dark:text-gray-400 dark:text-gray-300', '수': 'text-blue-600' };
                    return <span className={`shrink-0 text-[13px] font-bold ml-2 ${colorMap[oh] || 'text-gray-600 dark:text-gray-400'}`}>{formatIlganLabel(item.ilgan, lang)}</span>;
                  })()}
                  <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                    className="shrink-0 ml-2 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors text-[16px]">&times;</button>
                </div>
              );
            })}
          </div>
          {savedList.length > 3 && (
            <button
              type="button"
              onClick={() => setSavedExpanded(v => !v)}
              className="w-full mt-2 flex items-center justify-center gap-1 py-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:text-gray-300 transition-colors"
            >
              {savedExpanded ? t('접기', 'Collapse') : t(`${savedList.length - 3}개 더 보기`, `Show ${savedList.length - 3} more`)}
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: savedExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
        );
      })()}

      {/* 저장된 만세력 ↔ 배너 사이 구분선 */}
      {mode === 'full' && <div className="mt-6 mb-5 border-t" style={{ borderColor: '#EFEAE3' }} />}

      {/* phase-04 (2026-05-24): cross-link 카드 3종 — 메인 진입 카드 결 (아이콘박스+텍스트+›) */}
      {mode === 'full' && (<>
      <CrossLinkCard
        href={localePath('/chaeun')}
        bg="#FFF6E8" iconBg="#FFD8A0" iconFg="#8A5800"
        title={t('재운 흐름 보기', 'Wealth Flow')}
        sub={t('대운·세운·월운 한 흐름으로', 'Dae · Se · Wol cycle in one flow')}
        icon="coins"
        beforeClick={() => {
          trackEvent('chaeun_banner_click', { has_result: !!result });
          if (!result) { try { localStorage.removeItem('saju_current'); } catch {} }
        }}
        router={router}
      />
      <CrossLinkCard
        href={localePath('/career')}
        bg="#DBF1E8" iconBg="#86D4B5" iconFg="#1B5B45"
        title={t('커리어 흐름 보기', 'Career Flow')}
        sub={t('관성 진입과 직업 적성', 'Officer entries & career fit')}
        icon="briefcase"
        beforeClick={() => {
          trackEvent('career_banner_click', { has_result: !!result });
          if (!result) { try { localStorage.removeItem('saju_current'); } catch {} }
        }}
        router={router}
      />
      <CrossLinkCard
        href="/compatibility"
        bg="#FFE2DE" iconBg="#F3A296" iconFg="#7E2618"
        title={t('궁합 추천 보기', 'Ideal Match')}
        sub={t('상대 없이 내게 맞는 사주', 'Your match, even without one')}
        icon="heart"
        beforeClick={() => {
          trackEvent('compatibility_banner_click', { has_result: !!result });
          if (!result) { try { localStorage.removeItem('saju_current'); } catch {} }
        }}
        router={router}
      />
      </>)}
      </div>
      </div>
    </div>
  );

  function handleSave() {
    if (!result) return;
    const parsed = parseDateStr(birthdate);
    if (!parsed) return;
    const name = saveName.trim() || `${parsed.y}.${parsed.m}.${parsed.d}`;
    const entry: SavedEntry = {
      id: Date.now(), name,
      date: `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`,
      gender, time: timeInput, region,
      ilgan: result.pillars[1].ck && result.ilgan ? result.pillars[1].ck + result.ilgan : '',
      createdAt: new Date().toISOString(),
    };
    const list = [entry, ...getSaved()];
    setSaved(list); setSavedList(list);
    setShowSaveModal(false);
  }

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
    setShowForm(false);
  }

  function handleDelete(id: number) {
    const list = getSaved().filter(x => x.id !== id);
    setSaved(list); setSavedList(list);
  }
}

/**
 * CrossLinkCard — 점신 결 단순 박스 카드 (phase-04, 2026-05-24)
 * 메인 페이지의 진입 카드(/today, /blog) 와 동일 구조.
 * 컬러 박스 + 작은 아이콘 박스 + 제목·부제목 + ›.
 * SVG 배경·글로우 같은 잡스러운 그래픽 없음.
 */
function CrossLinkCard({
  href, bg, iconBg, iconFg, title, sub, icon, beforeClick, router,
}: {
  href: string;
  bg: string;
  iconBg: string;
  iconFg: string;
  title: string;
  sub: string;
  icon: 'coins' | 'briefcase' | 'heart';
  beforeClick: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <button
      type="button"
      onClick={() => { beforeClick(); router.push(href); }}
      className="w-full flex items-center gap-4 rounded-2xl p-4 mt-3 first:mt-0 transition-transform active:scale-[0.99] border-none cursor-pointer text-left"
      style={{ background: bg }}
    >
      <span
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: iconBg, color: iconFg }}
      >
        <CrossLinkIcon name={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold leading-tight tracking-tight" style={{ color: '#1A1A1A' }}>{title}</p>
        <p className="text-[12.5px] mt-1" style={{ color: '#4F4F58' }}>{sub}</p>
      </div>
      <span className="text-[20px] shrink-0" style={{ color: '#A0A0A8' }} aria-hidden>›</span>
    </button>
  );
}

function CrossLinkIcon({ name }: { name: 'coins' | 'briefcase' | 'heart' }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'coins') return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </svg>
  );
  if (name === 'briefcase') return (
    <svg {...common}>
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
  // heart
  return (
    <svg {...common}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
