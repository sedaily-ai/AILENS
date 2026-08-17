'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/cmsPostsApi';
import {
  LENS_ACCENT,
  lensPanelId,
  lensPerspectiveAt,
  lensTabId,
  parseLensView,
  pickLensPhoto,
} from '@/shared/constants/lensPerspectives';
import { HomeSideBar } from '@/features/news-feed';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { Link as LinkIcon, Check, Printer, Calendar } from 'lucide-react';

// "오늘의 이슈, 4가지 시선" 상세.
//
// 2026-08-14 재설계(3차) — 박스를 걷어내고 타이포·여백·헤어라인으로 구조를
// 만든다. 직전 버전은 한 카드에 테두리 + 그림자 + 컬러 tint 밴드 + 4px 상단선
// 네 가지 틀이 겹쳐 있어서 기사가 아니라 앱 UI 컴포넌트처럼 보였다.
//
// 바뀐 원칙:
//  · 구조는 **위계**로 만든다 — 헤드라인 40 > 질문 32 > 역할명 24 > 리드 18 >
//    본문 16 > 메타 13. 크기 차이가 충분해야 박스 없이도 덩어리가 읽힌다
//    (스티어링 §4: 강조 우선순위 크기 > 굵기 > 대비 > 색상).
//  · 색은 **작은 표식에만** 쓴다(서수·짧은 액센트 바·불릿 점). 넓은 면을
//    채우면 읽는 데 방해가 되고 "강조는 하나만" 원칙도 깨진다.
//  · 구획은 **헤어라인**으로 나눈다. 그림자 카드를 반복하면 스티어링 §4의
//    "카드 반복의 함정"에 걸린다.
//  · 탭은 알약 칩 대신 **밑줄 탭**(신문 섹션 내비게이션 관습). 칩 안에 이미지를
//    넣으면 선택 컨트롤이 과하게 무거워진다 — 캐릭터는 카드 안에서만 쓴다.
//
// ⚠️ SEO — 비활성 시선도 DOM 에는 항상 렌더하고 hidden 으로만 감춘다.
// 조건부 렌더로 3개를 빼면 page.tsx 의 NewsArticle articleBody / mainEntity
// (Question+acceptedAnswer 4쌍)와 실제 본문이 어긋난다.

// Facebook/Twitter(X)/LinkedIn — 우리 lucide-react 버전(^1.7.0)엔 브랜드
// 로고 아이콘이 빠져 있어(정책상 제거됨) 사용자가 붙여준 실제 렌더 마크업의
// SVG path를 그대로 복사했다 — 참고 사이트가 쓰는 lucide 아이콘과 픽셀
// 단위로 동일.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  );
}
function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

// 카카오톡/인스타그램 아이콘 — 처음엔 features/timeline/components/
// ShareBar.tsx의 색이 든 브랜드 배지(카카오 노란 원, 인스타 그라디언트)를
// 그대로 재사용했는데, 이 줄의 나머지 아이콘(Facebook/Twitter/LinkedIn)이
// 전부 회색 선 아이콘(stroke=currentColor)이라 둘만 튀어 보였다(2026-08-18,
// "아이콘 톤앤매너 일치시키죠.. 스케치로"). 같은 줄의 다른 아이콘과 동일한
// 스펙(viewBox 24x24, fill=none, stroke=currentColor, strokeWidth=2, round
// cap/join)으로 다시 그렸다 — 카카오는 말풍선, 인스타그램은 카메라 렌즈+
// 플래시라는 각 앱의 실루엣만 선으로 남기고 브랜드 고유색은 뺐다.
function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4C6.5 4 3 7.5 3 11.5c0 2.6 1.6 4.9 4 6.2l-.9 3.3c-.1.4.3.7.7.5l3.9-2.3c.4.05.85.08 1.3.08 5.5 0 9-3.5 9-7.8S17.5 4 12 4z" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

// Google 공식 4색 "G" 로고마크 — "구글 검색 선호 출처로 추가" 링크가 어떤
// 서비스로 연결되는지 아이콘만 보고도 알 수 있도록(2026-08-18, "아이콘도
// 있어야하지 않나"). Google 브랜드 가이드라인이 공개한 표준 마크 그대로.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

