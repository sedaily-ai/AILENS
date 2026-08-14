'use client';

import { useState } from 'react';
import type { DecisionCard } from '../types';
import { PERSONAS } from '../lib/personas';

interface DecisionCardListProps {
  cards: DecisionCard[];
  onDelete?: (id: string) => void;
}

export function DecisionCardList({ cards, onDelete }: DecisionCardListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayCards = showAll ? cards : cards.slice(0, 3);

  if (cards.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto p-6 text-center">
        <p className="text-gray-500">아직 뽑은 카드가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-4">
      <h3 className="font-bold text-lg">카드 모음</h3>
      <div className="space-y-2">
        {displayCards.map(card => {
          const persona = PERSONAS[card.personaId];
          const isExpanded = expanded === card.id;

          return (
            <div
              key={card.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : card.id)}
                className="w-full p-3 bg-gray-50 hover:bg-gray-100 transition flex items-start justify-between"
              >
                <div className="flex gap-2 items-start text-left">
                  <span className="text-lg">{persona?.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{card.decisionText}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(card.date).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400 ml-2">
                  {isExpanded ? '△' : '▽'}
                </span>
              </button>

              {isExpanded && (
                <div className="p-4 bg-white border-t border-gray-200 space-y-3">
                  <div className="text-sm">
                    <p className="text-gray-700 leading-relaxed">"{card.resultSummary}"</p>
                  </div>
                  <button
                    onClick={() => onDelete?.(card.id)}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cards.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {cards.length - 3}개 더 보기
        </button>
      )}
    </div>
  );
}
