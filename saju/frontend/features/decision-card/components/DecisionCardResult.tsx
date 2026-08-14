'use client';

import { useRef } from 'react';
import type { DecisionCard } from '../types';
import { PERSONAS } from '../lib/personas';

interface DecisionCardResultProps {
  card: DecisionCard;
  onSave?: () => void;
  onBack?: () => void;
}

export function DecisionCardResult({ card, onSave, onBack }: DecisionCardResultProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const persona = PERSONAS[card.personaId];

  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      // 실제 이미지 export는 나중에 (html-to-image 추가 시)
      alert('공유 기능은 준비 중입니다');
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6">
      <div
        ref={cardRef}
        className="bg-white rounded-xl shadow-md p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="text-5xl">{persona?.emoji}</div>
          <div className="font-bold text-lg">{persona?.name}</div>
        </div>

        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-medium">결정:</span> {card.decisionText}
          </div>
          <div className="text-sm text-gray-600">
            <span className="font-medium">기분:</span>{' '}
            {{
              yes: '그래, 하자',
              no: '아니야, 말자',
              maybe: '모르겠는데',
              later: '나중에 생각해',
            }[card.chosenOption]}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-center text-gray-800 leading-relaxed font-medium">
            "{card.resultSummary}"
          </p>
        </div>

        <div className="text-center text-xs text-gray-400">
          {new Date(card.date).toLocaleDateString('ko-KR')}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          다시 뽑기
        </button>
        <button
          onClick={handleShare}
          className="flex-1 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          공유
        </button>
        <button
          onClick={onSave}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          저장
        </button>
      </div>
    </div>
  );
}