// 공유 버튼 행(2026-08-17) — 로컬 참고 경로
// 1_ailink/globe/dev/frontend/src/components/article/ShareButtons/ShareButtons.tsx
// 를 그대로 이식(사용자 확인: "이거는 영문 사이트 컴포넌트 활용해주시죠",
// 실제 마크업까지 붙여줌). 로직·공유 URL 구성 방식이 원본과 동일 — 색만
// 우리 사이트의 회색/검정 호버 관례(text-gray-400 hover:text-gray-900)로
// 맞췄다(원본은 --color-accent 커스텀 프로퍼티 사용, 우리는 그런 변수가 없음).
function ShareButtons({ title, url }: { title: string; url: string }) {
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
      {/* 카카오톡·인스타그램(2026-08-18, "공유허ㅏ기에.. 인스타그램..
          카카오톡도 넣으시죠") — 아이콘이 나머지와 같은 회색 선 스타일로
          바뀐 뒤엔("아이콘 톤앤매너 일치시키죠.. 스케치로") btnCls를
          그대로 같이 쓴다. 클릭하면 링크 복사(위 "카카오톡/인스타그램은
          SDK·API가 없어 복사로 대체" 참고), 복사되면 체크 표시로 바뀐다. */}
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

// 글자 크기 조절(2026-08-17, "글자 크기랑 인쇄는?") — 원본
// (FontSizeControl.tsx)은 Tailwind text-sm/base/lg 클래스를 .article-content
// 에 토글하는데, 우리 본문(리드 문단·시선 근거 목록)은 인라인 px로 크기를
// 줘서(위 "위계는 크기로" 원칙 참조) 클래스 토글이 안 먹는다. 대신 CSS
// 변수(--lens-font-scale)를 document.documentElement에 심고, 본문 fontSize를
// calc(Npx * var(--lens-font-scale, 1))로 바꿔 실제로 커지게 했다(리드 문단
// 18px, 시선 근거 16px — 아래 렌더 코드 참조). localStorage 기억도 원본과
// 동일하게 유지.
type LensFontSize = 'small' | 'medium' | 'large';
const LENS_FONT_SCALE: Record<LensFontSize, string> = { small: '0.9', medium: '1', large: '1.15' };

function FontSizeControl() {
  const [size, setSize] = useState<LensFontSize>('medium');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lens-font-size') as LensFontSize | null;
      if (saved && saved in LENS_FONT_SCALE) {
        setSize(saved);
        document.documentElement.style.setProperty('--lens-font-scale', LENS_FONT_SCALE[saved]);
      }
    } catch {
      // 시크릿 모드 등 localStorage 접근 불가 — 기본값(medium)으로 둔다.
    }
    return () => {
      document.documentElement.style.removeProperty('--lens-font-scale');
    };
  }, []);

  const change = (next: LensFontSize) => {
    setSize(next);
    document.documentElement.style.setProperty('--lens-font-scale', LENS_FONT_SCALE[next]);
    try {
      localStorage.setItem('lens-font-size', next);
    } catch {
      // 무시 — 저장 안 돼도 이번 방문 중엔 정상 동작.
    }
  };

  const opt = (key: LensFontSize, label: string, px: number) => (
    <button
      type="button"
      onClick={() => change(key)}
      className={`px-2 py-1 font-medium transition-colors ${size === key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
      style={{ fontSize: px }}
      aria-label={`${label} 글자 크기`}
      title={label}
    >
      A
    </button>
  );

  return (
    <div className="flex items-center" style={{ gap: 2, padding: 2 }}>
      {opt('small', '작게', 12)}
      {opt('medium', '보통', 14)}
      {opt('large', '크게', 16)}
    </div>
  );
}

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-gray-400 hover:text-gray-900 transition-colors"
      style={{ padding: 8 }}
      aria-label="기사 인쇄"
      title="인쇄"
    >
      <Printer className="w-4 h-4" />
    </button>
  );
}

export function LensViewClient({
  slug,
  initialLens = undefined,
  otherLens = [],
}: {
  slug: string;
  initialLens?: CmsLens | null;
  otherLens?: CmsLens[];
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!slug || initialLens) return;
    let cancelled = false;
    fetchLensBySlug(slug).then((l) => {
      if (!cancelled) setLens(l);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialLens]);

  const count = lens?.lenses?.length ?? 0;

  // 홈에서 고른 시선(?v=N)을 연다. 스크롤은 건드리지 않는다 — 제목·사진·리드가
  // "무슨 뉴스인지" 주는 맥락이라 항상 최상단부터 보여야 한다.
  useEffect(() => {
    if (count === 0) return;
    const i = parseLensView(window.location.search);
    if (i === null || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
  }, [count]);

  const select = useCallback((i: number) => {
    setActive(i);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(i + 1));
      window.history.replaceState(null, '', url);
    }
  }, []);

  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent, i: number) => {
      if (count === 0) return;
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (i + 1) % count;
      else if (e.key === 'ArrowLeft') next = (i - 1 + count) % count;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      tabRefs.current[next]?.focus();
    },
    [count, select],
  );

  if (!slug || lens === null) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
        <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </div>
    );
  }

  if (!lens) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
      </div>
    );
  }

  const photo = pickLensPhoto(lens);
  const lenses = lens.lenses ?? [];

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <style>{`
        /* 폭을 하나로 통일한다(2026-08-14 최종).
           앞서 헤드라인용 넓은 폭(1080)과 본문용 좁은 폭(748)을 나눴는데,
           두 값을 어떻게 배치해도 문제가 났다 — 형제로 두고 각자 중앙 정렬하면
           좌측선이 166px 어긋나고, 자식으로 중첩하고 마진을 없애면 본문이 넓은
           영역의 왼쪽 끝에 붙어 화면 전체가 왼쪽으로 쏠렸다.
           해결: 컬럼은 하나(.lw)만 두고 모든 블록을 그 안에서 **대칭으로**
           중앙 배치한다. 좌우 여백이 같아지므로 "왼쪽으로 쏠린" 느낌이 없다.
           읽기 폭이 필요한 문단만 .lm 으로 좁히되, 그것도 margin:0 auto 로
           중앙에 둬서 양쪽 여백을 대칭으로 유지한다. */
        .lw { max-width: 880px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        /* 본문 폭 = 사진 폭(2026-08-14 요청). 예전엔 읽기 편한 줄 길이를 위해
           680px 로 좁혔는데, 그러면 사진(컬럼 전체 824px)보다 좁아 좌우가 어긋나
           보였다. 이제 컬럼 폭을 그대로 써서 사진·요약·질문·근거의 좌우선이
           완전히 일치한다.
           트레이드오프: 16px 기준 한 줄이 약 50자가 되어 스티어링 권장(25~40자)을
           넘는다. 정렬 일관성을 우선한 선택이다. */
        .lm { max-width: 100%; }
        .rule { height: 1px; background: rgba(17,24,39,0.1); }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 원문 링크 — 테두리 없는 텍스트 링크. 요약 아래 우측에 붙는다.
           보조 동작이라 시각적 무게를 최소로 두되 밑줄로 링크임을 명확히 한다. */
        .src { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          color: #6b7280; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.25); }
        .src:hover { color: #111827; text-decoration-color: currentColor; }
        .src:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* 사람 타일 선택기 — 모바일 2열, 480px 이상 4열.
           네 칸이 완전히 같은 크기·형태라 "넷 중 하나를 고른다"가 즉시 읽힌다. */
        .picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 480px) { .picks { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        .pick { position: relative; display: flex; flex-direction: column; align-items: center;
          gap: 6px; padding: 16px 12px 14px; border-radius: 14px; border: 1px solid;
          cursor: pointer; min-height: 148px; text-align: center;
          transition: background .16s ease, border-color .16s ease, transform .12s ease; }
        .pick:hover { transform: translateY(-2px); }
        .pick:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }
        .pick-on { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px;
          border-radius: 999px; display: flex; align-items: center; justify-content: center; }



        @media (prefers-reduced-motion: no-preference) {
          .panel { animation: swap .22s ease-out; }
          @keyframes swap { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
      `}</style>

      {/* 글로벌 헤더(2026-08-17) — 이 페이지엔 원래 헤더가 아예 없었다
          ("박스 걷어내고 타이포·여백·헤어라인으로만 구조를 만든다"는
          읽기 전용 설계 원칙, 위 주석 참조). 사용자가 본지(en.sedaily.com)
          스크린샷을 직접 보여주며 "영문사이트는 기사 상세 들어가도
          네비게이션이나 헤더는 다 유지하거든요, 저희도 그렇게 하면
          좋겠어요"라고 확인 — 뒤로가기 말고는 다른 곳으로 이동할 방법이
          없어 "뒤로가기가 이상하다"고 느꼈던 것도 이걸로 같이 해결된다.
          LetterDetailClient.tsx가 이미 쓰는 것과 같은 패턴. */}
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* 우측 사이드바(2026-08-17, 사용자 확인: "홈페이지와 동일 — 인기글+사주")
          — 홈(NewsFeedTab.tsx)과 같은 HomeSideBar를 재사용. 이 페이지는
          원래 .lw(880px) 하나만 중앙 정렬하는 단일 컬럼이었는데("양옆이
          허전하다"는 피드백), 그 .lw 블록들을 감싸는 그리드를 새로 씌워
          왼쪽 칸(본문)+오른쪽 칸(사이드바) 2열로 바꿨다. .lw 자체는
          이 파일 곳곳에서 그대로 재사용되므로 손 안 댔다 — 이제 왼쪽 칸
          (본문 폭, sidebar 없을 때보다 좁음) 안에서 여전히 margin:0 auto로
          중앙 정렬된다. lg 미만에서는 사이드바가 아예 안 뜬다. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: '0 clamp(20px, 4vw, 28px)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <div style={{ gridColumn: 1, minWidth: 0 }}>
      {/* "◀ 시선" 뒤로가기 링크는 걷어냈다(2026-08-17, 사용자 피드백:
          "시선 화살표... 저거는 빼면 어떨까요, 디자인이 구린듯" — 바로
          위에 전역 헤더가 새로 생겨서 그 아래 또 있는 텍스트 뒤로가기
          링크가 중복 내비게이션처럼 보였다). "4가지 시선" 카테고리
          라벨(아래 <main> 첫 줄)은 다른 섹션들과 같은 관례(예: "타임머신"
          위 "그날로 떠나요")라 그대로 유지. */}

      <main id="main-content">
        {/* ── 기사 머리 ── 위계: 아이브로우 13 → 헤드라인 40 → 메타 13 */}
        {/* 헤더 바로 아래 여백을 넓혔다(2026-08-17, "헤더랑 타이틀이 좀
            너무 달라붙은 느낌" — 이 페이지엔 원래 헤더가 없어서 8~14px
            정도로만 잡아뒀던 값인데, 전역 헤더가 새로 생긴 뒤엔 그 아래
            바로 헤드라인이 붙어 보였다). */}
        <div className="lw" style={{ paddingTop: 'clamp(28px, 4.5vw, 40px)' }}>
          {/* 헤드라인 — 한 줄에 들어가도록 넓은 폭(.lw)을 쓰고 크기를 38px로
              한 단계 낮췄다. 다만 이 서비스의 헤드라인 길이는 편차가 커서
              (실측 최장 40자 이상) 긴 제목은 결국 줄바꿈된다. 그때 한 줄만
              길고 다음 줄이 짧아지는 어색한 모양을 막으려고 text-wrap: balance
              를 준다. */}
          {/* 컬럼을 880px 로 통일했으므로 가용 폭이 824px 다. 이 기사 제목의
              예상 폭이 38px 에서 856px 였으므로 36px 로 낮춰 한 줄을 유지한다. */}
          <h1
            data-speakable="headline"
            style={{
              fontSize: 'clamp(26px, 3.4vw, 36px)',
              fontWeight: 800,
              color: '#111827',
              letterSpacing: '-0.03em',
              lineHeight: 1.25,
              marginBottom: 14,
              textWrap: 'balance',
              wordBreak: 'keep-all',
            }}
          >
            {lens.headline}
          </h1>
          {/* 달력 아이콘(2026-08-17, "달력 일러스트? 그거는?") — 원본
              헤더의 <Calendar/> 아이콘도 그대로 이식. 원본은 이 옆에
              <User/> 아이콘 + 기자 바이라인도 있지만, 이 콘텐츠는 특정
              기자 바이라인이 없는 형식이라 그 부분은 스킵.
              "4가지 시선" 배지를 헤드라인 위 별도 줄에서 이 메타 줄
              오른쪽으로 옮겼다가(2026-08-17, "4가지 시선을... 서울경제..
              날짜 오른쪽이랑 교체하면 안되나"), 다시 왼쪽으로 되돌렸다
              (2026-08-18, "카테고링 위치... 좌측으로 가면안되나" — 카테고리
              태그는 독자 시선이 가장 먼저 닿는 좌상단에 있어야 "이게 무슨
              분류의 글인지"가 헤드라인보다 먼저 읽힌다, justify-between으로
              멀리 떨어뜨려 놓으면 그 신호가 늦게 눈에 띈다). */}
          {/* "구글 검색 선호 출처로 추가"를 오른쪽 끝에 따로 뒀더니(2026-08-18
              첫 시도) 배지·날짜와 시선이 끊겨 "따로 논다"는 인상을 줬다
              (2026-08-18, "이것도 좌측으로 몰면 깔끔하지 않을까?"). 배지→
              날짜→구글 링크 세 요소를 전부 한 줄, 왼쪽 시작점에 나란히
              둬서 "이 글의 성격(배지) → 언제·어디서(날짜) → 부가 기능
              (구글 링크)" 순으로 시선이 한 방향으로만 흐르게 정리했다.
              중요도가 진한 배지 → 중간 톤 날짜 → 가장 옅은 회색 링크 순으로
              색 무게도 같이 옅어져서, 굳이 위치를 나누지 않아도 셋의 우선
              순위가 저절로 읽힌다. */}
          {/* 날짜 앞에 "입력" 라벨을 붙였다(2026-08-18, "발행일 인지, 입력인지
              수정인지.. 그런거 표기하면 좋겠고" — sedaily.com 실제 화면의
              "입력 2026-08-17 17:32" 표기를 참고. 단, CmsLens 데이터엔
              날짜만 있고 시:분은 없어(백엔드 필드 자체가 없음, 확인됨)
              "입력 2026.08.14"까지만 표기 가능 — 수정 시각은 별도 필드가
              생기기 전엔 표기할 수 없다). "· 서울경제"는 뺐다(2026-08-18,
              "서울경제 라는 키워드는 빼는게 어떤가요" — 바로 앞 사진
              캡션에도 "사진 · 서울경제"가 있고 페이지 전체가 이미 서울경제
              브랜드라 매 줄마다 반복할 필요가 없다는 판단에 동의). */}
          <div className="flex items-center flex-wrap" style={{ gap: 12, marginBottom: 10 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                background: `${LENS_ACCENT}14`,
                color: LENS_ACCENT,
              }}
            >
              4가지 시선
            </span>
            <p className="flex items-center" style={{ gap: 5, fontSize: 13, color: '#6b7280', fontWeight: 600, margin: 0 }}>
              <Calendar className="w-4 h-4" aria-hidden />
              입력 {lens.date.replaceAll('-', '.')}
            </p>
            <a
              href="https://www.google.com/preferences/source?q=ailens.sedaily.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
              style={{ gap: 5, fontSize: 11.5, color: '#9ca3af', textDecoration: 'none' }}
            >
              <GoogleIcon className="w-3 h-3" />
              구글 검색 선호 출처로 추가
            </a>
          </div>

          {/* 기사 툴바 — 로컬 참고 경로 1_ailink/globe/dev/frontend/src의
              article-toolbar 마크업(border-y 구분선 + 아이콘 행)을 그대로
              가져왔다(2026-08-17, 사용자가 실제 마크업을 붙여주며 "영문
              사이트 컴포넌트 활용해주시죠", 이어서 "글자 크기랑 인쇄는?").
              원본의 AI 요약·저장은 스킵(로그인 저장 기능 없음, 이미 AI로
              재구성된 콘텐츠라 별도 AI 요약 불필요) — 공유·글자크기·인쇄만
              이식. */}
          <div
            className="flex items-center justify-between flex-wrap"
            style={{ marginTop: 'clamp(14px, 2.4vw, 20px)', marginBottom: 'clamp(18px, 3vw, 24px)', gap: 12, padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
              <ShareButtons title={lens.headline} url={`https://ailens.sedaily.ai/lens/${slug}`} />
            </div>
            {/* 글자크기(알약 모양)와 인쇄(각진 정사각) 버튼이 각자
                테두리를 갖고 있어 8px 간격을 두고 붙어 있으니 "한 세트"가
                아니라 "따로 붙은 두 부품"처럼 보였다(2026-08-18, "각 요소들
                배치가 어때요?" 리뷰 후 "넵 개선하세요"). 두 컴포넌트의
                개별 border를 빼고, 여기서 테두리 하나로 감싸 얇은 구분선만
                중간에 넣어 하나의 컨트롤 그룹으로 통일했다. */}
            <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
              <FontSizeControl />
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
              <PrintButton />
            </div>
          </div>
        </div>

        {/* 사진 — 컬럼 폭을 꽉 채우고 높이는 사진이 정한다(레터박스 없음,
            좌우가 본문 가이드라인과 정확히 일치). 라운드·테두리를 없애 기사
            사진처럼 판면에 얹힌 느낌으로 뒀다. */}
        {/* 사진 — 세로가 길어지는 문제를 두 겹으로 막는다.
            (1) 본문 컬럼(.lw, 880px) 안에 두어 폭을 제한한다. 전체 폭이면
                거의 정사각인 사진이 700px 넘게 높아진다.
            (2) 2:1 컨테이너 + cover 로 높이를 확정한다(약 412px). 원본을 2:1 로
                다시 잘라뒀기 때문에 cover 가 잘라내는 양이 거의 없다.
            aspect-ratio 라 자리를 미리 잡아 레이아웃 이동(CLS)도 없다. */}
        {photo && (
          <div className="lw">
            <div style={{ position: 'relative', width: '100%', aspectRatio: '2 / 1', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0 }}>
              <Image
                src={photo}
                alt={lens.headline}
                fill
                sizes="(min-width: 920px) 880px, 100vw"
                priority
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            {/* 사진 출처 캡션 — 실제 뉴스 사이트는 사진 밑에 거의 예외
                없이 이 한 줄이 붙는데 우리는 없어서 "미완성" 인상을
                가장 크게 줬다(2026-08-17 피드백, 워싱턴포스트 비교).
                기사별 캡션 텍스트는 CmsLens에 아직 없는 데이터라(백엔드
                확장 필요) 지어내지 않고, 원문 링크가 있으면 그쪽으로
                출처를 붙인다. */}
            <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 8 }}>
              {lens.source_url ? (
                <>
                  사진 ·{' '}
                  <a href={lens.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    서울경제
                  </a>
                </>
              ) : (
                '사진 · 서울경제'
              )}
            </p>
          </div>
        )}

        {/* ── 리드 + 원문 링크 ── 사진과 같은 .lc 폭이라 좌우선이 맞는다. */}
        <div className="lw" style={{ paddingTop: 'clamp(20px, 3.4vw, 28px)' }}>
        <div>
          {lens.context && (
            <p
              data-speakable="summary"
              className="lm"
              style={{ fontSize: 'calc(18px * var(--lens-font-scale, 1))', lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}
            >
              {lens.context}
            </p>
          )}

          {lens.source_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <a href={lens.source_url} target="_blank" rel="noopener noreferrer" className="src">
                기사 원문 보기
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17 17 7" />
                  <path d="M8 7h9v9" />
                </svg>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                  (새 창으로 열립니다)
                </span>
              </a>
            </div>
          )}
        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 'clamp(28px, 4.4vw, 40px)' }}>
          <div>
            <div className="rule" />

            {/* ── 시선 선택 ──
                밑줄 텍스트 탭에서 **사람 타일**로 되돌렸다(2026-08-14).
                이 페이지의 핵심 동작이 "누구의 눈으로 볼지 고르기"인데, 앞선
                버전은 그 컨트롤을 회색 16px 텍스트로 낮춰서 화면에서 가장 약한
                요소가 됐다(눈에 안 들어온다는 피드백). 게다가 선택하는 순간에
                인물 일러스트가 없어서 "네 명 중 고른다"는 것이 직관적으로
                전달되지 않았다.
                네 타일을 같은 크기로 나란히 놓으면 선택지가 넷이라는 사실과
                각자가 누구인지가 한눈에 오고, 선택 상태는 색 채움 + 테두리 +
                체크 3중으로 표시해 색만으로 구분하지 않는다. */}
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', margin: 'clamp(24px, 3.4vw, 32px) 0 6px' }}>
              이 뉴스, 누구의 눈으로 볼까요?
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 'clamp(14px, 2.2vw, 18px)', wordBreak: 'keep-all' }}>
              고르면 아래 내용이 그 사람 기준으로 바뀝니다.
            </p>

            <div role="tablist" aria-label="독자 유형별 시선" className="picks">
              {lenses.map((l, i) => {
                const p = lensPerspectiveAt(i);
                const on = i === active;
                return (
                  <button
                    key={i}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={lensTabId(i)}
                    aria-selected={on}
                    aria-controls={lensPanelId(i)}
                    tabIndex={on ? 0 : -1}
                    onClick={() => select(i)}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className="pick"
                    style={{
                      borderColor: on ? p.color : 'rgba(17,24,39,0.12)',
                      background: on ? p.tint : '#fff',
                      boxShadow: on ? `inset 0 0 0 1px ${p.color}` : 'none',
                    }}
                  >
                    <span
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 48, height: 48, borderRadius: 999, background: '#fff', overflow: 'hidden' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트 */}
                      <img
                        src={p.illustration}
                        alt=""
                        width={48}
                        height={48}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                      />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: on ? p.color : '#4b5563', letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
                      {p.short}
                    </span>
                    {/* 이 시선이 무엇을 주는지 — 타일에 역할명만 있으면 무엇을
                        고르는지 모르고 골라야 한다. tagline 을 여기로 올려서
                        선택 전에 판단할 근거를 준다(선택 후 본문에서는 중복이라
                        제거했다). */}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: on ? p.color : '#6b7280',
                        opacity: on ? 0.9 : 1,
                        lineHeight: 1.45,
                        textAlign: 'center',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {p.tagline}
                    </span>
                    {/* 선택 표시 — 색 외에 형태 신호도 함께 준다. */}
                    {on && (
                      <span aria-hidden className="pick-on" style={{ background: p.color }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── 선택된 시선 ── 박스 없이 위계로만 구성 */}
            {lenses.map((l, i) => {
              const p = lensPerspectiveAt(i);
              const on = i === active;
              return (
                <section
                  key={i}
                  id={lensPanelId(i)}
                  role="tabpanel"
                  aria-labelledby={lensTabId(i)}
                  data-speakable="qa"
                  hidden={!on}
                  className={on ? 'panel' : undefined}
                  style={{
                    marginTop: 'clamp(22px, 3.4vw, 30px)',
                    // 선택한 타일의 색을 본문 왼쪽 규칙선으로 이어줘서
                    // "이 내용이 위에서 고른 그 사람의 읽기"라는 연결을 만든다.
                    borderLeft: `3px solid ${p.color}`,
                    paddingLeft: 'clamp(16px, 2.4vw, 24px)',
                  }}
                >
                  {/* 역할 머리 — 압축했다. 52px 일러스트와 액센트 바를 뺀 이유는
                      위 선택 타일에 이미 같은 인물이 강조된 채로 있어서 중복이고,
                      그만큼 질문(이 화면의 실제 보상)이 아래로 밀렸기 때문이다.
                      정체성은 컬러 서수 + 역할명 한 줄로 충분하다. */}
                  {/* tagline 은 위 타일로 옮겼다 — 선택 전에 필요한 정보이고,
                      여기서 반복하면 질문이 아래로 밀린다. 대신 몇 번째 시선인지
                      전체 개수와 함께 보여준다(내가 넷 중 어디에 있는지). */}
                  <div className="flex items-center" style={{ gap: 8, marginBottom: 'clamp(14px, 2.2vw, 18px)' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: p.color, letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
                      시선 {p.ordinal} · {p.full}
                    </p>
                    <span aria-hidden style={{ width: 1, height: 12, background: 'rgba(17,24,39,0.15)' }} />
                    <p style={{ fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {i + 1} / {count}
                    </p>
                  </div>

                  {/* 질문 — 카드 안 시각적 정점(32). 장식 없이 세리프 크기만으로
                      끌어올린다. */}
                  {l.question && (
                    <p
                      className="lm"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 'clamp(24px, 3vw, 32px)',
                        fontWeight: 700,
                        color: '#111827',
                        lineHeight: 1.45,
                        letterSpacing: '-0.03em',
                        marginBottom: 'clamp(22px, 3.4vw, 28px)',
                        wordBreak: 'keep-all',
                      }}
                    >
                      {l.question}
                    </p>
                  )}

                  {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 앞서는 큰
                      질문 다음에 사실이 그냥 나열돼서 둘이 Q&A 한 쌍이라는 게
                      드러나지 않았고, 그래서 구획이 끝났는지도 애매했다.
                      개수를 함께 보여주면 얼마나 읽어야 하는지도 예측된다. */}
                  {l.bullets.length > 0 && (
                    <>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          color: '#6b7280',
                          marginBottom: 14,
                        }}
                      >
                        이 질문에 답하는 사실 {l.bullets.length}
                      </p>
                      <ul className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none', padding: 0, margin: 0 }}>
                        {l.bullets.map((b, bi) => (
                          <li key={bi} style={{ display: 'flex', gap: 12, fontSize: 'calc(16px * var(--lens-font-scale, 1))', lineHeight: 1.75, color: '#374151', wordBreak: 'keep-all' }}>
                            <span
                              aria-hidden
                              className="flex-shrink-0"
                              style={{ width: 5, height: 5, marginTop: 11, borderRadius: 999, background: p.color }}
                            />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {!l.question && l.bullets.length === 0 && (
                    <p style={{ fontSize: 14, color: '#6b7280' }}>이 시선은 아직 준비 중이에요.</p>
                  )}
                </section>
              );
            })}

            {/* 구획 마감 — 본문이 끝났는데 아무 표시가 없어 브랜드 문구로 바로
                넘어가는 게 갑작스러웠다. 출처 한 줄로 닫는다: 뉴스에서 "이 사실이
                어디서 왔는지"는 신뢰의 마지막 조각이고, 네 시선이 모두 같은
                기사에서 나왔다는 것도 여기서 확인된다. */}
            <p
              style={{
                marginTop: 'clamp(28px, 4vw, 38px)',
                paddingTop: 16,
                borderTop: '1px solid rgba(17,24,39,0.09)',
                fontSize: 13,
                color: '#6b7280',
                lineHeight: 1.6,
                wordBreak: 'keep-all',
              }}
            >
              네 시선 모두 같은 기사를 바탕으로 정리했어요.
              {lens.source_url && (
                <>
                  {' '}
                  <a
                    href={lens.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#374151', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    원문 기사
                  </a>
                  에서 전체 내용을 확인할 수 있어요.
                </>
              )}
            </p>
          </div>
          </div>
        )}

        <div className="lw" style={{ paddingTop: 'clamp(44px, 6vw, 64px)', paddingBottom: 100 }}>
        <div>
          <div className="rule" />

          {/* "다른 시선" 미리보기(2026-08-16) — 마감부가 문구 한 줄 + 링크
              하나뿐이라 "허전하다"는 피드백. page.tsx가 fetchAllLens()
              in-flight 캐시에 편승해 이미 가져온 값 중 현재 글만 뺀 3개를
              넘겨준다(추가 API 호출 없음). */}
          {otherLens.length > 0 && (
            <div style={{ margin: '28px 0 8px' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 }}>
                다른 시선
              </p>
              <div>
                {otherLens.map((l) => {
                  const photo = pickLensPhoto(l);
                  return (
                    <Link
                      key={l.id}
                      href={`/lens/${encodeURIComponent(l.id)}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 0',
                        textDecoration: 'none',
                        borderTop: '1px solid rgba(17,24,39,0.07)',
                      }}
                    >
                      {photo && (
                        <span
                          className="flex-shrink-0"
                          style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}
                        >
                          <Image src={photo} alt="" fill sizes="64px" style={{ objectFit: 'cover' }} />
                        </span>
                      )}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 3 }}>
                          {l.date.replaceAll('-', '.')}
                        </span>
                        <span
                          style={{
                            display: '-webkit-box',
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#111827',
                            lineHeight: 1.4,
                            letterSpacing: '-0.01em',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {l.headline}
                        </span>
                      </span>
                      <span aria-hidden className="flex-shrink-0" style={{ color: '#c0c5cc', fontSize: 16 }}>
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '28px 0 4px', lineHeight: 1.5 }}>
            일상 속의 모든 소식, 신속하고 정확한 전달
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>통찰력 있는 이야기 · 인스타그램 @lens.sedaily</p>
          <Link
            href="/lens"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14, fontWeight: 700, color: LENS_ACCENT, textDecoration: 'none' }}
          >
            다른 시선 보기 →
          </Link>
        </div>
        </div>
      </main>
          </div>

          {/* 본문 칼럼은 안쪽 .lw div가 paddingTop:clamp(28px,4.5vw,40px)로
              헤더와 헤드라인 사이 여백을 갖는데, 사이드바는 그리드의 맨 위
              에 그대로 붙어 있어 헤더에 바짝 붙어 보였다(2026-08-18, "저거,
              헤더에 너무 붙은거 아닌가?"). 본문과 같은 값으로 맞춰 두 칼럼의
              시작선을 나란히 맞춘다. */}
          <HomeSideBar className="hidden lg:block" style={{ paddingTop: 'clamp(28px, 4.5vw, 40px)' }} />
        </div>
      </div>
    </div>
  );
}
