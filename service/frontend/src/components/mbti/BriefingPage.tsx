import { useState, useRef, useEffect, useCallback } from "react";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";

const ELEVENLABS_API_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ?? '';
const CHAT_API_URL = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/chat';

const voiceIds: Record<MbtiGroupId, string> = {
  NT: "pqHfZKP75CvOlQylNhV4", // Bill
  NF: "EXAVITQu4vr4xnSDxMaL", // Sarah
  ST: "onwK4e9ZLuTAKqWW03F9", // Daniel
  SF: "XB0fDUnXU5powFXDhCwa", // Charlotte
};

const editors: Record<MbtiGroupId, {
  name: string;
  image: string;
  greeting: string;
  color: string;
  bgClass: string;
}> = {
  NT: {
    name: "민철",
    image: "/editors/intj.webp",
    greeting: "안녕하세요. 민철이에요. 오늘 뉴스에 대해 얘기해볼까요?",
    color: "#3b82f6",
    bgClass: "from-slate-900 via-slate-800 to-blue-900",
  },
  NF: {
    name: "하은",
    image: "/editors/infp.webp",
    greeting: "안녕하세요, 하은이에요. 오늘 어떤 뉴스가 궁금하세요?",
    color: "#8b5cf6",
    bgClass: "from-violet-950 via-purple-900 to-fuchsia-900",
  },
  ST: {
    name: "준서",
    image: "/editors/istj.webp",
    greeting: "준서입니다. 오늘 뉴스 브리핑 시작하겠습니다.",
    color: "#22c55e",
    bgClass: "from-emerald-950 via-emerald-900 to-teal-900",
  },
  SF: {
    name: "소율",
    image: "/editors/esfp.webp",
    greeting: "안녕! 소율이야. 오늘 뉴스 같이 볼까?",
    color: "#f97316",
    bgClass: "from-orange-950 via-orange-900 to-amber-800",
  },
};

interface Props {
  groupId: MbtiGroupId;
  onFinish: () => void;
  onBack: () => void;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function BriefingPage({ groupId, onFinish, onBack }: Props) {
  const editor = editors[groupId];
  const voiceId = voiceIds[groupId];

  // Display states
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userText, setUserText] = useState("");
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const typeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const hasGreetedRef = useRef(false);

  // Cleanup
  useEffect(() => {
    return () => {
      stopAudio();
      stopTyping();
      stopListening();
    };
  }, []);

  // Initial greeting
  useEffect(() => {
    if (!hasGreetedRef.current) {
      hasGreetedRef.current = true;
      speakAndType(editor.greeting);
    }
  }, [editor.greeting]);

  const stopAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {}
      currentSourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const stopTyping = useCallback(() => {
    if (typeIntervalRef.current) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    setIsTyping(false);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // TTS with ElevenLabs
  const speakAndType = async (text: string) => {
    stopAudio();
    stopTyping();
    setDisplayText("");
    setIsTyping(true);
    setIsSpeaking(true);

    try {
      // Start TTS
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) throw new Error("TTS failed");

      const arrayBuffer = await response.arrayBuffer();

      // Create AudioContext if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 1;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      currentSourceRef.current = source;

      // Typing animation synced with audio
      const duration = audioBuffer.duration * 1000;
      const charDelay = duration / text.length;
      let charIndex = 0;

      typeIntervalRef.current = setInterval(() => {
        if (charIndex < text.length) {
          setDisplayText(text.slice(0, charIndex + 1));
          charIndex++;
        } else {
          stopTyping();
        }
      }, charDelay);

      source.onended = () => {
        setIsSpeaking(false);
        currentSourceRef.current = null;
      };

      source.start();
    } catch (error) {
      console.error("TTS error:", error);
      // Fallback: just show text
      setDisplayText(text);
      setIsTyping(false);
      setIsSpeaking(false);
    }
  };

  // Speech Recognition
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    stopAudio();
    stopTyping();

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;

    // `recognition.onend` previously read `userText` from the closure, which
    // captures whatever the state was at handler-attach time (= empty string).
    // Track the latest transcript locally so the recognizer always sends the
    // freshest value when speech recognition ends.
    let latestTranscript = "";

    recognition.onstart = () => {
      setIsListening(true);
      setUserText("");
      latestTranscript = "";
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      latestTranscript = transcript;
      setUserText(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      const final = latestTranscript.trim();
      if (final) {
        sendMessage(final);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Send message to AI
  const sendMessage = async (message: string) => {
    const newHistory: ConversationMessage[] = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];
    setConversationHistory(newHistory);
    setUserText("");

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          mbti_group: groupId,
          conversation_history: conversationHistory,
        }),
      });

