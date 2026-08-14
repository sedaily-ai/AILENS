'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles } from 'lucide-react';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import type { ChatMessage } from '../lib/types';

/** 글자당 타이핑 속도(ms) */
export const TYPE_SPEED = 24;

/** onTyped: 이 말풍선이 다 표시되면(타자기 완료 / 마크다운 등장 직후) 1회 호출 */
export function ChatBubble({ message, onTyped }: { message: ChatMessage; onTyped?: () => void }) {
  const isBot = message.role === 'bot';
  // 봇의 일반 텍스트만 타자기 효과. 마크다운 답변·내 말풍선은 즉시 표시.
  const typewriter = isBot && !message.markdown;
  const shown = useTypewriter(message.text, typewriter);
  const typing = typewriter && shown.length < message.text.length;

  // 완료 알림(1회): 타자기는 마지막 글자 후, 마크다운은 등장 애니메이션 직후
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current || !onTyped) return;
    if (typewriter) {
      if (!typing) { doneRef.current = true; onTyped(); }
    } else {
      const id = window.setTimeout(() => { doneRef.current = true; onTyped(); }, 380);
      return () => window.clearTimeout(id);
    }
  }, [typing, typewriter, onTyped]);

  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} items-end gap-1.5 mb-2`}>
      {isBot && (
        <span
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: SAJU.warmSoft, color: SAJU.warmDeep }}
          aria-hidden
        >
          <Sparkles size={13} strokeWidth={2.2} />
        </span>
      )}
      <div
        className={`${isBot ? 'chat-in-bot' : 'chat-in-user'} max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed break-words`}
        style={
          isBot
            ? { background: 'rgba(255,255,255,0.96)', border: `1px solid ${SAJU.warm}33`, color: SAJU.ink }
            : { background: SAJU.warmDeep, color: '#fff' }
        }
      >
        {message.markdown ? (
          <div className="chat-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
        ) : (
          <>
            {shown}
            {typing && <span className="chat-caret" style={{ background: isBot ? SAJU.inkSub : '#fff' }} />}
          </>
        )}
      </div>
    </div>
  );
}

/** full 문자열을 한 글자씩 드러냄. 메시지는 id 로 keying 되어 인스턴스마다 full 이 고정. */
function useTypewriter(full: string, enabled: boolean): string {
  const [shown, setShown] = useState(() => (enabled ? '' : full));
  useEffect(() => {
    if (!enabled) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, TYPE_SPEED);
    return () => window.clearInterval(id);
  }, [full, enabled]);
  return shown;
}
