'use client';

// 연대기 차트 — 서울경제 기사 비중 곡선 위에 사건을 핀으로 얹는 주석 시계열. d3(scale · shape · array)로 계산하고 SVG는 React가 그린다.
// 라벨은 줄(lane) 단위로 겹치지 않을 때만 붙이고 못 붙인 사건은 점으로만 남는다 → 줌인할수록 라벨이 늘어난다(점진적 공개).
// 조작: 끌어서 이동, ⌘/Ctrl+휠 또는 핀치로 확대·축소, 아래 개요 막대의 창을 끌거나 가장자리를 당김, 사건 클릭/키보드.
import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, scaleLog } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { max } from 'd3-array';
import type { TimelineEra, TimelineEvent } from '@/shared/data/timelineEvents';
import { yearFloat, eraColor } from '../../lib/chronicleLayout';
import { ATT_LABEL, ATT_START_YEAR, attentionSeries, type AttKey, type AttPoint } from '../../lib/attention';
import { KOSPI_GUIDES, KOSPI_MILESTONES, kospiRatio } from '../../lib/kospiMilestones';

export const FULL_DOMAIN: [number, number] = [1990, 2027];
const MIN_SPAN = 1.6;

const INK = '#14202f';
const MUTED = '#6b7686';
const HAIR = '#dfe3e9';
const SERIES = '#244a78';

type Domain = [number, number];

export function clampDomain([a, b]: Domain): Domain {
  let span = Math.min(Math.max(b - a, MIN_SPAN), FULL_DOMAIN[1] - FULL_DOMAIN[0]);
  let lo = a;
  if (lo < FULL_DOMAIN[0]) lo = FULL_DOMAIN[0];
  if (lo + span > FULL_DOMAIN[1]) lo = FULL_DOMAIN[1] - span;
  span = Math.min(span, FULL_DOMAIN[1] - lo);
  return [lo, lo + span];
}

function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[ㄱ-힝一-鿿]/.test(ch) ? 12.6 : 6.8;
  return w;
}

const priorityOf = (e: TimelineEvent) => (e.featured ? 100 : 0) + (e.eraSlug ? 40 : 0) + (e.sources.length > 2 ? 6 : 0) + (e.shortTitle ? 4 : 0);

