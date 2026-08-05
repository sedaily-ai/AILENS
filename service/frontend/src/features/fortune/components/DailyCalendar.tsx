'use client';

import { useState, useMemo } from 'react';
import { getGapja, CG_OH, JJ_OH, JJG, sipsung, unsung } from '../lib/engine';
import { V3_TOKENS } from '../lib/ohaeng';

const EL_COLORS: Record<string, string> = {
  '목': 'text-green-600', '화': 'text-red-500', '토': 'text-yellow-600',
  '금': 'text-gray-500', '수': 'text-blue-600',
};

const SS_MEANING: Record<string, string> = {
  '비견': '동료·경쟁자', '겁재': '경쟁·지출', '식신': '표현·여유', '상관': '재능·비판',
  '편재': '활동적 재물', '정재': '성실한 재물', '편관': '압박·도전', '정관': '명예·규율',
  '편인': '직관·영감', '정인': '학문·지혜',
};

const US_MEANING: Record<string, string> = {
  '장생': '새로운 시작', '목욕': '변화·불안정', '관대': '자신감·성장',
  '건록': '전성기 시작', '제왕': '에너지 정점', '쇠': '기운 쇠약',
  '병': '쇠약 상태', '사': '정체·막힘', '묘': '내면 회고',
  '절': '단절·전환', '태': '잉태·준비', '양': '조용한 성장',
};

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

interface Props { ilgan: string; }

interface DayInfo {
  day: number; dow: number;
  ganji: string; ganjiHanja: string;
  cgOh: string; jjOh: string;
  ss: string; us: string;
  isToday: boolean;
}

