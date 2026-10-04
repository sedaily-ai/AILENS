'use client';

import { useCallback, useState } from 'react';
import { Check, Link as LinkIcon } from 'lucide-react';
import {
  FacebookIcon,
  TwitterIcon,
  LinkedinIcon,
  KakaoIcon,
  InstagramIcon,
} from '@/shared/ui/icons/SocialShareIcons';

// 기사 공유 버튼 행 — lens/[slug]/LensViewClient.tsx의 원본을
// letters/[id]/LetterDetailClient.tsx가 로컬 복제해 쓰던 걸 하나로
// 합쳤다(2026-08-18). 원래 로직·색·간격은 그대로, import 경로만 shared로.
//
// 카카오톡·인스타그램은 SDK/API가 없어 링크 복사로 대체한다(카카오는 JS
// SDK+앱 키 등록이 필요한데 레포에 없고, 인스타그램은 데스크톱 웹에 임의
// 링크를 피드/스토리로 보내는 공식 API 자체가 없다 — 앱 인텐트만 가능).
// features/timeline/components/ShareBar.tsx가 이미 같은 결론을 낸 선례를
// 따른다.
export function ArticleShareButtons({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const [kakaoCopied, setKakaoCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);

  const copyTo = useCallback(async (setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(url);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // 클립보드 권한이 막힌 브라우저 — 조용히 무시.
    }
  }, [url]);

  const handleCopyLink = useCallback(() => copyTo(setCopied), [copyTo]);
  const handleKakao = useCallback(() => copyTo(setKakaoCopied), [copyTo]);
  const handleInstagram = useCallback(() => copyTo(setIgCopied), [copyTo]);

  const handleShare = useCallback((platform: 'facebook' | 'twitter' | 'linkedin') => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const shareUrl =
      platform === 'facebook' ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` :
      platform === 'twitter' ? `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}` :
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    window.open(shareUrl, '_blank', 'width=600,height=400');
  }, [url, title]);

  const btnCls = 'text-gray-400 hover:text-gray-900 transition-colors';

  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <button type="button" onClick={handleKakao} className={kakaoCopied ? 'transition-colors' : btnCls} style={kakaoCopied ? { color: '#059669' } : undefined} aria-label="카카오톡 공유 (링크 복사)" title={kakaoCopied ? '복사됨' : '카카오톡 (링크 복사)'}>
        {kakaoCopied ? <Check className="w-4 h-4" /> : <KakaoIcon className="w-4 h-4" />}
      </button>
      <button type="button" onClick={handleInstagram} className={igCopied ? 'transition-colors' : btnCls} style={igCopied ? { color: '#059669' } : undefined} aria-label="인스타그램 공유 (링크 복사)" title={igCopied ? '복사됨' : '인스타그램 (링크 복사)'}>
        {igCopied ? <Check className="w-4 h-4" /> : <InstagramIcon className="w-4 h-4" />}
      </button>
      <button type="button" onClick={() => handleShare('facebook')} className={btnCls} aria-label="페이스북에 공유" title="Facebook">
        <FacebookIcon className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => handleShare('twitter')} className={btnCls} aria-label="X(트위터)에 공유" title="Twitter">
        <TwitterIcon className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => handleShare('linkedin')} className={btnCls} aria-label="링크드인에 공유" title="LinkedIn">
        <LinkedinIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={handleCopyLink}
        className={copied ? 'transition-colors' : btnCls}
        style={copied ? { color: '#059669' } : undefined}
        aria-label="링크 복사"
        title={copied ? '복사됨' : '링크 복사'}
      >
        {copied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
      </button>
    </div>
  );
}
