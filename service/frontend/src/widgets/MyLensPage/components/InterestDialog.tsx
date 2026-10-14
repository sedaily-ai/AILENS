'use client';

import { useEffect, useRef, useState } from 'react';
import { ECON_CATEGORIES } from '@ailens/domain';
import { ChevronDown, Search, X } from 'lucide-react';
import { EDITORS, type InterestItem, type TopicOption } from '@/features/letter';

// 기존 interests_repo.py의 저장 계약. 분야와 주제를 합쳐 최대 40개다.
const MAX_INTERESTS = 40;

export function InterestDialog({ initial, topics, onSave, onClose }: { initial: InterestItem[]; topics: TopicOption[]; onSave: (items: InterestItem[]) => Promise<boolean>; onClose: () => void }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const groups = ECON_CATEGORIES.filter((category) => topics.some((topic) => topic.category_slug === category.slug));
  const [group, setGroup] = useState(() => groups.find((category) => initial.some((item) => item.type === 'category' && item.key === category.slug))?.slug ?? groups[0]?.slug ?? 'other');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  const toggle = (type: InterestItem['type'], key: string) => setItems((previous) => previous.some((item) => item.type === type && item.key === key) ? previous.filter((item) => item.type !== type || item.key !== key) : [...previous, { type, key }]);
  const selected = (type: InterestItem['type'], key: string) => items.some((item) => item.type === type && item.key === key);
  const nameFor = (item: InterestItem) => item.type === 'category' ? ECON_CATEGORIES.find((category) => category.slug === item.key)?.label ?? item.key : topics.find((topic) => topic.slug === item.key)?.name ?? EDITORS.flatMap((editor) => editor.topics).find((topic) => topic.slug === item.key)?.name ?? item.key;
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
  const otherTopics = topics.filter((topic) => !groups.some((category) => category.slug === topic.category_slug));
  const activeGroup = groups.some((category) => category.slug === group) ? group : otherTopics.length ? 'other' : groups[0]?.slug ?? 'other';
  const visibleTopics = topics.filter((topic) => needle ? topic.name.normalize('NFKC').toLocaleLowerCase().includes(needle) : activeGroup === 'other' ? otherTopics.includes(topic) : topic.category_slug === activeGroup);
  const categoryCount = items.filter((item) => item.type === 'category').length;
  const topicCount = items.length - categoryCount;
  const limitReached = items.length >= MAX_INTERESTS;
  const dirty = items.length !== initial.length || items.some((item) => !initial.some((old) => old.type === item.type && old.key === item.key));
  const save = async () => {
    setBusy(true); setError('');
    try { if (await onSave(items)) { onClose(); return; } }
    catch { /* 선택을 보존하고 같은 저장 버튼으로 재시도한다. */ }
    setError('관심사를 저장하지 못했어요. 선택은 유지돼요. 다시 시도해 주세요.');
    setBusy(false);
  };
  return (
    <dialog ref={dialogRef} className="ml-dialog ml-interest-dialog" aria-labelledby="ml-interest-title" aria-describedby="ml-interest-intro ml-interest-scope" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className="ml-interest-head"><div className="ml-dialog-head"><h2 id="ml-interest-title">나의 관심사</h2><button type="button" className="ml-icon-button" aria-label="관심사 설정 닫기" onClick={onClose} disabled={busy}><X size={21} /></button></div><p id="ml-interest-intro" className="ml-dialog-intro">선택한 분야와 주제를 뉴스·레터 추천에 반영해요.</p><p id="ml-interest-scope" className="ml-interest-scope">이 브라우저의 설정이에요. 기기 간 동기화는 준비 중이며, 알림은 별도로 선택해요.</p></header>
      <div className="ml-interest-body">
        <section className="ml-interest-selection" aria-labelledby="ml-interest-selected-title"><div className="ml-interest-section-head"><h3 id="ml-interest-selected-title">선택한 관심 <span>{items.length}</span></h3><button type="button" className="ml-text-link" disabled={busy || !items.length} onClick={() => setItems([])}>선택 초기화</button></div>{items.length ? <div className="ml-selected-interests">{items.map((item) => <button type="button" key={`${item.type}:${item.key}`} disabled={busy} onClick={() => toggle(item.type, item.key)} aria-label={`${nameFor(item)} 선택 해제`}>{nameFor(item)}<X size={12} aria-hidden /></button>)}</div> : <p className="ml-interest-empty-selection">아직 고른 관심이 없어요. 아래에서 궁금한 분야부터 골라보세요.</p>}{limitReached && <p className="ml-interest-help" role="status">분야와 주제를 합쳐 최대 {MAX_INTERESTS}개까지 선택할 수 있어요. 기존 선택을 해제하면 다른 관심을 고를 수 있어요.</p>}</section>
        <fieldset disabled={busy}><legend>관심 분야</legend><p className="ml-interest-help">먼저 자주 보고 싶은 뉴스 분야를 골라주세요.</p><div className="ml-check-grid ml-interest-categories">{ECON_CATEGORIES.map((category) => <label key={category.slug}><input type="checkbox" checked={selected('category', category.slug)} disabled={limitReached && !selected('category', category.slug)} onChange={() => toggle('category', category.slug)} /><span>{category.label}</span></label>)}</div></fieldset>
        <fieldset disabled={busy}><legend>관심 주제 <span className="ml-interest-optional">선택 사항</span></legend><p className="ml-interest-help">분야별로 살펴보거나, 모든 주제에서 검색해 보세요.</p>
          {topics.length ? <>
            <label className="ml-interest-search"><Search size={16} aria-hidden /><input type="search" aria-label="관심 주제 검색" placeholder="예: 반도체, 금리, 인공지능" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <div className="ml-interest-topic-toolbar"><label className="ml-interest-group">주제 분야<span><select aria-label="주제 분야" value={activeGroup} disabled={busy || !!needle} onChange={(event) => setGroup(event.target.value)}>{groups.map((category) => <option key={category.slug} value={category.slug}>{category.label}</option>)}{(otherTopics.length > 0 || !groups.length) && <option value="other">기타 주제</option>}</select><ChevronDown size={14} aria-hidden /></span></label><p role="status">{needle ? `전체 분야 검색 결과 ${visibleTopics.length}개` : `${visibleTopics.length}개의 주제`}</p>{needle && <button type="button" className="ml-text-link" onClick={() => setQuery('')}>검색 지우기</button>}</div>
            {visibleTopics.length ? <div className="ml-check-grid ml-interest-topic-grid">{visibleTopics.map((topic) => <label key={topic.slug}><input type="checkbox" checked={selected('topic', topic.slug)} disabled={limitReached && !selected('topic', topic.slug)} onChange={() => toggle('topic', topic.slug)} /><span>{topic.name}</span></label>)}</div> : <p className="ml-interest-empty-selection">{needle ? '검색한 주제가 없어요. 다른 단어로 찾아보세요.' : '이 분야에 등록된 주제가 없어요.'}</p>}
          </> : <p className="ml-interest-empty-selection">현재 선택할 주제 목록이 없어요. 분야를 선택하거나 기존에 고른 주제를 유지할 수 있어요.</p>}
        </fieldset>
      </div>
      <footer className="ml-interest-footer">{error && <p className="ml-error" role="alert">{error}</p>}<div className="ml-interest-save-row"><p aria-live="polite">분야 {categoryCount} · 주제 {topicCount}<small>{dirty ? '저장하면 추천에 반영돼요.' : '현재 저장된 관심이에요.'}</small></p><div className="ml-dialog-actions"><button type="button" className="ml-button ml-button-quiet" onClick={onClose} disabled={busy}>취소</button><button type="button" className="ml-button" disabled={busy || !dirty || items.length > MAX_INTERESTS} onClick={() => void save()}>{busy ? '저장 중…' : '관심사 저장'}</button></div></div></footer>
    </dialog>
  );
}