function tickStep(span: number): number {
  if (span > 22) return 5;
  if (span > 11) return 2;
  if (span > 4.5) return 1;
  if (span > 2.2) return 0.5;
  return 0.25;
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(960);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

interface Placed {
  event: TimelineEvent;
  x: number;
  y: number;
  lane: number | null;
  x0: number;
  width: number;
  text: string;
}

export function ChronicleChart({
  events, eras, selectedId, attKey, domain, onDomainChange, onSelect,
}: {
  events: TimelineEvent[];
  eras: TimelineEra[];
  selectedId: string;
  attKey: AttKey;
  domain: Domain;
  onDomainChange: (d: Domain) => void;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useWidth(wrapRef);
  const narrow = width < 640;

  const ML = narrow ? 36 : 48;
  const MR = 16;
  const LANES = narrow ? 3 : 4;
  const LANE_STEP = 36;
  const LABEL_H = 30;
  const TOP = 10 + LANES * LANE_STEP;
  const PLOT_H = narrow ? 170 : 220;
  const AXIS_H = 34;
  const H = TOP + PLOT_H + AXIS_H;
  const plotTop = TOP;
  const plotBottom = TOP + PLOT_H;

  const x = useMemo(() => scaleLinear().domain(domain).range([ML, width - MR]), [domain, ML, width]);

  const pts = useMemo(() => attentionSeries(attKey), [attKey]);
  const visible = useMemo(() => pts.filter((p) => p.yf >= domain[0] - 0.2 && p.yf <= domain[1] + 0.2), [pts, domain]);
  const yMaxRaw = max(visible, (p) => p.value ?? 0) ?? 0;
  const y = useMemo(() => {
    const floor = attKey === 'TOTAL' ? 1000 : 4;
    return scaleLinear().domain([0, Math.max(yMaxRaw * 1.12, floor)]).nice(4).range([plotBottom, plotTop + 10]);
  }, [yMaxRaw, attKey, plotBottom, plotTop]);

  const areaPath = useMemo(
    () => area<AttPoint>().defined((d) => d.value !== null).x((d) => x(d.yf)).y0(plotBottom).y1((d) => y(d.value as number)).curve(curveMonotoneX)(pts) ?? '',
    [pts, x, y, plotBottom],
  );
  const linePath = useMemo(
    () => line<AttPoint>().defined((d) => d.value !== null).x((d) => x(d.yf)).y((d) => y(d.value as number)).curve(curveMonotoneX)(pts) ?? '',
    [pts, x, y],
  );

  // 값을 못 그리는 달(아카이브 적재 적음)의 연속 구간
  const gaps = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    let start: number | null = null;
    pts.forEach((p, i) => {
      if (p.value === null && start === null) start = p.yf - 1 / 24;
      if ((p.value !== null || i === pts.length - 1) && start !== null) {
        out.push({ from: start, to: (p.value === null ? p.yf : pts[i - 1].yf) + 1 / 24 });
        start = null;
      }
    });
    return out.filter((g) => g.to - g.from >= 0.2);
  }, [pts]);

  const valueAt = (yf: number): number => {
    const i = Math.min(pts.length - 1, Math.max(0, Math.round((yf - ATT_START_YEAR) * 12 - 0.5)));
    return pts[i]?.value ?? 0;
  };

  // 사건 핀과 라벨 배치
  const placed = useMemo<Placed[]>(() => {
    const inView = events
      .map((event) => ({ event, yf: yearFloat(event.date) }))
      .filter(({ yf }) => yf >= domain[0] - 0.05 && yf <= domain[1] + 0.05);
    const order = [...inView].sort((a, b) => {
      if (a.event.id === selectedId) return -1;
      if (b.event.id === selectedId) return 1;
      return priorityOf(b.event) - priorityOf(a.event) || a.yf - b.yf;
    });
    const lanes: { x0: number; x1: number }[][] = Array.from({ length: LANES }, () => []);
    const result = new Map<string, Placed>();
    for (const { event, yf } of order) {
      const ex = x(yf);
      const text = (event.shortTitle ?? event.title).slice(0, 15);
      const w = Math.min(176, textWidth(text) + 22);
      const x0 = Math.min(Math.max(ex - 12, ML), width - MR - w);
      const ey = y(valueAt(yf));
      let lane: number | null = null;
      if (ex >= x0 + 6 && ex <= x0 + w - 6) {
        for (let l = LANES - 1; l >= 0; l--) {
          // 아래쪽(차트에 가까운) 줄부터 채운다
          if (lanes[l].every((r) => x0 >= r.x1 + 8 || x0 + w <= r.x0 - 8)) { lane = l; break; }
        }
      }
      if (lane !== null) lanes[lane].push({ x0, x1: x0 + w });
      result.set(event.id, { event, x: ex, y: ey, lane, x0, width: w, text });
    }
    return inView.map(({ event }) => result.get(event.id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valueAt은 pts에만 의존
  }, [events, domain, selectedId, x, y, width, pts, LANES, ML]);

  // 시대 띠 — 이름이 서로 겹치면 아랫줄로 내린다(줄 번호 row)
  const eraBands = useMemo(() => {
    const bands = eras.map((era) => {
      const first = era.events[0];
      const last = era.events[era.events.length - 1];
      return { era, from: yearFloat(first.date) - 1 / 24, to: yearFloat(last.endDate ?? last.date) + 1 / 24, color: eraColor(era.slug), row: 0 };
    });
    const ends: number[] = [];
    for (const b of bands.sort((p, q) => p.from - q.from)) {
      const left = x(b.from) + 6;
      let row = ends.findIndex((e) => left >= e + 8);
      if (row === -1) row = ends.length;
      ends[row] = left + textWidth(b.era.title) * 0.9;
      b.row = row;
    }
    return bands;
  }, [eras, x]);

  // 눈금
  const ticks = useMemo(() => {
    const step = tickStep(domain[1] - domain[0]);
    const out: { v: number; label: string; major: boolean }[] = [];
    for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1] + 1e-6; v += step) {
      const year = Math.floor(v + 1e-6);
      const frac = v - year;
      const month = Math.round(frac * 12) + 1;
      out.push({ v, major: frac < 1e-6 && year % 10 === 0, label: frac < 1e-6 ? String(year) : `${String(year).slice(2)}.${String(month).padStart(2, '0')}` });
    }
    return out;
  }, [domain]);

  const yTicks = y.ticks(4);

  // ── 끌어서 이동 · 휠/핀치 확대
  const drag = useRef<{ x: number; domain: Domain; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ px: number; point: AttPoint } | null>(null);

  const onPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    drag.current = { x: e.clientX, domain, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      if (Math.abs(dx) > 3) drag.current.moved = true;
      const span = drag.current.domain[1] - drag.current.domain[0];
      const dYears = (dx / (width - ML - MR)) * span;
      onDomainChange(clampDomain([drag.current.domain[0] - dYears, drag.current.domain[1] - dYears]));
      setHover(null);
      return;
    }
    if (!rect) return;
    const yf = x.invert(e.clientX - rect.left);
    const i = Math.min(pts.length - 1, Math.max(0, Math.round((yf - ATT_START_YEAR) * 12 - 0.5)));
    setHover({ px: x(pts[i].yf), point: pts[i] });
  };
  const endDrag = () => { drag.current = null; };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // 세로 스크롤은 페이지에 맡긴다
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchor = x.invert(e.clientX - rect.left);
      const [a, b] = domain;
      if (e.ctrlKey || e.metaKey) {
        const k = Math.exp(e.deltaY * 0.01);
        onDomainChange(clampDomain([anchor - (anchor - a) * k, anchor + (b - anchor) * k]));
      } else {
        const dYears = (e.deltaX / (width - ML - MR)) * (b - a);
        onDomainChange(clampDomain([a + dYears, b + dYears]));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [x, domain, width, ML, onDomainChange]);

  const hoverLabel = hover && (() => {
    const p = hover.point;
    const [yr, mo] = p.month.split('-');
    const head = `${yr}년 ${parseInt(mo, 10)}월`;
    if (attKey === 'TOTAL') return { head, body: p.total !== null ? `서울경제 기사 ${p.total.toLocaleString()}건` : '집계 없음' };
    if (p.value === null) return { head, body: `아카이브 기사가 ${p.total ?? 0}건뿐이라 비중을 그리지 않았어요` };
    return { head, body: `${ATT_LABEL[attKey]} 기사 ${p.value.toFixed(1)}% · ${p.hits?.toLocaleString()} / ${p.total?.toLocaleString()}건` };
  })();

  const yUnit = attKey === 'TOTAL' ? '' : '%';

  return (
    <div ref={wrapRef} className="cc-wrap">
      <style>{CSS}</style>
      <div className="cc-stage" style={{ height: H }}>
        <svg
          ref={svgRef}
          width={width}
          height={H}
          role="group"
          aria-label={`서울경제 ${ATT_LABEL[attKey]} 기사 ${attKey === 'TOTAL' ? '수' : '비중'}와 주요 사건 연표`}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          <defs>
            <linearGradient id="cc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity="0.30" />
              <stop offset="100%" stopColor={SERIES} stopOpacity="0.02" />
            </linearGradient>
            <pattern id="cc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#f3f4f6" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#d6dae1" strokeWidth="2" />
            </pattern>
            <clipPath id="cc-clip"><rect x={ML} y={plotTop - 2} width={width - ML - MR} height={PLOT_H + 4} /></clipPath>
          </defs>

          {/* 시대 띠 */}
          <g clipPath="url(#cc-clip)">
            {eraBands.map(({ era, from, to, color, row }) => (
              <g key={era.slug}>
                <rect x={x(from)} y={plotTop} width={Math.max(2, x(to) - x(from))} height={PLOT_H} fill={color} opacity={0.07} />
                <rect x={x(from)} y={plotTop} width={Math.max(2, x(to) - x(from))} height={2} fill={color} opacity={0.65} />
                <text x={x(from) + 6} y={plotTop + 16 + row * 14} fontSize={10.5} fontWeight={700} fill={color} letterSpacing="0.02em">{era.title}</text>
              </g>
            ))}
            {gaps.map((g, i) => (
              <g key={i}>
                <rect x={x(g.from)} y={plotTop} width={Math.max(0, x(g.to) - x(g.from))} height={PLOT_H} fill="url(#cc-hatch)" opacity={0.85} />
                {x(g.to) - x(g.from) > 70 && (
                  <text x={(x(g.from) + x(g.to)) / 2} y={plotBottom - 8} textAnchor="middle" fontSize={10} fill="#8b94a3">기사 적재 적음</text>
                )}
              </g>
            ))}
          </g>

          {/* y 격자 */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={ML} x2={width - MR} y1={y(t)} y2={y(t)} stroke={HAIR} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={ML - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill={MUTED}>{t.toLocaleString()}{yUnit}</text>
            </g>
          ))}

          {/* 곡선 */}
          <g clipPath="url(#cc-clip)">
            <path d={areaPath} fill="url(#cc-fill)" />
            <path d={linePath} fill="none" stroke={SERIES} strokeWidth={1.8} strokeLinejoin="round" />
          </g>

          {/* 끌기 · 호버 영역 */}
          <rect
            x={ML} y={plotTop} width={width - ML - MR} height={PLOT_H} fill="transparent" style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={() => { endDrag(); setHover(null); }}
          />
          {hover && !drag.current && (
            <g pointerEvents="none">
              <line x1={hover.px} x2={hover.px} y1={plotTop} y2={plotBottom} stroke={INK} strokeOpacity={0.35} />
              {hover.point.value !== null && <circle cx={hover.px} cy={y(hover.point.value)} r={3.5} fill="#fff" stroke={SERIES} strokeWidth={2} />}
            </g>
          )}

          {/* 축 */}
          <line x1={ML} x2={width - MR} y1={plotBottom} y2={plotBottom} stroke="#aab2bf" />
          {ticks.map((t) => (
            <g key={t.v}>
              <line x1={x(t.v)} x2={x(t.v)} y1={plotBottom} y2={plotBottom + (t.major ? 9 : 5)} stroke={t.major ? INK : '#aab2bf'} />
              <text x={x(t.v)} y={plotBottom + 22} textAnchor="middle" fontSize={t.major ? 12 : 10.5} fontWeight={t.major ? 800 : 500} fill={t.major ? INK : MUTED}>{t.label}</text>
            </g>
          ))}

          {/* 사건 핀 — 연결선을 먼저 모두 그리고 그 위에 라벨 · 점을 얹어, 다른 사건의 라벨을 연결선이 가로지르지 않게 한다 */}
          <g aria-hidden pointerEvents="none">
            {placed.map(({ event, x: ex, y: ey, lane }) => {
              if (lane === null) return null;
              const selected = event.id === selectedId;
              const labelTop = 6 + (LANES - 1 - lane) * LANE_STEP;
              return <line key={event.id} x1={ex} x2={ex} y1={labelTop + LABEL_H} y2={ey} stroke={eraColor(event.eraSlug)} strokeOpacity={selected ? 0.9 : 0.32} strokeWidth={selected ? 1.6 : 1} />;
            })}
          </g>
          {placed.map(({ event, x: ex, y: ey, lane, x0, width: lw, text }) => {
            const selected = event.id === selectedId;
            const color = eraColor(event.eraSlug);
            const labelTop = lane === null ? null : 6 + (LANES - 1 - lane) * LANE_STEP;
            return (
              <g
                key={event.id}
                role="button"
                tabIndex={0}
                aria-label={`${event.date.replace(/-/g, '.')} ${event.title}`}
                aria-pressed={selected}
                className={`cc-pin${selected ? ' is-selected' : ''}`}
                onClick={() => { if (!drag.current?.moved) onSelect(event.id); }}
                onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); onSelect(event.id); } }}
              >
                {labelTop !== null && (
                  <>
                    <rect x={x0} y={labelTop} width={lw} height={LABEL_H} rx={7} fill="#fff" stroke={selected ? color : HAIR} strokeWidth={selected ? 1.6 : 1} className="cc-label-bg" />
                    <text x={x0 + 10} y={labelTop + 12} fontSize={9.5} fontWeight={700} fill={color}>{event.date.replace(/-/g, '.')}</text>
                    <text x={x0 + 10} y={labelTop + 25} fontSize={12} fontWeight={700} fill={INK}>{text}</text>
                  </>
                )}
                <circle cx={ex} cy={ey} r={14} fill="transparent" />
                {selected && <circle cx={ex} cy={ey} r={11} fill={color} opacity={0.16} className="cc-halo" />}
                <circle cx={ex} cy={ey} r={selected ? 6 : 4.2} fill={color} stroke="#fff" strokeWidth={2} />
              </g>
            );
          })}
        </svg>

        {hover && hoverLabel && !drag.current && (
          <div className="cc-tip" style={{ left: Math.min(Math.max(hover.px, 110), width - 110), top: plotTop + 6 }}>
            <b>{hoverLabel.head}</b>
            <span>{hoverLabel.body}</span>
          </div>
        )}
      </div>

      <Overview pts={pts} domain={domain} width={width} ml={ML} mr={MR} events={placed.length ? events : events} onDomainChange={onDomainChange} />
      <KospiStrip x={x} width={width} ml={ML} mr={MR} selectedId={selectedId} onSelect={onSelect} events={events} />
    </div>
  );
}

