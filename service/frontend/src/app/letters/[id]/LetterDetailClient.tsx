'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Header } from "@/widgets/Header";
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorCommentsSection } from '@/features/news-feed/components/EditorCommentsSection';
import { SideRail } from '@/features/news-feed/components/SideRail';
import { InteractiveBlock, type InteractiveBlockData } from '@/features/news-feed/components/InteractiveBlock';
import { trackEvent } from '@/shared/lib/trackEvent';
import { trackArticleRead } from '@/shared/lib/readingTracker';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { UserMenu, useAuth } from '@/features/auth';
import { letterPodcastUrl } from '@/shared/lib/audioPlayer';
import { LETTER_PODCASTS } from '@/features/news-feed/data/letterPodcasts';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPostBySlug } from '@/shared/lib/cmsPostsApi';
import {
  fetchTodayLetters,
  withDisplayMeta,
  type ApiLetter,
  type DisplayLetter,
  type LetterChart,
} from '@/shared/lib/todayLettersApi';

// 다른 날짜 letter 를 스캔할 때 훑는 최근 일수 — app/letters/[id]/page.tsx 의
// SEED_DAYS 와 같은 값(그룹-날짜 합성 id 스킴 폐지 이후 findLetter 와 동일 패턴).
const LOOKBACK_DAYS = 14;

interface Props {
  letterId: string;
  // 서버(빌드타임)에서 findLetter()로 이미 가져온 글 — SSG 결과물 HTML에 실제
  // 본문이 바로 박히게(크롤러가 JS 없이도 볼 수 있게) 초기 상태를 이걸로
  // 채운다. 이후 useEffect는 그대로 재검증용으로 다시 돈다(2026-08-07,
  // JSON-LD/OG 태그는 있는데 정작 화면 본문은 client fetch 전까지 비어있던
  // 문제 — /letters/[id]/page.tsx 의 findLetter 결과를 그대로 내려받는다).
  initialLetter?: DisplayLetter | null;
}

// "YYYY-MM-DD" 최근 n 일 (오늘 포함, 내림차순) — app/letters/[id]/page.tsx 의
// 동명 헬퍼와 동일 로직. findLetter 가 빌드타임에 쓰는 것과 달리 여기는
// 클라이언트에서 letterId 로 날짜를 스캔해 찾는 용도로 쓴다.
function recentDatesISO(days: number): string[] {
  const out: string[] = [];
  const t = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function LetterDetailClient({ letterId, initialLetter = null }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [letter, setLetter] = useState<DisplayLetter | null>(initialLetter);
  // 오늘 함께 발행된, 지금 보고 있는 레터를 제외한 다른 레터들 — Another Lens 섹션에 전달.
  const [otherLetters, setOtherLetters] = useState<ApiLetter[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    initialLetter ? 'ready' : 'loading',
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // 레터 완독률 — 스크롤 90% 이상 도달 시 한 번만 발송 (letterId 단위)
  useEffect(() => {
    if (loadState !== 'ready') return;
    let fired = false;
    const onScroll = () => {
      if (fired) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total > 0 && scrolled / total >= 0.9) {
        fired = true;
        trackEvent('letter_complete', { letter_id: letterId });
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loadState, letterId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) CMS 글(admin 이 slug 로 발행) 먼저 시도 — 기존 동작 그대로.
      try {
        const post = await fetchCmsPostBySlug('letters', letterId);
        if (cancelled) return;
        if (post) {
          setLetter(withDisplayMeta(post));
          setOtherLetters([]);
          setLoadState('ready');
          trackArticleRead(letterId);
          return;
        }
      } catch {
        if (!cancelled) setLoadState('error');
        return;
      }

      // 2) CMS 에 없으면 AI 레터 — id 에 더 이상 날짜가 인코딩돼있지 않아
      //    (그룹-날짜 합성 id 스킴 폐지, 2026-08-07) 최근 LOOKBACK_DAYS 일을
      //    훑으며 .id 가 일치하는 레터를 찾는다. 개별 날짜 fetch 실패는 건너뛰고
      //    계속 스캔 — 하나가 실패했다고 전체를 에러로 처리하지 않는다.
      for (const date of recentDatesISO(LOOKBACK_DAYS)) {
        if (cancelled) return;
        try {
          const res = await fetchTodayLetters(date);
          if (cancelled) return;
          const target = res.letters.find((l) => l.id === letterId);
          if (target) {
            setLetter(withDisplayMeta(target));
            setOtherLetters(res.letters.filter((l) => l.id !== letterId));
            setLoadState('ready');
            // 읽기 streak 카운트 — letterId 단위 dedup, 일별 누적
            trackArticleRead(letterId);
            return;
          }
        } catch {
          // 이 날짜만 실패 — 다음 날짜로 계속.
        }
      }
      if (!cancelled) setLoadState('not-found');
    })();
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  if (loadState === 'not-found' || loadState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">
            {loadState === 'error' ? '잠시 후 다시 시도해주세요.' : '글을 찾을 수 없어요.'}
          </p>
          <Link href="/" className="text-sm text-gray-700 hover:underline">
            오늘로 돌아가기 →
          </Link>
        </div>
      </div>
    );
  }

  // !mounted 만으로 게이트하면 빌드타임(SSG) 렌더는 항상 mounted=false라 이
  // 블록에 걸려 빈 <div>만 출력된다 — initialLetter로 이미 검증된 데이터가
  // 있는 경우엔 mount를 기다리지 않고 바로 렌더한다(2026-08-07, 크롤러가
  // JS 없이 받는 정적 HTML에 실제 본문이 비어있던 원인).
  if (loadState === 'loading' || !letter || (!mounted && !initialLetter)) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 글로벌 헤더 — /editors 페이지와 동일한 마크업 (전체 페이지에서 고정) */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('feed')}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main>
        {/* 홈과 동일한 사이드바(요즘 많이 읽힌 글 + 사주 위젯)를 레터 본문 옆에도 —
            본문은 720 고정폭 유지(가독성), 전체 그리드만 720+사이드바 폭으로 센터. */}
        <div
          className="mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,720px)_minmax(220px,260px)] lg:gap-10 justify-center"
          style={{ maxWidth: 1040, padding: '0 clamp(16px, 3vw, 24px)' }}
        >
          <div style={{ minWidth: 0 }}>
            <LetterBody letter={letter} />
          </div>
          <div style={{ paddingTop: 'clamp(28px, 5vw, 56px)' }}>
            <SideRail />
          </div>
        </div>

        <div id="letter-other-lens" style={{ scrollMarginTop: 80 }}>
          <EditorCommentsSection otherLetters={otherLetters} />
        </div>
      </main>

      <div className="h-24" />
    </div>
  );
}

