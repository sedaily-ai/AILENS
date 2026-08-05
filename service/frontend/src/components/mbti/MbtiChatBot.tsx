

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

// API Configuration
import { API_URL } from '../../shared/config/api';
const CHAT_API_URL = `${API_URL}/api/chat`;
const CHAT_STREAM_API_URL = `${API_URL}/api/chat/stream`;

interface RecommendedArticle {
  news_id: string;
  title_ko: string;
  category: string;
  published_at: string;
  original_link: string;
  image_url?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  articles?: RecommendedArticle[];
}

interface MbtiChatBotProps {
  mbtiGroup?: 'NT' | 'NF' | 'ST' | 'SF';
  onMbtiChange?: (group: 'NT' | 'NF' | 'ST' | 'SF') => void;
}

// MBTI 그룹별 페르소나
const MBTI_PERSONAS = {
  NT: {
    name: '분석가',
    role: '논리와 전략으로 세상을 읽는 사람',
    greeting: '궁금한 거 있으면 핵심만 빠르게 정리해드릴게요.',
    style: '논리적이고 분석적',
    color: 'blue',
    emoji: '📊',
  },
  NF: {
    name: '이야기꾼',
    role: '의미와 가능성을 발견하는 사람',
    greeting: '오늘 어떤 이야기가 궁금하세요? 함께 생각해봐요.',
    style: '성찰적이고 따뜻한',
    color: 'purple',
    emoji: '💡',
  },
  ST: {
    name: '실용주의자',
    role: '사실과 경험을 중시하는 사람',
    greeting: '정확한 정보가 필요하시면 말씀하세요.',
    style: '정확하고 체계적',
    color: 'green',
    emoji: '📋',
  },
  SF: {
    name: '공감러',
    role: '사람과 순간을 소중히 여기는 사람',
    greeting: '뭐가 궁금하세요? 쉽게 설명해드릴게요 😊',
    style: '친근하고 공감적',
    color: 'orange',
    emoji: '💬',
  },
};

// MBTI 그룹별 색상
const GROUP_COLORS = {
  NT: {
    primary: 'bg-blue-500',
    light: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-200',
    hover: 'hover:bg-blue-600',
  },
  NF: {
    primary: 'bg-purple-500',
    light: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-200',
    hover: 'hover:bg-purple-600',
  },
  ST: {
    primary: 'bg-green-500',
    light: 'bg-green-50',
    text: 'text-green-600',
    border: 'border-green-200',
    hover: 'hover:bg-green-600',
  },
  SF: {
    primary: 'bg-orange-500',
    light: 'bg-orange-50',
    text: 'text-orange-600',
    border: 'border-orange-200',
    hover: 'hover:bg-orange-600',
  },
};

// MBTI 그룹별 퀵 액션 버튼
const QUICK_ACTIONS: Record<'NT' | 'NF' | 'ST' | 'SF', { label: string; query: string }[]> = {
  NT: [
    { label: '오늘 시장 핵심 데이터 분석해줘', query: '오늘 시장 핵심 데이터 분석해줘' },
    { label: '현재 주요 투자 리스크 요인은 뭐야?', query: '현재 주요 투자 리스크 요인은 뭐야?' },
    { label: '주목할 산업 트렌드 알려줘', query: '주목할 산업 트렌드 알려줘' },
  ],
  NF: [
    { label: '오늘 뉴스가 사회적으로 어떤 의미가 있어?', query: '오늘 뉴스가 사회적으로 어떤 의미가 있어?' },
    { label: '이 이슈에 대한 사람들 반응은 어때?', query: '이 이슈에 대한 사람들 반응은 어때?' },
    { label: '최근 사회 변화의 큰 흐름을 알려줘', query: '최근 사회 변화의 큰 흐름을 알려줘' },
  ],
  ST: [
    { label: '오늘 주요 뉴스 팩트 정리해줘', query: '오늘 주요 뉴스 팩트 정리해줘' },
    { label: '최근 핵심 경제 지표 알려줘', query: '최근 핵심 경제 지표 알려줘' },
    { label: '오늘 뉴스에서 실생활에 유용한 정보 알려줘', query: '오늘 뉴스에서 실생활에 유용한 정보 알려줘' },
  ],
  SF: [
    { label: '오늘 뉴스 쉽게 설명해줘', query: '오늘 뉴스 쉽게 설명해줘' },
    { label: '최근 뉴스가 내 일상에 어떤 영향이 있어?', query: '최근 뉴스가 내 일상에 어떤 영향이 있어?' },
    { label: '오늘 꼭 봐야 할 기사 추천해줘', query: '오늘 꼭 봐야 할 기사 추천해줘' },
  ],
};

