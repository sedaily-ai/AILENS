'use client';

// 공유 바 — "인스타/카카오톡에 바이럴 공유" 요청(2026-08-17), 이어서 "카카오톡·
// 인스타그램 아이콘은 있어야 한다"는 후속 요청 반영. 카카오톡은 SDK 키(Kakao
// Developers 발급, 계정·도메인 등록 필요)가 없어 링크 복사로 대체하기로
// 사용자와 확정. 인스타그램은 웹에서 피드/스토리에 직접 올리는 API가 없어서
// (모바일 앱 인텐트만 가능) 카드 이미지를 다운로드해 수동으로 올리는 방식이
// 현실적인 최선 — 각 버튼을 눌렀을 때의 동작은 다르지만(링크 복사 vs 이미지
// 저장), 아이콘으로 "이걸 누르면 이 앱에 공유하기 좋다"는 의도를 명확히 준다.
//
// PDF 대신 PNG를 유지한다 — 인스타 스토리·카카오톡 사진 전송은 이미지만
// 되고 PDF는 안 된다(2026-08-17 확인, 사용자도 PNG 유지로 확정).
//
// 디자인: "토스나 나이키, 일본의 장인 감성" — 카카오톡·인스타그램만 각자
// 브랜드 색(노란 원, 인스타 그라디언트)을 쓰고, 그 외(공유하기)는 절제된
// 모노톤 라인아이콘으로 남겨 튀지 않게 했다. 이상한 이모지는 안 씀.
import { useState } from 'react';
import { generateShareCardBlob, type ShareCardData } from '../lib/shareCard';
import { TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE, BORDER_CONTROL, FONT, SPACE, TOUCH_MIN } from '../lib/tone';

function KakaoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#FEE500" />
      <path
        d="M12 6.2c-3.6 0-6.5 2.3-6.5 5.2 0 1.85 1.22 3.47 3.06 4.4-.13.47-.5 1.8-.57 2.08-.09.35.13.34.27.25.11-.07 1.78-1.2 2.5-1.7.4.06.82.09 1.24.09 3.6 0 6.5-2.32 6.5-5.12s-2.9-5.22-6.5-5.22z"
        fill="#391B1B"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="igGrad" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0" stopColor="#FFD776" />
          <stop offset="0.35" stopColor="#F6635C" />
          <stop offset="0.68" stopColor="#CC2A9F" />
          <stop offset="1" stopColor="#7B3FE4" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="24" height="24" rx="7" fill="url(#igGrad)" />
      <rect x="6" y="6" width="12" height="12" rx="3.4" stroke="#fff" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.2" stroke="#fff" strokeWidth="1.5" />
      <circle cx="16.1" cy="7.9" r="0.9" fill="#fff" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.6l7.4-4.2" />
      <path d="M8.3 13.4l7.4 4.2" />
    </svg>
  );
}

function ShareBarButton({
  icon,
  label,
  feedback,
  onClick,
  bare,
}: {
  icon: React.ReactNode;
  label: string;
  feedback: string | null;
  onClick: () => void;
  /** 카카오톡·인스타그램처럼 아이콘 자체가 이미 원형 배지라 회색 테두리 원을 또 안 씌운다. */
  bare?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        // 아이콘 24px 뿐이라 히트 영역을 패딩으로 44px 까지 넓힌다.
        minHeight: TOUCH_MIN,
        padding: `${SPACE.sm}px ${SPACE.sm}px`,
        color: TEXT_STRONG,
        minWidth: 72,
      }}
    >
      {bare ? (
        icon
      ) : (
        <span
          style={{
            width: TOUCH_MIN,
            height: TOUCH_MIN,
            borderRadius: '50%',
            // 컨트롤 경계는 3:1 을 넘겨야 한다 — 기존 #e6e0d4 는 1.24:1 이었다.
            border: `1px solid ${BORDER_CONTROL}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {/* 기존 #78716c 11.5px → 4.83:1 통과하는 회색 + 스케일 안의 13px. */}
      <span style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {feedback ?? label}
      </span>
    </button>
  );
}

export function ShareBar({ cardData }: { cardData: ShareCardData }) {
  const [kakaoFeedback, setKakaoFeedback] = useState<string | null>(null);
  const [igFeedback, setIgFeedback] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const flash = (setter: (v: string | null) => void, text: string) => {
    setter(text);
    setTimeout(() => setter(null), 1800);
  };

  const handleKakao = async () => {
    try {
      await navigator.clipboard.writeText(cardData.url);
      flash(setKakaoFeedback, '링크 복사됨');
    } catch {
      flash(setKakaoFeedback, '실패했어요');
    }
  };

  const handleInstagram = async () => {
    setIgFeedback('만드는 중…');
    const blob = await generateShareCardBlob(cardData);
    if (!blob) {
      flash(setIgFeedback, '실패했어요');
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `ailens-timemachine-${cardData.date}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    flash(setIgFeedback, '이미지 저장됨');
  };

  const handleNativeShare = async () => {
    try {
      const blob = await generateShareCardBlob(cardData);
      const shareData: ShareData = {
        title: 'AI LENS 타임머신',
        text: `${cardData.dateLabel}, 그날의 서울경제`,
        url: cardData.url,
      };
      if (blob) {
        const file = new File([blob], `ailens-timemachine-${cardData.date}.png`, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          shareData.files = [file];
        }
      }
      await navigator.share(shareData);
    } catch {
      // 사용자가 공유 시트를 취소한 경우 포함 — 조용히 무시.
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: SPACE.xl,
        marginTop: SPACE.xxl,
        paddingTop: SPACE.xl,
        borderTop: `1px solid ${BORDER_HAIRLINE}`,
      }}
    >
      <ShareBarButton bare icon={<KakaoIcon />} label="카카오톡" feedback={kakaoFeedback} onClick={handleKakao} />
      <ShareBarButton bare icon={<InstagramIcon />} label="인스타그램" feedback={igFeedback} onClick={handleInstagram} />
      {canNativeShare && (
        <ShareBarButton icon={<ShareIcon />} label="더보기" feedback={null} onClick={handleNativeShare} />
      )}
    </div>
  );
}
