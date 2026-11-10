'use client';

import { useEffect, useState } from 'react';
import { parseDate } from './lib/birthdayModel';
import type { FrontPageReason } from '@/shared/lib/api/timelineApi';
import { frontPageNotice, frontPagePeriodLine, loadFrontScene, newspaperAvailabilityText, type FrontPageNotice, type FrontPageState } from './lib/birthdayFrontPage';
import { loadSedailyNewspaperMonth, newspaperImageUrl, newspaperPreviewUrl } from './lib/birthdayNewspaper';
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
  image.src = newspaperPreviewUrl(date);
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

export function BirthdayAvailability({ date, today, onSubstitutionChange, onCheckingChange, alignBottom = false }: { date: string; today: string; onSubstitutionChange?: (substitution: BirthdaySubstitution | null) => void; onCheckingChange?: (checking: boolean) => void; alignBottom?: boolean }) {
  const [result, setResult] = useState<Availability | null>(null);
  const valid = Boolean(parseDate(date, today));
  useEffect(() => {
    onSubstitutionChange?.(null);
    onCheckingChange?.(valid);
    if (!valid) return;
    let active = true;
    const notice = frontPageNotice(date);
    const photo = notice && notice !== 'before-archive' ? Promise.resolve<PhotoAvailability>('unavailable') : photoAvailable(date);
    const [year, month] = date.split('-').map(Number);
    const archive = loadSedailyNewspaperMonth(year, month);
    // 사진 보유 여부는 다이얼이 멈추기를 기다리지 않는다. 큰 원본 다운로드는 멈춘 뒤 시작한다.
    void Promise.all([photo, loadYear(date), archive]).then(([value, days, sourceMonth]) => {
      if (!active) return;
      const sourceHasArticles = sourceMonth?.days[date]?.some(article => article.title.trim()) ?? false;
      const article = sourceHasArticles ? 'front' : cachedArticleStatus(date, Boolean(notice), days?.[date]);
      setResult(previous => previous?.date === date && previous.complete ? previous : { date, shown: date, reason: null, photo: value, article, complete: false });
      // 날짜별 현황 파일이나 서울경제 원본에서 답을 얻었으면 화면에서 필요한 확인은 끝났다.
      // 서버가 대체 날짜를 찾는 응답은 별도로 이어가되 버튼을 계속 잠그지 않는다.
      if (article !== 'loading') onCheckingChange?.(false);
    });
    let finishTimer = 0;
    const timer = window.setTimeout(() => {
      finishTimer = window.setTimeout(() => {
        if (!active) return;
        setResult(previous => previous?.date === date
          ? { ...previous, article: previous.article === 'loading' ? 'unknown' : previous.article, complete: true }
          : previous);
        onCheckingChange?.(false);
      }, 10_000);
      void photo.then(value => { if (active && value === 'available') prefetchPhoto(date); });
      void loadAvailability(date, photo).then(value => {
        if (!active) return;
        setResult(previous => value.article === 'unknown' && previous?.date === date && (previous.article === 'front' || previous.article === 'day')
          ? { ...value, article: previous.article } : value);
        onSubstitutionChange?.(value.shown !== date ? { date: value.shown, reason: value.reason } : null);
        if (value.photo === 'available' && value.shown !== date) prefetchPhoto(value.shown);
      }).catch(() => {
        if (!active) return;
        setResult(previous => previous?.date === date
          ? { ...previous, article: previous.article === 'loading' ? 'unknown' : previous.article, complete: true }
          : previous);
        onCheckingChange?.(false);
      }).finally(() => {
        window.clearTimeout(finishTimer);
        if (active) onCheckingChange?.(false);
      });
    }, 400);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(finishTimer); };
  }, [date, valid, onSubstitutionChange, onCheckingChange]);
  const current = valid && result?.date === date ? result : null;
  if (!valid) return null;
  const notice: FrontPageNotice | null = frontPageNotice(date);
  const photoStatus = !current ? 'loading' : current.photo === 'available' ? 'available' : current.photo === 'unavailable' ? 'missing' : 'unknown';
  const articleStatus = !current || current.article === 'loading' ? 'loading' : current.article === 'front' ? 'available' : current.article === 'day' ? 'alternative' : current.article === 'unknown' ? 'unknown' : 'missing';
  return <div className={`${styles.availability}${alignBottom ? ` ${styles.alignBottom}` : ''}`} role="status" aria-live="polite">
    <div className={styles.heading}>
      <strong>선택한 날짜의 신문 자료</strong>
    </div>
    <NewspaperAvailabilityRow kind="photo" status={photoStatus}>
      {notice && photoStatus === 'missing' ? frontPagePeriodLine(notice, 'photo') : newspaperAvailabilityText('photo', photoStatus)}
    </NewspaperAvailabilityRow>
    <NewspaperAvailabilityRow kind="article" status={articleStatus}>
      {notice && articleStatus === 'missing' ? frontPagePeriodLine(notice, 'article') : newspaperAvailabilityText('article', articleStatus)}
    </NewspaperAvailabilityRow>
  </div>;
}
