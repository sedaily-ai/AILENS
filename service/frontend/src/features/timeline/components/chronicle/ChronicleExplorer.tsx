'use client';

// 연대기 탐험 — 서울경제 기사 비중 곡선 위에 사건 79개를 얹은 주석 시계열. 사건을 누르면 패널에서 설명 · 기사 · 그날 신문으로 이어진다.
// 조작: 끌기 / ⌘·Ctrl+휠·핀치 확대 / 개요 막대 / 연대 칩 / 키워드 전환 / 랜덤 / 검색 / ← → 키 / 주소(?e=) 공유.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERAS, EVENTS, type TimelineEvent } from '@/shared/data/timelineEvents';
import { yearFloat } from '../../lib/chronicleLayout';
import { ATT_KEYWORDS, ATT_LABEL, type AttKey } from '../../lib/attention';
import { ChronicleChart, FULL_DOMAIN, clampDomain } from './ChronicleChart';
import { EventDetailPanel } from './EventDetailPanel';
import { ACCENT, ACCENT_HOVER, BORDER_CONTROL, BORDER_HAIRLINE, BORDER_STRONG, FONT, SURFACE, SURFACE_CHIP, SURFACE_SUNKEN, TEXT_BODY, TEXT_INVERSE, TEXT_MUTED, TEXT_STRONG, TOUCH_MIN } from '../../lib/tone';

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

      {/* 연대별·시대별(ChronicleFrame)과 같은 머리 — 흰 바탕, 가운데 정렬, 굵은 밑줄. 숫자 4개는 한 줄로 둔다. */}
      <header className="cx-head">
        <p className="cx-eyebrow">그날로 떠나요 · 연대기</p>
        <h1 className="cx-head-title"><span>1990</span><i aria-hidden /><span>2026</span></h1>
        <p className="cx-head-sub">서울경제 기사가 가장 많이 다룬 말로 읽는 한국 경제 36년. 곡선 위의 사건을 눌러 그 무렵의 기사로 들어가 보세요.</p>
        <ul className="cx-stats">
          <li><b>{events.length}</b>검증한 사건</li>
          <li><b>{ERAS.length}</b>묶음 시대</li>
          <li><b>2+</b>사건당 출처</li>
          <li><b>{(FULL_DOMAIN[1] - FULL_DOMAIN[0] - 1).toFixed(0)}</b>년의 아카이브</li>
        </ul>
      </header>

      <section className="cx-stage" aria-label="연대기 차트">
        <div className="cx-in">
          <div className="cx-row cx-row-keys">
            <div className="cx-seg" role="group" aria-label="곡선으로 볼 말">
              {KEYS.map((k) => (
                <button key={k} type="button" aria-pressed={attKey === k} onClick={() => setAttKey(k)}>{ATT_LABEL[k]}</button>
              ))}
            </div>
            <p className="cx-cap">{attKey === 'TOTAL' ? '월별 서울경제 아카이브 기사 수' : `서울경제 기사 중 ‘${attKey}’가 나온 비중(월별)`}</p>
          </div>

          <div className="cx-row cx-row-tools">
            {/* 구간 칩과 확대·무작위 버튼을 나눠 둔다 — 좁은 화면에서 칩 줄만 옆으로 넘기고, '아무 사건으로'는 늘 보이게. */}
            <div className="cx-row-left">
              <div className="cx-chips" role="group" aria-label="구간 이동">
                {DECADE_JUMPS.map((d) => (
                  <button key={d} type="button" onClick={() => animateTo([d - 0.4, d + 10.4])}>{d}년대</button>
                ))}
                <button type="button" onClick={() => animateTo(FULL_DOMAIN)}>전체</button>
              </div>
              <div className="cx-chips cx-chips-tools">
                <span className="cx-zoom">
                  <button type="button" onClick={() => zoom(0.6)} aria-label="확대">+</button>
                  <button type="button" onClick={() => zoom(1 / 0.6)} aria-label="축소">−</button>
                </span>
                <button type="button" onClick={randomEvent} className="is-solid"><DiceIcon />아무 사건으로</button>
              </div>
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

