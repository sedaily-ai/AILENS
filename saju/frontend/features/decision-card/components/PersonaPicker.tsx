'use client';

import type { PersonaId } from '../types';
import { personaList } from '../lib/personas';

interface PersonaPickerProps {
  onSelect: (personaId: PersonaId) => void;
  selected?: PersonaId;
}

export function PersonaPicker({ onSelect, selected }: PersonaPickerProps) {
  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">누가 조언해줄까요?</h2>
        <p className="text-sm text-gray-500">4명의 친구 중 한명을 선택하세요</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {personaList.map(persona => (
          <button
            key={persona.id}
            onClick={() => onSelect(persona.id as PersonaId)}
            className={`p-4 rounded-lg border-2 transition text-center space-y-1 ${
              selected === persona.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="text-3xl">{persona.emoji}</div>
            <div className="font-medium text-sm">{persona.name}</div>
            <div className="text-xs text-gray-500">{persona.tone}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