// CMS body_html 안 퀴즈/투표 마커를 기준으로 HTML 조각과 실제 인터랙티브
// 컴포넌트를 번갈아 배치하기 위한 분리. 마커 두 형식을 함께 지원한다:
//   1) <!--AI_QUIZ:{...}-->            — 초기에 DB에 직접 심었던 구형 마커
//   2) <div data-ai-quiz="{...}"></div> — admin PostForm 퀴즈 위젯(Tiptap
//      aiQuiz 노드)이 저장하는 신형 마커. 브라우저가 속성값을 HTML 엔티티로
//      이스케이프해서 내보내므로 파싱 전에 디코딩한다.
// 마커 안 JSON이 깨져 있으면(수기 편집 실수 등) 조용히 건너뛰고 나머지
// HTML은 그대로 렌더.
type BodyHtmlPart =
  | { type: 'html'; content: string }
  | { type: 'interactive'; data: InteractiveBlockData };

function decodeHtmlEntities(s: string): string {
  if (typeof document === 'undefined') return s;
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

// admin 에디터가 저장하는 이미지는 <img alt="..."> 한 줄뿐이다(에디터
// 재로딩 시 스키마 불일치를 피하려고 저장 형태 자체는 손대지 않음 —
// admin/frontend/src/components/resizableImageExtension.tsx 참고). alt를
// 실제로 사진 밑 캡션처럼 보여주는 건 "읽는 화면"의 몫이라, alt가 있는
// 이미지를 렌더 시점에만 <figure>+<figcaption>으로 감싼다(네이버 블로그
// 참고 — admin 미리보기 모달과 같은 방식).
function injectImageCaptions(html: string): string {
  if (typeof document === 'undefined' || !html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img[alt]').forEach((img) => {
    const alt = img.getAttribute('alt');
    if (!alt?.trim() || img.parentElement?.tagName === 'FIGURE') return;
    const figure = doc.createElement('figure');
    figure.setAttribute('style', 'margin:0;');
    img.replaceWith(figure);
    figure.appendChild(img);
    const caption = doc.createElement('figcaption');
    caption.textContent = alt;
    caption.setAttribute(
      'style',
      'margin-top:8px;font-size:12.5px;font-style:italic;color:#9ca3af;text-align:center;',
    );
    figure.appendChild(caption);
  });
  return doc.body.innerHTML;
}

function splitBodyHtml(html: string): BodyHtmlPart[] {
  const parts: BodyHtmlPart[] = [];
  const markerRe = /<!--AI_QUIZ:([\s\S]*?)-->|<div data-ai-quiz="([^"]*)"[^>]*>\s*<\/div>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(html))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    const raw = match[1] ?? decodeHtmlEntities(match[2] ?? '');
    try {
      parts.push({ type: 'interactive', data: JSON.parse(raw) });
    } catch {
      // 마커가 깨졌으면 원본 그대로 유지(눈에는 안 보이거나 빈 div, 데이터 손실 없음)
      parts.push({ type: 'html', content: match[0] });
    }
    lastIndex = markerRe.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push({ type: 'html', content: html.slice(lastIndex) });
  }
  return parts;
}

