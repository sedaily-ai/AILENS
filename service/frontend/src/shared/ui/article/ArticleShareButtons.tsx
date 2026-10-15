'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link as LinkIcon } from 'lucide-react';
import {
  FacebookIcon,
  TwitterIcon,
  LinkedinIcon,
} from '@/shared/ui/icons/SocialShareIcons';

// 기사 공유 버튼 행. lens/[slug]/LensViewClient.tsx와 letters/[id]/LetterDetailClient.tsx가 공유한다.
// 같은 링크 복사는 한 곳에 두고, 외부 서비스 공유는 펼쳐서 선택한다.
export function ArticleShareButtons({ title, url, showCopy = true }: { title: string; url: string; showCopy?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleCopyLink = useCallback(async () => {
    setError('');
    setCopied(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('링크를 복사하지 못했어요. 브라우저의 클립보드 권한을 확인한 뒤 다시 시도해 주세요.');
    }
  }, [url]);

  const handleShare = useCallback((platform: 'facebook' | 'twitter' | 'linkedin') => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const shareUrl =
      platform === 'facebook' ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` :
      platform === 'twitter' ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}` :
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    setError('');
    try {
      if (!window.open(shareUrl, '_blank', 'width=600,height=400')) {
        setError('공유 창을 열지 못했어요. 팝업 허용을 확인하거나 링크 복사를 이용해 주세요.');
      }
    } catch {
      setError('공유 창을 열지 못했어요. 링크 복사를 이용해 주세요.');
    }
  }, [url, title]);

  const btnCls = 'text-gray-400 hover:text-gray-900 transition-colors';

  return (
    <div className="flex flex-wrap items-center" style={{ gap: 12 }}>
      {showCopy && <button
        type="button"
        onClick={handleCopyLink}
        className={`inline-flex items-center gap-1 ${copied ? 'transition-colors' : btnCls}`}
        style={copied ? { color: '#059669' } : undefined}
        aria-label="링크 복사"
        title={copied ? '복사됨' : '링크 복사'}
      >
        {copied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
        <span className="text-[12px]">링크 복사</span>
      </button>}
      <details className="text-[12px] text-gray-500">
        <summary className="cursor-pointer py-2">다른 곳에 공유</summary>
        <div className="flex items-center py-2" style={{ gap: 16 }}>
          <button type="button" onClick={() => handleShare('facebook')} className={btnCls} aria-label="페이스북에 공유" title="Facebook"><FacebookIcon className="w-4 h-4" /></button>
          <button type="button" onClick={() => handleShare('twitter')} className={btnCls} aria-label="X(트위터)에 공유" title="Twitter"><TwitterIcon className="w-4 h-4" /></button>
          <button type="button" onClick={() => handleShare('linkedin')} className={btnCls} aria-label="링크드인에 공유" title="LinkedIn"><LinkedinIcon className="w-4 h-4" /></button>
        </div>
      </details>
      {error && <p role="alert" className="w-full text-[12px] text-red-700">{error}</p>}
      {copied && createPortal(
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium whitespace-nowrap text-white shadow-lg"
        >
          링크 복사
        </div>,
        document.body,
      )}
    </div>
  );
}
