'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { IssueLetter } from '../data/letterTypes';
import { fetchBundles, fetchMyFeed, fetchMyInterests, fetchTopics, saveMyInterests, type Bundle, type InterestItem, type TopicOption } from '../data/interestApi';
import { LetterCard } from './LetterCard';
import { SubscribeForm } from './SubscribeForm';

// 서버 분류 slug(markets 등)와 사이트 분류 이름(시그널 등). 분류 정본은 shared/constants/econCategories.ts 다.
const CATEGORY_NAMES: Record<string, string> = {
  markets: '시그널', property: '부동산', economy: '경제', finance: '금융', industry: '산업',
  politics: '정치', national: '사회', international: '국제', culture: '문화',
};
const keyOf = (i: InterestItem) => `${i.type}:${i.key}`;

/**
 * 내 관심사: 관심 묶음이나 직접 고른 분류·주제로 이 기기의 관심을 저장하고, 겹치는 레터를 먼저 보여 준다.
 * 계정이 필요 없고 개인 정보를 모으지 않는다. 기본 최신순 목록은 그대로 두고 이 구역만 얹는다(추천이 편향으로 읽히지 않게).
 * 이유 문구는 레터에 실제로 붙은 주제·분류 이름만 말한다.
 */
export function InterestPanel() {
  const [ready, setReady] = useState(false);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [saved, setSaved] = useState<InterestItem[]>([]);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [feed, setFeed] = useState<IssueLetter[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [b, t, mine] = await Promise.all([fetchBundles(), fetchTopics(), fetchMyInterests()]);
    setBundles(b);
    setTopics(t);
    setSaved(mine ?? []);
    setFeed(mine && mine.length > 0 ? await fetchMyFeed() : []);
    setReady(true);
  }, []);

  useEffect(() => {
    // 마운트 뒤 서버에서 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const topicName = useMemo(() => new Map(topics.map((t) => [t.slug, t.name])), [topics]);
  const label = (i: InterestItem) => (i.type === 'category' ? CATEGORY_NAMES[i.key] ?? i.key : topicName.get(i.key) ?? i.key);
  const topicsByCategory = useMemo(() => {
    const groups = new Map<string, TopicOption[]>();
    for (const t of topics) groups.set(t.category_slug ?? 'etc', [...(groups.get(t.category_slug ?? 'etc') ?? []), t]);
    return Object.keys(CATEGORY_NAMES).map((slug) => ({ slug, name: CATEGORY_NAMES[slug], list: groups.get(slug) ?? [] })).filter((g) => g.list.length > 0);
  }, [topics]);

  if (!ready) return null; // 로딩 중이거나 서버를 못 읽으면 이 구역을 보이지 않는다(목록은 그대로)
  if (bundles.length === 0 && topics.length === 0) return null;

  const toggle = (item: InterestItem) =>
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(keyOf(item))) next.delete(keyOf(item));
      else next.add(keyOf(item));
      return next;
    });
  const bundleOn = (b: Bundle) => b.items.every((i) => draft.has(keyOf(i)));
  const toggleBundle = (b: Bundle) =>
    setDraft((prev) => {
      const next = new Set(prev);
      const on = b.items.every((i) => next.has(keyOf(i)));
      b.items.forEach((i) => (on ? next.delete(keyOf(i)) : next.add(keyOf(i))));
      return next;
    });

  const startEdit = () => {
    setDraft(new Set(saved.map(keyOf)));
    setFailed(false);
    setEditing(true);
  };
  const submit = async (items: InterestItem[]) => {
    setBusy(true);
    setFailed(false);
    const result = await saveMyInterests(items);
    setBusy(false);
    if (!result) return setFailed(true);
    trackEvent('letter_interest_save', { count: result.length });
    setSaved(result);
    setFeed(result.length > 0 ? await fetchMyFeed() : []);
    setEditing(false);
  };
  const draftItems = (): InterestItem[] => [...draft].map((k) => ({ type: k.split(':')[0] as InterestItem['type'], key: k.slice(k.indexOf(':') + 1) }));

  return (
    <section className="lt-interest" aria-label="내 관심사">
      {!editing && saved.length === 0 && (
        <div className="lt-int-prompt">
          <div>
            <strong>관심 분야를 고르면 맞는 레터를 먼저 보여드려요</strong>
            <p>계정 없이 이 기기에만 저장돼요. 언제든 바꾸거나 지울 수 있어요.</p>
          </div>
          <button type="button" className="lt-int-btn" onClick={startEdit}>관심 분야 고르기</button>
        </div>
      )}

      {!editing && saved.length > 0 && (
        <>
          <div className="lt-int-head">
            <h2 className="lt-sec-h">내 관심사 레터</h2>
            <button type="button" className="lt-int-link" onClick={startEdit}>관심사 수정</button>
          </div>
          <ul className="lt-int-chips" aria-label="선택한 관심사">
            {saved.map((i) => <li key={keyOf(i)} className="lt-topic">{label(i)}</li>)}
          </ul>
          {feed.length > 0 ? (
            <div className="lt-grid">{feed.map((l) => <LetterCard key={l.slug} letter={l} />)}</div>
          ) : (
            <p className="lt-empty">지금 관심사와 겹치는 레터가 아직 없어요. 새 레터가 나오면 이곳에 먼저 보여드려요.</p>
          )}
          <SubscribeForm interests={saved} />
        </>
      )}

      {editing && (
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
            <button type="button" className="lt-int-link" disabled={busy} onClick={() => setEditing(false)}>취소</button>
            {saved.length > 0 && <button type="button" className="lt-int-link" disabled={busy} onClick={() => submit([])}>모두 지우기</button>}
          </div>
        </div>
      )}
    </section>
  );
}
