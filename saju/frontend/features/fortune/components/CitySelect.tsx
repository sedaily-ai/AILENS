'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { REGION_OPTIONS, REGION_OPTIONS_EN } from '../lib/engine';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const CARET_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5' stroke='%23aaa' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/**
 * 도시 선택 입력.
 *  - 한국어: 기본 `<select>` 드롭다운 (옵션 18개 정도라 스크롤 OK)
 *  - 영어: 43개 도시 중에서 타이핑으로 검색하는 콤보박스
 */
export function CitySelect({ value, onChange }: Props) {
  const { lang, t } = useLang();

  if (lang !== 'en') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-3 text-[16px] bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-gray-400 appearance-none cursor-pointer"
        style={{ backgroundImage: CARET_SVG, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
        {REGION_OPTIONS.map((r, i) => <option key={`${r.value}-${i}`} value={r.value}>{r.label}</option>)}
      </select>
    );
  }

  return <CitySearch value={value} onChange={onChange} t={t} />;
}

interface SearchProps {
  value: string;
  onChange: (v: string) => void;
  t: (ko: string, en: string) => string;
}

function CitySearch({ value, onChange, t }: SearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = REGION_OPTIONS_EN.find(r => r.value === value);
  const displayLabel = selected?.label ?? '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGION_OPTIONS_EN;
    return REGION_OPTIONS_EN.filter(r => r.label.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Scroll the active row into view when navigating by keyboard
  useEffect(() => {
    if (!open || activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0 && filtered[activeIdx]) {
        e.preventDefault();
        commit(filtered[activeIdx].value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setActiveIdx(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : displayLabel}
        onFocus={() => { setOpen(true); setQuery(''); setActiveIdx(-1); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(e.target.value.trim() ? 0 : -1); }}
        onKeyDown={handleKeyDown}
        placeholder={t('도시 검색...', 'Type to search city...')}
        autoComplete="off"
        className="w-full px-3.5 py-3 text-[16px] bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl outline-none focus:border-gray-400 cursor-text"
        style={{ backgroundImage: CARET_SVG, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-[280px] overflow-y-auto bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2.5 text-[14px] text-gray-400">
              {t('결과가 없어요', 'No matches')}
            </li>
          ) : filtered.map((r, i) => {
            const isSelected = r.value === value;
            const isActive = i === activeIdx;
            return (
              <li
                key={`${r.value}-${i}`}
                role="option"
                aria-selected={isSelected}
                onMouseDown={e => { e.preventDefault(); commit(r.value); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-3.5 py-2.5 text-[14px] cursor-pointer ${
                  isActive
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : isSelected
                    ? 'bg-gray-50 dark:bg-gray-800/60 font-medium'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                {r.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