      // Previously this called .json() unconditionally — when the API
      // Gateway returns an HTML error page, .json() throws and the catch
      // block ran with no useful information. Check status first.
      if (!response.ok) {
        console.warn(`Briefing chat returned ${response.status}`);
        setConversationHistory([
          ...newHistory,
          { role: 'assistant', content: '죄송해요, 응답을 받지 못했어요.' }
        ]);
        return;
      }

      const data = await response.json();
      const aiResponse = data.response || "죄송해요, 응답을 받지 못했어요.";

      setConversationHistory([
        ...newHistory,
        { role: 'assistant', content: aiResponse }
      ]);

      // Speak the response
      speakAndType(aiResponse);
    } catch (error) {
      console.error("Chat API error:", error);
      speakAndType("죄송해요, 오류가 발생했어요. 다시 시도해주세요.");
    }
  };

  // MBTI 그룹별 퀵 질문
  const quickQuestionsMap: Record<MbtiGroupId, string[]> = {
    NT: ["오늘 핵심 뉴스 분석해줘", "시장 데이터 요약해줘", "투자 리스크 알려줘"],
    NF: ["오늘 뉴스의 의미 알려줘", "사회 변화 흐름 설명해줘", "사람들 반응이 어때?"],
    ST: ["오늘 뉴스 팩트 정리해줘", "핵심 경제 지표 알려줘", "실용 정보 요약해줘"],
    SF: ["오늘 뉴스 쉽게 알려줘", "내 생활에 영향 있는 거 뭐야?", "재밌는 뉴스 있어?"],
  };
  const quickQuestions = quickQuestionsMap[groupId];

  return (
    <div className={`fixed inset-0 bg-gradient-to-br ${editor.bgClass} z-50 flex flex-col`}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/20">
        <button onClick={onBack} className="text-white/70 hover:text-white p-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-white font-medium">{editor.name}과 대화</div>
        <button onClick={onFinish} className="text-white/70 hover:text-white text-sm px-3 py-1">
          뉴스 보기
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
        {/* Character */}
        <div className="relative mb-6">
          <div
            className={`w-40 h-40 rounded-full overflow-hidden border-4 ${isSpeaking ? 'animate-pulse' : ''}`}
            style={{ borderColor: editor.color }}
          >
            <img loading="lazy"
              src={editor.image}
              alt={editor.name}
              className="w-full h-full object-cover object-top"
            />
          </div>
          {isSpeaking && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>

        {/* Speech Bubble */}
        <div className="w-full max-w-md bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6">
          <p className="text-white text-lg leading-relaxed min-h-[80px]">
            {displayText}
            {isTyping && <span className="animate-pulse">|</span>}
          </p>
        </div>

        {/* User's Speech (when listening) */}
        {(isListening || userText) && (
          <div className="w-full max-w-md bg-white/5 rounded-xl p-4 mb-4">
            <p className="text-white/60 text-sm mb-1">내 말:</p>
            <p className="text-white">
              {userText || "듣고 있어요..."}
              {isListening && <span className="animate-pulse"> 🎤</span>}
            </p>
          </div>
        )}

        {/* Quick Questions */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={isSpeaking || isListening}
              className="px-4 py-2 bg-white/10 text-white/80 text-sm rounded-full hover:bg-white/20 disabled:opacity-50 transition-all"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="p-6 bg-black/20">
        <div className="flex items-center justify-center gap-4">
          {/* Stop Button */}
          {isSpeaking && (
            <button
              onClick={stopAudio}
              className="w-14 h-14 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          )}

          {/* Mic Button */}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isSpeaking}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-red-500 animate-pulse'
                : 'bg-white hover:scale-105'
            } disabled:opacity-50`}
          >
            <svg
              className={`w-8 h-8 ${isListening ? 'text-white' : 'text-gray-800'}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
            </svg>
          </button>

          {/* Replay Button */}
          {!isSpeaking && displayText && (
            <button
              onClick={() => speakAndType(displayText)}
              className="w-14 h-14 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-center text-white/40 text-sm mt-4">
          {isListening ? "말씀하세요..." : isSpeaking ? `${editor.name}이(가) 말하는 중...` : "마이크를 눌러 대화하세요"}
        </p>
      </div>
    </div>
  );
}
