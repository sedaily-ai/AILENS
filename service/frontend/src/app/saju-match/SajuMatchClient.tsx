'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/widgets/Header';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import {
  calculateSaju,
  parsePillar,
  REGION_OPTIONS,
  type Pillar,
} from '@/entities/saju';
import { IdealMatchSection } from '@/features/ideal-match';
import { CoupleMatchSection } from '@/features/couple-match';
import type { PersonInput } from '@/features/couple-match/lib/coupleEngine';

type Gender = '남' | '여';
type Tab = 'ideal' | 'couple';

interface PersonState {
  pillars: Pillar[];
  gender: Gender;
  birthYear: number;
  label?: string;
}

function buildPerson(
  y: number,
  m: number,
  d: number,
  hr: number | undefined,
  mn: number,
  region: string,
  gender: Gender,
  label?: string,
): PersonState | null {
  try {
    const opts: { longitude?: number; applyTimeCorrection?: boolean } = {};
    if (region) {
      opts.longitude = parseFloat(region);
      opts.applyTimeCorrection = true;
    }
    const s = calculateSaju(y, m, d, hr, mn, opts);
    const pillars: Pillar[] = [
      parsePillar(s.hourPillar ?? '', s.hourPillarHanja ?? ''),
      parsePillar(s.dayPillar ?? '', s.dayPillarHanja ?? ''),
      parsePillar(s.monthPillar ?? '', s.monthPillarHanja ?? ''),
      parsePillar(s.yearPillar ?? '', s.yearPillarHanja ?? ''),
    ];
    return { pillars, gender, birthYear: y, label };
  } catch {
    return null;
  }
}