// production letter inline 렌더
// - 4개 채널 탭 폐기. 한 페이지에서 자연스러운 흐름으로 통합:
//     헤더 → (있으면) 팟캐스트 미니 플레이어 → 본문 → 핵심 정리/닫는 줄/단어 → 구독
function LetterBody({ letter }: { letter: DisplayLetter }) {
  // 본문은 한 흐름으로 렌더 — 중간 mock 이미지는 제거. 하단 4컷 카드가 대체.
  const body = letter.body;

  // 시각 v2 — 2026-05-23 이후 발행분에만 적용 (용어 툴팁 + 클로징 풀쿼트).
  // letter.id 'l-YYYYMMDD-XX' 에서 날짜 추출 → lexical 비교.
  const dateStr = letter.id.match(/l-(\d{8})/)?.[1] ?? '';
  const isModern = dateStr >= '20260523';
  // 본문에서 어떤 키워드 단어들을 underline + tooltip 으로 감쌀지.
  // explain 가 비어있으면 적용 안 함 (구버전 letter 자동 제외).
  const glossary = isModern
    ? letter.keywords.filter((k) => k.term.length >= 2 && k.explain.trim().length > 0)
    : [];

  return (
    <article
      id="letter-top"
      data-letter-body
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 0',
        scrollMarginTop: 80,
      }}
    >
      {/* 마우스로 문장을 긁으면 '서랍에 담기' 플로팅 버튼 등장 */}
      <SentenceSelectionPopover letter={letter} />

      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 999,
            background: letter.accentBg,
            color: letter.accent,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.3,
            marginBottom: 16,
          }}
        >
          {letter.editorName}
        </div>
        {/* 역할 라벨(archetype) 제거(2026-08-09) — "모든 카테고리가 같은 조건"으로
            에디터 이름 배지 아래 부가 설명 없이 바로 제목. */}
        <h1
          data-speakable="headline"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(24px, 4.5vw, 32px)',
            fontWeight: 600,
            color: '#111827',
            margin: '4px 0 12px',
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          {letter.headline}
        </h1>
        {letter.subtitle && (
          <p data-speakable="summary" style={{ fontSize: 15, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{letter.subtitle}</p>
        )}

        {/* 팟캐스트 — 워싱턴포스트 기사 상단 메타줄(헤드셋 아이콘) 참고,
            헤드라인/부제 바로 아래 작은 아이콘+텍스트 한 줄로. article_id 가
            없어 실제 생성이 불가능한 레터도 아이콘 자체는 항상 노출(요청사항) —
            그 경우 클릭 시 LetterPodcastPlayer 내부에서 "준비 중" 안내로 처리. */}
        <div style={{ marginTop: 14 }}>
          <LetterPodcastPlayer letter={letter} />
        </div>
      </header>

      {/* 본문 — 한 흐름. CMS 글(body_html 있음)은 Tiptap 리치텍스트를 그대로
          렌더 — admin 에서 굵게/글머리/이미지를 넣은 위치 그대로 나온다.
          AI 레터는 body_html 이 없어 기존 ■/[라벨]/Q.A./![]() 마커 파싱으로. */}
      <div style={{ marginBottom: 28 }}>
        {letter.body_html ? (
          <div style={{ fontSize: 16, color: '#374151' }}>
            {splitBodyHtml(letter.body_html).map((part, i) =>
              part.type === 'html' ? (
                <div
                  key={`h-${i}`}
                  className="prose prose-neutral max-w-none prose-headings:font-bold prose-img:rounded-2xl prose-p:leading-[1.9]"
                  dangerouslySetInnerHTML={{ __html: injectImageCaptions(part.content) }}
                />
              ) : (
                <InteractiveBlock key={`q-${i}`} data={part.data} />
              ),
            )}
          </div>
        ) : (
          body.map((p, i) => (
            <Fragment key={`b-${i}`}>
              <LetterBlock text={p} accent={letter.accent} accentBg={letter.accentBg} glossary={glossary} />
              {/* 차트는 도입부 문단 바로 다음에 한 번만 — 원문 배치(배경 설명 → 데이터
                  시각화 → 본격 분석)를 따라가되, 그림은 AI LENS 자체 스타일로 새로 그린다. */}
              {i === 0 && letter.chart && <LetterChartBlock chart={letter.chart} accent={letter.accent} />}
            </Fragment>
          ))
        )}
      </div>

      {/* 핵심 정리 / 닫는 줄 / 단어 */}
      <div id="letter-extras" style={{ scrollMarginTop: 80 }}>
        <LetterTextExtras letter={letter} modern={isModern} />
      </div>

      {/* 뉴스레터 구독 — 그 페르소나로 고정, 메일받기 인라인 */}
      <LetterSubscribeSection letter={letter} />
    </article>
  );
}

