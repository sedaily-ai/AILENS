'use client';

// 공유 바 — 카카오톡은 SDK 키(계정·도메인 등록 필요)가 없어 링크 복사로 대체하고, 인스타그램은 웹에서 직접 올리는 API가 없어 카드 이미지를 다운로드해 수동으로 올리는 방식을 쓴다.
// 인스타 스토리·카카오톡 사진 전송은 이미지만 지원하므로 PDF가 아닌 PNG를 유지한다.
// 카카오톡·인스타그램만 각자 브랜드 색을 쓰고, 그 외(공유하기)는 절제된 모노톤 라인 아이콘으로 구성한다.
import { useEffect, useState } from 'react';
import { generateShareCardBlob, type ShareCardData } from '@/features/timeline/lib/shareCard';
import { TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE, BORDER_CONTROL, FONT, SPACE, TOUCH_MIN } from '@/features/timeline/lib/tone';

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
  /** 카카오톡·인스타그램은 아이콘 자체가 원형 배지이므로 회색 테두리 원을 추가하지 않는다. */
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
        // 아이콘이 24px뿐이므로 패딩으로 히트 영역을 44px까지 넓힌다.
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
            // 컨트롤 경계는 대비 3:1 이상을 유지한다.
            border: `1px solid ${BORDER_CONTROL}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {/* 대비 4.83:1을 만족하는 회색, 스케일 안의 13px. */}
      <span style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {feedback ?? label}
      </span>
    </button>
  );
}

export function ShareBar({ cardData }: { cardData: ShareCardData }) {
  const [kakaoFeedback, setKakaoFeedback] = useState<string | null>(null);
  const [igFeedback, setIgFeedback] = useState<string | null>(null);
  // 브라우저 공유 지원 여부는 마운트 뒤에 정한다. 렌더 중에 navigator를 읽으면 서버(미지원)와 브라우저(지원)의 출력이 달라 하이드레이션 오류(#418)가 발생한다.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 기능 감지
    setCanNativeShare(typeof navigator.share === 'function');
  }, []);

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
      // 사용자가 공유 시트를 취소한 경우를 포함해 조용히 무시한다.
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
