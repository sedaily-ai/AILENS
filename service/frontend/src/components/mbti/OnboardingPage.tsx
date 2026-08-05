import { useState, useEffect, useRef } from "react";
import { groupToDefaultMbti, type MbtiGroupId } from "@/shared/data/mbtiGroups";
import { playEditorIntro, stopAudio } from "@/shared/lib/elevenlabs";

// 샘플 뉴스 - 같은 뉴스를 다르게 표현
const sampleNews = {
  original: "한국은행이 기준금리를 0.25%p 인하해 연 3.0%로 결정했다.",
  versions: {
    NT: "핵심 지표를 보죠. 기준금리 3.0%, 물가상승률 2.1%로 안정권 진입. GDP 성장률 전망은 2.4%에서 2.2%로 하향. 이 조합이 의미하는 건? 부동산과 주식시장에 유동성이 풀린다는 겁니다. 다음 수는 뻔해요.",
    NF: "금리가 내렸다는 건... 사실 경기가 어렵다는 신호이기도 해요. 대출 이자에 허덕이던 자영업자분들, 전세 걱정하던 신혼부부들... 이분들에게 조금이나마 숨통이 트이면 좋겠어요. 희망이 되었으면...",
    ST: "한국은행 금융통화위원회 발표. 기준금리 0.25%p 인하, 연 3.0% 확정. 2022년 이후 2년 만의 인하. 다음 금통위 4월 11일 개최 예정. 추가 인하 여부 주목.",
    SF: "헐 드디어 금리 내렸다!! 쉽게 말하면요, 은행에서 돈 빌릴 때 이자가 좀 줄어든다는 거예요! 대출 있는 분들 한시름 덜겠다~ 근데 예금 이자도 같이 줄어드니까 그건 좀 아쉽긴 해요 ㅎㅎ",
  },
};

// 에디터 정보 - 풀페이지 스크롤용
const editors = [
  {
    id: "NT" as MbtiGroupId,
    name: "민철",
    mbti: "INTJ",
    role: "전략 분석 에디터",
    tagline: "숫자 뒤에 숨은 진실을 찾습니다",
    desc: "감정에 휘둘리지 않아요. 차트와 데이터, 논리적 근거만이 제 무기입니다. 복잡한 경제 현상도 명쾌하게 분해해서 핵심만 전달해드릴게요. 시간 낭비 없이, 본질만.",
    image: "/editors/intj.webp",
    gradient: "from-slate-900 via-slate-800 to-blue-900",
    textColor: "text-white",
    accentColor: "text-blue-400",
    cardBg: "bg-slate-800/50",
  },
  {
    id: "NF" as MbtiGroupId,
    name: "하은",
    mbti: "INFP",
    role: "오피니언 에디터",
    tagline: "뉴스 속 사람들이 보여요...",
    desc: "숫자보다 그 뒤에 있는 사람들의 이야기가 먼저 눈에 들어와요. 금리가 오르면... 누군가는 밤잠을 설치겠죠? 조심스럽지만, 따뜻한 시선으로 뉴스를 읽어드릴게요.",
    image: "/editors/infp.webp",
    gradient: "from-violet-950 via-purple-900 to-fuchsia-900",
    textColor: "text-white",
    accentColor: "text-violet-300",
    cardBg: "bg-violet-800/50",
  },
  {
    id: "ST" as MbtiGroupId,
    name: "준서",
    mbti: "ISTJ",
    role: "팩트 큐레이터",
    tagline: "사실만 말합니다. , .",
    desc: "저는 의견을 덧붙이지 않습니다. 언제, 어디서, 무엇이 일어났는지. 검증된 사실과 정확한 수치만 전달합니다. 믿을 수 있는 뉴스, 그게 제 약속이에요.",
    image: "/editors/istj.webp",
    gradient: "from-emerald-950 via-emerald-900 to-teal-900",
    textColor: "text-white",
    accentColor: "text-emerald-300",
    cardBg: "bg-emerald-800/50",
  },
  {
    id: "SF" as MbtiGroupId,
    name: "소율",
    mbti: "ESFP",
    role: "트렌드 캐스터",
    tagline: "어려운 건 제가 씹어드릴게요!",
    desc: "경제 뉴스가 어렵다고요? 걱정 마세요! 제가 쉽고 재미있게 풀어드릴게요. 우리 일상이랑 어떻게 연결되는지, 친구한테 얘기하듯 편하게 전해드릴게요 ✨",
    image: "/editors/esfp.webp",
    gradient: "from-orange-950 via-orange-900 to-amber-800",
    textColor: "text-white",
    accentColor: "text-orange-300",
    cardBg: "bg-orange-800/50",
  },
];