// ── 문장 선택 → 서랍 담기 플로팅 버튼 ────────────────────────────────
// 사용자가 letter 본문에서 텍스트를 드래그하면 selection 위에 작은 버튼이 뜸.
// - 로그인: 즉시 /api/archive 로 서버 저장 (saveArchiveSentence)
// - 비로그인: /login 으로 안내
// scoping: article[data-letter-body] 내부 selection 만 인정.
function SentenceSelectionPopover({ letter }: { letter: DisplayLetter }) {
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
      const { saveArchiveSentence } = await import('@/shared/lib/archiveApi');
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

// ── 뉴스레터 구독 — 레터 하단 인라인 ─────────────────────────────────
// 그 레터의 페르소나로 고정. POST /api/newsletter/subscribe 로 DDB 저장.
function LetterSubscribeSection({ letter }: { letter: DisplayLetter }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // 이미 구독 중이면 미리 채워둠 (localStorage 캐시). 페르소나별 그룹 목록 대신
  // 단일 명의(2026-08-07 MBTI 페르소나 폐지) 이므로 이메일 저장 여부만 본다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('newsletter-email');
    if (saved) {
      setEmail(saved);
      setState('done');
    }
  }, []);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && consent && state !== 'sending';

  const submit = async () => {
    if (!valid) return;
    setState('sending');
    setErrorMsg('');
    try {
      const res = await fetch(
        'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/newsletter/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            consent: true,
            // 즉시 첫 메일 발송용 — 백엔드가 받아 SES 로 보냄
            letter: {
              editor_name: letter.editorName,
              editor_role: letter.editorRole,
              accent: letter.accent,
              headline: letter.headline,
              subtitle: letter.subtitle,
              body: letter.body,
              key_points: letter.key_points,
              closing_line: letter.closing_line,
            },
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // 성공 — localStorage 캐시 업데이트 (재방문 시 즉시 done 상태)
      if (typeof window !== 'undefined') {
        localStorage.setItem('newsletter-email', email.trim());
      }
      trackEvent('newsletter_subscribe', { editor: letter.editorName });
      setState('done');
    } catch (e) {
      console.warn('subscribe failed', e);
      setErrorMsg(e instanceof Error ? e.message : '신청 실패. 잠시 후 다시 시도해주세요.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <section
        style={{
          marginTop: 36,
          padding: 'clamp(24px,4vw,32px) clamp(20px,4vw,28px)',
          borderRadius: 20,
          background: letter.accentBg,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: letter.accent, letterSpacing: '0.18em' }}>
          SENT
        </span>
        <p
          style={{
            marginTop: 10,
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#1a1a1a',
            lineHeight: 1.5,
          }}
        >
          {letter.editorName}의 한 통을 메일로 보냈어요
        </p>
        <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280' }}>
          {email} · 받은편지함을 확인해보세요 (스팸함도 한 번)
        </p>
        <p style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
          내일부터는 매일 아침 새 레터가 도착해요
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        marginTop: 36,
        padding: 'clamp(28px,5vw,40px) clamp(22px,5vw,32px)',
        borderRadius: 20,
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Image
          src={letter.editorAvatar}
          alt={letter.editorName}
          width={52}
          height={52}
          style={{
            borderRadius: '50%',
            objectFit: 'cover',
            boxShadow: `0 0 0 1px ${letter.accent}22`,
          }}
        />
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: letter.accent, letterSpacing: '0.14em' }}>
            NEWSLETTER
          </p>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(18px,3.5vw,22px)',
              fontWeight: 700,
              color: '#111827',
              marginTop: 2,
              letterSpacing: '-0.01em',
            }}
          >
            {letter.editorName}의 한 통, 매일 아침 받아보세요
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7, marginBottom: 18, maxWidth: 460 }}>
        {letter.editorName} 에디터가 그날의 뉴스를 한 통으로 정리해 메일로 보내드려요.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="email"
          inputMode="email"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: 0,
            padding: '12px 16px',
            fontSize: 14,
            color: '#111827',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          style={{
            padding: '12px 22px',
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            background: valid ? letter.accent : '#d1d5db',
            border: 'none',
            borderRadius: 10,
            cursor: valid ? 'pointer' : 'default',
            whiteSpace: 'nowrap',
            transition: 'background .15s',
          }}
        >
          {state === 'sending' ? '신청 중…' : '구독하기'}
        </button>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12.5,
          color: '#6b7280',
          lineHeight: 1.6,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span>매일 뉴스레터 수신과 이메일 저장에 동의합니다. 메일 하단 링크로 언제든 해지할 수 있어요.</span>
      </label>

      {state === 'error' && errorMsg && (
        <p style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 12 }}>{errorMsg}</p>
      )}
    </section>
  );
}

