'use client';

import { useEffect, useState } from 'react';
import { parseDate } from './lib/birthdayModel';
import type { FrontPageReason } from '@/shared/lib/api/timelineApi';
import { frontPageNotice, loadFrontScene, type FrontPageState } from './lib/birthdayFrontPage';
import { newspaperImageUrl } from './lib/birthdayNewspaper';
import { cachedArticleStatus, type DayStatus } from './lib/availabilityStatus';
import { needsOwnPhotoProbe, newspaperPhotoDate, newspaperView, type PhotoState } from './lib/birthdayNewspaperView';
import styles from './birthdayAvailability.module.css';
import { NewspaperAvailabilityRow } from './NewspaperAvailabilityRow';

interface Availability { date: string; shown: string; reason: FrontPageReason | null; photo: PhotoAvailability; article: 'loading' | 'front' | 'day' | 'unavailable' | 'unknown'; complete: boolean }
export interface BirthdaySubstitution { date: string; reason: FrontPageReason | null }

type PhotoAvailability = 'available' | 'unavailable' | 'unknown';
const yearFiles = new Map<string, { expires: number; data: Promise<Record<string, DayStatus> | null> }>();

/** 다이얼에서 확인된 사진을 결과 화면에 들어가기 전에 브라우저 캐시에 받는다. */
function prefetchPhoto(date: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = newspaperImageUrl(date);
}

async function loadYear(date: string): Promise<Record<string, DayStatus> | null> {
  const year = date.slice(0, 4);
  let entry = yearFiles.get(year);
  if (!entry || entry.expires < Date.now()) {
    const data = (async () => {
      for (const version of [2, 1]) {
        try {
          const response = await fetch(`/timemachine-newspaper/availability/v${version}/${year}.json`);
          if (!response.ok) continue;
          const raw: unknown = await response.json();
          if (!raw || typeof raw !== 'object' || !('schema' in raw) || raw.schema !== version || !('year' in raw) || raw.year !== Number(year) || !('days' in raw) || !raw.days || typeof raw.days !== 'object') continue;
          return raw.days as Record<string, DayStatus>;
        } catch { /* 기존 현황을 시도한다. */ }
      }
      return null;
    })();
    entry = { expires: Date.now() + 600_000, data };
    yearFiles.set(year, entry);
    void data.then(file => { if (!file && yearFiles.get(year)?.data === data) yearFiles.delete(year); });
  }
  return entry.data;
}

async function photoAvailable(date: string): Promise<PhotoAvailability> {
  const days = await loadYear(date);
  const status = days?.[date]?.photo;
  if (status === 'available' || status === 'unavailable') return status;
  try {
    const response = await fetch(newspaperImageUrl(date), { method: 'HEAD' });
    return response.ok && response.headers.get('content-type')?.startsWith('image/') ? 'available' : 'unknown';
  } catch { return 'unknown'; }
}

async function loadAvailability(date: string, selectedPhoto: Promise<PhotoAvailability>): Promise<Availability> {
  const unknown: Availability = { date, shown: date, reason: null, photo: 'unknown', article: 'unknown', complete: true };
  const notice = frontPageNotice(date);
  let state: FrontPageState;
  if (notice === 'before-archive') state = { status: 'image-only', date };
  else if (notice) return { ...unknown, photo: 'unavailable', article: 'unavailable' };
  else {
    const scene = await loadFrontScene(date);
    if (!scene) return { ...unknown, photo: await selectedPhoto };
    state = { status: 'ok', date, data: scene.data, ...(scene.naver ? { naver: scene.naver } : {}) };
  }
  const own = needsOwnPhotoProbe(state, date) ? await selectedPhoto : null;
  if (own === 'unknown') return unknown;
  const ownState: PhotoState | null = own === 'available' ? 'ok' : own === 'unavailable' ? 'missing' : null;
  const shown = newspaperPhotoDate(state, date, ownState) ?? date;
  const photo = shown === date ? (own ?? await selectedPhoto) : await photoAvailable(shown);
  const view = newspaperView(state, date, photo === 'available' ? 'ok' : 'missing', ownState);
  const article = view?.list === 'front' || view?.list === 'naver' ? 'front' : view?.list === 'day' ? 'day' : state.status === 'image-only' || (state.status === 'ok' && state.data.kind === 'none' && state.data.reason !== 'not_yet') || view?.ownPhotoDay ? 'unavailable' : 'unknown';
  return { date, shown, reason: state.status === 'ok' ? state.data.reason : null, photo, article, complete: true };
}

export function BirthdayAvailability({ date, today, onSubstitutionChange }: { date: string; today: string; onSubstitutionChange?: (substitution: BirthdaySubstitution | null) => void }) {
  const [result, setResult] = useState<Availability | null>(null);
  const valid = Boolean(parseDate(date, today));
  useEffect(() => {
    onSubstitutionChange?.(null);
    if (!valid) return;
    let active = true;
    const notice = frontPageNotice(date);
    const photo = notice && notice !== 'before-archive' ? Promise.resolve<PhotoAvailability>('unavailable') : photoAvailable(date);
    // 사진 보유 여부는 다이얼이 멈추기를 기다리지 않는다. 큰 원본 다운로드는 멈춘 뒤 시작한다.
    void Promise.all([photo, loadYear(date)]).then(([value, days]) => {
      if (!active) return;
      const article = cachedArticleStatus(date, Boolean(notice), days?.[date]);
      setResult(previous => previous?.date === date && previous.complete ? previous : { date, shown: date, reason: null, photo: value, article, complete: false });
    });
    const timer = window.setTimeout(() => {
      void photo.then(value => { if (active && value === 'available') prefetchPhoto(date); });
      void loadAvailability(date, photo).then(value => {
        if (!active) return;
        setResult(previous => value.article === 'unknown' && previous?.date === date && (previous.article === 'front' || previous.article === 'day')
          ? { ...value, article: previous.article } : value);
        onSubstitutionChange?.(value.shown !== date ? { date: value.shown, reason: value.reason } : null);
        if (value.photo === 'available' && value.shown !== date) prefetchPhoto(value.shown);
      });
    }, 400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [date, valid, onSubstitutionChange]);
  const current = valid && result?.date === date ? result : null;
  if (!valid) return null;
  return <div className={styles.availability} role="status" aria-live="polite">
    <div className={styles.heading}>
      <strong>선택한 날짜의 신문 자료</strong>
    </div>
    <NewspaperAvailabilityRow kind="photo" status={!current ? 'loading' : current.photo === 'available' ? 'available' : current.photo === 'unavailable' ? 'missing' : 'unknown'}>
      {!current ? '기록을 찾고 있어요' : current.photo === 'available' ? '그날의 기록이 있어요' : current.photo === 'unknown' ? '자료 여부를 알 수 없어요' : '자료가 없어 보여드릴 수 없어요'}
    </NewspaperAvailabilityRow>
    <NewspaperAvailabilityRow kind="article" status={!current || current.article === 'loading' ? 'loading' : current.article === 'front' ? 'available' : current.article === 'day' ? 'alternative' : current.article === 'unavailable' ? 'missing' : 'unknown'}>
      {!current || current.article === 'loading' ? '기록을 찾고 있어요' : current.article === 'front' ? '그날의 기록이 있어요' : current.article === 'day' ? '기사는 있어요 · 1면인지는 불분명해요' : current.article === 'unknown' ? '자료 여부를 알 수 없어요' : '자료가 없어 보여드릴 수 없어요'}
    </NewspaperAvailabilityRow>
  </div>;
}
