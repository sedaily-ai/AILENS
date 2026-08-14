'use client';

import { SAJU } from '@saju/shared/ui/sajuTokens';
import type { QuickReply } from '../lib/types';

export function QuickReplies({
  replies,
  onPick,
  disabled,
}: {
  replies: QuickReply[];
  onPick: (reply: QuickReply) => void;
  disabled?: boolean;
}) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-0.5 pb-2.5">
      {replies.map(r => (
        <button
          key={r.value || r.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(r)}
          className="rounded-full px-4 py-2 text-[13.5px] font-semibold transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ background: '#fff', border: `1px solid ${SAJU.line}`, color: SAJU.warmDeep }}
          onMouseEnter={e => {
            if (disabled) return;
            e.currentTarget.style.background = SAJU.warmSoft;
            e.currentTarget.style.borderColor = SAJU.warm;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#fff';
            e.currentTarget.style.borderColor = SAJU.line;
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