// ── 본문 본체 이후 — 핵심 정리 + 닫는 줄 + 단어 (LetterBody 가 직접 호출) ──
function LetterTextExtras({ letter, modern }: { letter: DisplayLetter; modern?: boolean }) {
  return (
    <>
      {letter.key_points.length > 0 && (
        <div data-speakable="qa" style={{ background: '#f9fafb', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: 1.2, margin: '0 0 12px', textTransform: 'uppercase' }}>
            핵심 정리
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {letter.key_points.map((kp, i) => (
              <li key={i} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, marginBottom: 6 }}>
                {kp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {letter.closing_line && (
        modern ? (
          <figure style={{ margin: '32px 0 40px', padding: '24px 0 0', borderTop: `2px solid ${letter.accent}` }}>
            <blockquote
              style={{
                margin: 0,
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(20px, 3.8vw, 26px)',
                fontWeight: 600,
                lineHeight: 1.55,
                letterSpacing: '-0.02em',
                color: '#111827',
              }}
            >
              {letter.closing_line}
            </blockquote>
            <figcaption
              style={{
                marginTop: 14,
                fontSize: 12,
                fontWeight: 700,
                color: letter.accent,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {letter.editorName} 에디터
            </figcaption>
          </figure>
        ) : (
          <p
            style={{
              fontSize: 16, fontWeight: 500, color: letter.accent, lineHeight: 1.6,
              margin: '0 0 32px', paddingTop: 16, borderTop: '1px solid #f3f4f6',
            }}
          >
            → {letter.closing_line}
          </p>
        )
      )}

      {letter.source_url && (
        <p style={{ fontSize: 13, marginBottom: 24 }}>
          <a
            href={letter.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: letter.accent, fontWeight: 600, textDecoration: 'none' }}
          >
            원문 보기 — 서울경제 →
          </a>
        </p>
      )}

      {letter.keywords.length > 0 && (
        <section style={{ borderTop: '1px solid #f3f4f6', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: 1.2, margin: 0, textTransform: 'uppercase' }}>
              단어
            </p>
            <Link href="/words" style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
              전체 용어 해설 보기 →
            </Link>
          </div>
          {letter.keywords.map((kw, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{kw.term}</p>
              {kw.explain && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>{kw.explain}</p>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}


// (구) 본문 중간 이미지 채널 + 모든 mock placeholder 컴포넌트는 제거됨.
// 4컷 카드 캐러셀(LetterCardsCarousel)도 2026-07-27 제거 — 레터 id 규약이
// 'l-YYYYMMDD-GG' → '{group}-YYYY-MM-DD' 로 바뀌면서 allowlist 가 영구 미매칭
// (항상 null 반환) 이 됐고, 대상 PNG(/cards/2026-05-26)도 함께 삭제했다.
// 하단 동영상 채널(LetterVideoChannel, 실제 mp4 재생 + mock placeholder)도
// 2026-08-05 제거 — 실사용 없이 "동영상 준비 중" mock 만 노출되고 있었음.

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// 스포티파이식 팟캐스트 플레이어 카드 — 캐릭터 이미지 + 큰 원형 재생 +
// 진행 바/시간 + 시킹. 자체 <audio> 엘리먼트로 진행률·탐색 제어.
function LetterPodcastPlayer({ letter }: { letter: DisplayLetter }) {
  // 우선순위: ① admin 수동 업로드(podcast_audio_url) — article_id 없어도 항상 신뢰
  // ② PoC 정적 녹음 8편(2026-05-18/22, LETTER_PODCASTS 에 있을 때만) ③ 실시간 생성.
  const manualUrl = letter.podcast_audio_url || null;
  const staticUrl = manualUrl ?? (LETTER_PODCASTS[letter.id] ? letterPodcastUrl(letter.id) : null);
  const canGenerate = !!letter.article_id;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(staticUrl);

  const accent = letter.accent;
  // 정적 녹음도 없고 실시간 생성에 필요한 article_id 도 없는 레터 —
  // 아이콘은 항상 노출하되(요청사항) 클릭해도 할 수 있는 게 없어 안내만.
  const notReady = !staticUrl && !canGenerate;

  // 이미 있으면 재사용, 없으면(로그인 유저만 도달) 생성 요청 후 완료까지 폴링.
  // mbti_group 파라미터는 폐지(2026-08-07) — 이제 페르소나가 하나뿐이라
  // podcastApi.ts 시그니처는 그대로 두고 고정 리터럴 'default' 를 넘긴다.
  const resolveUrl = async (): Promise<string> => {
    if (resolvedUrl) return resolvedUrl;

    const { getArticlePodcast, getPodcast, generatePodcast, waitForPodcast } =
      await import('@/shared/lib/podcastApi');

    let podcast = await getArticlePodcast(letter.article_id, 'default');
    if (podcast && !podcast.audio_url) {
      podcast = await getPodcast(podcast.podcast_id);
    }
    if (!podcast?.audio_url) {
      const generated = await generatePodcast(letter.article_id, 'default');
      podcast = await waitForPodcast(generated.podcast_id);
    }
    if (!podcast?.audio_url) throw new Error('podcast unavailable');

    setResolvedUrl(podcast.audio_url);
    return podcast.audio_url;
  };

  const toggle = async () => {
    if (notReady) return;
    const a = audioRef.current;
    if (!a) return;

    if (playing) {
      a.pause();
      return;
    }

    setErr(false);
    setLoading(true);
    try {
      const url = await resolveUrl();
      if (a.getAttribute('src') !== url) {
        a.src = url;
        a.load();
      }
      await a.play();
    } catch {
      setErr(true);
      setLoading(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * dur;
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  const label = notReady
    ? '아직 준비 중이에요'
    : err
      ? '재생 실패 · 다시 시도'
      : loading && !playing
        ? '오디오 만드는 중...'
        : '오늘의 한 통, 귀로 듣기';

  const timeLabel = notReady ? '' : `${fmtTime(cur)} / ${dur ? fmtTime(dur) : '--:--'}`;

  return (
    <div
      className={notReady ? '' : 'group transition-all duration-200 hover:-translate-y-0.5'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 20,
        background: notReady ? '#fafafa' : `linear-gradient(135deg, ${letter.accentBg} 0%, #ffffff 65%)`,
        border: `1px solid ${notReady ? '#f1f1f0' : `${accent}1f`}`,
        boxShadow: notReady ? 'none' : '0 1px 2px rgba(17,24,39,0.04), 0 10px 28px -8px rgba(17,24,39,0.10)',
        opacity: notReady ? 0.75 : 1,
      }}
    >
      {/* 페르소나 캐릭터 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Image
          src={letter.editorAvatar}
          alt={letter.editorName}
          width={60}
          height={60}
          className={notReady ? '' : 'transition-transform duration-200 group-hover:scale-105'}
          style={{
            borderRadius: 16,
            objectFit: 'cover',
            background: letter.accentBg,
            boxShadow: notReady ? 'none' : `0 0 0 1px ${accent}33`,
            filter: notReady ? 'grayscale(0.5)' : 'none',
          }}
        />
        {playing && (
          <span
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: accent,
              border: '2px solid #fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 8 }}>
              <i style={{ width: 2, background: '#fff', animation: 'eq 0.9s ease-in-out infinite', height: '40%' }} />
              <i style={{ width: 2, background: '#fff', animation: 'eq 0.9s ease-in-out infinite 0.2s', height: '90%' }} />
              <i style={{ width: 2, background: '#fff', animation: 'eq 0.9s ease-in-out infinite 0.4s', height: '60%' }} />
            </span>
          </span>
        )}
      </div>

      {/* 정보 + 진행바 — 처음부터 음악 플레이어처럼 보이도록 항상 표시 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: notReady ? '#9ca3af' : accent,
            letterSpacing: '0.06em',
            margin: '0 0 3px',
          }}
        >
          AI 팟캐스트 · {letter.editorName} 에디터가 들려줘요
        </p>
        <p
          className="text-gray-900"
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            margin: '0 0 9px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </p>
        <div
          onClick={notReady ? undefined : seek}
          style={{
            height: 5,
            borderRadius: 999,
            background: '#ececec',
            cursor: notReady ? 'default' : 'pointer',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: notReady ? '#d1d5db' : accent, borderRadius: 999, transition: 'width 0.15s linear' }} />
        </div>
        {!notReady && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
            <span style={{ fontSize: 10.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{timeLabel}</span>
          </div>
        )}
      </div>

      {/* 원형 재생 버튼 */}
      <button
        type="button"
        onClick={toggle}
        disabled={notReady}
        aria-label={playing ? '일시정지' : '재생'}
        style={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          cursor: notReady ? 'default' : 'pointer',
          background: notReady ? '#e5e7eb' : accent,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: notReady ? 'none' : `0 6px 16px ${accent}55`,
          transition: 'transform 0.12s',
        }}
        onMouseDown={(e) => !notReady && (e.currentTarget.style.transform = 'scale(0.92)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {loading && !playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} style={{ animation: 'spin 0.8s linear infinite' }}>
            <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        ) : playing ? (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
            <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.78-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
          </svg>
        )}
      </button>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
          setErr(false);
        }}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
        onError={() => {
          setErr(true);
          setLoading(false);
          setPlaying(false);
        }}
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes eq{0%,100%{height:30%}50%{height:100%}}`}</style>
    </div>
  );
}

// ── 데이터 차트 (2026-08-07) ─────────────────────────────────────────
// CMS 글이 배경자료(edragon 등)에 있던 수치 인포그래픽을 재구성해 넣을 때
// 쓰는 블록. 원본 이미지·캐릭터를 그대로 가져오지 않고, 수치만 가져와
// AI LENS 자체 톤(세리프 라벨 없는 담백한 가로 막대)으로 새로 그린다.
function LetterChartBlock({ chart, accent }: { chart: LetterChart; accent: string }) {
  const max = Math.max(...chart.series.map((s) => Math.abs(s.value)), 1);
  return (
    <div
      style={{
        margin: '28px 0',
        padding: 'clamp(16px, 3vw, 22px)',
        borderRadius: 14,
        background: '#fafaf9',
        border: '1px solid #f0efe9',
      }}
    >
      <p style={{ fontSize: 12.5, fontWeight: 700, color: '#78716c', marginBottom: 16, letterSpacing: '-0.005em' }}>
        {chart.title}
        {chart.unit ? ` (${chart.unit})` : ''}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {chart.series.map((s) => (
          <div key={s.label} className="flex items-center" style={{ gap: 10 }}>
            <span style={{ width: 64, flexShrink: 0, fontSize: 12.5, color: '#57534e', fontWeight: 600 }}>{s.label}</span>
            <div style={{ flex: 1, background: '#efece4', borderRadius: 6, height: 20, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(4, (Math.abs(s.value) / max) * 100)}%`,
                  height: '100%',
                  background: accent,
                  borderRadius: 6,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <span style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#292524' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 본문 블록 위계 렌더 ───────────────────────────────────────────────
// body 는 구조가 텍스트 약속으로만 인코딩된 string[] 이라, 한 줄을
// 분류해 섹션 헤더 / 소제목 / 인사이트 콜아웃 / 아젠다 / Q&A / 본문으로
// 시각 위계를 부여한다. 톤은 기존 레터(여백·헤어라인·세리프 본문)를 유지.
const SERIF = '"Noto Serif KR", serif';

function LetterBlock({
  text,
  accent,
  accentBg,
  glossary,
}: {
  text: string;
  accent: string;
  accentBg: string;
  glossary?: Array<{ term: string; explain: string }>;
}) {
  const t = text.trim();
  // 본문 텍스트만 wrap. 헤더/라벨/소제목은 그대로.
  const wrap = (s: string): ReactNode => (glossary && glossary.length > 0 ? wrapWithTerms(s, glossary) : s);

  // ![alt](url) — CMS 에디터에서 본문 중 원하는 자리에 끌어놓은 이미지.
  // admin PostForm 이 드래그·붙여넣기 시 이 마커를 그 위치에 그대로 심는다.
  const image = t.match(/^!\[([^\]]*)\]\((\S+)\)$/);
  if (image) {
    const [, alt, url] = image;
    return (
      <figure style={{ margin: '24px 0' }}>
        {/* 외부 S3 이미지 — 정적 export 라 next/image 대신 원본 사용 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          style={{ width: '100%', borderRadius: 14, display: 'block' }}
        />
        {alt && (
          <figcaption style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
            {alt}
          </figcaption>
        )}
      </figure>
    );
  }

  // ■ 섹션 헤더 (핵심 기사 / 참고 기사 / 종합 / 데이터 표 제목)
  const section = t.match(/^■\s*(.+)$/);
  if (section) {
    return (
      <h2
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#111827',
          letterSpacing: '-0.02em',
          margin: '40px 0 16px',
          paddingLeft: 12,
          borderLeft: `3px solid ${accent}`,
          lineHeight: 1.35,
        }}
      >
        {section[1]}
      </h2>
    );
  }

  // [라벨] … — 본문 텍스트가 있으면 콜아웃, 라벨만이면 FAQ/섹션 라벨
  const bracket = t.match(/^[[〔]([^\]〕]+)[\]〕]\s*([\s\S]*)$/);
  if (bracket) {
    const label = bracket[1].trim();
    const rest = bracket[2].trim();
    if (!rest) {
      return (
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.08em',
            margin: '36px 0 14px',
          }}
        >
          {label}
        </p>
      );
    }
    return (
      <div
        style={{
          background: accentBg,
          borderRadius: 12,
          padding: '16px 18px',
          margin: '18px 0',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: 14.5, lineHeight: 1.75, color: '#374151', margin: 0 }}>
          {wrap(rest)}
        </p>
      </div>
    );
  }

  // Q. … A. … FAQ 항목
  const qa = t.match(/^Q\.\s*([\s\S]+?)\s*A\.\s*([\s\S]+)$/);
  if (qa) {
    return (
      <div style={{ margin: '0 0 20px' }}>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.6,
            margin: '0 0 8px',
          }}
        >
          Q. {wrap(qa[1].trim())}
        </p>
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.8,
            color: '#4b5563',
            margin: 0,
            paddingLeft: 14,
            borderLeft: '2px solid #e5e7eb',
          }}
        >
          {wrap(qa[2].trim())}
        </p>
      </div>
    );
  }

  // 1. 제목 — 부제/리드. 번호 줄은 소제목으로, 뒤따르는 리드는 본문으로.
  const num = t.match(/^(\d+)\.\s+([\s\S]+)$/);
  if (num) {
    const [head, ...ledeParts] = num[2].split(/\s—\s/);
    const lede = ledeParts.join(' — ').trim();
    return (
      <div style={{ margin: '28px 0 0' }}>
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.45,
            letterSpacing: '-0.01em',
            margin: lede ? '0 0 10px' : 0,
          }}
        >
          <span style={{ color: accent, marginRight: 6 }}>{num[1]}.</span>
          {head.trim()}
        </h3>
        {lede && (
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              lineHeight: 1.9,
              color: '#374151',
              margin: 0,
            }}
          >
            {wrap(lede)}
          </p>
        )}
      </div>
    );
  }

  // ①②③ 아젠다(상단 목차) — 본문보다 한 톤 진하게, 간격 좁게
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
    return (
      <p
        style={{
          fontSize: 15.5,
          fontWeight: 600,
          color: '#1f2937',
          lineHeight: 1.7,
          margin: '0 0 10px',
        }}
      >
        {t}
      </p>
    );
  }

  // 기본 본문
  return (
    <p
      style={{
        fontFamily: SERIF,
        fontSize: 16,
        lineHeight: 1.9,
        color: '#374151',
        margin: '0 0 18px',
      }}
    >
      {wrap(t)}
    </p>
  );
}

// (구) 이전/다음 letter 네비게이션 — UI 정리 일환으로 제거됨.
// PrevNextLetterNav + PrevNextCard 정의 모두 삭제.
/* function PrevNextLetterNav({ letter }: { letter: DisplayLetter }) {
  const [prev, setPrev] = useState<{ date: string; headline: string } | null>(null);
  const [next, setNext] = useState<{ date: string; headline: string } | null>(null);

  // letter.id = 'l-YYYYMMDD-XX' → date / group
  const parsed = letter.id.match(/^l-(\d{4})(\d{2})(\d{2})-([A-Z]{2})$/);
  const date = parsed ? `${parsed[1]}-${parsed[2]}-${parsed[3]}` : '';
  const group = letter.mbti_group;

  useEffect(() => {
    if (!date) return;
    const shift = (days: number): string => {
      const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + days);
      return dt.toISOString().slice(0, 10);
    };
    let cancelled = false;
    const tryFetch = async (
      targetDate: string,
      setter: (v: { date: string; headline: string } | null) => void,
    ) => {
      try {
        const res = await fetchTodayLetters(targetDate);
        if (cancelled) return;
        const found = res.letters.find((l) => l.mbti_group === group);
        setter(found ? { date: targetDate, headline: found.headline } : null);
      } catch {
        if (!cancelled) setter(null);
      }
    };
    void tryFetch(shift(-1), setPrev);
    void tryFetch(shift(1), setNext);
    return () => {
      cancelled = true;
    };
  }, [date, group]);

  if (!prev && !next) return null;

  return (
    <nav
      aria-label={`${letter.editorName} 에디터 이전/다음 한 통`}
      style={{
        maxWidth: 720,
        margin: '24px auto 0',
        padding: '0 clamp(20px, 5vw, 32px)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}
    >
      {prev ? (
        <PrevNextCard
          direction="prev"
          targetDate={prev.date}
          headline={prev.headline}
          editorName={letter.editorName}
          group={group}
          accent={letter.accent}
          accentBg={letter.accentBg}
        />
      ) : (
        <div />
      )}
      {next ? (
        <PrevNextCard
          direction="next"
          targetDate={next.date}
          headline={next.headline}
          editorName={letter.editorName}
          group={group}
          accent={letter.accent}
          accentBg={letter.accentBg}
        />
      ) : (
        <div />
      )}
    </nav>
  );
}

function PrevNextCard({
  direction,
  targetDate,
  headline,
  editorName,
  group,
  accent,
  accentBg,
}: {
  direction: 'prev' | 'next';
  targetDate: string;
  headline: string;
  editorName: string;
  group: MbtiGroupId;
  accent: string;
  accentBg: string;
}) {
  const isPrev = direction === 'prev';
  const href = letterHref(`${group.toLowerCase()}-${targetDate}`);
  const label = isPrev ? '이전 한 통' : '다음 한 통';
  const [y, m, d] = targetDate.split('-').map((s) => parseInt(s, 10));
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  const dateLabel = `${m}월 ${d}일 ${dow}요일`;

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 18px',
        background: '#fff',
        border: '1px solid #f1f1f0',
        borderRadius: 14,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.18s, transform 0.18s, border-color 0.18s',
        boxShadow: '0 1px 2px rgba(17,24,39,0.03)',
        textAlign: isPrev ? 'left' : 'right',
        minHeight: 84,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 6px 18px ${accent}22`;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = `${accent}55`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.03)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#f1f1f0';
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: isPrev ? 'flex-start' : 'flex-end',
        }}
      >
        {isPrev && <span aria-hidden>←</span>}
        {label}
        {!isPrev && <span aria-hidden>→</span>}
      </span>
      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
        {editorName} · {dateLabel}
      </span>
      <span
        style={{
          fontFamily: '"Noto Serif KR", serif',
          fontSize: 14.5,
          fontWeight: 600,
          color: '#1f2937',
          lineHeight: 1.45,
          letterSpacing: '-0.01em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: 2,
          // 한 줄 단어 강조용 accent — 살짝 비추는 배경
          background: accentBg,
          padding: '2px 6px',
          borderRadius: 4,
          alignSelf: isPrev ? 'flex-start' : 'flex-end',
          maxWidth: '100%',
        }}
      >
        {headline}
      </span>
    </Link>
  );
} */

// ── 용어 툴팁 ────────────────────────────────────────────────────────
// 본문 안에서 glossary 의 단어들을 dotted underline + 호버 툴팁(term+explain)으로 감싼다.
// 같은 단락 안의 모든 등장에 적용. 가장 긴 단어 먼저 매칭해 substring 충돌 방지.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wrapWithTerms(
  text: string,
  glossary: Array<{ term: string; explain: string }>,
): ReactNode {
  const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);
  const pattern = new RegExp(sorted.map((t) => escapeRegex(t.term)).join('|'), 'g');
  const lookup = new Map(glossary.map((g) => [g.term, g.explain]));

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const m = match[0];
    nodes.push(
      <TermTooltip key={`tt-${i++}-${match.index}`} term={m} explain={lookup.get(m) ?? ''}>
        {m}
      </TermTooltip>,
    );
    lastIndex = match.index + m.length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}

function TermTooltip({
  term,
  explain,
  children,
}: {
  term: string;
  explain: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`용어 해설: ${term}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        setOpen((o) => !o);
      }}
      style={{
        position: 'relative',
        display: 'inline',
        cursor: 'help',
        outline: 'none',
      }}
    >
      <span
        style={{
          borderBottom: '1px dotted #9ca3af',
          paddingBottom: 1,
        }}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 14px',
            background: '#111827',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.55,
            borderRadius: 8,
            minWidth: 200,
            maxWidth: 'min(320px, 80vw)',
            width: 'max-content',
            whiteSpace: 'normal',
            zIndex: 20,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            textAlign: 'left',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif',
            letterSpacing: '-0.005em',
          }}
        >
          <span style={{ fontWeight: 700, color: '#fbbf24', display: 'block', marginBottom: 4 }}>
            {term}
          </span>
          {explain}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #111827',
            }}
          />
        </span>
      )}
    </span>
  );
}