interface Props {
  onSelectGroup: (group: MbtiGroupId) => void;
  onStartBriefing?: (group: MbtiGroupId) => void;
  onBack?: () => void;
}

export function OnboardingPage({ onSelectGroup, onStartBriefing, onBack }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 스크롤 감지로 현재 에디터 인덱스 업데이트 (부드러운 전환용)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const sectionHeight = window.innerHeight;
      const index = Math.round(scrollTop / sectionHeight);
      setCurrentIndex(Math.min(index, editors.length - 1));
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // 음성 재생 핸들러
  const handlePlayVoice = async (editorId: string) => {
    if (playingId === editorId) {
      // 현재 재생 중인 것 중지
      stopAudio();
      setPlayingId(null);
      return;
    }

    setIsLoading(true);
    setPlayingId(editorId);

    try {
      await playEditorIntro(editorId, () => {
        // 재생 완료 콜백
        setPlayingId(null);
      });
    } catch (error) {
      console.error('음성 재생 실패:', error);
      setPlayingId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (id: MbtiGroupId) => {
    stopAudio(); // 재생 중인 음성 정지
    setPlayingId(null);
    localStorage.setItem("mbti-group", id);
    // Round 5-G: persist 4-char MBTI for backend lazy profile-create.
    // Each editor's persona maps to a fixed 4-char (민철=INTJ, 하은=INFP,
    // 준서=ISTJ, 소율=ESFP) — selecting an editor adopts that MBTI.
    localStorage.setItem("mbti-type", groupToDefaultMbti[id]);
    onSelectGroup(id);
  };

  const scrollToIndex = (index: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({
      top: index * window.innerHeight,
      behavior: "smooth",
    });
  };

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-auto snap-y snap-mandatory"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {/* 뒤로가기 버튼 - 고정 */}
      {onBack && (
        <button
          onClick={onBack}
          className="fixed top-6 left-6 z-50 p-2 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 transition-colors"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 우측 네비게이션 도트 - 고정 */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
        {editors.map((editor, idx) => (
          <button
            key={editor.id}
            onClick={() => scrollToIndex(idx)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              currentIndex === idx
                ? "bg-white scale-125"
                : "bg-white/30 hover:bg-white/50"
            }`}
            title={editor.name}
          />
        ))}
      </div>

      {/* 에디터 섹션들 */}
      {editors.map((editor, idx) => (
        <section
          key={editor.id}
          className={`h-screen w-full snap-start snap-always bg-gradient-to-br ${editor.gradient} flex relative overflow-hidden`}
        >
          {/* 좌측: 캐릭터 이미지 (50%) */}
          <div className="w-1/2 h-full relative flex items-end justify-center overflow-hidden">
            {/* 배경 레이어 - 섹션 그라데이션과 동일 */}
            <div className={`absolute inset-0 bg-gradient-to-br ${editor.gradient}`} />

            {/* 이미지 - 진입 시 애니메이션 */}
            <img
              src={editor.image}
              alt={editor.name}
              className={`h-[115%] w-auto object-cover object-top absolute bottom-0 left-1/2 -translate-x-1/2 z-[1] transition-all duration-700 ease-out ${
                currentIndex === idx
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-105'
              }`}
              style={{
                filter: 'brightness(0.92) contrast(1.02)',
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 85%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 85%, transparent 100%)',
              }}
            />

            {/* 상단/좌측 그라데이션 오버레이 - 경계 제거 */}
            <div
              className="absolute inset-0 z-[2] pointer-events-none"
              style={{
                background: `
                  radial-gradient(ellipse 100% 60% at 0% 0%, rgba(0,0,0,0.7) 0%, transparent 45%),
                  radial-gradient(ellipse 80% 50% at 100% 0%, rgba(0,0,0,0.5) 0%, transparent 40%),
                  linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 12%, transparent 88%, rgba(0,0,0,0.3) 100%),
                  linear-gradient(to right, rgba(0,0,0,0.4) 0%, transparent 8%, transparent 100%)
                `
              }}
            />
          </div>

          {/* 우측: 정보 (50%) */}
          <div
            className={`w-1/2 h-full flex flex-col justify-center px-10 lg:px-16 transition-all duration-500 ease-out ${
              currentIndex === idx
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-8'
            }`}
          >
            {/* MBTI 뱃지 */}
            <div className={`text-[13px] font-medium ${editor.accentColor} mb-3`}>
              {editor.mbti} · {editor.role}
            </div>

            {/* 이름 */}
            <h1 className={`text-[44px] lg:text-[56px] font-bold ${editor.textColor} mb-1`}>
              {editor.name}
            </h1>

            {/* 태그라인 */}
            <p className={`text-[20px] lg:text-[26px] font-light ${editor.textColor} opacity-80 mb-4`}>
              {editor.tagline}
            </p>

            {/* 음성 재생 버튼 */}
            <button
              onClick={() => handlePlayVoice(editor.id)}
              disabled={isLoading && playingId !== editor.id}
              className={`flex items-center gap-2 px-4 py-2 rounded-full mb-6 transition-all duration-300 ${
                playingId === editor.id
                  ? 'bg-white/20 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
              }`}
            >
              {isLoading && playingId === editor.id ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : playingId === editor.id ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
              <span className="text-[13px] font-medium">
                {isLoading && playingId === editor.id ? '로딩 중...' : playingId === editor.id ? '정지' : `${editor.name} 목소리 듣기`}
              </span>
            </button>

            {/* 뉴스 샘플 카드 */}
            <div className={`${editor.cardBg} backdrop-blur-sm rounded-xl p-5 mb-6 max-w-lg border border-white/10`}>
              <div className="text-[11px] text-white/40 mb-2">같은 뉴스, 다른 시선</div>
              <div className="text-[11px] text-white/50 mb-3 line-clamp-1">
                원문: {sampleNews.original}
              </div>
              <div className={`text-[14px] ${editor.textColor} leading-relaxed`}>
                "{sampleNews.versions[editor.id]}"
              </div>
            </div>

            {/* 선택 버튼들 */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleSelect(editor.id)}
                className="px-6 py-3 bg-white text-gray-900 text-[14px] font-semibold rounded-full hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
              >
                📰 {editor.name}과 뉴스 보러가기
              </button>
              {onStartBriefing && (
                <button
                  onClick={() => {
                    stopAudio(); // 재생 중인 음성 정지
                    setPlayingId(null);
                    localStorage.setItem("mbti-group", editor.id);
                    // Round 5-G: see handleSelect — same 4-char persistence.
                    localStorage.setItem("mbti-type", editor.mbti);
                    onStartBriefing(editor.id);
                  }}
                  className={`px-6 py-3 ${editor.cardBg} text-white text-[14px] font-semibold rounded-full border border-white/30 hover:bg-white/20 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105`}
                >
                  💬 {editor.name}과 대화하기
                </button>
              )}
            </div>

            {/* 스크롤 힌트 (마지막이 아닐 때) */}
            {idx < editors.length - 1 && (
              <div className={`mt-10 ${editor.textColor} opacity-40 flex items-center gap-2`}>
                <span className="text-[11px]">스크롤하여 다음 에디터</span>
                <svg className="w-3 h-3 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
