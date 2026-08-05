'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/shared/config/api';
import { personaMeta, type PersonaGroup, type VoiceContext } from '../lib/personaVoice';

interface Props {
  group: PersonaGroup;
  context: VoiceContext;
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const accentByGroup: Record<PersonaGroup, { ink: string; tint: string; userBg: string }> = {
  NT: { ink: '#5b21b6', tint: '#f5f3ff', userBg: '#111827' },
  NF: { ink: '#9f1239', tint: '#fff1f2', userBg: '#111827' },
  ST: { ink: '#065f46', tint: '#ecfdf5', userBg: '#111827' },
  SF: { ink: '#92400e', tint: '#fffbeb', userBg: '#111827' },
};

const suggestionsByGroup: Record<PersonaGroup, string[]> = {
  NT: ['오늘 결정 내려도 되는 날인가요?', '재물운 변수는 어떻게 풀이되나요?', '다음 대운 변화는 언제인가요?'],
  NF: ['오늘 마음 가는 일에 집중해도 될까요?', '연애 흐름은 어떻게 보이나요?', '요즘 무엇에 마음을 두면 좋을까요?'],
  ST: ['오늘 회의 잘 풀릴까요?', '이번 주 핵심 일 무엇?', '투자 결정 가능한 날인가요?'],
  SF: ['오늘 친구 만남 어때요?', '소비·쇼핑 운은요?', '주말 약속 잡아도 될까요?'],
};

export function SajuChat({ group, context }: Props) {
  const p = personaMeta[group];
  const c = accentByGroup[group];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 페르소나 전환 시 채팅 초기화
  useEffect(() => {
    setMessages([]);
  }, [group]);

  const buildSystemContext = () =>
    `당신은 사주 풀이를 도와주는 AI 에디터 "${p.name}"(${p.nickname})입니다. 톤: ${p.tone}.
사용자의 사주 컨텍스트:
- 일간: ${context.ilgan}(${context.ilganHanja}) — 오행 ${context.ilganElement}, ${context.seasonHint}생
- 신강도: ${context.strength}
- 격국: ${context.gyeokguk || '미구성'}
- 용신 후보: ${context.yongsin || '미정'}
- 오늘 일진: ${context.todayPillar} (${context.todaySipsung}, 12운성 ${context.todayUnsung})

답변 규칙:
- ${p.tone}을 그대로 유지할 것
- 사주 데이터를 근거로 답할 것 (없는 데이터 만들지 말 것)
- 3~5문장으로 간결하게
- "${p.name}이(가) 봐드리면..." 식의 1인칭 화법`;

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: t };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const sysContent = buildSystemContext();
      const augmented = [
        { role: 'system' as const, content: sysContent },
        ...history,
      ];

      const payload = JSON.stringify({
        message: t,
        mbti_group: group,
        conversation_history: augmented,
      });

      const res = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      // 운영에는 /api/chat/stream 라우트가 없다 — API Gateway HTTP API +
      // Lambda proxy 는 응답 스트리밍을 지원하지 않기 때문이다 (스트리밍은
      // Function URL 이나 ALB 가 필요). SSE 는 `main.py` 로컬 FastAPI 에서만
      // 동작한다. 폴백이 없던 탓에 운영에서 사주 챗은 시도마다 404 → catch →
      // "연결이 잠시 불안정해요" 만 띄우고 있었다 (chatbot Lambda 호출 0회로
      // 확인). 여기서 비스트리밍 /api/chat 으로 내려앉는다.
      if (!res.ok || !res.body) {
        const plain = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        if (!plain.ok) throw new Error('chat-unavailable');
        const data = await plain.json();
        const answer = (data?.response ?? '').trim();
        if (!answer) throw new Error('empty-answer');
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: answer },
        ]);
        setLoading(false);
        return;
      }

      const id = `a-${Date.now()}`;
      setMessages((prev) => [...prev, { id, role: 'assistant', content: '' }]);
      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.content || parsed.delta || '';
            if (delta) {
              setMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
              );
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: '연결이 잠시 불안정해요. 다시 시도해 주세요.',
        },
      ]);
      setLoading(false);
    }
  };

  return (
    <article
      className="bg-white border border-gray-100 rounded-[16px] p-5 md:p-6"
      style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
    >
      <header className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-50">
        <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm" />
        <div className="flex-1">
          <p className="text-[11px] font-bold tracking-[0.08em]" style={{ color: c.ink }}>
            더 궁금한 것
          </p>
          <p className="text-[14px] font-bold text-gray-900 mt-0.5">
            {p.name}에게 직접 물어보세요
          </p>
        </div>
      </header>

      {messages.length === 0 ? (
        <>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
            사주 컨텍스트를 알고 있는 {p.name}이(가) {p.tone} 톤으로 답해드려요.
          </p>
          <div className="space-y-2 mb-4">
            <p className="text-[11px] font-bold text-gray-400 tracking-[0.1em] uppercase">예시 질문</p>
            {suggestionsByGroup[group].map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="w-full text-left px-4 py-3 rounded-xl text-[13px] text-gray-700 transition-colors flex items-center gap-2 group"
                style={{ background: '#f9fafb' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = c.tint)}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f9fafb')}
              >
                <span className="flex-1">{s}</span>
                <span className="text-gray-300 group-hover:text-gray-600">→</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3 mb-4 max-h-[420px] overflow-y-auto pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <img src={p.avatar} alt={p.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
              )}
              <div
                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'rounded-br-md text-white'
                    : 'rounded-bl-md text-gray-800'
                }`}
                style={{
                  background: m.role === 'user' ? c.userBg : '#f9fafb',
                }}
              >
                {m.content || (m.role === 'assistant' && '...')}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5">
              <img src={p.avatar} alt={p.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-1" />
              <div className="px-3.5 py-2.5 bg-gray-50 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 pt-3 border-t border-gray-50"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`${p.name}에게 물어보기`}
          disabled={loading}
          className="flex-1 px-4 py-2.5 bg-gray-50 rounded-full text-[13px] focus:outline-none focus:bg-white transition-all"
          style={{ border: '1px solid transparent' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = c.ink;
            e.currentTarget.style.background = '#fff';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.background = '#f9fafb';
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 rounded-full text-[13px] font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          style={{ background: c.userBg }}
        >
          보내기
        </button>
      </form>
    </article>
  );
}
