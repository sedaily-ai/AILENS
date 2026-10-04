'use client';

// 선택한 사건 패널 — 날짜 · 시대 · 제목(세리프) · 설명 · 코스피 종가 · "그 달 서울경제가 다룬 것"(키워드별 기사 비중 막대) · 그 무렵 기사(자동 로드) · 그날 신문 · 링크 복사 · 출처.
// 부모가 key={event.id}로 다시 마운트해서 사건이 바뀔 때 기사 목록과 애니메이션이 새로 시작한다.
import { useState } from 'react';
import Link from 'next/link';
import type { TimelineEvent } from '@/shared/data/timelineEvents';
import { decadeOf } from '@/shared/data/timelineEvents';
import { formatEventDate, kdate } from '@/shared/lib/timelineDates';
import { eraColor } from '../../lib/chronicleLayout';
import { kospiOn } from '../../lib/kospiMilestones';
import { MIN_TOTAL, readMonth } from '../../lib/attention';
import { EventArticles } from '../EventArticles';

function MonthReading({ event }: { event: TimelineEvent }) {
  const reading = readMonth(event.date);
  if (!reading) return null;
  const [y, m] = reading.month.split('-');
  const sparse = reading.total === null || reading.total < MIN_TOTAL;
  const top = Math.max(5, ...reading.items.map((i) => i.share ?? 0));
  return (
    <section className="cx-reading" aria-label="그 달 서울경제가 다룬 것">
      <h3>{y}년 {parseInt(m, 10)}월, 서울경제 기사 속 이 말들</h3>
      {sparse ? (
        <p className="cx-reading-note">이 달은 아카이브에 실린 기사가 {reading.total ?? 0}건뿐이라 비중을 계산하지 않았어요.</p>
      ) : (
        <>
          <ul>
            {reading.items.map((i) => (
              <li key={i.key}>
                <span className="cx-r-key">{i.key}</span>
                <span className="cx-r-bar"><i style={{ width: `${((i.share ?? 0) / top) * 100}%` }} /></span>
                <span className="cx-r-val">{(i.share ?? 0).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
          <p className="cx-reading-note">그 달 서울경제 기사 {reading.total?.toLocaleString()}건 중 해당 단어가 나온 비율</p>
        </>
      )}
    </section>
  );
}

export function EventDetailPanel({
  event, index, total, onPrev, onNext,
}: {
  event: TimelineEvent;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const color = eraColor(event.eraSlug);
  const kospi = kospiOn(event.id);
  const decade = decadeOf(event.date);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?e=${event.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('이 주소를 복사하세요', url);
    }
  };

  return (
    <article className="cx-panel" aria-live="polite" style={{ ['--ev' as string]: color }}>
      <div className="cx-panel-top">
        <span className="cx-count"><b>{String(index + 1).padStart(2, '0')}</b> / {total}</span>
        <div className="cx-nav">
          <button type="button" onClick={onPrev} aria-label="이전 사건">이전</button>
          <button type="button" onClick={onNext} aria-label="다음 사건">다음</button>
        </div>
      </div>

      <div className="cx-panel-grid">
        <div>
          <p className="cx-date">{formatEventDate(event.date, event.endDate)}</p>
          {event.era && (
            <p className="cx-era-chip" style={{ color }}>
              <span style={{ background: color }} />
              {event.eraSlug ? <Link href={`/timeline/era/${event.eraSlug}`}>{event.era}</Link> : event.era}
            </p>
          )}
          <h2 className="cx-title">{event.title}</h2>
          {kospi && (
            <p className="cx-kospi-pill">
              코스피 종가 <b>{kospi.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
              {kospi.date !== event.date && <small>({kdate(kospi.date)})</small>}
            </p>
          )}
          <p className="cx-desc">{event.description}</p>
          {event.note && <p className="cx-note">{event.note}</p>}

          <div className="cx-actions">
            {event.paperDate && (
              <Link href={`/timeline/${event.paperDate}`} className="cx-btn cx-btn-primary">
                {kdate(event.paperDate)} 신문 보기
              </Link>
            )}
            <button type="button" className="cx-btn" onClick={copyLink}>{copied ? '링크를 복사했어요' : '이 사건 링크 복사'}</button>
            <Link href={`/timeline/decade/${decade}`} className="cx-btn">{decade.slice(0, 4)}년대 연표</Link>
          </div>

          <MonthReading event={event} />

          <p className="cx-sources">
            출처{' '}
            {event.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              </span>
            ))}
          </p>
        </div>

        <div className="cx-articles">
          <h3>그 무렵 서울경제 기사</h3>
          <EventArticles event={event} autoLoad />
        </div>
      </div>
    </article>
  );
}
