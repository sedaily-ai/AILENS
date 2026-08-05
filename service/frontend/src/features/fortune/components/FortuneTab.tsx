'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  calculateSaju, parsePillar, sipsung, unsung, elClass,
  CG_OH, JJ_OH, OH_HJ, JJG,
  buildChongun, buildTodayFortune, calcDaeun, calcYeonun, calcWolun,
  matchSijin, REGION_OPTIONS,
  type Pillar, type ChongunResult, type TodayFortuneResult, type DaeunEntry, type YeonunEntry, type WolunEntry,
} from '../lib/engine';
import { SajuTable } from './SajuTable';
import { FortuneResult } from './FortuneResult';
import { SajuHero } from './SajuHero';
import { SajuQuickForm } from './SajuQuickForm';
import { SajuExplore, type SajuIntent } from './SajuExplore';
import { trackEvent } from '@/shared/lib/trackEvent';

// SajuExplore 카드 라벨 — 입력 폼 헤더 칩으로 표시.
const INTENT_LABEL: Record<SajuIntent, string> = {
  manse: '만세력 사주표',
  today: '오늘의 운세',
  chongun: '총운',
  category: '분야별 운세',
  daeun: '대운 흐름',
  calendar: '일진 달력',
};

interface SajuData {
  pillars: Pillar[];
  ilgan: string;
  year: number; month: number; day: number;
  gender: string;
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

const STORAGE_KEY = 'saju_saved';
function getSaved(): SavedEntry[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function setSaved(list: SavedEntry[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }

interface FortuneTabProps {
  selectedGroup?: 'NT' | 'NF' | 'ST' | 'SF';
  onMbtiChange?: (group: 'NT' | 'NF' | 'ST' | 'SF') => void;
}

export function FortuneTab({ selectedGroup, onMbtiChange }: FortuneTabProps = {}) {
  const [birthdate, setBirthdate] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [noTime, setNoTime] = useState(false);
  const [gender, setGender] = useState<'남' | '여'>('남');
  const mbtiGroup = selectedGroup ?? 'NF';
  const setMbtiGroup = useCallback((g: 'NT' | 'NF' | 'ST' | 'SF') => {
    if (onMbtiChange) onMbtiChange(g);
  }, [onMbtiChange]);
  const [region, setRegion] = useState('');
  const [result, setResult] = useState<SajuData | null>(null);
  const [error, setError] = useState('');
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [explore, setExplore] = useState(true);
  // 사용자가 explore 에서 어떤 섹션 카드를 골랐는지 — 결과 렌더 후 해당 섹션으로 스크롤.
  const [intent, setIntent] = useState<SajuIntent | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => { setSavedList(getSaved()); }, []);

  // URL ?birthdate=YYYY-MM-DD 진입 시 폼 자동 prefill — 타임머신 끝 페이지에서 딥링크 연결.
  // explore 단계 건너뛰고 입력 폼으로 바로 이동, 생년월일은 사주 폼 표기(YYYY / MM / DD).
  const searchParams = useSearchParams();
  useEffect(() => {
    const bd = searchParams?.get('birthdate');
    if (!bd) return;
    const m = bd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    setBirthdate(`${m[1]} / ${m[2]} / ${m[3]}`);
    setExplore(false);
    setShowForm(true);
    // 같은 effect 안에서 explore push state 도 한 번 — 뒤로가기 자연스럽게.
    try { window.history.pushState({ sajuStep: 'form' }, ''); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 브라우저 뒤로가기 — 사주 결과/폼 단계에서 뒤로가면 /editors 같은 외부로 빠지지 않고
  // 사주 explore 화면으로 돌아가도록. 카드 클릭 시 history.pushState 로 한 단계 더 쌓고,
  // popstate 시 explore=true 복원.
  useEffect(() => {
    const onPop = () => {
      // explore 외 단계에 있다면 popstate 한 번에 explore 로 복귀.
      setExplore(true);
      setShowForm(true);
      setIntent(null);
      setResult(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
      const { daeuns } = il ? calcDaeun(s, g, y, m, d) : { daeuns: [] };
      const yeonuns = il ? calcYeonun() : [];
      const woluns = il ? calcWolun() : [];

      setResult({
        pillars: ps, ilgan: il, year: y, month: m, day: d, gender: g,
        chongun, todayFortune, daeuns, yeonuns, woluns,
        correctedTime: s.isTimeCorrected && s.correctedTime ? s.correctedTime : undefined,
      });
      trackEvent('saju_calculate', { ilgan: il, gender: g, has_time: !isNoTime });
      setError('');
    } catch (err) {
      setError('계산 오류: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleCalculate = useCallback(() => {
    const parsed = parseDateStr(birthdate);
    if (!parsed) { setError('생년월일을 정확히 입력해주세요.'); return; }
    const { y, m, d } = parsed;
    if (y < 1900 || y > 2050) { setError('1900~2050년 범위만 지원합니다.'); return; }
    doCalculate(y, m, d, gender, timeInput, noTime, region);
    setShowForm(false);
  }, [birthdate, timeInput, noTime, gender, region, parseDateStr, doCalculate]);

  const today = new Date();
  const todayLabel = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  if (explore && !result) {
    return (
      <div className="w-full" style={{ minHeight: '100vh' }}>
        <SajuExplore
          group={mbtiGroup}
          onAsk={() => {
            try { window.history.pushState({ sajuStep: 'form' }, ''); } catch {}
            setExplore(false); setShowForm(true);
          }}
          onOpen={(focus) => {
            try { window.history.pushState({ sajuStep: 'form', intent: focus ?? null }, ''); } catch {}
            setIntent(focus ?? null); setExplore(false); setShowForm(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="-my-6 w-full" style={{ minHeight: 'calc(100vh + 48px)', background: '#ffffff' }}>
      <div className="max-w-[720px] mx-auto relative" style={{ zIndex: 1 }}>
      {/* 페르소나 무드 히어로 */}
      <SajuHero group={mbtiGroup} onChange={setMbtiGroup} todayLabel={todayLabel} />

      {/* 회색 콘텐츠 영역 */}
      <div style={{ padding: '20px 20px 56px' }}>
      <button
        type="button"
        onClick={() => { setExplore(true); setShowForm(true); setIntent(null); }}
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
        </svg>
        운세 둘러보기
      </button>
      {/* 입력 폼 — 결과가 있으면 접힘 */}
      {showForm ? (
        <SajuQuickForm
          group={mbtiGroup}
          intentLabel={intent ? INTENT_LABEL[intent] : null}
          onChangeGroup={setMbtiGroup}
          onComplete={({ birthdate: bd, timeInput: ti, noTime: nt, region: rg, gender: gd }) => {
            const raw = bd.replace(/[^0-9]/g, '');
            const y = parseInt(raw.slice(0, 4));
            const m = parseInt(raw.slice(4, 6));
            const d = parseInt(raw.slice(6, 8));
            setBirthdate(`${raw.slice(0, 4)} / ${raw.slice(4, 6)} / ${raw.slice(6, 8)}`);
            setTimeInput(ti);
            setNoTime(nt);
            setRegion(rg);
            setGender(gd);
            doCalculate(y, m, d, gd, ti, nt, rg);
            setShowForm(false);
          }}
        />
      ) : result ? (() => {
        const EL_BG: Record<string, string> = {
          '목': 'bg-green-50 text-green-700',
          '화': 'bg-red-50 text-red-600',
          '토': 'bg-yellow-50 text-yellow-700',
          '금': 'bg-gray-100 text-gray-700',
          '수': 'bg-blue-50 text-blue-700',
        };
        const ilganOh = CG_OH[result.ilgan] || '';
        const parsed = parseDateStr(birthdate);
        const dateLabel = parsed ? `${parsed.y}년 ${parsed.m}월 ${parsed.d}일` : '';
        const timeLabel = noTime || !timeInput ? '시간 모름' : timeInput;
        const regionLabel = REGION_OPTIONS.find(r => r.value === region)?.label || '';

        // 경도 보정 분 차이
        let offsetLabel = '';
        if (result.correctedTime && !noTime) {
          const raw = timeInput.replace(/[^0-9]/g, '');
          if (raw.length === 4) {
            const inMin = parseInt(raw.slice(0, 2)) * 60 + parseInt(raw.slice(2, 4));
            const outMin = result.correctedTime.hour * 60 + result.correctedTime.minute;
            const diff = outMin - inMin;
            if (diff !== 0) offsetLabel = ` (경도보정 ${diff > 0 ? '+' : ''}${diff}분)`;
          }
        }

        const subtitle = [gender, regionLabel].filter(Boolean).join(' · ') + offsetLabel;

        return (
          <div id="saju-summary" className="bg-white rounded-[16px] p-4 mb-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0 ${EL_BG[ilganOh] || 'bg-gray-50 text-gray-400'}`}>
                {result.ilgan || '—'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-900 truncate">
                  {dateLabel}{!noTime && timeInput && ` ${timeLabel}`}
                </div>
                <div className="text-[11px] text-gray-400 truncate">{subtitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="shrink-0 border-none rounded-lg cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                다시 입력
              </button>
            </div>
          </div>
        );
      })() : null}

      {error && <p className="mt-3 text-center text-[13px] text-red-500">{error}</p>}

      {/* 결과 */}
      {result && (
        <>
          <FortuneResult data={result} mbtiGroup={mbtiGroup} onMbtiChange={setMbtiGroup} focusSection={intent} />
          <div id="saju-save" />
          <button
            onClick={() => {
              const parsed = parseDateStr(birthdate);
              setSaveName(parsed ? `${parsed.y}.${parsed.m}.${parsed.d}` : '');
              setShowSaveModal(true);
            }}
            className="w-full mt-4 mb-8 py-3.5 text-[14px] font-bold rounded-xl text-white transition-all"
            style={{ background: '#5B8DF0' }}
          >
            만세력 저장하기
          </button>
        </>
      )}

      {/* 저장 모달 */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-[320px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold text-gray-900 mb-1">만세력 저장</h3>
            <p className="text-[12px] text-gray-400 mb-4">저장할 이름을 입력해주세요</p>
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
              placeholder="예) 홍길동" maxLength={20} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { handleSave(); } if (e.key === 'Escape') setShowSaveModal(false); }}
              className="w-full px-3 py-2.5 text-[14px] border border-gray-200 rounded-lg outline-none focus:border-gray-400 mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-2.5 text-[13px] font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all">취소</button>
              <button onClick={handleSave} className="flex-1 py-2.5 text-[13px] font-medium bg-[#3182F6] text-white rounded-lg hover:bg-[#1f6feb] transition-all">저장</button>
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
          <h3 className="text-[13px] font-semibold text-gray-800 mb-3">저장된 만세력</h3>
          <div className="space-y-2">
            {(savedExpanded ? savedList : savedList.slice(0, 3)).map(item => {
              const isCurrent = item.id === currentSavedId;
              return (
                <div key={item.id} onClick={() => handleLoad(item)}
                  className={`flex items-center justify-between px-4 py-3 bg-white rounded-xl cursor-pointer transition-all ${
                    isCurrent
                      ? 'border-2 border-green-500 bg-green-50/50'
                      : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {isCurrent && (
                    <span className="shrink-0 mr-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-600 text-white">
                      현재
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-gray-900 mr-2">{item.name}</span>
                    <span className="text-[11px] text-gray-400">
                      {item.date.replace(/-/g, '.')} {item.time && `${item.time}`} · {item.gender}
                    </span>
                  </div>
                  {item.ilgan && (() => {
                    const hanja = item.ilgan.length >= 2 ? item.ilgan[1] : '';
                    const oh = CG_OH[hanja] || '';
                    const colorMap: Record<string, string> = { '목': 'text-green-600', '화': 'text-red-500', '토': 'text-yellow-600', '금': 'text-gray-500', '수': 'text-blue-600' };
                    return <span className={`text-[13px] font-bold ml-2 ${colorMap[oh] || 'text-gray-600'}`}>{item.ilgan}</span>;
                  })()}
                  <button onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                    className="ml-2 w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors text-[16px]">&times;</button>
                </div>
              );
            })}
          </div>
          {savedList.length > 3 && (
            <button
              type="button"
              onClick={() => setSavedExpanded(v => !v)}
              className="w-full mt-2 flex items-center justify-center gap-1 py-2 text-[12px] font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              {savedExpanded ? '접기' : `${savedList.length - 3}개 더 보기`}
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
