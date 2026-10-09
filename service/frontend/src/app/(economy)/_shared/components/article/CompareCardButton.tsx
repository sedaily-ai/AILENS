'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, Layers, Link as LinkIcon, Share2, X } from 'lucide-react';
import { SITE_URL } from '@/shared/constants/site';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { ArticleShareButtons } from '@/shared/ui/article/ArticleShareButtons';

// 비교 카드(신청서 모듈 F) — 레터·웹툰·팟캐스트·영상의 첫 마디를 한 장에 모은 이미지를 보여 주고 저장·공유하게 한다.
// 이미지는 /card/{id}/story.png, 공유 링크는 /card/{id}(og:image = og.png)라서 카카오톡·X·페이스북 미리보기에 카드가 뜬다.
// block: 4형식 구획 끝의 안내 줄, inline: 좁은 화면 도구 줄의 작은 버튼.

const ACCENT = '#1d4ed8';

export function CompareCardButton({ articleId, title, date, variant = 'block' }: { articleId: string; title: string; date: string; variant?: 'block' | 'inline' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const show = () => {
    setOpen(true);
    trackEvent('compare_card_open', { article_id: articleId, placement: variant });
  };

  return (
    <>
      {variant === 'inline' ? (
        <button type="button" onClick={show} className="ccb-inline" aria-haspopup="dialog">
          <Layers size={14} aria-hidden />
          비교 카드
        </button>
      ) : (
        <div className="ccb-block">
          <div style={{ minWidth: 0 }}>
            <p className="ccb-title">네 형식을 한 장에 — 비교 카드</p>
            <p className="ccb-sub">형식마다 어떻게 시작하는지 모아 이미지로 저장하거나 링크로 공유해 보세요</p>
          </div>
          <button type="button" onClick={show} className="ccb-cta" aria-haspopup="dialog">
            <Layers size={16} aria-hidden />
            비교 카드 보기
          </button>
        </div>
      )}
      <style>{`
        .ccb-inline { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 1px solid #dbe3f4; background: #f5f8ff; color: ${ACCENT}; font-size: 12.5px; font-weight: 700; cursor: pointer; }
        .ccb-inline:hover { background: #eaf0ff; }
        .ccb-block { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; margin: 20px 0 24px; padding: 16px 18px; border-radius: 14px; background: #f5f8ff; border: 1px solid #dbe3f4; }
        .ccb-title { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
        .ccb-sub { margin: 3px 0 0; font-size: 13px; line-height: 1.55; color: #4b5563; word-break: keep-all; }
        .ccb-cta { display: inline-flex; align-items: center; gap: 6px; min-height: 42px; padding: 0 16px; border: none; border-radius: 999px; background: ${ACCENT}; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .ccb-cta:hover { background: #1e40af; }
      `}</style>
      {open && <CompareCardDialog articleId={articleId} title={title} date={date} onClose={close} />}
    </>
  );
}

function CompareCardDialog({ articleId, title, date, onClose }: { articleId: string; title: string; date: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent(articleId);
  const imageUrl = `/card/${enc}/story.png`;
  const pageUrl = `${SITE_URL}/card/${enc}`;
  const shareTitle = `${title} — 4가지로 비교`;
  const fileName = `AI-LENS-비교카드-${date}.png`;
  // 대화상자는 클릭 뒤에만 그려지므로(서버 렌더 없음) 여기서 navigator를 읽어도 하이드레이션이 어긋나지 않는다.
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent('compare_card_share', { article_id: articleId, method: 'copy_link' });
    } catch {
      // 클립보드 권한이 막힌 브라우저 — 조용히 무시.
    }
  };

  const webShare = async () => {
    try {
      // 이미지 파일째 보낼 수 있으면(대부분의 모바일) 카드 이미지를, 아니면 링크를 보낸다.
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: `${shareTitle}\n${pageUrl}` });
      } else {
        await navigator.share({ title: shareTitle, url: pageUrl });
      }
      trackEvent('compare_card_share', { article_id: articleId, method: 'web_share' });
    } catch {
      // 사용자가 공유 창을 닫은 경우(AbortError) 포함 — 무시.
    }
  };

  const action: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', border: '1px solid #d1d5db', background: '#fff', color: '#111827' };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ padding: 'clamp(10px, 3vw, 32px)', zIndex: 200, background: 'rgba(8,10,14,0.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ccb-dialog-title"
    >
      <div
        className="relative flex flex-col w-full"
        style={{ maxWidth: 460, maxHeight: '100%', borderRadius: 20, background: '#fff', boxShadow: '0 24px 60px rgba(0,0,0,.35)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between" style={{ padding: '14px 16px 10px' }}>
          <p id="ccb-dialog-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
            비교 카드
          </p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#f3f4f6', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '0 16px', overflowY: 'auto', minHeight: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1080 / 1350', maxHeight: '62vh', margin: '0 auto', borderRadius: 12, background: '#f3f4f6', overflow: 'hidden' }}>
            {state === 'loading' && (
              <p style={{ position: 'absolute', inset: 0, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, color: '#6b7280' }}>카드를 만드는 중이에요…</p>
            )}
            {state === 'error' && (
              <p style={{ position: 'absolute', inset: 0, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, color: '#b91c1c' }}>카드를 만들지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- 서버가 만든 PNG를 그대로 보여 주고 저장한다(이미지 최적화 대상 아님). */}
            <img
              src={imageUrl}
              alt={`${title} — 레터·웹툰·팟캐스트·영상 비교 카드`}
              onLoad={() => setState('ready')}
              onError={() => setState('error')}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: state === 'error' ? 'none' : 'block' }}
            />
          </div>
        </div>
        <div style={{ padding: '14px 16px 16px' }}>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <a href={imageUrl} download={fileName} style={{ ...action, background: ACCENT, borderColor: ACCENT, color: '#fff' }} onClick={() => trackEvent('compare_card_download', { article_id: articleId })}>
              <Download size={16} aria-hidden />
              이미지 저장
            </a>
            {canWebShare && (
              <button type="button" onClick={webShare} style={action}>
                <Share2 size={16} aria-hidden />
                공유하기
              </button>
            )}
            <button type="button" onClick={copyLink} style={action} aria-live="polite">
              {copied ? <Check size={16} aria-hidden style={{ color: '#059669' }} /> : <LinkIcon size={16} aria-hidden />}
              {copied ? '복사됨' : '링크 복사'}
            </button>
          </div>
          <div className="flex items-center" style={{ gap: 10, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>SNS</span>
            <ArticleShareButtons title={shareTitle} url={pageUrl} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
