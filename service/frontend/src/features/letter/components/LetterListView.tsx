'use client';

import { useMemo, useState } from 'react';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import type { IssueLetter } from '../data/letterTypes';
import { LetterCard } from './LetterCard';
import { LETTER_CSS } from './letterStyles';

export function LetterListView({ letters }: { letters: IssueLetter[] }) {
  const [cat, setCat] = useState('전체');
  // 필터 칩은 사이트 분류 순서대로, 레터가 한 편이라도 있는 분류만. 주 분류와 보조 분류 어느 쪽이든 매칭한다.
  const cats = useMemo(() => ['전체', ...ECON_CATEGORIES.map((c) => c.label).filter((label) => letters.some((l) => l.categories.includes(label)))], [letters]);
  const shown = cat === '전체' ? letters : letters.filter((l) => l.categories.includes(cat));
  const featured = shown.find((l) => l.featured) ?? shown[0];
  const rest = shown.filter((l) => l !== featured);

  return (
    <div className="lt-wrap">
      <style>{LETTER_CSS}</style>
      <header className="lt-hero">
        <div className="lt-eyebrow">AI LENS 레터</div>
        <h1 className="lt-h1">기사 하나가 아니에요. 하나의 이슈, 여러 관점</h1>
        <p className="lt-sub">소식, 실체, 다른 시각. 세 가지 관점으로 읽어요. 에디터가 고른 오늘의 핵심 이슈를 매일 오전에 전해요.</p>
      </header>

      <div className="lt-filters" role="group" aria-label="분류">
        {cats.map((c) => (
          <button key={c} type="button" className="lt-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      {featured ? (
        <>
          <LetterCard letter={featured} featured />
          {rest.length > 0 && (
            <>
              <h2 className="lt-sec-h">지난 레터</h2>
              <div className="lt-grid">
                {rest.map((l) => (
                  <LetterCard key={l.slug} letter={l} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className="lt-empty">이 분류의 레터가 아직 없어요.</p>
      )}

      <p className="lt-note">화면 확정용 목업입니다. 기획서 샘플 레터 기반의 예시 데이터로 구성했고, 발행 기능과 연결되기 전까지 검색엔진에는 노출되지 않아요.</p>
    </div>
  );
}
