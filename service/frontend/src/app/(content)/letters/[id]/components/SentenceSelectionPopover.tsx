'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해 2라운드).
// ── 문장 선택 → 서랍 담기 플로팅 버튼 ────────────────────────────────
// 사용자가 letter 본문에서 텍스트를 드래그하면 selection 위에 작은 버튼이 뜸.
// - 로그인: 즉시 /api/archive 로 서버 저장 (saveArchiveSentence)
// - 비로그인: /login 으로 안내
// scoping: article[data-letter-body] 내부 selection 만 인정.
export function SentenceSelectionPopover({ letter }: { letter: DisplayLetter }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.rangeCount === 0) { setPos(null); return; }
      const text = s.toString().trim();
      if (text.length < 4) { setPos(null); return; }
      const range = s.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = (node.nodeType === 1 ? (node as Element) : node.parentElement);
      if (!el || !el.closest('article[data-letter-body]')) { setPos(null); return; }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { setPos(null); return; }
      setPos({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top - 12 + window.scrollY,
        text,
      });
    };
    const onUp = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 40);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 스크롤·리사이즈 시 stale 위치 → 숨김
  useEffect(() => {
    const hide = () => setPos(null);
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
    };
  }, []);

  const save = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pos || saving) return;
    if (!isAuthenticated || !user?.userId) {
      router.push('/login');
      return;
    }
    setSaving(true);
    try {
      const { saveArchiveSentence } = await import('@/shared/lib/api/archiveApi');
      const dm = letter.id.match(/^l-(\d{4})(\d{2})(\d{2})/);
      const publishedAt = dm ? `${dm[1]}-${dm[2]}-${dm[3]}T07:00:00+09:00` : new Date().toISOString();
      await saveArchiveSentence({
        user_id: user.userId,
        text: pos.text,
        article_id: letter.id,
        article_title: letter.headline,
        article_published_at: publishedAt,
      });
      trackEvent('letter_sentence_archive', {
        letter_id: letter.id,
        text_length: pos.text.length,
      });
      setToast('서랍에 담았어요');
      setPos(null);
      window.getSelection()?.removeAllRanges();
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      console.warn('archive save failed', err);
      setToast('저장 실패 — 잠시 후 다시 시도해주세요');
      setTimeout(() => setToast(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* letter 본문 내 selection 을 형광펜처럼 노랗게 — article 안쪽으로만 scoping. */}
      <style>{`
        article[data-letter-body] ::selection {
          background: rgba(253, 224, 71, 0.55);
          color: inherit;
          text-shadow: none;
        }
        article[data-letter-body] ::-moz-selection {
          background: rgba(253, 224, 71, 0.55);
          color: inherit;
          text-shadow: none;
        }
      `}</style>
      {pos && (
        <button
          type="button"
          onClick={save}
          onMouseDown={(e) => e.preventDefault()}
          disabled={saving}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 60,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 13px',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#fff',
            background: '#111827',
            border: 'none',
            borderRadius: 999,
            boxShadow: '0 4px 16px rgba(15,23,42,0.22), 0 1px 2px rgba(15,23,42,0.08)',
            cursor: saving ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
            opacity: saving ? 0.65 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
          {isAuthenticated ? (saving ? '담는 중…' : '서랍에 담기') : '로그인하고 담기'}
        </button>
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: '#fff',
            padding: '11px 20px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 70,
            boxShadow: '0 6px 24px rgba(15,23,42,0.28)',
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
