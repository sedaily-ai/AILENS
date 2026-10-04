'use client';

// 연대기 탐험 — 서울경제 기사 비중 곡선 위에 사건 79개를 얹은 주석 시계열. 사건을 누르면 패널에서 설명 · 기사 · 그날 신문으로 이어진다.
// 조작: 끌기 / ⌘·Ctrl+휠·핀치 확대 / 개요 막대 / 연대 칩 / 키워드 전환 / 랜덤 / 검색 / ← → 키 / 주소(?e=) 공유.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, EVENTS, type TimelineEvent } from '@/shared/data/timelineEvents';
import { yearFloat } from '../../lib/chronicleLayout';
import { ATT_KEYWORDS, ATT_LABEL, type AttKey } from '../../lib/attention';
import { ChronicleChart, FULL_DOMAIN, clampDomain } from './ChronicleChart';
import { EventDetailPanel } from './EventDetailPanel';

type Domain = [number, number];
const DEFAULT_EVENT_ID = '1997-11-21-1';
const DEFAULT_SPAN = 12;
const DECADE_JUMPS = [1990, 2000, 2010, 2020];
const KEYS: AttKey[] = [...ATT_KEYWORDS, 'TOTAL'];

const centered = (yf: number, span: number): Domain => clampDomain([yf - span / 2, yf + span / 2]);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function DiceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.3" cy="5.3" r="1.1" fill="currentColor" /><circle cx="10.7" cy="10.7" r="1.1" fill="currentColor" /><circle cx="8" cy="8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ChronicleExplorer() {
  const events = useMemo<TimelineEvent[]>(() => [...EVENTS].sort((a, b) => a.date.localeCompare(b.date)), []);
  const initialId = events.some((e) => e.id === DEFAULT_EVENT_ID) ? DEFAULT_EVENT_ID : events[0].id;
  const [selectedId, setSelectedId] = useState<string>(initialId);
  const [attKey, setAttKey] = useState<AttKey>('IMF');
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<Domain>(() => centered(yearFloat(events.find((e) => e.id === initialId)!.date), DEFAULT_SPAN));
  const domainRef = useRef(domain);
  const anim = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  const index = Math.max(0, events.findIndex((e) => e.id === selectedId));
  const selected = events[index];

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(events.filter((e) => `${e.title} ${e.shortTitle ?? ''} ${e.description} ${e.era ?? ''}`.toLowerCase().includes(q)).map((e) => e.id));
  }, [events, query]);

  const setNow = useCallback((d: Domain) => {
    cancelAnimationFrame(anim.current);
    const next = clampDomain(d);
    domainRef.current = next;
    setDomain(next);
  }, []);

  const animateTo = useCallback((target: Domain) => {
    const to = clampDomain(target);
    if (reducedMotion()) return setNow(to);
    cancelAnimationFrame(anim.current);
    const from = domainRef.current;
    const t0 = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const cur: Domain = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
      domainRef.current = cur;
      setDomain(cur);
      if (k < 1) anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, [setNow]);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // 주소의 ?e= 로 들어오면 그 사건을 연다(공유 링크).
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get('e');
    if (e && events.some((ev) => ev.id === e)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 주소에서 선택 복원
      setSelectedId(e);
      const ev = events.find((x) => x.id === e)!;
      setNow(centered(yearFloat(ev.date), DEFAULT_SPAN));
    }
  }, [events, setNow]);

  // 선택이 바뀌면: 보이는 구간 밖이면 그 사건 쪽으로 옮기고, 주소를 갱신하고, 패널이 가려져 있으면 살짝 내린다.
  useEffect(() => {
    const yf = yearFloat(selected.date);
    window.history.replaceState(null, '', `?e=${selected.id}`);
    if (firstRun.current) { firstRun.current = false; return; }
    const [a, b] = domainRef.current;
    const span = b - a;
    if (yf < a + span * 0.08 || yf > b - span * 0.08 || span > 16) animateTo(centered(yf, Math.min(span, DEFAULT_SPAN)));
    const top = panelRef.current?.getBoundingClientRect().top ?? 0;
    if (top > window.innerHeight * 0.7) window.scrollBy({ top: top - window.innerHeight * 0.58, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [selected, animateTo]);

  const step = useCallback((dir: 1 | -1) => setSelectedId(events[(index + dir + events.length) % events.length].id), [events, index]);
  const randomEvent = () => {
    const pool = events.filter((e) => e.id !== selectedId);
    setSelectedId(pool[Math.floor(Math.random() * pool.length)].id);
  };
  const zoom = (factor: number) => {
    const [a, b] = domainRef.current;
    const c = (a + b) / 2;
    animateTo([c - ((b - a) / 2) * factor, c + ((b - a) / 2) * factor]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <style>{CSS}</style>

      <section className="cx-hero">
        <div className="cx-hero-in">
          <p className="cx-eyebrow">그날로 떠나요 · 연대기</p>
          <h1 className="cx-hero-title"><span>1990</span><i aria-hidden /><span>2026</span></h1>
          <p className="cx-hero-sub">서울경제 기사가 가장 많이 다룬 말로 읽는 한국 경제 36년. 곡선 위의 사건을 눌러 그 무렵의 기사로 들어가 보세요.</p>
          <ul className="cx-stats">
            <li><b>{events.length}</b><span>검증한 사건</span></li>
            <li><b>{ERAS.length}</b><span>묶음 시대</span></li>
            <li><b>2+</b><span>사건당 출처</span></li>
            <li><b>{(FULL_DOMAIN[1] - FULL_DOMAIN[0] - 1).toFixed(0)}</b><span>년의 아카이브</span></li>
          </ul>
        </div>
      </section>

      <section className="cx-stage" aria-label="연대기 차트">
        <div className="cx-in">
          <div className="cx-row">
            <div className="cx-seg" role="group" aria-label="곡선으로 볼 말">
              {KEYS.map((k) => (
                <button key={k} type="button" aria-pressed={attKey === k} onClick={() => setAttKey(k)}>{ATT_LABEL[k]}</button>
              ))}
            </div>
            <p className="cx-cap">{attKey === 'TOTAL' ? '월별 서울경제 아카이브 기사 수' : `서울경제 기사 중 ‘${attKey}’가 나온 비중(월별)`}</p>
          </div>

          <div className="cx-row cx-row-tools">
            <div className="cx-chips" role="group" aria-label="구간 이동">
              {DECADE_JUMPS.map((d) => (
                <button key={d} type="button" onClick={() => animateTo([d - 0.4, d + 10.4])}>{d}년대</button>
              ))}
              <button type="button" onClick={() => animateTo(FULL_DOMAIN)}>전체</button>
              <span className="cx-zoom">
                <button type="button" onClick={() => zoom(0.6)} aria-label="확대">+</button>
                <button type="button" onClick={() => zoom(1 / 0.6)} aria-label="축소">−</button>
              </span>
              <button type="button" onClick={randomEvent} className="is-solid"><DiceIcon />아무 사건으로</button>
            </div>
            <label className="cx-search">
              <span className="sr-only">사건 검색</span>
              <input
                type="search"
                value={query}
                placeholder="사건 검색  예: 리먼, 금리"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && matchIds && matchIds.size > 0) setSelectedId([...matchIds][0]); }}
              />
              {matchIds && <em>{matchIds.size}개</em>}
            </label>
          </div>
        </div>

        <ChronicleChart
          events={matchIds ? events.filter((e) => matchIds.has(e.id) || e.id === selectedId) : events}
          eras={ERAS}
          selectedId={selectedId}
          attKey={attKey}
          domain={domain}
          onDomainChange={setNow}
          onSelect={setSelectedId}
        />
        <p className="cx-hint">끌어서 옮기고, ⌘·Ctrl + 휠(또는 핀치)로 확대하세요. 아래 개요 막대의 창도 끌 수 있어요. 확대할수록 사건 이름이 더 보여요.</p>
      </section>

      <div ref={panelRef}>
        <EventDetailPanel key={selected.id} event={selected} index={index} total={events.length} onPrev={() => step(-1)} onNext={() => step(1)} />
      </div>
    </div>
  );
}

