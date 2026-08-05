'use client';

import { useState } from 'react';
import { REGION_OPTIONS } from '../lib/engine';
import { personaMeta } from '../lib/personaVoice';
import { trackEvent } from '@/shared/lib/trackEvent';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

interface CalculateInput {
  birthdate: string;
  timeInput: string;
  noTime: boolean;
  region: string;
  gender: '남' | '여';
}

interface Props {
  group: MbtiGroup;
  // explore 에서 골라온 섹션 라벨 — 인사 카드 eyebrow 를 동적으로 바꿈.
  // null 이면 "오늘의 풀이" 기본값.
  intentLabel?: string | null;
  onChangeGroup: (g: MbtiGroup) => void;
  onComplete: (input: CalculateInput) => void;
}

const PERSONA_AVATARS: Record<MbtiGroup, string> = {
  NT: '/editors/intj.webp',
  NF: '/editors/infp.webp',
  ST: '/editors/istj.webp',
  SF: '/editors/esfp.webp',
};

const PERSONA_ACCENTS: Record<MbtiGroup, { accent: string; soft: string }> = {
  NT: { accent: '#7c3aed', soft: '#ede9fe' },
  NF: { accent: '#e11d48', soft: '#ffe4e6' },
  ST: { accent: '#059669', soft: '#d1fae5' },
  SF: { accent: '#d97706', soft: '#fef3c7' },
};

export function SajuQuickForm({ group, intentLabel, onChangeGroup, onComplete }: Props) {
  const [birth, setBirth] = useState(''); // YYYYMMDD
  const [gender, setGender] = useState<'남' | '여'>('남');
  const [time, setTime] = useState(''); // HHMM
  const [noTime, setNoTime] = useState(false);
  const [region, setRegion] = useState('');

  const p = personaMeta[group];
  const { accent, soft } = PERSONA_ACCENTS[group];

  const handleBirthChange = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '').slice(0, 8);
    setBirth(raw);
  };

  const handleTimeChange = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '').slice(0, 4);
    setTime(raw);
  };

  const birthFormatted = birth.length >= 5
    ? `${birth.slice(0, 4)} / ${birth.slice(4, 6)}${birth.length >= 7 ? ` / ${birth.slice(6)}` : ''}`
    : birth;

  const timeFormatted = time.length >= 3
    ? `${time.slice(0, 2)} : ${time.slice(2)}`
    : time;

  const birthValid = birth.length === 8;
  const timeValid = noTime || time.length === 4;
  const formValid = birthValid && timeValid && !!region;

  const handleSubmit = () => {
    if (!formValid) return;
    onComplete({
      birthdate: birth,
      timeInput: time,
      noTime,
      region,
      gender,
    });
  };

  return (
    <section
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: 'clamp(28px, 5vw, 48px) clamp(20px, 5vw, 32px)',
      }}
    >
      {/* 인텐트 라벨 — 페르소나 인사 카드 제거(에디터 토글과 의미 동일 제거) */}
      {intentLabel && (
        <p style={{ fontSize: 11, color: accent, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 16, padding: '0 4px' }}>
          {intentLabel}
        </p>
      )}

      {/* 통합 폼 — 한 화면에 모든 입력 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 생년월일 */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 8, letterSpacing: '-0.005em' }}>
            생년월일
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={birthFormatted}
            onChange={e => handleBirthChange(e.target.value)}
            placeholder="1990 / 01 / 15"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
            style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.005em' }}
          />
        </div>

        {/* 성별 */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 8, letterSpacing: '-0.005em' }}>
            성별
          </label>
          <div className="flex" style={{ gap: 8 }}>
            {(['남', '여'] as const).map(g => {
              const active = g === gender;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className="flex-1 transition-all duration-200"
                  style={{
                    padding: '12px 0',
                    borderRadius: 12,
                    background: active ? '#3182F6' : '#fff',
                    color: active ? '#fff' : '#374151',
                    border: active ? '1px solid #3182F6' : '1px solid #e5e7eb',
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    letterSpacing: '-0.005em',
                  }}
                  aria-pressed={active}
                >
                  {g}자
                </button>
              );
            })}
          </div>
        </div>

        {/* 태어난 시간 */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 8, letterSpacing: '-0.005em' }}>
            태어난 시간
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={timeFormatted}
            onChange={e => {
              handleTimeChange(e.target.value);
              if (e.target.value && noTime) setNoTime(false);
            }}
            placeholder="14 : 30"
            disabled={noTime}
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
            style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.005em' }}
          />
          <label className="flex items-center mt-2 cursor-pointer" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={noTime}
              onChange={e => {
                setNoTime(e.target.checked);
                if (e.target.checked) setTime('');
              }}
              style={{ width: 15, height: 15 }}
            />
            <span style={{ fontSize: 12.5, color: '#6b7280' }}>시간을 잘 몰라요</span>
          </label>
        </div>

        {/* 출생 지역 */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 8, letterSpacing: '-0.005em' }}>
            출생 지역
          </label>
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors bg-white"
            style={{ fontSize: 15, letterSpacing: '-0.005em', color: region ? '#111827' : '#9ca3af' }}
          >
            <option value="" disabled>지역을 골라주세요</option>
            {REGION_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 시작 버튼 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!formValid}
        className="w-full mt-8 transition-all duration-300 hover:translate-y-[-1px] disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
        style={{
          padding: '16px 0',
          borderRadius: 999,
          background: '#3182F6',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          border: 'none',
          cursor: formValid ? 'pointer' : 'not-allowed',
          boxShadow: formValid ? '0 10px 28px rgba(49, 130, 246, 0.28)' : 'none',
          letterSpacing: '-0.005em',
        }}
      >
        {p.name}의 풀이 받기 →
      </button>

      <p className="text-center mt-4" style={{ fontSize: 11.5, color: '#9ca3af', letterSpacing: '-0.005em' }}>
        입력하신 정보는 기기에만 저장돼요. 서버로 전송되지 않아요.
      </p>
    </section>
  );
}