export function DailyCalendar({ ilgan }: Props) {
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  const [viewY, setViewY] = useState(todayY);
  const [viewM, setViewM] = useState(todayM);
  const [mode, setMode] = useState<'sipsung' | 'unseong'>('sipsung');
  const [selectedDay, setSelectedDay] = useState<DayInfo | null>(null);

  const calData = useMemo(() => {
    const daysInMonth = new Date(viewY, viewM, 0).getDate();
    const firstDow = new Date(viewY, viewM - 1, 1).getDay();
    const todayStr = `${todayY}-${todayM}-${todayD}`;
    const days: DayInfo[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dow = (firstDow + d - 1) % 7;
      let ganji = '', ganjiHanja = '', cgOh = '', jjOh = '', ss = '', us = '';
      try {
        const g = getGapja(viewY, viewM, d);
        ganji = g.dayPillar;
        ganjiHanja = g.dayPillarHanja;
        cgOh = CG_OH[ganjiHanja[0]] || '';
        jjOh = JJ_OH[ganjiHanja[1]] || '';
        if (ilgan && ganjiHanja.length === 2) {
          ss = sipsung(ilgan, ganjiHanja[0]);
          us = unsung(ilgan, ganjiHanja[1]);
        }
      } catch {}
      days.push({
        day: d, dow, ganji, ganjiHanja, cgOh, jjOh, ss, us,
        isToday: `${viewY}-${viewM}-${d}` === todayStr,
      });
    }
    return { days, firstDow, daysInMonth };
  }, [viewY, viewM, todayY, todayM, todayD, ilgan]);

  const prevMonth = () => {
    if (viewM === 1) { setViewM(12); setViewY(viewY - 1); }
    else setViewM(viewM - 1);
  };
  const nextMonth = () => {
    if (viewM === 12) { setViewM(1); setViewY(viewY + 1); }
    else setViewM(viewM + 1);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-[16px] p-5 mb-4">
      {/* 헤더: 타이틀 + 토글 pill */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-gray-900">일진 달력</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{viewY}년 {viewM}월</div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('sipsung')}
            className="cursor-pointer border-none rounded-lg"
            style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 700,
              background: mode === 'sipsung' ? V3_TOKENS.ink : V3_TOKENS.page,
              color: mode === 'sipsung' ? '#fff' : V3_TOKENS.ink,
            }}
          >
            십성
          </button>
          <button
            type="button"
            onClick={() => setMode('unseong')}
            className="cursor-pointer border-none rounded-lg"
            style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 700,
              background: mode === 'unseong' ? V3_TOKENS.ink : V3_TOKENS.page,
              color: mode === 'unseong' ? '#fff' : V3_TOKENS.ink,
            }}
          >
            운성
          </button>
        </div>
      </div>

      {/* 월 네비 */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg border-none cursor-pointer"
          style={{ background: V3_TOKENS.panel, color: V3_TOKENS.sub, fontSize: 14 }}
          aria-label="이전 달"
        >‹</button>
        <div className="text-[13px] font-bold text-gray-900">{viewY}년 {viewM}월</div>
        <button
          type="button"
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg border-none cursor-pointer"
          style={{ background: V3_TOKENS.panel, color: V3_TOKENS.sub, fontSize: 14 }}
          aria-label="다음 달"
        >›</button>
      </div>

      {/* 요일 + 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {DOWS.map((w, i) => (
          <div
            key={w}
            className="text-center font-semibold"
            style={{
              fontSize: 10,
              color: i === 0 ? '#C33A1F' : V3_TOKENS.sub,
              padding: '6px 0',
            }}
          >
            {w}
          </div>
        ))}
        {Array.from({ length: calData.firstDow }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {calData.days.map(info => {
          const { day, ganji, ss, us, isToday } = info;
          const subtitle = mode === 'sipsung' ? ss : us;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(info)}
              className="rounded-[10px] flex flex-col items-center justify-center cursor-pointer border-none"
              style={{
                aspectRatio: '1 / 1',
                background: isToday ? V3_TOKENS.ink : V3_TOKENS.panel,
                color: isToday ? '#fff' : V3_TOKENS.ink,
                padding: 2,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700 }}>{day}</div>
              <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{ganji}</div>
              <div style={{ fontSize: 9, opacity: 0.6, marginTop: 1 }}>{subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* 선택 상세 모달 (기존 로직 유지) */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4"
          onClick={() => setSelectedDay(null)}>
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-[420px]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="text-[15px] font-bold text-gray-900">
                  {viewY}년 {viewM}월 {selectedDay.day}일 ({DOWS[selectedDay.dow]})
                </h4>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  일진 <span className={`font-bold ${EL_COLORS[selectedDay.cgOh]}`}>{selectedDay.ganji}</span>
                  <span className="text-gray-400 ml-1.5">({selectedDay.ganjiHanja})</span>
                </p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {selectedDay.ss && (
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-gray-500 mb-0.5">십성</div>
                <div className="text-[13px]">
                  <strong>{selectedDay.ss}</strong>
                  <span className="text-[11px] text-gray-400 ml-1.5">{SS_MEANING[selectedDay.ss] || ''}</span>
                </div>
              </div>
            )}
            {selectedDay.us && (
              <div className="mb-3">
                <div className="text-[11px] font-semibold text-gray-500 mb-0.5">12운성</div>
                <div className="text-[13px]">
                  <strong>{selectedDay.us}</strong>
                  <span className="text-[11px] text-gray-400 ml-1.5">{US_MEANING[selectedDay.us] || ''}</span>
                </div>
              </div>
            )}
            {selectedDay.ganjiHanja && JJG[selectedDay.ganjiHanja[1]] && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 mb-0.5">
                  지지({selectedDay.ganjiHanja[1]}) 속 숨은 기운
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {JJG[selectedDay.ganjiHanja[1]].map((h, i, arr) => {
                    const weight = arr.length === 1 ? '본기' : arr.length === 2 ? (i === 0 ? '여기' : '본기') : (i === 0 ? '여기' : i === 1 ? '중기' : '본기');
                    const hss = ilgan ? sipsung(ilgan, h) : '';
                    return (
                      <span key={i} className={`px-1.5 py-0.5 rounded border ${weight === '본기' ? 'border-gray-400 bg-gray-50 font-medium' : 'border-gray-200 text-gray-500'}`}>
                        <span className="text-gray-400">{weight}</span>{' '}
                        <span>{h}</span>{' '}
                        {hss && <span className="text-gray-600">{hss}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
