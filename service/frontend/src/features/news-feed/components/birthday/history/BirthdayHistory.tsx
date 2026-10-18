import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { BirthdayResult, ViewMode } from '../data/birthdayTypes';
import { ageOn, number } from '../lib/birthdayModel';
import styles from './birthdayHistory.module.css';

export function BirthdayHistory({ result, mode }: { result: BirthdayResult; mode: ViewMode }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const events = result.events;
  const event = events[index];
  const points = result.chart;
  const first = Number(points[0]?.period), last = Number(points.at(-1)?.period);
  const maximum = Math.ceil(Math.max(...points.map(point => point.value), 20) / 20) * 20;
  const x = (year: number) => 48 + (year - first) / Math.max(last - first, 1) * 620;
  const y = (value: number) => 220 - value / maximum * 184;
  const eventYear = Number(event?.date.slice(0, 4));
  const pointIndex = points.findIndex(item => Number(item.period) === eventYear);
  const point = points[pointIndex];
  const age = event ? mode !== 'year' && event.date.length === 10 ? `그때 나는 만 ${ageOn(result.birthDate, event.date)}세` : `태어난 해로부터 ${eventYear - result.date.year}년 뒤` : '';
  const move = (next: number) => setIndex(Math.max(0, Math.min(events.length - 1, next)));

  function chooseYear(year: number) {
    const candidates = events.map((item, position) => ({ position, year: Number(item.date.slice(0, 4)) })).filter(item => item.year >= first && item.year <= last);
    const nearest = candidates.reduce<typeof candidates[number] | undefined>((best, item) => !best || Math.abs(item.year - year) < Math.abs(best.year - year) ? item : best, undefined);
    if (nearest) setIndex(nearest.position);
  }

  return <section id="birthday-history" className={styles.history} aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>물가의 흐름, 그 사이의 사건</h4>
    <p className={styles.intro}>{event ? '시간 막대를 움직이거나 그래프를 눌러보세요. 내가 자라는 동안 어떤 일이 있었는지 살펴볼 수 있어요.' : '생일 이후의 주요 사건과 같은 해의 물가를 함께 살펴보는 공간이에요.'}</p>
    {points.length ? <div className={styles.chartArea}>
      <div className={styles.chartHeading}><span>연평균 소비자물가지수</span><span>2020년 = 100</span></div>
      <div className={styles.chartLegend}><span>연도별 물가지수 · 증감률이 아닌 지수 수준이에요</span></div>
      <svg className={styles.chart} viewBox="0 0 720 264" role="group" aria-roledescription="인터랙티브 그래프" tabIndex={events.length ? 0 : undefined}
        aria-label={`${first}년부터 ${last}년까지 연평균 물가. ${points[0].value}에서 ${points.at(-1)?.value}로 변화. 좌우 방향키로 경제 사건을 선택할 수 있어요.`}
        onKeyDown={e => { if (events.length && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); move(index + (e.key === 'ArrowLeft' ? -1 : 1)); } }}
        onPointerDown={e => {
          const screen = e.currentTarget.getScreenCTM();
          if (!screen) return;
          const pointer = e.currentTarget.createSVGPoint();
          pointer.x = e.clientX; pointer.y = e.clientY;
          const px = pointer.matrixTransform(screen.inverse()).x;
          if (px >= 48 && px <= 668) chooseYear(first + (px - 48) / 620 * (last - first));
        }}>
        <title>연평균 소비자물가지수와 선택한 사건의 연도</title>
        {[0, 1, 2, 3, 4].map(step => { const value = maximum * step / 4; return <g key={step}><line x1="48" x2="668" y1={y(value)} y2={y(value)} stroke="#e5e7eb" strokeDasharray="3 5" /><text x="38" y={y(value) + 5} textAnchor="end">{value}</text></g>; })}
        {[...new Set([first, Math.round((first + last) / 2), last])].map(year => <text x={x(year)} y="252" textAnchor="middle" key={year}>{year}</text>)}
        {points.slice(1).map((item, index) => <line key={item.period} x1={x(Number(points[index].period))} y1={y(points[index].value)} x2={x(Number(item.period))} y2={y(item.value)} stroke="#64748b" strokeWidth="3" strokeLinecap="round" />)}
        {point && <g data-selected-year={eventYear}><line x1={x(eventYear)} x2={x(eventYear)} y1="24" y2="224" stroke="#94a3b8" strokeDasharray="4 5" /><circle cx={x(eventYear)} cy={y(point.value)} r="7" fill="#fff" stroke="#374151" strokeWidth="3" /></g>}
      </svg>
      <p className={styles.chartNote}>{point ? `${eventYear}년 연평균 CPI ${number(point.value, 2)}` : event ? `${eventYear}년의 연평균 물가 자료는 연결 전이에요.` : '선택할 사건이 없어요.'} · 사건과 같은 해의 물가이며, 인과관계를 뜻하지 않아요.</p>
    </div> : <p className={styles.empty}>해당 출생연도의 연간 물가 자료는 아직 없어요. 확인된 사건이 있으면 아래에서 살펴볼 수 있어요.</p>}
    {event ? <>
      <div className={styles.controls}>
        <div className={styles.controlsTop}><label htmlFor={`${id}-range`}>사건을 따라 시간 이동</label><span>{index + 1} / {events.length}</span></div>
        <div className={styles.rangeSelection} aria-hidden="true"><span>선택한 날</span><time dateTime={event.date}>{event.date.replaceAll('-', '.')}</time></div>
        <input id={`${id}-range`} type="range" min={0} max={Math.max(1, events.length - 1)} step={1} value={index} disabled={events.length < 2}
          style={{ '--range-progress': `${index / Math.max(1, events.length - 1) * 100}%` } as CSSProperties}
          aria-valuetext={`${event.date}, ${event.shortTitle ?? event.title}`} onChange={e => setIndex(Number(e.target.value))} />
        <div className={styles.rangeLabels}><span>{events[0].date.replaceAll('-', '.')}</span><span>사건 순서대로 이동</span><span>{events.at(-1)!.date.replaceAll('-', '.')}</span></div>
      </div>
      <article className={styles.story} aria-live="polite" aria-atomic="true">
        <div className={styles.storyDate}><time dateTime={event.date}>{event.date.replaceAll('-', '.')}</time><span>{age}</span>{event.era && <small>{event.era}</small>}</div>
        <div className={styles.storyBody}><h5>{event.title}</h5><p className={styles.description}>{event.description}</p>{event.note && <p className={styles.note}>{event.note}</p>}
          <p className={styles.note}>{point ? `이 해의 연평균 물가지수는 ${number(point.value, 2)}예요. 그래프의 표시점과 함께 비교해보세요.` : '이 사건 연도의 연평균 물가는 아직 비교할 수 없어요.'}</p>
          {event.paperDate && <Link className={styles.articleLink} href={`/timeline/${event.paperDate}`} prefetch={false}>관련 날짜의 기사 보기<ChevronRight size={16} aria-hidden="true" /></Link>}
          {event.paperDate && <p className={styles.note}>관련 지면일 {event.paperDate.replaceAll('-', '.')}{event.paperDate !== event.date && ' · 사건 발생일과 달라요.'}</p>}
          <div className={styles.sources}><span>사건 출처</span>{event.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ExternalLink size={12} aria-hidden="true" /></a>)}</div>
        </div>
      </article>
      <div className={styles.navigation}><button type="button" disabled={index === 0} onClick={() => move(index - 1)}><ChevronLeft size={18} aria-hidden="true" />이전 사건</button><button type="button" disabled={index === events.length - 1} onClick={() => move(index + 1)}>다음 사건<ChevronRight size={18} aria-hidden="true" /></button></div>
    </> : <p className={styles.empty}>생일 이후 확인된 사건이 아직 없어요.</p>}
    <p className={styles.note}>그래프는 2025년까지의 연평균 CPI예요. 코스피 시계열은 준비 중이에요.</p>
  </section>;
}
