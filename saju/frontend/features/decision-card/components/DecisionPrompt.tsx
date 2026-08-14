'use client';

import { useState } from 'react';
import type { DecisionOption } from '../types';

interface DecisionPromptProps {
  onConfirm: (text: string, option: DecisionOption) => void;
  loading?: boolean;
}

export function DecisionPrompt({ onConfirm, loading = false }: DecisionPromptProps) {
  const [text, setText] = useState('');
  const [option, setOption] = useState<DecisionOption | null>(null);

  const handleConfirm = () => {
    if (!text.trim() || !option) return;
    onConfirm(text.trim(), option);
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">오늘 정해야 할 일이 있나요?</h2>
        <p className="text-sm text-gray-500">결정 사항을 알려주고 나의 선택을 표현해보세요</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium">어떤 결정인가요?</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="예: 새 직장으로 옮겨야 할까?"
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={4}
        />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium">지금 기분은?</label>
        <div className="grid grid-cols-2 gap-2">
          {(['yes', 'no', 'maybe', 'later'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setOption(opt)}
              className={`p-3 rounded-lg border-2 transition font-medium text-sm ${
                option === opt
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {opt === 'yes' && '그래, 하자'}
              {opt === 'no' && '아니야, 말자'}
              {opt === 'maybe' && '모르겠는데'}
              {opt === 'later' && '나중에 생각해'}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={!text.trim() || !option || loading}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
      >
        {loading ? '생성 중...' : '카드 뽑기'}
      </button>
    </div>
  );
}
