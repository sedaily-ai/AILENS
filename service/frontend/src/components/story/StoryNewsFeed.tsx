import { useState, useEffect, useRef, useCallback } from "react";
import { X, Heart, ExternalLink, TrendingUp, Clock, Zap } from "lucide-react";
import { API_URL } from "@/shared/config/api";
import { Character2D } from "@/components/character/Character3D";

interface Article {
  news_id: string;
  title: string;
  sub_title: string;
  published_at: string;
  category: string;
  provider: string;
  image_url: string | null;
  content: string;
  original_link: string;
  versions?: Record<string, { title: string; body: string | string[] }>;
}

// 카테고리 매핑 - 더 세련된 색상
const categoryMap: Record<string, { label: string; color: string; gradient: string; icon: string }> = {
  "경제": { label: "경제", color: "#3B82F6", gradient: "from-blue-500 to-cyan-400", icon: "chart" },
  "정치": { label: "정치", color: "#EF4444", gradient: "from-red-500 to-orange-400", icon: "flag" },
  "사회": { label: "사회", color: "#10B981", gradient: "from-emerald-500 to-teal-400", icon: "users" },
  "국제": { label: "국제", color: "#8B5CF6", gradient: "from-violet-500 to-purple-400", icon: "globe" },
  "IT_과학": { label: "IT/과학", color: "#F59E0B", gradient: "from-amber-500 to-yellow-400", icon: "cpu" },
  "산업": { label: "산업", color: "#6366F1", gradient: "from-indigo-500 to-blue-400", icon: "building" },
  "문화": { label: "문화", color: "#EC4899", gradient: "from-pink-500 to-rose-400", icon: "palette" },
  "스포츠": { label: "스포츠", color: "#14B8A6", gradient: "from-teal-500 to-cyan-400", icon: "trophy" },
};

function getCategoryInfo(category: string) {
  return categoryMap[category] || { label: category, color: "#6B7280", gradient: "from-gray-500 to-gray-400", icon: "news" };
}

function getBodyText(body: string | string[]): string {
  const text = Array.isArray(body) ? body.join("\n\n") : body;
  const clean = text.replace(/\*\*/g, "").replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF\w\s.,!?]/g, "");
  const paragraphs = clean.split("\n\n").filter(p => p.trim());

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) continue;
    if (trimmed.startsWith("■")) continue;
    if (trimmed.includes("|")) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.length < 20) continue;
    return trimmed.slice(0, 120) + (trimmed.length > 120 ? "..." : "");
  }
  return "";
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

interface Props {
  onComplete?: (preferences: { liked: string[]; categories: string[] }) => void;
  onSwitchToFeed?: () => void;
}

const MAX_CARDS = 10;

