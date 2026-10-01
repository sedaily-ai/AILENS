'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/entities/user';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해 2라운드),
// letters/[id]/components/에서 shared/ui/로 재이전(같은 날, 사용자 지적
// — /lens/[slug] 레터 포맷 패널엔 이 컴포넌트 자체가 안 붙어있어서 문장을
// 긁어도 아무것도 안 떴다). letter 프롭을 DisplayLetter 전용에서
// {id, headline, publishedAt?} 최소 구조로 넓혀 두 페이지가 같이 쓴다.
// ── 문장 선택 → 서랍 담기 플로팅 버튼 ────────────────────────────────
// 사용자가 본문에서 텍스트를 드래그하면 selection 위에 작은 버튼이 뜸.
// - 로그인: 즉시 /api/archive 로 서버 저장 (saveArchiveSentence)
// - 비로그인: /login 으로 안내
// scoping: article[data-letter-body] 내부 selection 만 인정.
//
// 용어 풀이(2026-10-01) — 선택한 문장 안에 발행 시 미리 뽑아 둔 용어(keywords)가 들어 있으면 "용어 풀이" 버튼이
// 함께 뜨고, 누르면 그 용어의 뜻을 바로 아래 카드로 보여 준다. 런타임 AI 호출이 없어 독자 수와 무관하게 비용 0.
function pillStyle(busy: boolean, bg: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 13px',
    fontSize: 12.5,
    fontWeight: 700,
    color: '#fff',
    background: bg,
    border: 'none',
    borderRadius: 999,
    boxShadow: '0 4px 16px rgba(15,23,42,0.22), 0 1px 2px rgba(15,23,42,0.08)',
    cursor: busy ? 'default' : 'pointer',
    whiteSpace: 'nowrap',
    opacity: busy ? 0.65 : 1,
    transition: 'opacity 0.15s',
  };
}

export function SentenceSelectionPopover({
  letter,
  glossary,
}: {
  letter: { id: string; headline: string; publishedAt?: string };
  glossary?: Array<{ term: string; explain: string }>;
}) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  // 선택 문장에 들어 있는 용어만 — 공백 차이는 무시하고, 같은 용어는 한 번만.
  const matched = useMemo(() => {
    if (!pos || !glossary?.length) return [];
    const flat = pos.text.replace(/\s+/g, '').toLowerCase();
    const seen = new Set<string>();
    return glossary.filter((g) => {
      const key = g.term.replace(/\s+/g, '').toLowerCase();
      if (!key || seen.has(key) || !flat.includes(key)) return false;
      seen.add(key);
      return true;
    });
  }, [pos, glossary]);

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
      setShowTerms(false);
      setPos({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top - 12 + window.scrollY,
        text,
      });
    };
    const onUp = (e: Event) => {
      // 팝오버 안쪽 클릭(용어 풀이 토글 등)은 선택이 바뀐 게 아니므로 갱신하지 않는다 — 카드가 닫히는 걸 막는다.
      if ((e.target as Element | null)?.closest?.('[data-sel-popover]')) return;
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
      // lens 페이지는 CmsLens.date를 그대로 넘겨준다 — letters 페이지의
      // "l-YYYYMMDD..." id 규칙은 lens 쪽 id(날짜 슬러그)엔 안 맞아서 fallback.
      const dm = letter.id.match(/^l-(\d{4})(\d{2})(\d{2})/);
      const publishedAt =
        letter.publishedAt ?? (dm ? `${dm[1]}-${dm[2]}-${dm[3]}T07:00:00+09:00` : new Date().toISOString());
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
        <div
          data-sel-popover
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {showTerms && matched.length > 0 && (
            <div
              role="dialog"
              aria-label="용어 풀이"
              style={{
                width: 'min(320px, calc(100vw - 32px))',
                background: '#fff',
                color: '#111827',
                borderRadius: 16,
                padding: '14px 16px',
                boxShadow: '0 12px 32px rgba(15,23,42,0.18), 0 1px 3px rgba(15,23,42,0.08)',
                textAlign: 'left',
                wordBreak: 'keep-all',
              }}
            >
              {matched.map((g, i) => (
                <div key={g.term} style={{ marginTop: i ? 12 : 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{g.term}</div>
                  <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.6, color: '#4b5563' }}>{g.explain}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {matched.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTerms((v) => !v);
                  if (!showTerms) trackEvent('letter_term_explain', { letter_id: letter.id, terms: matched.length });
                }}
                aria-expanded={showTerms}
                style={pillStyle(false, showTerms ? '#374151' : '#111827')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 16.9h.01" />
                </svg>
                용어 풀이
              </button>
            )}
            <button type="button" onClick={save} disabled={saving} style={pillStyle(saving, '#111827')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
              </svg>
              {isAuthenticated ? (saving ? '담는 중…' : '서랍에 담기') : '로그인하고 담기'}
            </button>
          </div>
        </div>
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