// Lens 톤 — 색·글자 크기·간격은 tone.ts 토큰만 쓴다. 시대 색(--ev)만 사건이 속한 시대를 구분하는 정보라 그대로 둔다.
// 버튼·칩은 높이 44px(터치 타겟), 글자는 13px 이상, 컨트롤 경계는 BORDER_CONTROL(4.83:1).
const CSS = `
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cx-head{max-width:1180px;margin:0 auto;padding:${TOUCH_MIN + 32}px clamp(20px,4vw,36px) 24px;text-align:center}
.cx-eyebrow{font-size:${FONT.caption}px;letter-spacing:.2em;color:${TEXT_MUTED};margin-bottom:8px}
.cx-head-title{display:flex;align-items:center;justify-content:center;gap:16px;font-size:clamp(${FONT.pageTitleLg}px,6vw,40px);font-weight:800;letter-spacing:-.02em;line-height:1.2;color:${TEXT_STRONG};font-variant-numeric:tabular-nums}
.cx-head-title i{display:block;width:clamp(24px,5vw,48px);height:2px;background:${TEXT_STRONG}}
.cx-head-sub{max-width:560px;margin:12px auto 0;font-size:${FONT.body}px;line-height:1.7;color:${TEXT_BODY};word-break:keep-all}
.cx-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 24px;margin:16px 0 0;padding:0 0 24px;list-style:none;border-bottom:2px solid ${BORDER_STRONG};font-size:${FONT.caption}px;color:${TEXT_MUTED}}
.cx-stats li{display:flex;align-items:baseline;gap:4px}.cx-stats b{font-size:${FONT.sectionTitle}px;font-weight:800;color:${TEXT_STRONG};font-variant-numeric:tabular-nums}
.cx-stage{background:${SURFACE};border-bottom:1px solid ${BORDER_HAIRLINE};padding:8px 0 16px}
.cx-in{max-width:1180px;margin:0 auto;padding:0 clamp(16px,3vw,28px)}
.cx-row{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;margin-bottom:12px}
.cx-chips,.cx-row-left{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cx-row-left{min-width:0}
/* 1줄(곡선으로 볼 말)은 하나만 고르는 스위치라 회색 홈 안의 세그먼트로, 2줄(구간 이동·확대)은 누르는 버튼이라 테두리 버튼으로 모양을 나눈다. */
.cx-seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;background:${SURFACE_CHIP}}
.cx-seg button{display:inline-flex;align-items:center;justify-content:center;min-height:${TOUCH_MIN}px;padding:0 16px;border:none;border-radius:999px;background:transparent;color:${TEXT_BODY};font-size:${FONT.meta}px;font-weight:600;font-family:inherit;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}
.cx-seg button:not([aria-pressed="true"]):hover{background:#e5e7eb;color:${TEXT_STRONG}}
.cx-seg button[aria-pressed="true"]{background:${TEXT_STRONG};color:${TEXT_INVERSE};font-weight:700;box-shadow:0 1px 4px rgba(17,24,39,.24)}
.cx-chips>button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:${TOUCH_MIN}px;padding:0 16px;border:1px solid ${BORDER_CONTROL};border-radius:999px;background:${SURFACE};color:${TEXT_BODY};font-size:${FONT.meta}px;font-weight:600;font-family:inherit;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}
.cx-chips>button:hover{background:${SURFACE_SUNKEN};color:${TEXT_STRONG}}
.cx-chips .is-solid{background:${ACCENT};border-color:${ACCENT};color:${TEXT_INVERSE};font-weight:700}.cx-chips .is-solid:hover{background:${ACCENT_HOVER};color:${TEXT_INVERSE}}
.cx-cap{font-size:${FONT.caption}px;color:${TEXT_MUTED}}
.cx-zoom{display:inline-flex}.cx-zoom button{min-width:${TOUCH_MIN}px;min-height:${TOUCH_MIN}px;padding:0;border:1px solid ${BORDER_CONTROL};background:${SURFACE};color:${TEXT_STRONG};font-size:${FONT.sectionTitle}px;font-family:inherit;cursor:pointer}
.cx-zoom button:hover{background:${SURFACE_SUNKEN}}.cx-zoom button:first-child{border-radius:999px 0 0 999px}.cx-zoom button:last-child{border-radius:0 999px 999px 0;border-left:none}
.cx-search{position:relative;display:flex;align-items:center;gap:8px}
.cx-search input{min-height:${TOUCH_MIN}px;width:min(280px,100%);padding:0 16px;border-radius:999px;border:1px solid ${BORDER_CONTROL};background:${SURFACE};color:${TEXT_STRONG};font-size:${FONT.meta}px;font-family:inherit}
.cx-search em{font-style:normal;font-size:${FONT.caption}px;color:${TEXT_MUTED};white-space:nowrap}
.cx-hint{max-width:1180px;margin:12px auto 0;padding:0 clamp(16px,3vw,28px);font-size:${FONT.caption}px;line-height:1.6;color:${TEXT_MUTED}}
.cx-panel{max-width:1180px;margin:0 auto;padding:clamp(24px,4vw,48px) clamp(16px,3vw,28px) clamp(48px,8vw,96px);animation:cx-in .38s ease}
@keyframes cx-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cx-panel-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid ${BORDER_HAIRLINE};position:relative}
.cx-panel-top:after{content:'';position:absolute;left:0;bottom:-1px;width:72px;height:3px;background:var(--ev,${ACCENT})}
.cx-count{font-size:${FONT.caption}px;color:${TEXT_MUTED};font-variant-numeric:tabular-nums}.cx-count b{font-size:${FONT.pageTitle}px;font-weight:800;color:${TEXT_STRONG};margin-right:4px}
.cx-nav{display:flex;gap:8px}
.cx-nav button{min-height:${TOUCH_MIN}px;padding:0 20px;border-radius:999px;border:1px solid ${BORDER_CONTROL};background:${SURFACE};color:${TEXT_BODY};font-size:${FONT.meta}px;font-weight:700;font-family:inherit;cursor:pointer}
.cx-nav button:hover{background:${SURFACE_SUNKEN};color:${TEXT_STRONG}}
.cx-panel-grid{display:grid;grid-template-columns:1.12fr 1fr;gap:clamp(24px,5vw,64px)}
.cx-date{font-size:${FONT.meta}px;font-weight:800;color:var(--ev,${ACCENT});font-variant-numeric:tabular-nums}
.cx-era-chip{display:inline-flex;align-items:center;gap:8px;margin-top:4px;font-size:${FONT.caption}px;font-weight:800}.cx-era-chip span{width:8px;height:8px;border-radius:50%}.cx-era-chip a{display:inline-flex;align-items:center;min-height:${TOUCH_MIN}px;color:inherit;text-decoration:underline;text-underline-offset:3px}
.cx-title{margin:4px 0 16px;font-size:clamp(${FONT.pageTitle}px,3.6vw,${FONT.pageTitleLg}px);font-weight:800;letter-spacing:-.02em;line-height:1.35;color:${TEXT_STRONG};word-break:keep-all}
.cx-kospi-pill{display:inline-block;margin-bottom:16px;padding:8px 12px;border-radius:999px;background:${SURFACE_CHIP};color:${TEXT_BODY};font-size:${FONT.caption}px}.cx-kospi-pill b{font-size:${FONT.meta}px;color:${TEXT_STRONG};margin-left:4px}.cx-kospi-pill small{margin-left:8px;font-size:${FONT.caption}px;color:${TEXT_MUTED}}
.cx-desc{font-size:${FONT.body}px;line-height:1.75;color:${TEXT_BODY};word-break:keep-all}
.cx-note{margin-top:12px;font-size:${FONT.caption}px;line-height:1.6;color:${TEXT_MUTED}}
.cx-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.cx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:${TOUCH_MIN}px;padding:0 24px;border-radius:999px;border:1px solid ${BORDER_CONTROL};background:transparent;color:${TEXT_BODY};font-size:${FONT.meta}px;font-weight:700;font-family:inherit;text-decoration:none;cursor:pointer;transition:background .15s,color .15s}
.cx-btn:hover{background:${SURFACE_SUNKEN};color:${TEXT_STRONG}}
.cx-btn-primary{background:${ACCENT};border-color:${ACCENT};color:${TEXT_INVERSE}}.cx-btn-primary:hover{background:${ACCENT_HOVER};color:${TEXT_INVERSE}}
.cx-btn svg{flex-shrink:0}
/* 링크 복사는 이동 버튼(신문·연표)과 성격이 달라 넓은 화면에서는 줄 오른쪽 끝으로 떼어 둔다. 좁은 화면은 줄이 바뀌면 떨어져 보여서 순서만 맨 끝. */
@media (min-width:641px){.cx-btn-copy{margin-left:auto}}
.cx-reading{margin-top:24px;padding:16px 20px;border:1px solid ${BORDER_HAIRLINE};border-radius:16px;background:${SURFACE_SUNKEN}}
.cx-reading h3{font-size:${FONT.meta}px;font-weight:800;color:${TEXT_STRONG};margin-bottom:12px}
.cx-reading ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.cx-reading li{display:grid;grid-template-columns:56px 1fr 52px;align-items:center;gap:12px;font-size:${FONT.caption}px}
.cx-r-key{font-weight:700;color:${TEXT_BODY}}.cx-r-bar{height:8px;border-radius:99px;background:#e5e7eb;overflow:hidden}.cx-r-bar i{display:block;height:100%;border-radius:99px;background:var(--ev,${ACCENT});transition:width .6s cubic-bezier(.22,.8,.22,1)}
.cx-r-val{text-align:right;font-variant-numeric:tabular-nums;color:${TEXT_MUTED}}
.cx-reading-note{margin-top:12px;font-size:${FONT.caption}px;line-height:1.6;color:${TEXT_MUTED}}
.cx-sources{margin-top:16px;font-size:${FONT.caption}px;line-height:1.7;color:${TEXT_MUTED}}.cx-sources a{color:${TEXT_MUTED};text-decoration:underline;text-underline-offset:3px}
.cx-articles h3{font-size:${FONT.body}px;font-weight:800;color:${TEXT_STRONG};margin-bottom:12px}
.cx-seg button:focus-visible,.cx-chips>button:focus-visible,.cx-zoom button:focus-visible,.cx-search input:focus-visible,.cx-nav button:focus-visible,.cx-btn:focus-visible,.cx-era-chip a:focus-visible,.cx-sources a:focus-visible{outline:2px solid ${ACCENT};outline-offset:3px}
@media (max-width:860px){.cx-panel-grid{grid-template-columns:1fr}}
/* 좁은 화면 — 키워드 탭과 구간 칩은 옆으로 넘기는 한 줄로 둬서 글자가 세로로 꺾이지 않게 한다. */
@media (max-width:640px){
  .cx-head{padding-top:${TOUCH_MIN + 32}px}
  /* 세그먼트는 화면 폭을 꽉 채우고 6개를 나눠 담는다(375px에서 한 줄에 들어감, 더 좁으면 홈 안에서 옆으로 넘김). */
  .cx-row-keys{flex-direction:column;align-items:stretch}
  .cx-seg{display:flex;overflow-x:auto;scrollbar-width:none}
  .cx-seg button{flex:1 0 auto;padding:0 8px}
  .cx-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 calc(-1 * clamp(16px,3vw,28px));padding:2px clamp(16px,3vw,28px)}
  .cx-seg::-webkit-scrollbar,.cx-chips::-webkit-scrollbar{display:none}
  /* 한 줄(nowrap) 세로 배치여야 자식이 화면 폭으로 늘어난다 — wrap이면 칩 줄 길이만큼 넓어져 화면이 옆으로 넘친다. */
  .cx-row-tools,.cx-row-left{flex-direction:column;flex-wrap:nowrap;align-items:stretch}
  /* 확대·무작위 버튼은 두 개뿐이라 넘기지 않고 그대로 보인다. */
  .cx-chips-tools{flex-wrap:wrap;overflow:visible;margin:0;padding:0}
  .cx-search input{width:100%}
}
@media (max-width:360px){.cx-seg button{padding:0 4px}}
@media (prefers-reduced-motion:reduce){.cx-panel{animation:none}.cx-r-bar i,.cx-seg button,.cx-chips>button,.cx-btn{transition:none}}
`;