export function StoryNewsFeed({ onComplete, onSwitchToFeed }: Props) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedArticles, setLikedArticles] = useState<string[]>([]);
  const [likedCategories, setLikedCategories] = useState<string[]>([]);
  const [showComplete, setShowComplete] = useState(false);

  // 스와이프 상태
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [cardEnter, setCardEnter] = useState(true);

  // 고양이 상태
  const [catMood, setCatMood] = useState<"waving" | "happy" | "excited" | "thinking" | "neutral">("waving");
  const [catMessage, setCatMessage] = useState("오늘 어떤 뉴스가 끌리는지 같이 볼까요?");
  const [catBounce, setCatBounce] = useState(false);
  const [catPosition, setCatPosition] = useState<"center" | "left" | "right">("center");
  const [catJump, setCatJump] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);

  // Fetch articles
  useEffect(() => {
    async function fetchArticles() {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

        const res = await fetch(`${API_URL}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "*",
            filters: {
              published_from: today,
              published_until: tomorrow,
            },
            page: 1,
            page_size: MAX_CARDS,
          }),
        });
        const data = await res.json();
        setArticles(data.articles?.slice(0, MAX_CARDS) || []);
      } catch (e) {
        console.error("Failed to fetch:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, []);

  // 카드 입장 애니메이션
  useEffect(() => {
    if (!loading && articles.length > 0) {
      setCardEnter(true);
      const timer = setTimeout(() => setCardEnter(false), 500);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, loading, articles.length]);

  // 고양이 메시지 업데이트
  const updateCatReaction = useCallback((action: "like" | "pass", category: string) => {
    setCatBounce(true);
    setCatJump(true);

    // 액션에 따라 고양이가 해당 방향으로 이동
    if (action === "like") {
      setCatPosition("right");
    } else {
      setCatPosition("left");
    }

    setTimeout(() => {
      setCatBounce(false);
      setCatJump(false);
      setCatPosition("center");
    }, 600);

    if (action === "like") {
      const likeCount = likedArticles.length + 1;
      const catLabel = getCategoryInfo(category).label;

      if (likeCount === 1) {
        setCatMood("happy");
        setCatMessage(`${catLabel}에 관심 있으시군요`);
      } else if (likeCount === 3) {
        setCatMood("excited");
        setCatMessage("취향이 점점 보여요");
      } else if (likeCount >= 5) {
        setCatMood("excited");
        setCatMessage("뉴스 취향이 확실하시네요");
      } else {
        setCatMood("happy");
        setCatMessage("좋아요, 기억해둘게요");
      }
    } else {
      setCatMood("neutral");
      const passMessages = [
        "다음 거 볼게요",
        "넘어갈게요",
        "다른 건 어때요?",
      ];
      setCatMessage(passMessages[Math.floor(Math.random() * passMessages.length)]);
    }
  }, [likedArticles.length]);

  // 좋아요 처리
  const handleLike = useCallback(() => {
    if (currentIndex >= articles.length) return;

    const article = articles[currentIndex];
    setLikedArticles(prev => [...prev, article.news_id]);
    setLikedCategories(prev => [...prev, article.category]);
    updateCatReaction("like", article.category);

    setSwipeDirection("right");
    setTimeout(() => {
      setSwipeDirection(null);
      if (currentIndex < articles.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setShowComplete(true);
      }
    }, 400);
  }, [currentIndex, articles, updateCatReaction]);

  // 패스 처리
  const handlePass = useCallback(() => {
    if (currentIndex >= articles.length) return;

    const article = articles[currentIndex];
    updateCatReaction("pass", article.category);

    setSwipeDirection("left");
    setTimeout(() => {
      setSwipeDirection(null);
      if (currentIndex < articles.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setShowComplete(true);
      }
    }, 400);
  }, [currentIndex, articles, updateCatReaction]);

  // 터치/마우스 핸들러
  const handleDragStart = (clientX: number) => {
    startX.current = clientX;
    setIsDragging(true);
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    const diff = clientX - startX.current;
    setDragX(diff);

    // 드래그에 따라 고양이가 따라 기울어짐
    if (diff > 50) {
      setCatMood("excited");
    } else if (diff < -50) {
      setCatMood("thinking");
    } else {
      setCatMood("waving");
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (dragX > 100) {
      handleLike();
    } else if (dragX < -100) {
      handlePass();
    }
    setDragX(0);
  };

  const onTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX);
  const onTouchMove = (e: React.TouchEvent) => handleDragMove(e.touches[0].clientX);
  const onTouchEnd = () => handleDragEnd();
  const onMouseDown = (e: React.MouseEvent) => handleDragStart(e.clientX);
  const onMouseMove = (e: React.MouseEvent) => handleDragMove(e.clientX);
  const onMouseUp = () => handleDragEnd();
  const onMouseLeave = () => { if (isDragging) handleDragEnd(); };

  // 완료 처리
  const handleCompleteClick = () => {
    const categoryCount: Record<string, number> = {};
    likedCategories.forEach(cat => {
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    onComplete?.({ liked: likedArticles, categories: topCategories });
  };

  // 로딩
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-32 h-32 mx-auto animate-float">
              <Character2D mood="thinking" size="large" />
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-20 h-3 bg-white/10 rounded-full blur-sm" />
          </div>
          <p className="text-white/70 mt-6 text-lg">뉴스를 가져오는 중...</p>
        </div>
      </div>
    );
  }

  // 뉴스 없음
  if (articles.length === 0) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center px-8">
          <Character2D mood="thinking" size="large" />
          <h2 className="text-xl font-bold text-white mt-6 mb-2">아직 오늘의 뉴스가 없어요</h2>
          <p className="text-white/60">잠시 후 다시 확인해주세요</p>
        </div>
      </div>
    );
  }

  // 완료 화면
  if (showComplete) {
    const categoryCount: Record<string, number> = {};
    likedCategories.forEach(cat => {
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    const topCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center animate-fadeIn">
          <div className="w-40 h-40 mx-auto animate-bounce-slow">
            <Character2D mood="excited" size="large" />
          </div>

          <h2 className="text-3xl font-bold text-white mt-6 mb-3">
            탐색 완료
          </h2>

          {likedArticles.length > 0 ? (
            <>
              <p className="text-white/70 text-lg mb-8">
                {likedArticles.length}개 뉴스에 관심을 보이셨네요
              </p>

              {topCategories.length > 0 && (
                <div className="bg-white/10 backdrop-blur rounded-3xl p-6 mb-8">
                  <p className="text-white/50 text-sm mb-4">관심 분야</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {topCategories.map(([cat]) => {
                      const info = getCategoryInfo(cat);
                      return (
                        <span
                          key={cat}
                          className={`px-5 py-2.5 rounded-full text-white font-medium bg-gradient-to-r ${info.gradient}`}
                        >
                          {info.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-white/70 text-lg mb-8">
              다음엔 더 맞는 뉴스를 찾아볼게요
            </p>
          )}

          <button
            onClick={handleCompleteClick}
            className="w-full py-4 bg-white text-slate-900 font-bold rounded-2xl hover:bg-white/90 transition-all text-lg"
          >
            맞춤 뉴스 보러가기
          </button>

          {onSwitchToFeed && (
            <button
              onClick={onSwitchToFeed}
              className="w-full py-3 text-white/50 mt-4 hover:text-white/70"
            >
              전체 뉴스 목록 보기
            </button>
          )}
        </div>
      </div>
    );
  }

  const article = articles[currentIndex];
  const catInfo = getCategoryInfo(article.category);
  const summary = article.versions?.SF
    ? getBodyText(article.versions.SF.body)
    : article.content?.slice(0, 120) || article.sub_title;
  const title = article.versions?.SF?.title || article.title;
  // 이모지 제거
  const cleanTitle = title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();

  // 카드 스타일
  const getCardStyle = () => {
    if (swipeDirection === "right") {
      return {
        transform: "translateX(150%) rotate(30deg) scale(0.9)",
        opacity: 0,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    if (swipeDirection === "left") {
      return {
        transform: "translateX(-150%) rotate(-30deg) scale(0.9)",
        opacity: 0,
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    if (cardEnter) {
      return {
        transform: "translateY(30px) scale(0.95)",
        opacity: 0,
        transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      };
    }
    return {
      transform: `translateX(${dragX}px) rotate(${dragX * 0.08}deg)`,
      transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    };
  };

  const likeOpacity = Math.min(Math.max(dragX / 100, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / 100, 0), 1);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/* 배경 장식 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-20 -left-20 w-60 h-60 bg-gradient-to-r ${catInfo.gradient} rounded-full blur-3xl opacity-20`} />
        <div className="absolute bottom-40 -right-20 w-80 h-80 bg-purple-500 rounded-full blur-3xl opacity-10" />
      </div>

      {/* 상단 진행 바 */}
      <div className="relative z-10 flex gap-1.5 p-4 pt-safe">
        {articles.map((_, idx) => (
          <div
            key={idx}
            className="h-1 flex-1 rounded-full overflow-hidden bg-white/20"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${catInfo.gradient}`}
              style={{ width: idx <= currentIndex ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* 메인 영역: 좌측 고양이 + 우측 카드 */}
      <div className="flex-1 flex flex-row items-center justify-center gap-6 px-4 pb-4 relative z-10">

        {/* 좌측: 고양이 영역 - 카드만큼 크게 */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center">
          {/* 고양이 캐릭터 - 카드 크기만큼 */}
          <div
            className="transition-transform duration-300 ease-out"
            style={{
              transform: isDragging
                ? `translateX(${Math.min(Math.max(dragX * 0.2, -30), 30)}px)`
                : catPosition === "left"
                  ? "translateX(-20px)"
                  : catPosition === "right"
                    ? "translateX(20px)"
                    : "translateX(0)"
            }}
          >
            <div className={`animate-cat-sway ${catBounce ? 'animate-bounce-cat' : ''}`}>
              <div className="w-64 h-64 md:w-80 md:h-80 relative">
                <Character2D mood={catMood} size="large" />
                {/* 그림자 */}
                <div
                  className="absolute -bottom-4 left-1/2 w-48 h-6 bg-black/20 rounded-full blur-md transition-all duration-300"
                  style={{
                    transform: `translateX(-50%) scaleX(${catJump ? 0.6 : 1})`,
                    opacity: catJump ? 0.3 : 0.5
                  }}
                />
              </div>
            </div>
          </div>

          {/* 말풍선 */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10 max-w-[220px] mt-4">
            <p className="text-white text-base leading-relaxed text-center">{catMessage}</p>
          </div>
        </div>

        {/* 우측: 카드 영역 */}
        <div
          className="flex-1 max-w-xs cursor-grab active:cursor-grabbing select-none"
          style={getCardStyle()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
        >
          {/* 메인 카드 */}
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden relative">
            {/* 좋아요/패스 오버레이 */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center z-20 pointer-events-none rounded-3xl"
              style={{ opacity: likeOpacity * 0.9 }}
            >
              <div className="text-white text-center">
                <Heart className="w-16 h-16 mx-auto fill-current" />
                <p className="text-2xl font-bold mt-2">관심있어요</p>
              </div>
            </div>
            <div
              className="absolute inset-0 bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center z-20 pointer-events-none rounded-3xl"
              style={{ opacity: passOpacity * 0.9 }}
            >
              <div className="text-white text-center">
                <X className="w-16 h-16 mx-auto" />
                <p className="text-2xl font-bold mt-2">패스</p>
              </div>
            </div>

            {/* 이미지 영역 */}
            <div className="relative h-52">
              {article.image_url ? (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${article.image_url})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                </div>
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${catInfo.gradient}`}>
                  <div className="absolute inset-0 bg-black/20" />
                </div>
              )}

              {/* 카테고리 뱃지 */}
              <div className="absolute top-4 left-4">
                <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold bg-gradient-to-r ${catInfo.gradient} shadow-lg`}>
                  <Zap className="w-4 h-4" />
                  {catInfo.label}
                </span>
              </div>

              {/* 시간 */}
              <div className="absolute top-4 right-4">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur text-white/90 text-xs">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(article.published_at)}
                </span>
              </div>

              {/* 인포그래픽 요소 */}
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-white text-xs">
                    <p className="opacity-70">카드</p>
                    <p className="font-bold">{currentIndex + 1} / {articles.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 콘텐츠 영역 */}
            <div className="p-6">
              {/* 제목 */}
              <h2 className="text-xl font-bold text-slate-900 leading-snug mb-3 line-clamp-2">
                {cleanTitle}
              </h2>

              {/* 요약 */}
              <p className="text-slate-600 text-sm leading-relaxed line-clamp-2 mb-4">
                {summary.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')}
              </p>

              {/* 하단 정보 */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">{article.provider || "서울경제"}</span>
                <a
                  href={article.original_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  원문보기 <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="relative z-10 p-6 pb-safe">
        <div className="max-w-sm mx-auto flex items-center justify-center gap-8">
          {/* 패스 버튼 */}
          <button
            onClick={handlePass}
            className="w-18 h-18 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all shadow-lg group"
            style={{ width: 72, height: 72 }}
          >
            <X className="w-8 h-8 group-hover:scale-110 transition-transform" />
          </button>

          {/* 좋아요 버튼 */}
          <button
            onClick={handleLike}
            className={`rounded-full bg-gradient-to-r ${catInfo.gradient} flex items-center justify-center text-white hover:scale-105 transition-all shadow-xl`}
            style={{ width: 80, height: 80 }}
          >
            <Heart className="w-9 h-9" />
          </button>
        </div>

        {/* 스와이프 힌트 */}
        {currentIndex === 0 && (
          <p className="text-center text-white/40 text-sm mt-4 animate-pulse">
            카드를 좌우로 밀거나 버튼을 눌러보세요
          </p>
        )}
      </div>

      <style>{`
        .pt-safe { padding-top: max(1rem, env(safe-area-inset-top)); }
        .pb-safe { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
        @keyframes bounce-cat {
          0%, 100% { transform: scale(1) translateY(0) rotate(0deg); }
          20% { transform: scale(1.2) translateY(-15px) rotate(-5deg); }
          40% { transform: scale(0.9) translateY(0) rotate(3deg); }
          60% { transform: scale(1.1) translateY(-8px) rotate(-3deg); }
          80% { transform: scale(0.95) translateY(-2px) rotate(2deg); }
        }
        @keyframes cat-sway {
          0%, 100% { transform: rotate(-3deg) translateY(0); }
          50% { transform: rotate(3deg) translateY(-3px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }
        .animate-bounce-cat { animation: bounce-cat 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important; }
        .animate-cat-sway { animation: cat-sway 1.5s ease-in-out infinite; }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
      `}</style>
    </div>
  );
}
