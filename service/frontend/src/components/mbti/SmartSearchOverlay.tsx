'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { chatbotWs } from '@/shared/lib/chatbotWs';
import {
  createRecognizer,
  type VoiceRecognizerOptions,
  synthesizeSpeech,
  playAudioUrl,
  stopVoiceAudio,
  sanitizeForTTS,
  makeSentenceFlusher,
} from '@/shared/lib/voiceChat';

// 챗봇 응답 마크다운 → 자연스러운 본문 렌더.
// 디자인 톤: 부드러운 위계, 헤더/볼드는 톤만 살짝 다르게.
const mdComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="my-2 leading-[1.7]" {...props} />
  ),
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mt-4 mb-2 font-semibold text-gray-900" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mt-4 mb-2 font-semibold text-gray-900" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mt-3 mb-1.5 font-semibold text-gray-900" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <span className="font-semibold text-gray-900" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => <em className="text-gray-700" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-2 ml-4 list-disc space-y-1" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-2 ml-4 list-decimal space-y-1" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-[1.65]" {...props} />,
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto rounded-xl bg-gray-50/60">
      <table className="w-full text-[13px] border-collapse" {...props} />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="text-gray-500" {...props} />
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="px-3 py-2 text-left font-medium" {...props} />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="px-3 py-2" {...props} />
  ),
  hr: () => <div className="my-4 h-px bg-gray-100" />,
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="my-3 border-l-2 border-gray-200 pl-3 text-gray-600" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[12.5px] text-gray-800 font-mono" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-violet-600 underline underline-offset-2 hover:text-violet-700" target="_blank" rel="noopener noreferrer" {...props} />
  ),
};