export function SajuMatchClient() {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get('tab') === 'couple' ? 'couple' : 'ideal';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mine, setMine] = useState<PersonState | null>(null);
  const [partner, setPartner] = useState<PersonState | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  // CTA 배너로 들어왔을 때 — query 가 늦게 도착하면 effect 로 보강.
  useEffect(() => {
    if (searchParams.get('tab') === 'couple' && tab !== 'couple') setTab('couple');
    // 의도적으로 tab 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const resetAll = useCallback(() => {
    setMine(null);
    setPartner(null);
  }, []);

  const personA: PersonInput | null = useMemo(() => {
    if (!mine) return null;
    return { pillars: mine.pillars, gender: mine.gender, birthYear: mine.birthYear, label: '나' };
  }, [mine]);

  const personB: PersonInput | null = useMemo(() => {
    if (!partner) return null;
    return { pillars: partner.pillars, gender: partner.gender, birthYear: partner.birthYear, label: '상대' };
  }, [partner]);

  return (
    <div className="min-h-screen bg-white">
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('fortune')}
      />
      {showSearch && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full mt-20"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-600">검색은 메인 화면에서 이용해주세요.</p>
            <Link href="/" className="mt-3 inline-block text-sm font-semibold text-blue-600">
              메인으로 →
            </Link>
          </div>
        </div>
      )}

      <main className="max-w-[820px] mx-auto px-4 sm:px-5 py-8">
        <header className="mb-7">
          <p style={{ fontSize: 11, fontWeight: 700, color: '#3182F6', letterSpacing: '0.14em' }}>
            SAJU × MATCH
          </p>
          <h1 className="text-[clamp(22px,4.5vw,30px)] font-extrabold tracking-tight text-gray-900 mt-1">
            사주로 보는 궁합
          </h1>
          <p className="text-[13.5px] text-gray-500 mt-2 leading-relaxed">
            내 사주만으로 풀어내는 <strong className="text-gray-700">이상형 역산</strong>과, 두 사주를
            맞춰보는 <strong className="text-gray-700">커플 궁합</strong> 두 가지를 제공해요.
          </p>
        </header>

        <div className="flex gap-2 mb-6">
          {([['ideal', '이상형 역산'], ['couple', '커플 궁합']] as const).map(([key, label]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="px-4 h-9 rounded-full text-[13px] font-semibold transition-colors"
                style={{
                  background: on ? '#3182F6' : '#f3f4f6',
                  color: on ? '#fff' : '#6b7280',
                }}
              >
                {label}
              </button>
            );
          })}
          {mine && (
            <button
              type="button"
              onClick={resetAll}
              className="ml-auto text-[12px] text-gray-500 hover:text-gray-900"
            >
              다시 입력
            </button>
          )}
        </div>

        {!mine ? (
          <PersonForm
            label="내 정보"
            description="태어난 정보로 사주를 풀어요."
            onSubmit={(p) => setMine(p)}
          />
        ) : tab === 'ideal' ? (
          <IdealMatchSection
            pillars={mine.pillars}
            gender={mine.gender}
            birthYear={mine.birthYear}
            onGoCouple={() => {
              setTab('couple');
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : !partner ? (
          <PersonForm
            label="상대 정보"
            description="두 사주를 맞춰 일간 관계·일지 합충·오행 보완을 비교해드려요."
            onSubmit={(p) => setPartner({ ...p, label: '상대' })}
          />
        ) : personA && personB ? (
          <CoupleMatchSection a={personA} b={personB} onReset={() => setPartner(null)} />
        ) : null}
      </main>
    </div>
  );
}

function PersonForm({
  label,
  description,
  onSubmit,
}: {
  label: string;
  description: string;
  onSubmit: (p: PersonState) => void;
}) {
  const [birth, setBirth] = useState('');
  const [time, setTime] = useState('');
  const [noTime, setNoTime] = useState(false);
  const [gender, setGender] = useState<Gender>('남');
  const [region, setRegion] = useState('');
  const [error, setError] = useState('');

  const birthFormatted =
    birth.length >= 5
      ? `${birth.slice(0, 4)} / ${birth.slice(4, 6)}${birth.length >= 7 ? ` / ${birth.slice(6)}` : ''}`
      : birth;
  const timeFormatted = time.length >= 3 ? `${time.slice(0, 2)} : ${time.slice(2)}` : time;
  const birthValid = birth.length === 8;
  const timeValid = noTime || time.length === 4;
  const formValid = birthValid && timeValid && !!region;

  const handleSubmit = () => {
    if (!formValid) return;
    const y = parseInt(birth.slice(0, 4));
    const m = parseInt(birth.slice(4, 6));
    const d = parseInt(birth.slice(6, 8));
    if (y < 1900 || y > 2050) {
      setError('1900~2050년 범위만 지원합니다.');
      return;
    }
    let hr: number | undefined;
    let mn = 0;
    if (!noTime && time.length === 4) {
      hr = parseInt(time.slice(0, 2));
      mn = parseInt(time.slice(2, 4));
    }
    const built = buildPerson(y, m, d, hr, mn, region, gender);
    if (!built) {
      setError('사주 계산 중 오류가 발생했어요.');
      return;
    }
    setError('');
    onSubmit(built);
  };

  return (
    <section className="border border-gray-100 rounded-2xl p-6 bg-white">
      <h3 className="text-[15px] font-extrabold text-gray-900 mb-1">{label}</h3>
      <p className="text-[12.5px] text-gray-500 mb-5">{description}</p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1.5">생년월일</label>
          <input
            type="text"
            inputMode="numeric"
            value={birthFormatted}
            onChange={(e) => setBirth(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
            placeholder="1990 / 01 / 15"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-[15px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1.5">성별</label>
          <div className="flex gap-2">
            {(['남', '여'] as const).map((g) => {
              const active = g === gender;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className="flex-1 py-3 rounded-xl text-[14px] transition-all"
                  style={{
                    background: active ? '#3182F6' : '#fff',
                    color: active ? '#fff' : '#374151',
                    border: active ? '1px solid #3182F6' : '1px solid #e5e7eb',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {g}자
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1.5">태어난 시간</label>
          <input
            type="text"
            inputMode="numeric"
            value={timeFormatted}
            onChange={(e) => {
              setTime(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
              if (e.target.value && noTime) setNoTime(false);
            }}
            placeholder="14 : 30"
            disabled={noTime}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors disabled:bg-gray-50 disabled:text-gray-400 text-[15px]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
          <label className="inline-flex items-center mt-2 cursor-pointer gap-1.5">
            <input
              type="checkbox"
              checked={noTime}
              onChange={(e) => {
                setNoTime(e.target.checked);
                if (e.target.checked) setTime('');
              }}
              style={{ width: 15, height: 15 }}
            />
            <span className="text-[12.5px] text-gray-600">시간을 잘 몰라요</span>
          </label>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1.5">출생 지역</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors bg-white text-[15px]"
            style={{ color: region ? '#111827' : '#9ca3af' }}
          >
            <option value="" disabled>
              지역을 골라주세요
            </option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-red-500">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!formValid}
        className="w-full mt-6 py-3.5 rounded-full text-[14.5px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: '#3182F6',
          color: '#fff',
          boxShadow: formValid ? '0 10px 28px rgba(49,130,246,0.28)' : 'none',
        }}
      >
        풀이 받기 →
      </button>
    </section>
  );
}
