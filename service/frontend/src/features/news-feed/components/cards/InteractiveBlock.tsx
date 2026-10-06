'use client';

import { useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

export interface InteractiveBlockData {
  mode: 'quiz' | 'poll';
  icon?: string;
  title?: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
}

// CMS body_html 안 <!--AI_QUIZ:{...}--> 마커를 실제 클릭 가능한 퀴즈/투표로 렌더.
// quiz: 정답 공개형(맞았는지 표시 + 해설). poll: 정답 없이 선택만 남기는 단순 투표.
export function InteractiveBlock({ data }: { data: InteractiveBlockData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const isQuiz = data.mode === 'quiz';
  const answered = selected !== null;

  const handleSelect = (i: number) => {
    if (answered) return;
    setSelected(i);
    trackEvent(isQuiz ? 'letter_quiz_answer' : 'letter_poll_vote', {
      question: data.question,
      option_index: i,
      ...(isQuiz ? { correct: i === data.correctIndex } : {}),
    });
  };

  return (
    <div
      style={{
        margin: '28px 0',
        padding: '20px 22px',
        borderRadius: 16,
        background: '#f9fafb',
        border: '1px solid #eef0f3',
      }}
    >
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 700,
          color: '#6b7280',
          letterSpacing: 0.2,
        }}
      >
        {data.icon ? `${data.icon} ` : ''}
        {data.title ?? (isQuiz ? '퀴즈' : '투표')}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 15.5, fontWeight: 600, color: '#111827', lineHeight: 1.55 }}>
        {data.question}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.options.map((opt, i) => {
          const isSelected = selected === i;
          const isCorrect = isQuiz && i === data.correctIndex;
          let borderColor = '#e5e7eb';
          let bg = '#ffffff';
          let textColor = '#374151';

          if (answered && isQuiz) {
            if (isCorrect) {
              borderColor = '#34d399';
              bg = '#ecfdf5';
              textColor = '#047857';
            } else if (isSelected) {
              borderColor = '#f87171';
              bg = '#fef2f2';
              textColor = '#b91c1c';
            }
          } else if (answered && isSelected) {
            borderColor = '#3182F6';
            bg = '#eff6ff';
            textColor = '#1d4ed8';
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(i)}
              disabled={answered}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '11px 14px',
                borderRadius: 10,
                border: `1.5px solid ${borderColor}`,
                background: bg,
                color: textColor,
                fontSize: 14.5,
                fontWeight: isSelected || (answered && isQuiz && isCorrect) ? 700 : 500,
                textAlign: 'left',
                cursor: answered ? 'default' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (answered) return;
                e.currentTarget.style.borderColor = '#3182F6';
                e.currentTarget.style.background = '#f5f9ff';
              }}
              onMouseLeave={(e) => {
                if (answered) return;
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.background = '#ffffff';
              }}
            >
              <span>{opt}</span>
              {answered && isQuiz && isCorrect && <span>✓</span>}
              {answered && isQuiz && isSelected && !isCorrect && <span>✗</span>}
              {answered && !isQuiz && isSelected && <span>✓</span>}
            </button>
          );
        })}
      </div>

      {answered && isQuiz && (
        <p
          style={{
            margin: '14px 0 0',
            padding: '12px 14px',
            borderRadius: 10,
            background: selected === data.correctIndex ? '#ecfdf5' : '#fffbeb',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: '#4b5563',
          }}
        >
          <strong style={{ color: selected === data.correctIndex ? '#047857' : '#b45309' }}>
            {selected === data.correctIndex ? '정답이에요! ' : '아쉬워요, 정답은 따로 있어요. '}
          </strong>
          {data.explanation}
        </p>
      )}

      {answered && !isQuiz && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#9ca3af' }}>투표해주셔서 고마워요.</p>
      )}
    </div>
  );
}
