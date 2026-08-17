'use client';

// 공유 바 — "인스타/카카오톡에 바이럴 공유" 요청(2026-08-17). 카카오톡은
// SDK 키(Kakao Developers 발급, 계정·도메인 등록 필요)가 없어 링크 복사로
// 대체하기로 사용자와 확정. 인스타그램은 웹에서 피드/스토리에 직접 올리는
// API가 없어서(모바일 앱 인텐트만 가능) 카드 이미지를 다운로드해 수동으로
// 올리는 방식이 현실적인 최선 — "복사하면, 혹은 다운로드하면 친구들에게
// 공유가 가능하도록" 요청과도 맞는다.
//
// 디자인: "토스나 나이키, 일본의 장인 감성" 요청 — 이상한 이모지 대신 얇은
// 스트로크 라인아이콘, 절제된 여백, 모노톤 + 액센트 하나. 이 코드베이스의
// "손그림 캐릭터 아이콘"(HandDrawnIcons)과는 다른 카테고리 — 저건 기능
// 브랜딩용, 이건 툴바 액션용이라 의도적으로 더 간결한 라인아이콘을 쓴다.
import { useState } from 'react';
import { generateShareCardBlob, type ShareCardData } from '../lib/shareCard';

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 14.5l5-5" />
      <path d="M8 16.5l-1.8 1.8a3.5 3.5 0 0 1-5-5L3 11.5a3.5 3.5 0 0 1 5-5" />
      <path d="M16 7.5l1.8-1.8a3.5 3.5 0 0 1 5 5L21 12.5a3.5 3.5 0 0 1-5 5" />
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
}: {
  icon: React.ReactNode;
  label: string;
  feedback: string | null;
  onClick: () => void;
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
        padding: '4px 8px',
        color: '#2a2622',
        minWidth: 72,
      }}
    >
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid #e6e0d4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color .15s, background .15s',
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 11.5, color: '#78716c', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {feedback ?? label}
      </span>
    </button>
  );
}

export function ShareBar({ cardData }: { cardData: ShareCardData }) {
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const flash = (setter: (v: string | null) => void, text: string) => {
    setter(text);
    setTimeout(() => setter(null), 1800);
  };

  const handleDownload = async () => {
    setDownloadFeedback('만드는 중…');
    const blob = await generateShareCardBlob(cardData);
    if (!blob) {
      flash(setDownloadFeedback, '실패했어요');
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
    flash(setDownloadFeedback, '저장됐어요');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(cardData.url);
      flash(setCopyFeedback, '복사됐어요');
    } catch {
      flash(setCopyFeedback, '실패했어요');
    }
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
        gap: 28,
        marginTop: 36,
        paddingTop: 28,
        borderTop: '1px solid #ece6d9',
      }}
    >
      <ShareBarButton icon={<DownloadIcon />} label="이미지 저장" feedback={downloadFeedback} onClick={handleDownload} />
      <ShareBarButton icon={<LinkIcon />} label="링크 복사" feedback={copyFeedback} onClick={handleCopyLink} />
      {canNativeShare && (
        <ShareBarButton icon={<ShareIcon />} label="공유하기" feedback={null} onClick={handleNativeShare} />
      )}
    </div>
  );
}
