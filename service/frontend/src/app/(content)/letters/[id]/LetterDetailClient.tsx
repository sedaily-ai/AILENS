'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Header } from "@/widgets/Header";
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { EditorCommentsSection, InteractiveBlock, type InteractiveBlockData } from '@/features/news-feed';
import { HomeSideBar } from '@/shared/ui/HomeSideBar';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { trackArticleRead } from '@/shared/lib/tracking/readingTracker';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { useAuth } from '@/features/auth';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { letterHref } from '@/shared/lib/letterHref';
import { fetchCmsPostBySlug } from '@/shared/lib/api/cmsPostsApi';
import { API_URL } from '@/shared/config/apiClient';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/ArticlePrintButton';
import { AiDisclaimer } from '@/shared/ui/AiDisclaimer';
import { Calendar } from 'lucide-react';
import {
  fetchTodayLetters,
  withDisplayMeta,
  type ApiLetter,
  type DisplayLetter,
  type LetterChart,
  type TodayLetterCardLike,
} from '@/shared/lib/api/todayLettersApi';

// 다른 날짜 letter 를 스캔할 때 훑는 최근 일수 — app/letters/[id]/page.tsx 의
// SEED_DAYS 와 같은 값(그룹-날짜 합성 id 스킴 폐지 이후 findLetter 와 동일 패턴).
const LOOKBACK_DAYS = 14;

// 헤더 메타줄·공유 아이콘 — 처음엔 /lens/[slug]/LensViewClient.tsx에서 만든
// 걸 이 파일도 로컬 복제해 뒀었는데(2026-08-18, "헤더부분? 공유버튼?
// 발행일? 카테고리? ... 이거 전체 글들에 동일하게 적용되어야합니다"), 두
// 페이지가 완전히 동일한 ~150줄을 각자 들고 있는 게 유지보수 부담이라
// shared/ui로 추출해 합쳤다(같은 날 후속). 글자크기만 CSS 변수·
// localStorage 키를 페이지별로 다르게 넘긴다 — 본문 fontSize를
// calc(var())로 배선하는 지점(LetterBlock 여러 분기)이 lens와 달라서.
interface Props {
  letterId: string;
  // 서버(빌드타임)에서 findLetter()로 이미 가져온 글 — SSG 결과물 HTML에 실제
  // 본문이 바로 박히게(크롤러가 JS 없이도 볼 수 있게) 초기 상태를 이걸로
  // 채운다. 이후 useEffect는 그대로 재검증용으로 다시 돈다(2026-08-07,
  // JSON-LD/OG 태그는 있는데 정작 화면 본문은 client fetch 전까지 비어있던
  // 문제 — /letters/[id]/page.tsx 의 findLetter 결과를 그대로 내려받는다).
  initialLetter?: DisplayLetter | null;
  // 이전/다음 레터 내비게이션용(2026-08-21, GEO 재감사) — 서버(page.tsx)가
  // findNeighbors()로 미리 조회해 내려준다.
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
  // 우측 사이드바 "요즘 가장 많이 읽힌 글" 서버 프리페치(2026-08-23) —
  // SideRail.tsx 참조.
  initialHotLetters?: TodayLetterCardLike[];
}

