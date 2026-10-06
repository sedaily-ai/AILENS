'use client';

import { useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW } from '@/shared/constants/lensPerspectives';
import { nextQuickCheckQuestion, scoreQuickCheck, type QuickCheckAnswers, type QuickCheckChoice } from '../lib/mbtiCorner';

// 답을 고르면 바로 다음 질문으로 넘어간다. 축마다 앞 두 답이 갈릴 때만 보충 질문이 나온다(4~6문항).
// "건너뛰기"는 결과를 저장하지 않고 고르기 화면으로 돌아간다.
export function QuickCheck({ onComplete, onCancel }: { onComplete: (group: MbtiGroupId) => void; onCancel: () => void }) {
  const [answers, setAnswers] = useState<QuickCheckAnswers>({});
  const question = nextQuickCheckQuestion(answers);
  if (!question) return null;

  const step = Object.keys(answers).length + 1;
  const choose = (choice: QuickCheckChoice) => {
    const next = { ...answers, [question.id]: choice };
    const group = scoreQuickCheck(next);
    if (group) {
      onComplete(group);
      return;
    }
    setAnswers(next);
  };

  return (
    <section aria-labelledby="mbti-check-q">
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em' }}>
        간단 성향 체크 · 질문 {step}
      </p>
      <h2 id="mbti-check-q" style={{ margin: '10px 0 18px', fontSize: 20, fontWeight: 700, lineHeight: 1.45, color: '#0f172a', letterSpacing: '-0.02em' }}>
        {question.prompt}
      </h2>
      <div role="radiogroup" aria-labelledby="mbti-check-q" style={{ display: 'grid', gap: 10 }}>
        {(['a', 'b'] as const).map((c) => (
          <button
            key={`${question.id}-${c}`}
            type="button"
            role="radio"
            aria-checked={false}
            onClick={() => choose(c)}
            style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, border: LENS_CARD_BORDER, boxShadow: LENS_CARD_SHADOW, background: '#ffffff', fontSize: 15, lineHeight: 1.5, color: '#1f2937', cursor: 'pointer' }}
          >
            {question[c]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onCancel}
        style={{ marginTop: 16, padding: 0, background: 'none', border: 'none', color: '#64748b', fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}
      >
        건너뛰기
      </button>
    </section>
  );
}
