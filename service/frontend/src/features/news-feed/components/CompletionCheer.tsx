'use client';

// MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) 이후 단일 명의('AI LENS')로 고정.
// 이전엔 selectedGroup(NT/NF/ST/SF) 별로 다른 캐릭터·멘트를 보여줬지만, 이제
// 유일한 호출부(LetterDetailClient.tsx)가 그룹 정보를 넘길 수 없어 prop 자체를
// 없애고 톤을 합친 메시지 하나로 통일했다.
const CHEER = {
  avatar: '/lens.png',
  accent: '#111827',
  soft: '#f3f4f6',
  message: '오늘도 함께 챙겨봤네요! 내일 또 새로운 이야기를 가져올게요.',
};

export function CompletionCheer() {
  return (
    <section
      style={{
        maxWidth: 720,
        margin: '40px auto 0',
        padding: 'clamp(24px, 5vw, 36px) clamp(20px, 5vw, 32px)',
        background: CHEER.soft,
        borderRadius: 20,
        textAlign: 'center',
      }}
    >
      <div
        className="mx-auto rounded-full overflow-hidden mb-4"
        style={{
          width: 64,
          height: 64,
          background: '#ffffff',
          boxShadow: `0 8px 20px ${CHEER.accent}26`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" src={CHEER.avatar} alt="AI LENS" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <p
        className="text-gray-700"
        style={{
          fontFamily: '"Noto Serif KR", serif',
          fontSize: 'clamp(15px, 3.8vw, 16.5px)',
          lineHeight: 1.7,
          letterSpacing: '-0.01em',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        “{CHEER.message}”
      </p>
      <p
        className="mt-3"
        style={{
          fontSize: 12,
          color: CHEER.accent,
          fontWeight: 600,
          letterSpacing: '-0.005em',
        }}
      >
        — AI LENS
      </p>
    </section>
  );
}