const STORAGE_KEY = 'mbti-chatbot-messages';

function loadMessages(): Record<string, Message[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { NT: [], NF: [], ST: [], SF: [] };
    const parsed = JSON.parse(raw);
    // Restore Date objects
    for (const group of Object.keys(parsed)) {
      parsed[group] = parsed[group].map((m: Message) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    return parsed;
  } catch {
    return { NT: [], NF: [], ST: [], SF: [] };
  }
}

export function MbtiChatBot({ mbtiGroup = 'SF', onMbtiChange }: MbtiChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [messagesByGroup, setMessagesByGroup] = useState<Record<string, Message[]>>(loadMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentGroup, setCurrentGroup] = useState(mbtiGroup);

  useEffect(() => { setCurrentGroup(mbtiGroup); }, [mbtiGroup]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const persona = MBTI_PERSONAS[currentGroup];
  const colors = GROUP_COLORS[currentGroup];
  const messages = messagesByGroup[currentGroup];

  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesByGroup(prev => ({
      ...prev,
      [currentGroup]: typeof updater === 'function' ? updater(prev[currentGroup]) : updater,
    }));
  };

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesByGroup));
  }, [messagesByGroup]);

  // Show after delay
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `${persona.emoji} 안녕하세요! ${persona.name}이에요. ${persona.greeting}`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length, persona]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle MBTI group change — switch to separate conversation
  const handleGroupChange = (group: 'NT' | 'NF' | 'ST' | 'SF') => {
    if (group === currentGroup) return;
    setCurrentGroup(group);
    onMbtiChange?.(group);
  };

  // Send message with streaming support (falls back to non-streaming)
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const conversationHistory = messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({ role: m.role, content: m.content }));

    const requestBody = JSON.stringify({
      message: content.trim(),
      mbti_group: currentGroup,
      conversation_history: conversationHistory,
    });

    const assistantId = `assistant-${Date.now()}`;

    try {
      // Try streaming first
      const response = await fetch(CHAT_STREAM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      if (!response.ok || !response.body) {
        throw new Error('stream-unavailable');
      }

      // Create empty assistant message, then fill incrementally
      setMessages(prev => [...prev, {
        id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
      }]);
      setIsLoading(false);

      const reader = response.body.getReader();
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
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              setMessagesByGroup(prev => {
                const groupMsgs = prev[currentGroup];
                const last = groupMsgs[groupMsgs.length - 1];
                if (last?.id === assistantId) {
                  return {
                    ...prev,
                    [currentGroup]: [
                      ...groupMsgs.slice(0, -1),
                      { ...last, content: last.content + data.content },
                    ],
                  };
                }
                return prev;
              });
            } else if (data.type === 'articles' && data.articles?.length > 0) {
              setMessagesByGroup(prev => {
                const groupMsgs = prev[currentGroup];
                const last = groupMsgs[groupMsgs.length - 1];
                if (last?.id === assistantId) {
                  return {
                    ...prev,
                    [currentGroup]: [
                      ...groupMsgs.slice(0, -1),
                      { ...last, articles: data.articles },
                    ],
                  };
                }
                return prev;
              });
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (streamError) {
      // Fallback to non-streaming API
      try {
        const response = await fetch(CHAT_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();

        setMessages(prev => {
          // Remove empty streaming placeholder if exists
          const filtered = prev.filter(m => m.id !== assistantId);
          return [...filtered, {
            id: assistantId, role: 'assistant',
            content: data.response || '응답을 받지 못했어요.',
            timestamp: new Date(),
            articles: data.recommended_articles,
          }];
        });
      } catch (fallbackError) {
        console.error('Chat error:', fallbackError);
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== assistantId);
          return [...filtered, {
            id: `error-${Date.now()}`, role: 'assistant',
            content: '죄송해요, 오류가 발생했어요. 잠시 후 다시 시도해주세요!',
            timestamp: new Date(),
          }];
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <div
          className="fixed bottom-6 right-6 z-[45] group"
        >
          {/* Tooltip */}
          <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 ${colors.primary} text-white text-sm rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg`}>
            <span className="font-medium">{persona.emoji} {persona.name}</span>
            <span className="block text-xs opacity-80">AI 어시스턴트</span>
          </div>

          {/* Button */}
          <button
            onClick={() => setIsOpen(true)}
            className={`w-14 h-14 ${colors.primary} ${colors.hover} text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110`}
            aria-label="AI 어시스턴트 열기"
          >
            <Sparkles className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <>
        {/* Backdrop - 데스크톱에서 바깥 클릭 시 닫기 */}
        <div
          className="fixed inset-0 z-[59] max-md:hidden"
          onClick={() => setIsOpen(false)}
        />
        <div
          className="fixed bottom-24 right-6 z-[60] w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 max-md:w-full max-md:h-[100dvh] max-md:rounded-none max-md:top-0 max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:fixed max-md:z-[100]"
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 ${colors.primary} text-white`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-xl">{persona.emoji}</span>
              </div>
              <div>
                <h3 className="font-semibold text-sm">{persona.name}</h3>
                <p className="text-xs opacity-80">{persona.role}</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* MBTI Group Selector */}
          <div className="flex gap-1 p-2 bg-gray-50 border-b border-gray-100">
            {(['NT', 'NF', 'ST', 'SF'] as const).map((group) => (
              <button
                key={group}
                onClick={() => handleGroupChange(group)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  currentGroup === group
                    ? `${GROUP_COLORS[group].primary} text-white`
                    : `${GROUP_COLORS[group].light} ${GROUP_COLORS[group].text} hover:opacity-80`
                }`}
              >
                {MBTI_PERSONAS[group].name}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? `${colors.primary} text-white rounded-br-sm`
                      : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
                  }`}
                >
                  {message.content}
                </div>
                {message.articles && message.articles.length > 0 && (
                  <div className="mt-2 space-y-1.5 max-w-[85%]">
                    <p className="text-[11px] text-gray-400 px-1">관련 기사</p>
                    {message.articles.map((article) => (
                      <a
                        key={article.news_id}
                        href={article.original_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3 py-2 bg-white rounded-lg border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all text-left"
                      >
                        <p className="text-xs font-medium text-gray-800 line-clamp-2">{article.title_ko}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{article.category} · {article.published_at.slice(0, 10)}</p>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm border border-gray-100">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-3 py-2 bg-white border-t border-gray-100">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUICK_ACTIONS[currentGroup].map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.query)}
                  disabled={isLoading}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${colors.light} ${colors.text} hover:opacity-80 disabled:opacity-50`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="무엇이든 물어보세요..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
                style={{
                  // @ts-ignore
                  '--tw-ring-color': currentGroup === 'NT' ? '#3b82f6' : currentGroup === 'NF' ? '#8b5cf6' : currentGroup === 'ST' ? '#22c55e' : '#f97316'
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`w-10 h-10 ${colors.primary} ${colors.hover} text-white rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
        </>
      )}
    </>
  );
}
