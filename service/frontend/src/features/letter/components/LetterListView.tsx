'use client';

import { useMemo, useState } from 'react';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import type { IssueLetter } from '../data/letterTypes';
import { InterestPanel } from './InterestPanel';
import { LetterCard } from './LetterCard';
import { LETTER_CSS } from './letterStyles';

export function LetterListView({ letters }: { letters: IssueLetter[] }) {
  const [cat, setCat] = useState('전체');
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // 필터 칩은 사이트 분류 순서대로, 레터가 한 편이라도 있는 분류만. 주 분류와 보조 분류 어느 쪽이든 매칭한다.
  const cats = useMemo(() => ['전체', ...ECON_CATEGORIES.map((c) => c.label).filter((label) => letters.some((l) => l.categories.includes(label)))], [letters]);
  const q = query.trim().toLowerCase();
  const shown = letters.filter(
    (l) =>
      (cat === '전체' || l.categories.includes(cat)) &&
      (!topic || (l.topics ?? []).includes(topic)) &&
      (!q || [l.title, l.deck, ...(l.topics ?? []), ...l.categories].some((t) => t.toLowerCase().includes(q))),
  );
  const filtering = cat !== '전체' || !!topic || !!q;
  const pickTopic = (name: string) => {
    setTopic(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const featured = shown.find((l) => l.featured) ?? shown[0];
  const rest = shown.filter((l) => l !== featured);

  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <header className="lt-hero">
        <div className="lt-eyebrow">AI LENS 레터</div>
        <h1 className="lt-h1">기사 하나가 아니에요. 하나의 이슈, 여러 관점</h1>
        <p className="lt-sub">소식, 실체, 다른 시각. 세 가지 관점으로 읽어요. 모아쓰기는 같은 이슈를 다룬 여러 서울경제 기사를 하나의 흐름으로 엮은 레터예요.</p>
      </header>

      <div className="lt-filters" role="group" aria-label="분류">
        {cats.map((c) => (
          <button key={c} type="button" className="lt-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="lt-search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="제목·주제로 레터 찾기" aria-label="레터 검색" />
        {topic && (
          <button type="button" className="lt-chip lt-chip-on" onClick={() => setTopic(null)} aria-label={`${topic} 주제 해제`}>
            {topic} ✕
          </button>
        )}
      </div>

      <InterestPanel />

      {featured ? (
        <>
          <LetterCard letter={featured} featured onTopic={pickTopic} />
          {rest.length > 0 && (
            <>
              <h2 className="lt-sec-h">지난 레터</h2>
              <div className="lt-grid">
                {rest.map((l) => (
                  <LetterCard key={l.slug} letter={l} onTopic={pickTopic} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="lt-empty">{filtering ? '조건에 맞는 레터가 아직 없어요.' : '레터가 아직 없어요.'}</p>
      )}

    </div>
  );
}
