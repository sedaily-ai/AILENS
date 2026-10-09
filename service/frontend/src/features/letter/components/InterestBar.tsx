'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { InterestItem } from '../data/interestApi';
import type { InterestState } from '../lib/useInterests';
import { SubscribeForm } from './SubscribeForm';

// 서버 분류 slug(markets 등)와 사이트 분류 이름(시그널 등). 분류 정본은 shared/constants/econCategories.ts 다.
const CATEGORY_NAMES: Record<string, string> = {
  markets: '시그널', property: '부동산', economy: '경제', finance: '금융', industry: '산업',
  politics: '정치', national: '사회', international: '국제', culture: '문화',
};
const keyOf = (i: InterestItem) => `${i.type}:${i.key}`;
const PREVIEW_CHIPS = 4;

/**
 * 내 관심사 바: 목록 위의 한 줄. 관심을 고르면 같은 목록의 해당 레터에 "왜 맞는지"만 표시한다(순서는 최신순 그대로, 별도 추천 구역으로 중복해서 보여 주지 않는다).
 * 계정 없이 이 기기에만 저장한다. 이유 문구는 레터에 실제로 붙은 주제·분류 이름만 말한다.
 */
export function InterestBar({ state, onlyMine, onToggleOnlyMine, matchCount }: { state: InterestState; onlyMine: boolean; onToggleOnlyMine: () => void; matchCount: number }) {
  const { bundles, topics, saved, save } = state;
  const [mode, setMode] = useState<'idle' | 'edit' | 'mail'>('idle');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const topicName = useMemo(() => new Map(topics.map((t) => [t.slug, t.name])), [topics]);
  const label = (i: InterestItem) => (i.type === 'category' ? CATEGORY_NAMES[i.key] ?? i.key : topicName.get(i.key) ?? i.key);
  const topicsByCategory = useMemo(() => {
    const groups = new Map<string, typeof topics>();
    for (const t of topics) groups.set(t.category_slug ?? 'etc', [...(groups.get(t.category_slug ?? 'etc') ?? []), t]);
    return Object.keys(CATEGORY_NAMES).map((slug) => ({ slug, name: CATEGORY_NAMES[slug], list: groups.get(slug) ?? [] })).filter((g) => g.list.length > 0);
  }, [topics]);

  const toggle = (item: InterestItem) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(keyOf(item))) next.delete(keyOf(item));
      else next.add(keyOf(item));
      return next;
    });
  const bundleOn = (b: (typeof bundles)[number]) => b.items.every((i) => draft.has(keyOf(i)));
  const toggleBundle = (b: (typeof bundles)[number]) =>
    setDraft((prev) => {
      const next = new Set(prev);
      const on = b.items.every((i) => next.has(keyOf(i)));
      b.items.forEach((i) => (on ? next.delete(keyOf(i)) : next.add(keyOf(i))));
      return next;
    });
  const startEdit = () => {
    setDraft(new Set(saved.map(keyOf)));
    setFailed(false);
    setMode('edit');
  };
  const submit = async (items: InterestItem[]) => {
    setBusy(true);
    setFailed(false);
    const ok = await save(items);
    setBusy(false);
    if (!ok) return setFailed(true);
    trackEvent('letter_interest_save', { count: items.length });
    if (items.length === 0 && onlyMine) onToggleOnlyMine();
    setMode('idle');
  };
  const draftItems = (): InterestItem[] => [...draft].map((k) => ({ type: k.split(':')[0] as InterestItem['type'], key: k.slice(k.indexOf(':') + 1) }));

  return (
    <section className="lt-ibar" aria-label="내 관심사">
      {saved.length === 0 ? (
        <div className="lt-ibar-row">
          <p className="lt-ibar-msg"><strong>관심 분야를 고르면</strong> 맞는 레터에 이유와 함께 표시해 드려요. 계정 없이 이 기기에만 저장돼요.</p>
          {mode !== 'edit' && <button type="button" className="lt-int-btn" onClick={startEdit}>관심 분야 고르기</button>}
        </div>
      ) : (
        <div className="lt-ibar-row">
          <div className="lt-ibar-mine">
            <span className="lt-ibar-label">내 관심사</span>
            <ul className="lt-ibar-chips" aria-label="선택한 관심사">
              {saved.slice(0, PREVIEW_CHIPS).map((i) => <li key={keyOf(i)} className="lt-topic">{label(i)}</li>)}
              {saved.length > PREVIEW_CHIPS && <li className="lt-ibar-more">+{saved.length - PREVIEW_CHIPS}</li>}
            </ul>
          </div>
          <div className="lt-ibar-actions">
            <button type="button" className="lt-ibar-toggle" aria-pressed={onlyMine} onClick={onToggleOnlyMine}>관심사 레터만 {matchCount}</button>
            <button type="button" className="lt-int-link" onClick={startEdit}>수정</button>
            <button type="button" className="lt-ibar-mail" aria-expanded={mode === 'mail'} onClick={() => setMode(mode === 'mail' ? 'idle' : 'mail')}>메일로 받기</button>
          </div>
        </div>
      )}

      {mode === 'mail' && saved.length > 0 && <SubscribeForm interests={saved} onClose={() => setMode('idle')} />}

      {mode === 'edit' && (
        <div className="lt-int-edit">
          <h2 className="lt-sec-h">관심 분야 고르기</h2>
          {bundles.length > 0 && (
            <>
              <p className="lt-int-sub">자주 찾는 묶음</p>
              <div className="lt-int-chips" role="group" aria-label="관심 묶음">
                {bundles.map((b) => (
                  <button key={b.slug} type="button" className="lt-chip" aria-pressed={bundleOn(b)} title={b.description ?? undefined} onClick={() => toggleBundle(b)}>{b.name}</button>
                ))}
              </div>
            </>
          )}
          <p className="lt-int-sub">분야</p>
          <div className="lt-int-chips" role="group" aria-label="분야">
            {Object.entries(CATEGORY_NAMES).map(([slug, name]) => (
              <button key={slug} type="button" className="lt-chip" aria-pressed={draft.has(`category:${slug}`)} onClick={() => toggle({ type: 'category', key: slug })}>{name}</button>
            ))}
          </div>
          <details className="lt-int-details">
            <summary>주제 직접 고르기 ({topics.length}개)</summary>
            {topicsByCategory.map((g) => (
              <div key={g.slug} className="lt-int-group">
                <p className="lt-int-sub">{g.name}</p>
                <div className="lt-int-chips">
                  {g.list.map((t) => (
                    <button key={t.slug} type="button" className="lt-chip" aria-pressed={draft.has(`topic:${t.slug}`)} onClick={() => toggle({ type: 'topic', key: t.slug })}>{t.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </details>
          {failed && <p className="lt-int-err" role="status">저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.</p>}
          <div className="lt-int-actions">
            <button type="button" className="lt-int-btn" disabled={busy} onClick={() => submit(draftItems())}>{busy ? '저장 중…' : `저장 (${draft.size}개 선택)`}</button>
            <button type="button" className="lt-int-link" disabled={busy} onClick={() => setMode('idle')}>취소</button>
            {saved.length > 0 && <button type="button" className="lt-int-link" disabled={busy} onClick={() => submit([])}>모두 지우기</button>}
          </div>
        </div>
      )}
    </section>
  );
}