/** 개요 막대 — 전체 기간 곡선과 지금 보는 창. 창 몸통을 끌면 이동, 가장자리를 끌면 확대·축소, 바탕을 누르면 그 위치로. */
function Overview({
  pts, domain, width, ml, mr, events, onDomainChange,
}: {
  pts: AttPoint[]; domain: Domain; width: number; ml: number; mr: number; events: TimelineEvent[]; onDomainChange: (d: Domain) => void;
}) {
  const H = 46;
  const ox = useMemo(() => scaleLinear().domain(FULL_DOMAIN).range([ml, width - mr]), [ml, width, mr]);
  const maxV = max(pts, (p) => p.value ?? 0) || 1;
  const oy = useMemo(() => scaleLinear().domain([0, maxV]).range([H - 6, 6]), [maxV]);
  const path = useMemo(
    () => area<AttPoint>().defined((d) => d.value !== null).x((d) => ox(d.yf)).y0(H - 6).y1((d) => oy(d.value as number)).curve(curveMonotoneX)(pts) ?? '',
    [pts, ox, oy],
  );
  const mode = useRef<{ kind: 'move' | 'l' | 'r'; startX: number; domain: Domain } | null>(null);
  const left = ox(domain[0]);
  const right = ox(domain[1]);

  const start = (kind: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    mode.current = { kind, startX: e.clientX, domain };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const m = mode.current;
    if (!m) return;
    const d = ((e.clientX - m.startX) / (width - ml - mr)) * (FULL_DOMAIN[1] - FULL_DOMAIN[0]);
    if (m.kind === 'move') onDomainChange(clampDomain([m.domain[0] + d, m.domain[1] + d]));
    if (m.kind === 'l') onDomainChange(clampDomain([Math.min(m.domain[0] + d, m.domain[1] - MIN_SPAN), m.domain[1]]));
    if (m.kind === 'r') onDomainChange(clampDomain([m.domain[0], Math.max(m.domain[1] + d, m.domain[0] + MIN_SPAN)]));
  };
  const end = () => { mode.current = null; };

  return (
    <svg width={width} height={H} className="cc-overview" aria-label="전체 기간 개요. 창을 끌어 보는 구간을 옮기세요" role="group">
      <rect
        x={ml} y={0} width={width - ml - mr} height={H} fill="transparent"
        onPointerDown={(e) => {
          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
          const c = ox.invert(e.clientX - rect.left);
          const half = (domain[1] - domain[0]) / 2;
          onDomainChange(clampDomain([c - half, c + half]));
        }}
      />
      <path d={path} fill="#c5d0e0" />
      {events.map((ev) => (
        <line key={ev.id} x1={ox(yearFloat(ev.date))} x2={ox(yearFloat(ev.date))} y1={H - 6} y2={H - 11} stroke={eraColor(ev.eraSlug)} strokeOpacity={0.7} />
      ))}
      <rect x={ml} y={0} width={Math.max(0, left - ml)} height={H} fill="#fff" opacity={0.6} pointerEvents="none" />
      <rect x={right} y={0} width={Math.max(0, width - mr - right)} height={H} fill="#fff" opacity={0.6} pointerEvents="none" />
      <rect x={left} y={1} width={Math.max(8, right - left)} height={H - 2} rx={6} fill={SERIES} opacity={0.08} stroke={SERIES} strokeWidth={1.4} style={{ cursor: 'grab' }} onPointerDown={start('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <rect x={left - 4} y={8} width={8} height={H - 16} rx={3} fill={SERIES} style={{ cursor: 'ew-resize' }} onPointerDown={start('l')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <rect x={right - 4} y={8} width={8} height={H - 16} rx={3} fill={SERIES} style={{ cursor: 'ew-resize' }} onPointerDown={start('r')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    </svg>
  );
}

/** 코스피 이정표 — 같은 가로축에 로그 눈금으로. 확인한 종가만 점으로 찍고 잇지 않는다. 라벨은 겹치지 않는 것만. */
function KospiStrip({
  x, width, ml, mr, selectedId, onSelect, events,
}: {
  x: (v: number) => number; width: number; ml: number; mr: number; selectedId: string; onSelect: (id: string) => void; events: TimelineEvent[];
}) {
  const H = 112;
  const ky = (v: number) => H - 20 - kospiRatio(v) * (H - 40);
  const ids = new Set(events.map((e) => e.id));
  // 숫자 라벨은 직전에 라벨을 붙인 점에서 44px 이상 떨어진 것만(렌더 중 변수를 바꾸지 않도록 미리 계산)
  const pointsInView = KOSPI_MILESTONES.map((p) => ({ p, px: x(yearFloat(p.date)) }))
    .filter(({ px }) => px >= ml - 4 && px <= width - mr + 4)
    .reduce<{ p: (typeof KOSPI_MILESTONES)[number]; px: number; showLabel: boolean }[]>((acc, pt) => {
      const lastLabeled = [...acc].reverse().find((a) => a.showLabel);
      acc.push({ ...pt, showLabel: !lastLabeled || pt.px - lastLabeled.px >= 44 });
      return acc;
    }, []);
  return (
    <svg width={width} height={H} className="cc-kospi" role="group" aria-label="코스피 종가 이정표">
      <text x={ml} y={11} fontSize={10.5} fontWeight={700} fill={MUTED} letterSpacing="0.04em">코스피 종가 이정표 · 확인된 날만 점으로 찍고 사이는 잇지 않았어요</text>
      {KOSPI_GUIDES.map((g) => (
        <g key={g}>
          <line x1={ml} x2={width - mr} y1={ky(g)} y2={ky(g)} stroke={HAIR} strokeDasharray="2 4" />
          <text x={ml - 8} y={ky(g) + 3.5} textAnchor="end" fontSize={10} fill={MUTED}>{g.toLocaleString()}</text>
        </g>
      ))}
      {pointsInView.map(({ p, px, showLabel }) => {
        const py = ky(p.value);
        const linked = !!p.eventId && ids.has(p.eventId);
        const selected = p.eventId === selectedId;
        return (
          <g key={p.date} className={linked ? 'cc-kp is-link' : 'cc-kp'} onClick={linked ? () => onSelect(p.eventId!) : undefined}>
            <title>{`${p.date} 코스피 종가 ${p.value.toLocaleString()}`}</title>
            <line x1={px} x2={px} y1={H - 20} y2={py} stroke={SERIES} strokeOpacity={0.25} />
            <circle cx={px} cy={py} r={selected ? 6 : 4} fill={selected ? SERIES : '#fff'} stroke={SERIES} strokeWidth={2} />
            {showLabel && <text x={px} y={py - 10} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={INK}>{Math.round(p.value).toLocaleString()}</text>}
          </g>
        );
      })}
    </svg>
  );
}

const CSS = `
.cc-wrap{position:relative;max-width:1180px;margin:0 auto;padding:0 clamp(8px,2vw,20px)}
.cc-stage{position:relative}
.cc-wrap text{font-variant-numeric:tabular-nums}
.cc-pin{cursor:pointer;outline:none}
.cc-pin .cc-label-bg{transition:stroke .15s,filter .15s}
.cc-pin:hover .cc-label-bg,.cc-pin:focus-visible .cc-label-bg{filter:drop-shadow(0 3px 8px rgba(20,32,47,.18))}
.cc-pin:focus-visible circle:last-of-type{stroke:#14202f}
.cc-halo{animation:cc-halo 2.2s ease-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes cc-halo{0%{transform:scale(.7);opacity:.35}100%{transform:scale(1.7);opacity:0}}
.cc-tip{position:absolute;transform:translateX(-50%);pointer-events:none;background:#14202f;color:#fff;border-radius:8px;padding:7px 11px;font-size:12px;line-height:1.5;white-space:nowrap;box-shadow:0 6px 18px rgba(20,32,47,.25);display:flex;flex-direction:column;gap:1px}
.cc-tip b{font-size:12px;letter-spacing:.02em;color:#c8d3e6}
.cc-overview{display:block;margin-top:6px;touch-action:none}
.cc-kospi{display:block;margin-top:10px}
.cc-kp.is-link{cursor:pointer}.cc-kp.is-link:hover circle{stroke-width:3}
@media (prefers-reduced-motion:reduce){.cc-halo{animation:none}}
`;
