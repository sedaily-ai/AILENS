'use client';

import { useEffect, useState } from 'react';

interface SavedEntry {
  id: number;
  name: string;
  date: string;
  gender: string;
  time: string;
  region: string;
  ilgan: string;
  createdAt: string;
}

interface Props {
  profile: {
    year: number;
    month: number;
    day: number;
    gender: string;
    timeInput: string;
    region: string;
    ilgan: string;      // 한자 (예: "丙")
    ilganKo?: string;   // 한글 (예: "병")
  };
}

const STORAGE_KEY_SAVED = 'saju_saved';

function getSaved(): SavedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED) || '[]');
  } catch {
    return [];
  }
}

function writeSaved(list: SavedEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(list));
  } catch {}
}

function dateKey(p: Props['profile']): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function matches(e: SavedEntry, p: Props['profile']): boolean {
  return (
    e.date === dateKey(p) &&
    e.gender === p.gender &&
    (e.time || '') === (p.timeInput || '') &&
    (e.region || '') === (p.region || '')
  );
}

export function SaveProfileButton({ profile }: Props) {
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [justSaved, setJustSaved] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    setSavedList(getSaved());
  }, []);

  const alreadySaved = savedList.some((e) => matches(e, profile));

  const openModal = () => {
    if (alreadySaved) return;
    setSaveName('');
    setShowModal(true);
  };

  const confirmSave = () => {
    const defaultName = `${profile.year}.${profile.month}.${profile.day}`;
    const name = saveName.trim() || defaultName;
    const entry: SavedEntry = {
      id: Date.now(),
      name,
      date: dateKey(profile),
      gender: profile.gender,
      time: profile.timeInput,
      region: profile.region,
      ilgan: profile.ilganKo ? `${profile.ilganKo}${profile.ilgan}` : profile.ilgan,
      createdAt: new Date().toISOString(),
    };
    const list = [entry, ...getSaved()];
    writeSaved(list);
    setSavedList(list);
    setShowModal(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const label = justSaved
    ? '저장 완료'
    : alreadySaved
      ? '이미 저장된 프로필'
      : '이 프로필 저장하기';

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={alreadySaved}
        className={`w-full py-3 text-[13px] font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${
          alreadySaved
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-default'
            : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 cursor-pointer'
        }`}
      >
        {justSaved ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : alreadySaved ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {label}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-[360px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 mb-1">만세력 저장</h3>
            <p className="text-[12px] text-gray-400 dark:text-gray-300 mb-3">저장할 이름을 입력해주세요</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4 leading-snug">
              이 기기의 브라우저에만 저장돼요. 서버로 전송되거나 다른 기기에서 보이지 않아요.
            </p>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={`예) ${profile.year}.${profile.month}.${profile.day}`}
              maxLength={20}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSave();
                if (e.key === 'Escape') setShowModal(false);
              }}
              className="w-full px-3 py-2.5 text-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-lg outline-none focus:border-gray-400 mb-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-[13px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                취소
              </button>
              <button
                onClick={confirmSave}
                className="flex-1 py-2.5 text-[13px] font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-all"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