interface NeighborLetter {
  id: string;
  headline: string;
  date: string;
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

export function LetterDetailClient({ letterId, initialLetter = null, nextLetter = null, prevLetter = null, initialHotLetters }: Props) {
  const [mounted, setMounted] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [letter, setLetter] = useState<DisplayLetter | null>(initialLetter);
  // 오늘 함께 발행된, 지금 보고 있는 레터를 제외한 다른 레터들 — Another Lens 섹션에 전달.
  const [otherLetters, setOtherLetters] = useState<ApiLetter[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    initialLetter ? 'ready' : 'loading',
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, 클라이언트 hydration 완료 플래그
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
      {/* 글로벌 헤더 — /editors 페이지와 동일한 마크업 (전체 페이지에서 고정).
          'feed' 탭은 2026-08-17 상단 탭 개편으로 nav에서 빠졌다(headerTabs.ts
          참조) — 강조할 대응 탭이 더 없다. */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs()}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main>
        {/* 우측 사이드바를 홈/카테고리/lens 페이지와 완전히 동일한 그리드로
            통일했다(2026-08-23, 사용자 지적 — "사이드바 들어가는 모든 경로의
            위치가 x, y 그리고 포지션도 동일한 위치였으면"). 예전엔 이 페이지만
            별도 폭(1040)·별도 컬럼비(720/260)·별도 사이드바 컴포넌트
            (SideRail.tsx — HomeSideBar와 별개로 존재하던 구현체, lg:sticky
            까지 걸려있어 다른 페이지와 스크롤 동작 자체가 달랐다)를 썼다.
            이제 HomeSideBar를 그대로 쓰고, 바깥 grid도 다른 페이지와 같은
            maxWidth 1320 + clamp(24px,3.5vw,44px) 좌우 패딩 +
            clamp(8px,2vw,16px) 위 패딩을 쓴다 — 본문 가독성 폭(720)은 안쪽
            div에서만 유지한다. */}
        <div
          className="mx-auto"
          style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
            <div style={{ maxWidth: 720, minWidth: 0 }}>
              <LetterBody letter={letter} nextLetter={nextLetter} prevLetter={prevLetter} />
            </div>
            <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
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

// 부제(letter.subtitle) 정제(2026-08-18, "크기나 레이아웃 개선해쥣죠") —
// 일부 레터는 subtitle 필드에 본문 마커 문법(■ 섹션헤더, [라벨] 태그)이
// 그대로 들어있다("■AI 프리즘 [신입 직장인 뉴스] ..."). 헤드라인 바로
// 아래 노출되는 자리라 마커가 그대로 보이면 파싱 안 된 원본이 새어나온
// 것처럼 읽힌다 — 데이터 자체는 안 건드리고 표시 시점에만 앞쪽 마커를
// 걷어낸다.
function cleanSubtitle(raw: string): string {
  return raw
    .replace(/^■\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .trim();
}

// 헤더 배지 라벨(2026-08-18, "이거 카테고리 뭔가요?") — letter.editorName은
// MBTI 4-페르소나 폐지(2026-08-07) 이후 모든 레터가 항상 "AI LENS" 한
// 값이라 카테고리 정보가 전혀 없고, 사이트 로고와 텍스트가 겹쳐 거슬렸다.
// 실제 분류 필드(category → section)로 교체 — 둘 다 없으면 lens의
// "4가지 시선"처럼 이 콘텐츠 형식 자체를 가리키는 "AI 레터"로 폴백.
const SECTION_LABEL: Record<NonNullable<ApiLetter['section']>, string> = {
  trend: '트렌드',
  column: '칼럼',
  issue_talk: '이슈 브리핑',
};
function letterCategoryLabel(letter: DisplayLetter): string {
  return letter.category?.trim() || (letter.section ? SECTION_LABEL[letter.section] : null) || 'AI 레터';
}

// production letter inline 렌더
// - 4개 채널 탭 폐기. 한 페이지에서 자연스러운 흐름으로 통합:
//     헤더 → (있으면) 팟캐스트 미니 플레이어 → 본문 → 핵심 정리/닫는 줄/단어 → 구독
function LetterBody({
  letter,
  nextLetter,
  prevLetter,
}: {
  letter: DisplayLetter;
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
}) {
  // 본문은 한 흐름으로 렌더 — 중간 mock 이미지는 제거. 하단 4컷 카드가 대체.
  const body = letter.body;

  // 시각 v2 — 2026-05-23 이후 발행분에만 적용 (용어 툴팁 + 클로징 풀쿼트).
  // letter.id 'l-YYYYMMDD-XX' 에서 날짜 추출 → lexical 비교.
  const dateStr = letter.id.match(/l-(\d{8})/)?.[1] ?? '';
  const isModern = dateStr >= '20260523';
  // 헤더 메타줄 발행일 표시(2026-08-18) — ApiLetter엔 개별 date 필드가 없다
  // (date는 배치 응답 ApiTodayLettersResponse 쪽에만 있음, 확인됨). id의
  // 'l-YYYYMMDD-XX' 패턴에서 이미 뽑아둔 dateStr을 그대로 재사용하고,
  // 이 패턴을 안 쓰는 CMS 글은 published_at(시:분까지, 2026-08-23 추가)
  // → publish_date(날짜만) 순으로 폴백한다.
  const displayDate = dateStr.length === 8
    ? `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`
    : kstDateTimeLabel(letter.published_at) ?? letter.publish_date?.replaceAll('-', '.') ?? null;
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
        {/* 역할 라벨(archetype) 제거(2026-08-09) — "모든 카테고리가 같은 조건"으로
            에디터 이름 배지 아래 부가 설명 없이 바로 제목. */}
        <h1
          data-speakable="headline"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(24px, 4.5vw, 32px)',
            fontWeight: 600,
            color: '#111827',
            margin: '0 0 12px',
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          {letter.headline}
        </h1>
        {letter.subtitle && (
          <p
            data-speakable="summary"
            style={{
              fontSize: 14,
              color: '#6b7280',
              margin: '0 0 16px',
              lineHeight: 1.55,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {cleanSubtitle(letter.subtitle)}
          </p>
        )}

        {/* 배지·발행일·구글 선호 출처 링크 + 공유·글자크기·인쇄 툴바 —
            lens 상세페이지와 정확히 같은 구성·순서로 맞췄다(2026-08-18,
            "제목 아래에.. 두 요소가 붙어있어야죠... 기존것처럼" — 처음엔
            이 메타줄을 제목 "위"에 두고, 그 사이에 부제·팟캐스트 플레이어가
            끼어들어 공유 툴바가 메타줄과 뚝 떨어져 보였다. lens처럼
            제목 바로 아래에 메타줄 → 공유 툴바가 붙어서 나오도록 순서를
            바꾸고, 원래 있던 부제·팟캐스트 플레이어는 툴바 아래로 옮겼다. */}
        <div className="flex items-center flex-wrap" style={{ gap: 12, marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              background: letter.accentBg,
              color: letter.accent,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            {letterCategoryLabel(letter)}
          </span>
          {displayDate && (
            <p className="flex items-center" style={{ gap: 5, fontSize: 13, color: '#6b7280', fontWeight: 600, margin: 0 }}>
              <Calendar className="w-4 h-4" aria-hidden />
              입력 {displayDate}
            </p>
          )}
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
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ gap: 12, padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
            <ArticleShareButtons title={letter.headline} url={`https://ailens.sedaily.ai/letters/${letter.id}`} />
          </div>
          <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
            <ArticleFontSizeControl cssVar="--letter-font-scale" storageKey="letter-font-size" />
            <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
            <ArticlePrintButton />
          </div>
        </div>

        {/* 팟캐스트 미니 플레이어 제거(2026-08-18, "저거 요소 삭제" — 대부분의
            레터가 오디오가 없어 "아직 준비 중이에요"만 뜨는 회색 카드로
            보였다). 이 카드만 쓰던 LetterPodcastPlayer/fmtTime도 같이 삭제 —
            남겨두면 아무 데서도 안 부르는 죽은 코드가 된다. */}
      </header>

      {/* 본문 — 한 흐름. CMS 글(body_html 있음)은 Tiptap 리치텍스트를 그대로
          렌더 — admin 에서 굵게/글머리/이미지를 넣은 위치 그대로 나온다.
          AI 레터는 body_html 이 없어 기존 ■/[라벨]/Q.A./![]() 마커 파싱으로. */}
      <div style={{ marginBottom: 28 }}>
        {letter.body_html ? (
          <div style={{ fontSize: 'calc(16px * var(--letter-font-scale, 1))', color: '#374151' }}>
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
        <LetterTextExtras letter={letter} modern={isModern} nextLetter={nextLetter} prevLetter={prevLetter} />
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
        `${API_URL}/api/newsletter/subscribe`,
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
function LetterTextExtras({
  letter,
  modern,
  nextLetter,
  prevLetter,
}: {
  letter: DisplayLetter;
  modern?: boolean;
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
}) {
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

      {/* AI 생성 콘텐츠 고지(2026-08-21, 사용자 요청 — 서울경제 영문
          CMS의 "AI-translated from Korean..." 박스를 레퍼런스로 "면책조항
          걸어주세요"). 기존 "원문 보기 — 서울경제 →" 링크는 이 박스 안
          "원문 기사 보기" 링크로 흡수. */}
      <div style={{ marginBottom: 24 }}>
        <AiDisclaimer sourceUrl={letter.source_url} articleId={letter.id} format="letter" />
      </div>

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

      {(nextLetter || prevLetter) && (
        <PrevNextLetterNav next={nextLetter} prev={prevLetter} accent={letter.accent} accentBg={letter.accentBg} />
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
        <p style={{ fontSize: 'calc(14.5px * var(--letter-font-scale, 1))', lineHeight: 1.75, color: '#374151', margin: 0 }}>
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
            fontSize: 'calc(14.5px * var(--letter-font-scale, 1))',
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
              fontSize: 'calc(16px * var(--letter-font-scale, 1))',
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
          fontSize: 'calc(15.5px * var(--letter-font-scale, 1))',
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
        fontSize: 'calc(16px * var(--letter-font-scale, 1))',
        lineHeight: 1.9,
        color: '#374151',
        margin: '0 0 18px',
      }}
    >
      {wrap(t)}
    </p>
  );
}

// 이전/다음 레터 내비게이션(2026-08-21, GEO 재감사에서 새로 구현). 예전
// 버전(MBTI 페르소나 체계 — l-YYYYMMDD-XX id 파싱 + mbti_group 매칭, 아래
// 참고용으로 잠깐 흔적만 남겨뒀다가 삭제)은 그 체계 폐지로 이미 죽어있었다
// — page.tsx의 findNeighbors()가 서버에서 미리 조회해 내려준 데이터를
// 그대로 그리기만 하면 돼서 클라이언트 fetch/useEffect 자체가 필요 없다.
function PrevNextLetterNav({
  next,
  prev,
  accent,
  accentBg,
}: {
  next?: NeighborLetter | null;
  prev?: NeighborLetter | null;
  accent: string;
  accentBg: string;
}) {
  return (
    <nav
      aria-label="이전·다음 레터"
      style={{
        marginTop: 24,
        paddingTop: 24,
        borderTop: '1px solid #f3f4f6',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}
    >
      {prev ? (
        <PrevNextCard direction="prev" letter={prev} accent={accent} accentBg={accentBg} />
      ) : (
        <div />
      )}
      {next ? (
        <PrevNextCard direction="next" letter={next} accent={accent} accentBg={accentBg} />
      ) : (
        <div />
      )}
    </nav>
  );
}

function PrevNextCard({
  direction,
  letter,
  accent,
  accentBg,
}: {
  direction: 'prev' | 'next';
  letter: NeighborLetter;
  accent: string;
  accentBg: string;
}) {
  const isPrev = direction === 'prev';
  const label = isPrev ? '이전 레터' : '다음 레터';
  const [y, m, d] = letter.date.split('-').map((s) => parseInt(s, 10));
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  const dateLabel = `${m}월 ${d}일 ${dow}요일`;

  return (
    <Link
      href={letterHref(letter.id)}
      prefetch
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
      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{dateLabel}</span>
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
          background: accentBg,
          padding: '2px 6px',
          borderRadius: 4,
          alignSelf: isPrev ? 'flex-start' : 'flex-end',
          maxWidth: '100%',
        }}
      >
        {letter.headline}
      </span>
    </Link>
  );
}

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
