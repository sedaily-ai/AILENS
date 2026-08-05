import { useEffect, useState } from "react";

interface Props {
  mood?: "happy" | "excited" | "thinking" | "waving" | "sleeping" | "neutral";
  size?: "small" | "medium" | "large";
  className?: string;
}

// 고양이 캐릭터 이미지 매핑
const CAT_IMAGES: Record<string, string> = {
  waving: "/assets/character/cat-waving.png",
  happy: "/assets/character/cat-happy.png",
  excited: "/assets/character/cat-excited.png",
  thinking: "/assets/character/cat-thinking.png",
  sleeping: "/assets/character/cat-sleeping.png",
  neutral: "/assets/character/cat-neutral.png",
};

// 고양이 캐릭터 컴포넌트
export function Character2D({ mood = "neutral", size = "medium", className = "" }: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    small: "w-24 h-24",
    medium: "w-40 h-40",
    large: "w-56 h-56",
  };

  const imageSrc = CAT_IMAGES[mood] || CAT_IMAGES.neutral;

  // 이미지 프리로드
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);
    img.src = imageSrc;
  }, [imageSrc]);

  // 이미지 로드 실패 시 이모지 폴백
  if (imageError) {
    return <CharacterEmojiFallback mood={mood} size={size} className={className} />;
  }

  const animationClass =
    mood === "waving" ? "animate-cat-wave" :
    mood === "excited" ? "animate-cat-bounce" :
    mood === "thinking" ? "animate-cat-think" :
    mood === "sleeping" ? "animate-cat-sleep" :
    mood === "happy" ? "animate-cat-happy" :
    "animate-cat-idle";

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* 고양이 캐릭터 이미지 - 단독으로 크게 */}
      <div className={`w-full h-full flex items-center justify-center ${animationClass}`}>
        {imageLoaded && (
          <img
            src={imageSrc}
            alt={`고양이 - ${mood}`}
            className="w-full h-full object-contain drop-shadow-lg"
            style={{
              opacity: imageLoaded ? 1 : 0,
              transition: "opacity 0.3s ease",
              filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))",
            }}
          />
        )}
      </div>

      {/* 로딩 중일 때 */}
      {!imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* 반짝임 효과 */}
      {(mood === "excited" || mood === "happy" || mood === "waving") && imageLoaded && (
        <>
          <div className="absolute top-0 right-0 w-3 h-3 bg-yellow-300 rounded-full animate-ping opacity-75" />
          <div className="absolute top-2 -left-1 w-2 h-2 bg-orange-200 rounded-full animate-ping opacity-50" style={{ animationDelay: "0.3s" }} />
        </>
      )}

      {/* Zzz 효과 (sleeping일 때) */}
      {mood === "sleeping" && imageLoaded && (
        <div className="absolute top-0 right-0 text-sm text-blue-400 font-bold animate-bounce">
          z<span className="text-xs">z</span><span className="text-[10px]">z</span>
        </div>
      )}

      <style>{`
        @keyframes cat-wave {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes cat-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
        }
        @keyframes cat-think {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        @keyframes cat-sleep {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(0.97); }
        }
        @keyframes cat-happy {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25% { transform: scale(1.03) rotate(-2deg); }
          75% { transform: scale(1.03) rotate(2deg); }
        }
        @keyframes cat-idle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-cat-wave {
          animation: cat-wave 0.8s ease-in-out infinite;
        }
        .animate-cat-bounce {
          animation: cat-bounce 0.5s ease-in-out infinite;
        }
        .animate-cat-think {
          animation: cat-think 2s ease-in-out infinite;
        }
        .animate-cat-sleep {
          animation: cat-sleep 3s ease-in-out infinite;
        }
        .animate-cat-happy {
          animation: cat-happy 1s ease-in-out infinite;
        }
        .animate-cat-idle {
          animation: cat-idle 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// 이모지 폴백 (이미지 로드 실패 시)
function CharacterEmojiFallback({ mood, size, className }: Props) {
  const sizeClasses = {
    small: "w-20 h-20",
    medium: "w-28 h-28",
    large: "w-44 h-44",
  };

  const fontSizes = {
    small: "text-2xl",
    medium: "text-3xl",
    large: "text-5xl",
  };

  const emojiMap = {
    happy: "😺",
    excited: "😻",
    thinking: "🐱",
    waving: "🙀",
    sleeping: "😸",
    neutral: "🐱",
  };

  return (
    <div className={`relative ${sizeClasses[size || "medium"]} ${className}`}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-200 to-amber-100 shadow-lg flex items-center justify-center">
        <span className={`${fontSizes[size || "medium"]} animate-bounce`}>
          {emojiMap[mood || "neutral"]}
        </span>
      </div>
    </div>
  );
}

// 기본 export
export default Character2D;