interface Props {
  open: boolean;
  onClose: () => void;
  selectedGroup: MbtiGroupId;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const editorAvatars: Record<MbtiGroupId, { name: string; role: string; avatar: string; tagline: string; accent: string; ring: string }> = {
  NT: { name: '민철', role: '전략 분석 에디터', avatar: '/editors/intj.webp', tagline: '데이터·논리로 단정적이고 간결하게', accent: 'from-blue-50/80 via-white to-indigo-50/60', ring: 'ring-blue-200/70' },
  NF: { name: '하은', role: '오피니언 에디터', avatar: '/editors/infp.webp', tagline: '의미와 본질을 함께 사유하는 톤', accent: 'from-rose-50/80 via-white to-pink-50/60', ring: 'ring-rose-200/70' },
  ST: { name: '준서', role: '팩트 큐레이터', avatar: '/editors/istj.webp', tagline: '군더더기 없이 필요한 정보만', accent: 'from-emerald-50/80 via-white to-teal-50/60', ring: 'ring-emerald-200/70' },
  SF: { name: '소율', role: '트렌드 캐스터', avatar: '/editors/esfp.webp', tagline: '친구에게 설명하듯 편한 대화체', accent: 'from-amber-50/80 via-white to-orange-50/60', ring: 'ring-amber-200/70' },
};

const personaOrder: MbtiGroupId[] = ['NT', 'NF', 'ST', 'SF'];

const aiSuggestions: Record<MbtiGroupId, string[]> = {
  NT: ['오늘 가장 주목할 만한 거시지표는?', '반도체 사이클 현재 단계 분석해줘', '연준 금리 결정 시나리오별 영향'],
  NF: ['요즘 사람들 어떤 이야기에 마음 쓰고 있어?', '세대 갈등 관련 뉴스 정리해줘', '오늘 가장 따뜻한 뉴스 알려줘'],
  ST: ['오늘 장 마감 핵심만 정리', '이번 주 실적 발표 일정', '환율 오늘 어떻게 움직였어?'],
  SF: ['요즘 핫한 트렌드 뭐 있어?', '오늘 단톡방 화제될 뉴스', 'MZ가 좋아할 만한 브랜드 소식'],
};

export function SmartSearchOverlay({ open, onClose, selectedGroup }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activePersona, setActivePersona] = useState<MbtiGroupId>(selectedGroup);
  // 기본 진입 = 음성 통화 모드 (베이스). 공공장소 등에선 텍스트 모드로 전환.
  const [mode, setMode] = useState<'text' | 'voice'>('voice');
  // 텍스트 모드도 응답을 TTS 로 재생 (페르소나가 채팅 출력한 거 말해줌).
  // 지하철 등 조용한 곳에서 음소거 필요 시 토글로 OFF — localStorage 기억.
  const [ttsMuted, setTtsMuted] = useState(false);
  // 음성 모드 내부 상태 (핸즈프리는 음성 모드 안의 옵션)
  const [handsFree, setHandsFree] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer> | null>(null);
  // 핸즈프리 ON 상태에서 응답 후 자동 재시작을 위한 ref (state stale 회피)
  const handsFreeRef = useRef(false);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => {
    setActivePersona(selectedGroup);
  }, [selectedGroup]);

  // 텍스트 모드 mute 상태 localStorage 복원/저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('chat-tts-muted');
    if (saved === '1') setTtsMuted(true);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat-tts-muted', ttsMuted ? '1' : '0');
    }
  }, [ttsMuted]);

  // 오버레이 열릴 때마다 기본 텍스트 모드로 리셋
  useEffect(() => {
    if (open) setMode('text');
  }, [open]);

  const editor = editorAvatars[activePersona];
  const suggestions = aiSuggestions[activePersona];

  const handleSelectPersona = (group: MbtiGroupId) => {
    if (group === activePersona) return;
    setActivePersona(group);
    if (messages.length > 0) setMessages([]);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInput('');
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // textarea 자동 높이
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleClose = () => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    stopVoiceAudio();
    setMessages([]);
    setInput('');
    setVoiceStatus('idle');
    setPartialTranscript('');
    setVoiceError(null);
    onClose();
  };

  // 오버레이 닫힐 때 (open=false) 또는 unmount 시 재생 중인 음성 강제 중단.
  // X 버튼이 아니라 외부에서 닫는 경우에도 대비.
  useEffect(() => {
    if (!open) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      stopVoiceAudio();
      setVoiceStatus('idle');
      setPartialTranscript('');
    }
    return () => {
      // 언마운트 시도 정리
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      stopVoiceAudio();
    };
  }, [open]);

  // Barge-in 용 turn cancel ref. speaking 중 사용자가 마이크 탭 → true 로
  // 세팅 → 남은 TTS sentence skip + 후속 chunk 무시.
  const turnAbortedRef = useRef(false);

  /** 음성 모드 전용: 텍스트 → 챗봇 → 응답 → TTS 재생 → (핸즈프리면) 다시 듣기 */
  const sendAiVoice = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      turnAbortedRef.current = false;
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
      const assistantId = `a-${Date.now()}`;
      setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
      setVoiceStatus('thinking');
      setPartialTranscript('');

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      // 스트리밍 TTS — parallel prefetch + serial 재생.
      // sentence 도착 즉시 fetch (병렬), 재생 queue 가 직렬로 소비.
      // 다음 sentence audio 가 앞 sentence 재생 도중에 미리 받아져 있어,
      // 재생 사이 휴지 ≈ 0 (자연 호흡 끊김 없음).
      let hadAnySentence = false;
      const audioQueue: Array<{ urlP: Promise<string>; cancelled: boolean }> = [];
      let playLoopRunning = false;

      const runPlayLoop = async () => {
        if (playLoopRunning) return;
        playLoopRunning = true;
        try {
          while (true) {
            if (turnAbortedRef.current) {
              // 남은 queue 정리 (받아진 URL 해제)
              for (const it of audioQueue) {
                it.cancelled = true;
                it.urlP.then((u) => URL.revokeObjectURL(u)).catch(() => {});
              }
              audioQueue.length = 0;
              break;
            }
            const item = audioQueue.shift();
            if (!item) {
              // queue 비었는데 아직 LLM stream 진행 중이면 대기, 끝났으면 종료
              if (flusherEnded) break;
              await new Promise((r) => setTimeout(r, 20));
              continue;
            }
            try {
              setVoiceStatus('speaking');
              const url = await item.urlP;
              if (turnAbortedRef.current || item.cancelled) {
                URL.revokeObjectURL(url);
                continue;
              }
              await playAudioUrl(url);
            } catch (e) {
              if (turnAbortedRef.current) break;
              const msg = e instanceof Error ? e.message : String(e);
              console.warn('streaming voice TTS fail', e);
              setVoiceError(`음성 재생 실패: ${msg}`);
            }
          }
        } finally {
          playLoopRunning = false;
        }
      };

      let flusherEnded = false;
      const speak = (sentence: string) => {
        if (turnAbortedRef.current) return;
        const clean = sanitizeForTTS(sentence);
        if (!clean) return;
        hadAnySentence = true;
        // 즉시 fetch (parallel) — 결과 mp3 URL Promise 만 queue 에 넣음
        const urlP = synthesizeSpeech(clean, activePersona).catch((e) => {
          console.warn('synthesizeSpeech fail', e);
          throw e;
        });
        audioQueue.push({ urlP, cancelled: false });
        runPlayLoop();
      };
      const flusher = makeSentenceFlusher(speak);

      try {
        await chatbotWs.sendMessage({
          message: trimmed,
          mbti_group: activePersona,
          conversation_history: history,
          onChunk: (chunk) => {
            if (turnAbortedRef.current) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
            );
            flusher.push(chunk);
          },
          onEnd: () => {
            if (turnAbortedRef.current) return;
            flusher.end();
            flusherEnded = true;
          },
          onError: (msg) => {
            if (turnAbortedRef.current) return;
            setVoiceError(msg);
          },
        });
      } catch (e) {
        if (turnAbortedRef.current) return;
        console.warn('voice chat ws failed', e);
        setVoiceError(e instanceof Error ? e.message : String(e));
      } finally {
        // chatbot stream 끝났다는 신호 — playLoop 가 queue 비고 나면 종료
        flusherEnded = true;
      }

      // playLoop 완료 대기 (queue 다 소비 + 마지막 audio 재생 완료)
      while (playLoopRunning) {
        await new Promise((r) => setTimeout(r, 30));
      }
      if (turnAbortedRef.current) return; // barge-in 으로 종료 — 새 listening 이 별도 트리거됨
      if (!hadAnySentence) {
        setVoiceStatus('idle');
        return;
      }

      setVoiceStatus('idle');

      // 핸즈프리 ON 이면 자동으로 다시 듣기 시작
      if (handsFreeRef.current) {
        window.setTimeout(() => startListening(), 300);
      }
    },
    // startListening 은 아래에서 선언되므로 의도적으로 deps 에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePersona, messages]
  );

  // HTMLAudioElement autoplay 정책 우회 — 사용자 user-gesture (마이크 클릭) 안에서
  // 짧은 silent audio 1회 play 해두면 같은 origin 의 후속 audio.play() 가
  // await 이후라도 NotAllowedError 없이 재생 가능. 한 번만 해두면 페이지 라이프타임 유효.
  const audioUnlockedRef = useRef(false);
  const unlockAudioPlayback = useCallback(() => {
    if (audioUnlockedRef.current) return;
    try {
      // 짧은 silent wav (44.1kHz mono, 1 sample). data URI 라 네트워크 X.
      const a = new Audio(
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      );
      a.muted = true;
      const p = a.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audioUnlockedRef.current = true;
          a.pause();
        }).catch(() => {/* unlock 실패해도 진행 — 다음 시도에서 다시 */});
      }
    } catch {/* noop */}
  }, []);

  const startListening = useCallback(() => {
    setVoiceError(null);
    unlockAudioPlayback();
    recognizerRef.current?.stop();
    const opts: VoiceRecognizerOptions = {
      onPartial: (t) => setPartialTranscript(t),
      onFinal: (t) => {
        setPartialTranscript('');
        recognizerRef.current?.stop();
        recognizerRef.current = null;
        sendAiVoice(t);
      },
      onError: (msg) => {
        setVoiceError(msg);
        setVoiceStatus('idle');
        recognizerRef.current = null;
      },
      onEnd: () => {
        recognizerRef.current = null;
        setVoiceStatus((s) => (s === 'listening' ? 'idle' : s));
      },
    };
    const recognizer = createRecognizer(opts);
    recognizerRef.current = recognizer;
    setVoiceStatus('listening');
    // createRecognizer 가 환경별 sync (Web Speech) or async (Transcribe) 반환
    void recognizer.start();
  }, [sendAiVoice]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setVoiceStatus('idle');
    setPartialTranscript('');
  }, []);

  /** 마이크 listening 상태에서 사용자가 ↑ 버튼 눌렀을 때 — 마지막 partial
   *  을 즉시 final 로 commit 해서 sendAiVoice 트리거 (silence 1.5s 안 기다림).
   *  partial 이 비어있으면 그냥 stop. */
  const submitCurrentPartial = useCallback(() => {
    const text = partialTranscript.trim();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setPartialTranscript('');
    if (text) {
      sendAiVoice(text);
    } else {
      setVoiceStatus('idle');
    }
  }, [partialTranscript, sendAiVoice]);

  /** AI 가 말하는 중 (speaking) 사용자가 마이크 탭 → 즉시 barge-in.
   *  TTS 멈추고 + 후속 chunk 무시 (turnAbortedRef) + 새 listening 시작. */
  const bargeIn = useCallback(() => {
    turnAbortedRef.current = true;
    stopVoiceAudio();
    setVoiceStatus('idle');
    // 즉시 listening 재개 — 사용자가 끼어들었으니 바로 받기 시작
    window.setTimeout(() => startListening(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 핸즈프리 ON 토글 시 즉시 듣기 시작 (idle 일 때만)
  useEffect(() => {
    if (handsFree && voiceStatus === 'idle' && mode === 'voice') {
      startListening();
    }
    if (!handsFree && voiceStatus === 'listening') {
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree]);

  // 모드 전환 시 마이크 정리 + 음성 출력 정지 (text 로 가면 voice 안 들려야)
  useEffect(() => {
    if (mode !== 'voice') {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      stopVoiceAudio();
      setVoiceStatus('idle');
      setPartialTranscript('');
    }
  }, [mode]);

  const sendAi = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    // 스트리밍 TTS — sentence 경계마다 즉시 Polly 호출 + serial 재생.
    // text 가 와다다 다 나온 후 한 번에 읽지 않고, 첫 문장부터 말하기 시작 → 자연 대화.
    let ttsTask: Promise<void> = Promise.resolve();
    const speak = (sentence: string) => {
      if (ttsMuted) return;
      const clean = sanitizeForTTS(sentence);
      if (!clean) return;
      ttsTask = ttsTask.then(async () => {
        try {
          const url = await synthesizeSpeech(clean, activePersona);
          await playAudioUrl(url);
        } catch (e) {
          console.warn('streaming TTS fail', e);
        }
      });
    };
    const flusher = makeSentenceFlusher(speak);

    try {
      await chatbotWs.sendMessage({
        message: text.trim(),
        mbti_group: activePersona,
        conversation_history: history,
        onStart: () => setIsLoading(false),
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
          );
          flusher.push(chunk);
        },
        onEnd: () => {
          flusher.end();
        },
        onError: (msg) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content || `오류: ${msg}` } : m
            )
          );
        },
      });
    } catch (err) {
      console.warn('chatbot ws failed', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || '연결이 잠시 불안정해요. 다시 시도해 주세요.' }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendAi(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendAi(input);
    }
  };

  if (!open) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-[searchIn_0.28s_cubic-bezier(0.16,1,0.3,1)]">
      <style>{`
        @keyframes searchIn {
          0% { opacity: 0; transform: translateY(-4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pop {
          0% { transform: scale(0.94); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* 헤더 — 닫기 + 모드 세그먼트 컨트롤 */}
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <button
          onClick={handleClose}
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* Segment control: 텍스트 ↔ 핸즈프리 */}
        <div className="flex items-center rounded-full bg-gray-100/80 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)_inset]">
          <button
            onClick={() => setMode('text')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
              mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            텍스트
          </button>
          <button
            onClick={() => setMode('voice')}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
              (mode as string) === 'voice' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
              <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
            </svg>
            음성
          </button>
        </div>
        {/* 텍스트 모드 mute 토글 — 응답 TTS 자동 재생 on/off (지하철 등) */}
        {mode === 'text' ? (
          <button
            onClick={() => setTtsMuted((v) => !v)}
            aria-label={ttsMuted ? '음소거 해제' : '음소거'}
            title={ttsMuted ? '응답 음성 OFF — 누르면 ON' : '응답 음성 ON — 누르면 OFF'}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              ttsMuted
                ? 'text-gray-400 hover:bg-gray-100'
                : 'text-violet-600 hover:bg-violet-50'
            }`}
          >
            {ttsMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l4-4m0 4l-4-4M9 9v6l5 4V5L9 9zM5 9H3v6h2l4 0V9H5z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M9 9v6l5 4V5L9 9zM5 9H3v6h2l4 0V9H5z" />
              </svg>
            )}
          </button>
        ) : (
          <div className="w-9" /> /* spacer */
        )}
      </header>

      {/* 메시지/빈 상태 영역 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 pb-40">
          {!hasMessages ? (
            <div className="pt-8">
              {/* 헤드라인 */}
              <div className="text-center mb-8">
                <p className="text-[11px] tracking-[0.25em] uppercase text-gray-400 mb-3">PICK YOUR EDITOR</p>
                <h1 className="text-[22px] font-semibold text-gray-900">누구와 이야기할까요?</h1>
                <p className="text-[13px] text-gray-500 mt-1.5">에디터마다 같은 뉴스도 다르게 풀어드려요</p>
              </div>

              {/* 페르소나 4 카드 — 활성 카드는 그라데이션 배경 + ring + 살짝 떠오름 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
                {personaOrder.map((g) => {
                  const p = editorAvatars[g];
                  const isActive = g === activePersona;
                  return (
                    <button
                      key={g}
                      onClick={() => handleSelectPersona(g)}
                      aria-pressed={isActive}
                      className={`group relative flex flex-col items-center px-3 py-5 rounded-2xl transition-all ${
                        isActive
                          ? `bg-gradient-to-b ${p.accent} ring-1 ${p.ring} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] -translate-y-0.5`
                          : 'bg-gray-50/70 hover:bg-white hover:shadow-[0_4px_14px_-8px_rgba(0,0,0,0.12)] hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="relative mb-3">
                        <img
                          src={p.avatar}
                          alt={p.name}
                          className={`w-16 h-16 rounded-full object-cover transition-transform ${
                            isActive ? 'scale-105' : 'group-hover:scale-105'
                          }`}
                        />
                        {isActive && (
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                            <svg className="w-3 h-3 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <span className={`text-[14px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                        {p.name}
                      </span>
                      <span className="mt-0.5 text-[10.5px] tracking-[0.12em] text-gray-400">{g}</span>
                    </button>
                  );
                })}
              </div>

              {/* 활성 페르소나 캡션 */}
              <div className="text-center mb-6" style={{ animation: 'pop 0.25s ease-out' }} key={activePersona}>
                <p className="text-[13px] text-gray-500">{editor.role}</p>
                <p className="text-[17px] font-semibold text-gray-900 mt-1">
                  {editor.name}이 답해드릴게요
                </p>
                <p className="text-[13px] text-gray-500 mt-1.5">{editor.tagline}</p>
              </div>

              {/* 추천 질문 */}
              <div className="space-y-2 max-w-[560px] mx-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendAi(s)}
                    className="group flex w-full items-center gap-3 rounded-2xl bg-gray-50/60 px-4 py-3.5 text-left text-[14px] text-gray-700 transition hover:bg-white hover:shadow-[0_4px_14px_-8px_rgba(0,0,0,0.12)]"
                  >
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-300 group-hover:text-violet-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="flex-1">{s}</span>
                    <span className="text-gray-300 group-hover:text-gray-500 transition">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // 채팅 모드 — 메시지 목록
            <div className="pt-6 space-y-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.role === 'assistant' && (
                    <img
                      src={editor.avatar}
                      alt={editor.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-1"
                    />
                  )}
                  <div
                    className={`max-w-[78%] text-[14.5px] ${
                      m.role === 'user'
                        ? 'rounded-2xl rounded-br-md bg-gray-900 px-4 py-3 text-white whitespace-pre-wrap leading-relaxed'
                        : 'text-gray-800'
                    }`}
                  >
                    {m.role === 'user' ? (
                      m.content
                    ) : m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {m.content}
                      </ReactMarkdown>
                    ) : (
                      <div className="flex gap-1 py-2">
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                        <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* 하단 입력바 — ChatGPT 식. 항상 노출, 테두리 없음, 그림자만 */}
      <footer className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/0 pt-8 pb-5">
        <div className="mx-auto w-full max-w-[760px] px-5">
          {/* 채팅 진행 중에도 페르소나 전환 가능한 작은 칩 */}
          {hasMessages && (
            <div className="mb-3 flex items-center justify-center gap-1.5">
              {personaOrder.map((g) => {
                const p = editorAvatars[g];
                const isActive = g === activePersona;
                return (
                  <button
                    key={g}
                    onClick={() => handleSelectPersona(g)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] transition ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80'
                    }`}
                  >
                    <img src={p.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                    <span className="font-medium">{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'text' ? (
            <form onSubmit={handleSubmit}>
              <div className="flex items-end gap-2 rounded-3xl bg-gray-100/80 px-4 py-2.5 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.1)] transition-all focus-within:bg-white focus-within:shadow-[0_8px_24px_-10px_rgba(0,0,0,0.14)]">
                <img
                  src={editor.avatar}
                  alt={editor.name}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 mb-1"
                />
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={`${editor.name}에게 물어보기…`}
                  className="flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-[1.5] text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  style={{ maxHeight: '160px' }}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition ${
                    input.trim() && !isLoading
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-300 text-white cursor-not-allowed'
                  }`}
                  aria-label="보내기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-gray-400">
                Enter로 보내기 · Shift+Enter 줄바꿈
              </p>
            </form>
          ) : (
            // 음성 모드 인라인 인터페이스 — 같은 라이트 톤·페이지 안에서 입력만 변형
            <div
              className={`rounded-3xl px-5 py-5 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.06)] transition-colors ${
                voiceStatus === 'listening'
                  ? 'bg-violet-50/70 ring-1 ring-violet-200/60'
                  : voiceStatus === 'speaking'
                  ? 'bg-amber-50/60 ring-1 ring-amber-200/60'
                  : voiceStatus === 'thinking'
                  ? 'bg-slate-50/80 ring-1 ring-slate-200/60'
                  : 'bg-gray-50/70'
              }`}
            >
              {/* 상태 + 핸즈프리 토글. 턴 주체 (사용자/AI) 가 한 눈에 보이도록
                  점 색 + 라벨로 구분. */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      voiceStatus === 'listening'
                        ? 'bg-violet-500 animate-pulse'
                        : voiceStatus === 'speaking'
                        ? 'bg-amber-500 animate-pulse'
                        : voiceStatus === 'thinking'
                        ? 'bg-slate-400 animate-pulse'
                        : 'bg-gray-300'
                    }`}
                  />
                  <span
                    className={
                      voiceStatus === 'listening'
                        ? 'text-violet-700 font-medium'
                        : voiceStatus === 'speaking'
                        ? 'text-amber-700 font-medium'
                        : voiceStatus === 'thinking'
                        ? 'text-slate-600 font-medium'
                        : 'text-gray-500'
                    }
                  >
                    {voiceStatus === 'listening'
                      ? '내 차례 · 듣고 있어요'
                      : voiceStatus === 'thinking'
                      ? `${editor.name} 차례 · 생각 중`
                      : voiceStatus === 'speaking'
                      ? `${editor.name} 차례 · 말하는 중 (탭해서 끼어들기)`
                      : handsFree
                      ? '핸즈프리 ON — 자동으로 듣고 답해요'
                      : '탭하여 말하기'}
                  </span>
                </div>
                {/* 핸즈프리 토글 — 음성 모드 안의 옵션 */}
                <button
                  onClick={() => setHandsFree((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition ${
                    handsFree
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-white text-gray-500 hover:text-gray-700 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                  }`}
                  aria-pressed={handsFree}
                >
                  <span
                    className={`block h-3.5 w-6 rounded-full transition relative ${
                      handsFree ? 'bg-violet-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all ${
                        handsFree ? 'left-3' : 'left-0.5'
                      }`}
                    />
                  </span>
                  핸즈프리
                </button>
              </div>

              {/* 사용자 partial transcript (말하는 중) */}
              {partialTranscript && (
                <p className="text-[14px] text-gray-700 text-center mb-4 leading-[1.55]">
                  {partialTranscript}
                  <span className="ml-0.5 inline-block w-0.5 h-4 bg-gray-400 align-middle animate-pulse" />
                </p>
              )}

              {/* 큰 메인 버튼 — 상태에 따라 동작·색·아이콘 모두 변경.
                  idle: 마이크(black)         · 누르면 listening 시작
                  listening: ↑ (violet)       · 누르면 즉시 전송
                  speaking: 정지 사각형(amber) · 누르면 barge-in (AI 멈춤 + listening)
                  thinking: 점 3개(slate, disabled) — 끼어들 단계 X */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => {
                    if (voiceStatus === 'idle') startListening();
                    else if (voiceStatus === 'listening') submitCurrentPartial();
                    else if (voiceStatus === 'speaking') bargeIn();
                    // thinking: disabled
                  }}
                  disabled={voiceStatus === 'thinking'}
                  aria-label={
                    voiceStatus === 'listening'
                      ? '탭하여 지금까지 말한 내용 전송'
                      : voiceStatus === 'speaking'
                      ? `${editor.name} 응답 중단하고 다시 말하기`
                      : voiceStatus === 'thinking'
                      ? '답변 생성 중'
                      : '탭하여 말하기'
                  }
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                    voiceStatus === 'listening'
                      ? 'bg-violet-600 text-white scale-105 shadow-[0_8px_24px_-6px_rgba(124,58,237,0.4)]'
                      : voiceStatus === 'speaking'
                      ? 'bg-amber-500 text-white scale-105 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.45)] hover:bg-amber-600'
                      : voiceStatus === 'thinking'
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.25)]'
                  }`}
                >
                  {voiceStatus === 'listening' && (
                    <span className="absolute inset-0 rounded-full bg-violet-400/40 animate-ping" />
                  )}
                  {voiceStatus === 'speaking' && (
                    <span className="absolute inset-0 rounded-full bg-amber-300/40 animate-ping" />
                  )}
                  {voiceStatus === 'listening' ? (
                    /* 위쪽 화살표 (전송) */
                    <svg
                      className="relative w-7 h-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  ) : voiceStatus === 'speaking' ? (
                    /* 정지 사각형 (끼어들기) */
                    <svg className="relative w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : voiceStatus === 'thinking' ? (
                    /* 점 3개 (생각 중) — tailwind animate-bounce + delay */
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  ) : (
                    /* 마이크 (idle) */
                    <svg className="relative w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                      <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
                    </svg>
                  )}
                </button>

                {/* 듣는 중 5막대 파동 */}
                {voiceStatus === 'listening' && (
                  <div className="mt-3 flex items-end gap-1 h-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="block w-1 rounded-full bg-violet-400"
                        style={{
                          height: '100%',
                          animation: `bar 0.9s ease-in-out ${i * 0.12}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {voiceError && (
                <p className="mt-3 text-center text-[12px] text-rose-500">{voiceError}</p>
              )}
              <style>{`
                @keyframes bar { 0%,100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
              `}</style>
            </div>
          )}
        </div>
      </footer>

    </div>
  );
}