const SERIF = "'Noto Serif KR','Nanum Myeongjo','AppleMyungjo',Georgia,serif";
const CSS = `
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cx-hero{background:#0d1726;color:#fff;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px);background-size:100% 44px}
.cx-hero-in{max-width:1180px;margin:0 auto;padding:clamp(60px,8vw,88px) clamp(20px,4vw,36px) clamp(26px,4vw,40px)}
.cx-eyebrow{font-size:12px;letter-spacing:.22em;color:#8fa3c4;margin-bottom:14px;text-transform:uppercase}
.cx-hero-title{display:flex;align-items:center;gap:clamp(14px,2.6vw,30px);font-family:${SERIF};font-size:clamp(46px,9vw,92px);font-weight:700;letter-spacing:-.02em;line-height:1}
.cx-hero-title i{display:block;width:clamp(36px,8vw,96px);height:1px;background:linear-gradient(90deg,#8fa3c4,#e7ecf5)}
.cx-hero-sub{margin-top:18px;max-width:560px;font-size:clamp(14px,1.8vw,16.5px);line-height:1.75;color:#c3cde0;word-break:keep-all}
.cx-stats{display:flex;flex-wrap:wrap;gap:6px clamp(22px,4vw,44px);margin:26px 0 0;padding:20px 0 0;list-style:none;border-top:1px solid rgba(255,255,255,.14)}
.cx-stats li{display:flex;align-items:baseline;gap:8px}.cx-stats b{font-family:${SERIF};font-size:24px;font-weight:700}.cx-stats span{font-size:12.5px;color:#8fa3c4}
.cx-stage{background:#fafaf7;border-bottom:1px solid #e6e3da;padding:24px 0 16px}
.cx-in{max-width:1180px;margin:0 auto;padding:0 clamp(16px,3vw,28px)}
.cx-row{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;justify-content:space-between;margin-bottom:14px}
.cx-seg{display:inline-flex;padding:3px;background:#eceae3;border-radius:999px}
.cx-seg button{min-height:34px;padding:0 15px;border:none;background:transparent;border-radius:999px;font-size:13.5px;font-weight:700;color:#4a5566;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s}
.cx-seg button[aria-pressed="true"]{background:#14202f;color:#fff;box-shadow:0 2px 8px rgba(20,32,47,.25)}
.cx-seg button:not([aria-pressed="true"]):hover{background:rgba(20,32,47,.07)}
.cx-cap{font-size:13px;color:#5f6b7c}
.cx-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.cx-chips>button,.cx-zoom button{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid #d3d0c6;background:#fff;color:#14202f;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:background .15s,border-color .15s,transform .12s}
.cx-chips>button:hover,.cx-zoom button:hover{background:#f2f0e9;border-color:#b9b5a8}.cx-chips>button:active{transform:scale(.97)}
.cx-chips .is-solid{background:#14202f;border-color:#14202f;color:#fff}.cx-chips .is-solid:hover{background:#243247}
.cx-zoom{display:inline-flex;gap:0}.cx-zoom button{min-width:36px;padding:0;justify-content:center;font-size:16px}.cx-zoom button:first-child{border-radius:999px 0 0 999px}.cx-zoom button:last-child{border-radius:0 999px 999px 0;border-left:none}
.cx-search{position:relative;display:flex;align-items:center;gap:8px}
.cx-search input{min-height:36px;width:min(260px,72vw);padding:0 14px;border-radius:999px;border:1px solid #d3d0c6;background:#fff;font-size:13.5px;font-family:inherit}
.cx-search em{font-style:normal;font-size:12px;color:#5f6b7c}
.cx-hint{max-width:1180px;margin:10px auto 0;padding:0 clamp(16px,3vw,28px);font-size:12px;line-height:1.6;color:#7a8494}
.cx-panel{max-width:1180px;margin:0 auto;padding:clamp(26px,4vw,44px) clamp(16px,3vw,28px) clamp(56px,8vw,96px);animation:cx-in .38s ease}
@keyframes cx-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.cx-panel-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;padding-bottom:12px;border-bottom:1px solid #d9d6cc;position:relative}
.cx-panel-top:after{content:'';position:absolute;left:0;bottom:-1px;width:72px;height:3px;background:var(--ev,#244a78)}
.cx-count{font-size:12.5px;color:#7a8494;font-variant-numeric:tabular-nums}.cx-count b{font-family:${SERIF};font-size:20px;color:#14202f;margin-right:2px}
.cx-nav{display:flex;gap:6px}.cx-nav button{min-height:34px;padding:0 16px;border-radius:999px;border:1px solid #d3d0c6;background:#fff;font-size:13px;font-weight:700;cursor:pointer}.cx-nav button:hover{background:#f2f0e9}
.cx-panel-grid{display:grid;grid-template-columns:1.12fr 1fr;gap:clamp(24px,5vw,60px)}
@media (max-width:860px){.cx-panel-grid{grid-template-columns:1fr}}
.cx-date{font-size:14px;font-weight:800;color:var(--ev,#244a78);font-variant-numeric:tabular-nums;letter-spacing:.02em}
.cx-era-chip{display:inline-flex;align-items:center;gap:7px;margin-top:6px;font-size:12.5px;font-weight:800}.cx-era-chip span{width:7px;height:7px;border-radius:50%}.cx-era-chip a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.cx-title{margin:12px 0 14px;font-family:${SERIF};font-size:clamp(26px,4.4vw,40px);font-weight:700;letter-spacing:-.02em;line-height:1.28;color:#14202f;word-break:keep-all}
.cx-kospi-pill{display:inline-block;margin-bottom:14px;padding:6px 13px;border-radius:999px;background:#eef2f8;color:#1e3a62;font-size:12.5px}.cx-kospi-pill b{font-size:14.5px;margin-left:2px}.cx-kospi-pill small{margin-left:6px;color:#5f6b7c}
.cx-desc{font-size:16px;line-height:1.85;color:#2f3a4a;word-break:keep-all}
.cx-note{margin-top:10px;font-size:13px;line-height:1.6;color:#7a8494}
.cx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.cx-btn{display:inline-flex;align-items:center;min-height:44px;padding:0 20px;border-radius:999px;border:1px solid #b9b5a8;background:#fff;color:#14202f;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;transition:background .15s,transform .12s}
.cx-btn:hover{background:#f2f0e9}.cx-btn:active{transform:scale(.98)}
.cx-btn-primary{background:#14202f;border-color:#14202f;color:#fff}.cx-btn-primary:hover{background:#243247}
.cx-reading{margin-top:26px;padding:18px 20px;border:1px solid #e1ded4;border-radius:14px;background:#fff}
.cx-reading h3{font-size:13.5px;font-weight:800;color:#14202f;margin-bottom:12px}
.cx-reading ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.cx-reading li{display:grid;grid-template-columns:54px 1fr 50px;align-items:center;gap:10px;font-size:13px}
.cx-r-key{font-weight:700;color:#2f3a4a}.cx-r-bar{height:8px;border-radius:99px;background:#eeece5;overflow:hidden}.cx-r-bar i{display:block;height:100%;border-radius:99px;background:var(--ev,#244a78);transition:width .6s cubic-bezier(.22,.8,.22,1)}
.cx-r-val{text-align:right;font-variant-numeric:tabular-nums;color:#5f6b7c}
.cx-reading-note{margin-top:10px;font-size:12px;line-height:1.55;color:#7a8494}
.cx-sources{margin-top:18px;font-size:12px;line-height:1.7;color:#7a8494}.cx-sources a{color:#7a8494;text-decoration:underline;text-underline-offset:2px}
.cx-articles h3{font-size:14px;font-weight:800;color:#14202f;margin-bottom:10px;letter-spacing:.01em}
@media (prefers-reduced-motion:reduce){.cx-panel{animation:none}.cx-r-bar i,.cx-seg button,.cx-chips>button{transition:none}}
`;
