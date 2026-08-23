'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import {
  LENS_ACCENT,
  LENS_CARD_BORDER,
  LENS_CARD_SHADOW,
  lensFormatAt,
  lensPanelId,
  lensPerspectiveAt,
  lensTabId,
  parseLensView,
  pickLensPhoto,
} from '@/shared/constants/lensPerspectives';
import { HomeSideBar } from '@/shared/ui/HomeSideBar';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/ArticlePrintButton';
import { AiDisclaimer } from '@/shared/ui/AiDisclaimer';
import { Check, Calendar, Play, Headphones, Images, Video, Zap, ArrowRight, type LucideIcon } from 'lucide-react';

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

/**
 * 팟캐스트·영상 목업의 길이 표기 — 고정값("약 1분 30초", "0:45") 대신 실제
 * 불릿 개수에 비례해 계산한다(2026-08-18, "내용이 부실해서 데이터 잘
 * 맞춰서 채워달라" 요청). 인트로 15초 + 사실 1건당 18초 내레이션 가정 —
 * 실측치가 아니라 "그럴듯한 추정"이지만, 불릿이 3개면 4개짜리보다 항상
 * 짧게 나와서 최소한 내용량과 방향이 어긋나지는 않는다.
 */
function mockDuration(bulletCount: number): string {
  const totalSec = 15 + bulletCount * 18;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 완성감 있는 데모 샘플(2026-08-18, "원소스를 프롬프트로 멀티 포맷 변환하는
 * 게 목적" — 카드뉴스·영상·팟캐스트·레터 각각에 맞는 각본으로 바꾸고, 상단에
 * 핵심 요약도 두라는 요청). 이전엔 CMS 4렌즈 불릿(짧은 카드뉴스 문장)만
 * 재활용했는데, 사용자가 원본 기사 전문(김태영 기자, 2026-08-14 06:40 입력)을
 * 직접 붙여줘서 그 전문의 사실을 근거로 포맷별로 다시 썼다 — 원문에는 있지만
 * CMS 4렌즈 불릿에는 없던 사실(500대+300대 순차 도입, 20종 라인업, 제주 제외
 * 지역 조건, 종목코드 403550 등)까지 포함해 밀도를 올렸다. 변조 없이 원문
 * 사실만 재구성. `lens.id`(기사 slug) 키 기준 — 이 특정 기사에만 적용되고
 * 나머지 기사는 지금처럼 CMS 데이터를 그대로 쓴다. 원래는 로컬 dev에서만
 * 켜지는 목업이었으나(2026-08-18 국장님 회의용 실제 프로덕션 노출로 전환
 * — "풀어달라" 요청, `NODE_ENV` 게이트 제거) 지금은 프로덕션에도 그대로
 * 노출된다.
 */
const ARTICLE_FORMAT_SAMPLES: Record<
  string,
  {
    summary?: string[];
    letter?: string[];
    webtoonHeadline?: string;
    webtoon?: string[];
    podcast?: string[];
    video?: string[];
    // 시선 간 연결 문구(2026-08-18, "네 개가 따로 떨어졌다는 느낌" 지적) —
    // 각 포맷 끝에서 다음 시선으로 자연스럽게 넘어가는 한 줄. 마지막
    // 포맷(video)은 다음이 없어 안 씀.
    bridge?: { letter?: string; webtoon?: string; podcast?: string };
  }
> = {
  '2026-08-14-쏘카-테슬라-800대-더-늘린다-전기차-비중-14-로': {
    // 상단 "핵심 요약" — AI LENS 편집장 프롬프트의 "⚡ 30초 핵심"에 해당.
    summary: [
      '쏘카가 연말까지 전기차 비중을 14%로 끌어올려요 — 테슬라 모델Y 800여대와 BYD 아토3 100여대를 9월 말까지 추가해요.',
      '전기차 운영 대수는 지난해보다 59% 늘었고, 대당 수익성도 내연기관차보다 53% 높아요.',
      '이달 28일까지 모델Y 24시간 이상 대여 시 70% 할인, 한 달 전 예약하면 얼리버드 혜택도 있어요.',
    ],
    // 레터(원인) — "왜 이렇게 됐을까"에 맞춰 이용 데이터 중심 서사.
    letter: [
      '쏘카가 전기차를, 그중에서도 테슬라를 이렇게까지 늘리는 이유는 이용 데이터에 있어요. 올해 2분기 전기차 예약은 한 번 빌리면 평균 27시간을 썼는데, 이건 내연기관차의 두 배예요.',
      '게다가 전기차로 다닌 거리의 84%가 100km를 넘었고, 차 한 대 유지관리비도 내연기관차보다 34% 낮았어요. 대당 수익성은 오히려 53% 더 높았고요.',
      '쏘카는 올해 기아 EV3·EV4 롱레인지, 현대차 아이오닉9, 테슬라 모델S·모델X까지 들이며 운영하는 전기차 종류를 20종으로 늘려왔어요. 오래, 멀리, 싸게, 그리고 다양하게 쓰인다는 뜻이니 쏘카 입장에선 늘릴 이유가 충분한 셈이죠.',
    ],
    // 카드뉴스(공감) — "그래서 누가 어떻게 됐을까"는 사람·선택지 중심이어야
    // 하는데, 처음 버전은 물량·일정 숫자만 나열해 "숫자" 페르소나와 다를 게
    // 없었다(2026-08-18, 품질 체크에서 지적). 물량·일정은 영상이 이미
    // 다루니, 카드뉴스는 "그래서 나는 뭘 타게 되나"로 완전히 바꿔 겹침을
    // 없앴다.
    webtoonHeadline: '그래서 누가 이 차를 타게 될까',
    webtoon: [
      '예산 넉넉하게 쓰고 싶다면 — 새로 늘어난 모델Y·모델S·모델X, 프리미엄 \'블랙라벨\'로 예약할 수 있어요.',
      '실속 있게 타고 싶다면 — 기아 EV3, 현대 아이오닉9 같은 실속형·SUV까지 골라 탈 수 있어요.',
      '쏘카가 굴리는 전기차만 20종 — 세단부터 SUV까지, 원하는 대로 골라 타는 시대가 됐어요.',
    ],
    // 팟캐스트(실무) — "그래서 나는 뭘 해야 할까", 이용자 행동 중심 대본.
    podcast: [
      '이번 혜택은 테슬라 모델Y 한정이고, 이달 28일까지 약 3주간 진행돼요. 제주 지역은 빠져요.',
      '그 기간엔 매일 선착순 500명에게, 24시간 이상 빌리면 대여료를 70% 할인해드려요.',
      '여유가 있다면 한 달 전에 모델Y나 아이오닉9, EV9 같은 프리미엄 전기차를 예약해보세요. 2일권을 18만 9000원부터 살 수 있는 얼리버드 혜택이 있어요.',
      '안동화 쏘카 카셰어링본부장은 "예산과 목적에 따라 원하는 전기차를 이용할 수 있도록 증차를 추진했다"고 밝혔어요.',
    ],
    // 영상(숫자) — "그래서 숫자로 보면", 규모·비율 수치 중심 타임라인.
    video: [
      '이번에 늘리는 전기차, 모델Y 800여대에 BYD 아토3 100여대까지 총 900여대예요.',
      '이달 말까지 500대, 다음 달 말까지 300여대로 나눠 들어와요.',
      '기존 차량까지 합치면 쏘카가 굴리는 테슬라만 약 1000대가 돼요.',
      '전기차 운영 대수는 지난해 같은 기간보다 59% 늘었고요.',
      '대당 수익성은 내연기관차보다 53% 높았어요. 쏘카가 잡은 연말 목표는 전기차 비중 14%예요.',
    ],
    bridge: {
      letter: '그럼 이 전기차, 실제로 누가 타게 될까요?',
      webtoon: '그럼 나는 지금 뭘 하면 좋을까요?',
      podcast: '이 변화, 숫자로 정리하면 어떨까요?',
    },
  },
};

function articleFormatSample(
  lensId: string,
  format: 'letter' | 'webtoon' | 'podcast' | 'video',
): string[] | null {
  return ARTICLE_FORMAT_SAMPLES[lensId]?.[format] ?? null;
}

// "핵심 요약" 불릿 — 실제 lens 데이터 기반(2026-08-20, GEO 개선 — 사용자
// 요청: 인용하기 쉬운 리스트·통계가 상단에 있으면 AI 답변엔진 노출에
// 유리하다는 리서치 결과 반영). 팟캐스트 불릿이 사실·수치 위주로 쓰이도록
// 설계돼 있어 1순위, 없으면 영상→웹툰→레터 순으로 폴백(LENS_FORMATS 인덱스
// 기준: 팟캐스트=2, 영상=3, 웹툰=1, 레터=0).
const SUMMARY_BULLET_FORMAT_ORDER = [2, 3, 1, 0];

function coreSummaryBullets(lens: CmsLens): string[] {
  for (const i of SUMMARY_BULLET_FORMAT_ORDER) {
    const bullets = (lens.lenses ?? [])[i]?.bullets?.filter((b) => b && b.trim());
    if (bullets && bullets.length > 0) return bullets.slice(0, 4);
  }
  return [];
}

function articleBridgeSample(lensId: string, format: 'letter' | 'webtoon' | 'podcast'): string | null {
  return ARTICLE_FORMAT_SAMPLES[lensId]?.bridge?.[format] ?? null;
}

/**
 * 카드뉴스 목업 — 인스타 카드뉴스처럼 한 장씩 크게 보여주고 화살표(또는
 * 스와이프)로 넘긴다(2026-08-18, "가로 스크롤 필름스트립은 촌스럽다,
 * 인스타처럼 화살표 누르면 안 되냐" 지적 — 실제로 /design 캔버스로 방향을
 * 먼저 스케치해서 승인받은 뒤 반영). 카드마다 자기 useState가 필요해서
 * 별도 컴포넌트로 뺐다 — 시선 패널은 하나만 보이므로(다른 시선은 hidden)
 * 이 컴포넌트도 사실상 한 인스턴스만 활성 상태로 존재한다.
 */
function CardnewsCarousel({
  photo,
  coverHeadline,
  ordinal,
  full,
  cards,
  color,
  tint,
  Icon,
}: {
  photo: string | null;
  coverHeadline: string;
  ordinal: string;
  full: string;
  cards: { hook: string | null; caption: string }[];
  color: string;
  tint: string;
  Icon: LucideIcon;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const total = cards.length + 1;
  const onPhoto = index === 0;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(total - 1, Math.max(0, i + delta)));
    },
    [total],
  );

  const onTouchStart = (e: ReactTouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 32) return;
    go(dx < 0 ? 1 : -1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          type="button"
          aria-label="이전 카드"
          disabled={index === 0}
          onClick={() => go(-1)}
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: LENS_CARD_BORDER,
            background: '#fff',
            boxShadow: LENS_CARD_SHADOW,
            marginRight: 10,
            cursor: index === 0 ? 'default' : 'pointer',
            opacity: index === 0 ? 0.35 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'relative',
            width: 240,
            aspectRatio: '4/5',
            borderRadius: 14,
            overflow: 'hidden',
            flexShrink: 0,
            background: onPhoto ? (photo ? '#111827' : tint) : '#fff',
            border: onPhoto ? undefined : LENS_CARD_BORDER,
            boxShadow: LENS_CARD_SHADOW,
            boxSizing: 'border-box',
            padding: onPhoto ? 0 : 18,
          }}
        >
          {/* 상단 진행바 — 사진 배경 위에서는 흰 톤, 흰 카드 위에서는 persona
              색 톤으로 대비를 맞춘다(스토리 세그먼트 관습). */}
          <div
            style={{
              position: onPhoto ? 'absolute' : 'static',
              top: onPhoto ? 14 : undefined,
              left: onPhoto ? 14 : undefined,
              right: onPhoto ? 14 : undefined,
              display: 'flex',
              gap: 5,
            }}
          >
            {Array.from({ length: total }).map((_, si) => (
              <div
                key={si}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 999,
                  background: onPhoto
                    ? si <= index
                      ? 'rgba(255,255,255,0.92)'
                      : 'rgba(255,255,255,0.32)'
                    : si <= index
                      ? color
                      : 'rgba(17,24,39,0.10)',
                }}
              />
            ))}
          </div>

          {index === 0 ? (
            <>
              {photo && (
                <>
                  <Image src={photo} alt="" fill sizes="240px" style={{ objectFit: 'cover' }} />
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 45%, transparent 78%)',
                    }}
                  />
                </>
              )}
              <span
                style={{
                  position: 'absolute',
                  top: 26,
                  left: 14,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: photo ? 'rgba(255,255,255,0.78)' : 'rgba(17,24,39,0.5)',
                }}
              >
                AI LENS
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: photo ? 'rgba(255,255,255,0.7)' : '#6b7280' }}>
                  시선 {ordinal} · {full}
                </span>
                <span
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 21,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    letterSpacing: '-0.01em',
                    color: photo ? '#fff' : '#111827',
                    wordBreak: 'keep-all',
                  }}
                >
                  {coverHeadline || '표지'}
                </span>
              </div>
            </>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <span
                aria-hidden
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: 32, height: 32, borderRadius: 999, background: tint, color, marginTop: 14 }}
              >
                <Icon size={15} />
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                {cards[index - 1]?.hook && (
                  <p
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 19,
                      fontWeight: 700,
                      color: '#111827',
                      lineHeight: 1.4,
                      letterSpacing: '-0.01em',
                      wordBreak: 'keep-all',
                      margin: 0,
                    }}
                  >
                    {cards[index - 1]?.hook}
                  </p>
                )}
                <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, wordBreak: 'keep-all', margin: 0 }}>{cards[index - 1]?.caption}</p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="다음 카드"
          disabled={index === total - 1}
          onClick={() => go(1)}
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: LENS_CARD_BORDER,
            background: '#fff',
            boxShadow: LENS_CARD_SHADOW,
            marginLeft: 10,
            cursor: index === total - 1 ? 'default' : 'pointer',
            opacity: index === total - 1 ? 0.35 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#9ca3af' }}>
        {index + 1} / {total}
      </p>
    </div>
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

  // 클릭 직후 아래 내용이 바뀐 걸 못 느낀다는 피드백(2026-08-18, "클릭했는데
  // 화면이 안 바뀐 것처럼 느낄 수 있다")으로 스크롤 보정을 뒀었으나, 배경을
  // 잠깐 물들이는 클릭 피드백은 같은 날 "그 배경색 없애달라"는 요청으로
  // 뺐다 — 위 타일 선택 상태(색 테두리+그림자+체크)만으로도 선택은 이미
  // 충분히 보인다. 딥링크(?v=N) 최초 진입은 여전히 select()가 아니라
  // setActive()를 직접 불러서(위 useEffect) 이 스크롤이 안 걸린다 —
  // "항상 최상단부터 랜딩" 원칙은 그대로 유지.
  const select = useCallback((i: number) => {
    setActive(i);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('v', String(i + 1));
      window.history.replaceState(null, '', url);
      // block:'nearest' — 패널이 이미 화면 안에 있으면(대부분의 경우, 타일
      // 바로 아래라) 아예 스크롤하지 않고, 화면 밖으로 밀려나 있을 때만
      // 최소한으로 당겨온다. 'start'를 쓰면 매번 패널을 뷰포트 맨 위로
      // 붙여서 방금 누른 타일까지 화면 밖으로 밀려나 버린다.
      document.getElementById(lensPanelId(i))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      {/* 좌우 패딩을 홈(NewsFeedTab.tsx)과 동일한 clamp(24px,3.5vw,44px)로
          맞췄다(2026-08-23) — 원래 clamp(20px,4vw,28px)였는데, 카테고리
          페이지에 사이드바를 새로 붙이며 같은 문제(사이드바가 홈보다
          오른쪽으로 밀려 보임)를 발견해 이 페이지도 같이 정정한다.
          위쪽 패딩도 홈과 같은 clamp(8px,2vw,16px)를 추가했다 — 아래
          사이드바 쪽 주석 참조. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
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
              <ArticleShareButtons title={lens.headline} url={`https://ailens.sedaily.ai/lens/${slug}`} />
            </div>
            {/* 글자크기(알약 모양)와 인쇄(각진 정사각) 버튼이 각자
                테두리를 갖고 있어 8px 간격을 두고 붙어 있으니 "한 세트"가
                아니라 "따로 붙은 두 부품"처럼 보였다(2026-08-18, "각 요소들
                배치가 어때요?" 리뷰 후 "넵 개선하세요"). 두 컴포넌트의
                개별 border를 빼고, 여기서 테두리 하나로 감싸 얇은 구분선만
                중간에 넣어 하나의 컨트롤 그룹으로 통일했다. */}
            <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
              <ArticleFontSizeControl cssVar="--lens-font-scale" storageKey="lens-font-size" />
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
              <ArticlePrintButton />
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
            {/* 핵심 요약("30초 핵심") — 실 데이터 기반(2026-08-20, GEO 개선).
                이전엔 데모 기사 하나에만 하드코딩된 오버라이드였는데,
                coreSummaryBullets()로 교체해 실제 발행된 모든 lens 글에서
                동작한다. 네 시선을 고르기 전에 기사 전체의 핵심(수치·사실
                위주)을 먼저 준다 — data-speakable="summary"를 붙여 위
                리드 문단과 함께 "인용하기 쉬운 요약 블록"으로 묶는다. */}
            {coreSummaryBullets(lens).length > 0 && (
              <div
                data-speakable="summary"
                style={{
                  border: LENS_CARD_BORDER,
                  borderRadius: 16,
                  padding: 18,
                  background: '#fff',
                  boxShadow: LENS_CARD_SHADOW,
                  marginBottom: 'clamp(24px, 3.4vw, 32px)',
                }}
              >
                <p className="flex items-center" style={{ gap: 6, fontSize: 13, fontWeight: 800, color: LENS_ACCENT, marginBottom: 12 }}>
                  <Zap size={14} fill="currentColor" aria-hidden />
                  30초 핵심
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                  {coreSummaryBullets(lens).map((s, si) => (
                    <li key={si} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14.5, lineHeight: 1.6, color: '#1f2937', wordBreak: 'keep-all' }}>
                      <Check size={15} style={{ flexShrink: 0, marginTop: 3, color: LENS_ACCENT }} aria-hidden />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rule" />

            {/* ── 형식 선택 ──
                밑줄 텍스트 탭에서 **타일**로 되돌렸다(2026-08-14).
                이 페이지의 핵심 동작이 "어떤 형식으로 볼지 고르기"인데, 앞선
                버전은 그 컨트롤을 회색 16px 텍스트로 낮춰서 화면에서 가장 약한
                요소가 됐다(눈에 안 들어온다는 피드백). 게다가 선택하는 순간에
                형식을 표시하는 요소가 없어서 "넷 중 고른다"는 것이 직관적으로
                전달되지 않았다.
                네 타일을 같은 크기로 나란히 놓으면 선택지가 넷이라는 사실과
                각자가 무슨 형식인지가 한눈에 오고, 선택 상태는 색 채움 + 테두리 +
                체크 3중으로 표시해 색만으로 구분하지 않는다.
                2026-08-20 — 문구를 "누구의 눈으로"(인물 선택)에서 "어떤
                형식으로"(포맷 선택)로 고쳤다. 2026-08-18에 산출물이 4가지
                형식(레터/웹툰/팟캐스트/영상)으로 확정된 뒤에도 이 문구만
                옛 "독자 관점 선택" 프레이밍에 남아있어서, 실제로 고르는 것과
                질문이 어긋나 있었다(사용자가 실제 발행 글에서 직접 발견) —
                아래 lensPerspectives.ts의 LENS_PERSPECTIVES도 같이 고쳤다. */}
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', margin: 'clamp(24px, 3.4vw, 32px) 0 6px' }}>
              이 뉴스, 어떤 형식으로 볼까요?
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 'clamp(14px, 2.2vw, 18px)', wordBreak: 'keep-all' }}>
              고르면 아래 내용이 그 형식으로 바뀝니다.
            </p>

            <div role="tablist" aria-label="형식별 시선" className="picks">
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
                      // 선택 시 타일 전체를 tint로 채우던 걸 뺐다(2026-08-18,
                      // "유형 누르면 뜨는 배경색 없애달라") — 테두리 색 +
                      // 그림자 + 체크 배지 3중 표시로도 선택 상태는 충분히
                      // 드러나고, 배경까지 채우면 특히 진한 색(로즈·앰버
                      // 등)에서 과해 보였다.
                      borderColor: on ? p.color : 'rgba(17,24,39,0.12)',
                      background: '#fff',
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
              const format = lensFormatAt(i);
              // 웹툰·팟캐스트·영상은 완성감 있는 데모 스크립트(딱 한 기사에만
              // 있는 하드코딩 오버라이드)가 있으면 그걸 쓰고, 없는 기사는
              // admin이 실제로 채운 CMS 불릿을 그대로 쓴다(2026-08-19부터
              // LensMode.tsx 4개 포맷 탭이 슬롯마다 다른 내용을 넣을 수 있어
              // 이 폴백이 비로소 의미가 생겼다 — 그 전엔 모든 슬롯이 같은
              // question+bullets를 공유했다).
              const scriptBullets =
                format === 'webtoon' || format === 'podcast' || format === 'video'
                  ? articleFormatSample(lens.id, format) ?? l.bullets
                  : l.bullets;
              // 레터 본문 — 데모 오버라이드 → 없으면 admin이 채운 실제
              // paragraphs(2026-08-19 신설 필드) → 그것도 없으면 아래
              // 불릿 목록으로 폴백(letterParagraphs가 null인 경우).
              const letterParagraphs =
                format === 'letter'
                  ? (articleFormatSample(lens.id, 'letter') ??
                     (l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : null))
                  : null;
              // 웹툰 표지 헤드라인 — 오버라이드가 있으면 그 표지 문구를,
              // 없으면 CMS 질문(l.question)을 그대로 쓴다.
              const webtoonHeadline =
                format === 'webtoon' ? ARTICLE_FORMAT_SAMPLES[lens.id]?.webtoonHeadline ?? l.question : l.question;
              // 실제 미디어 보유 여부(2026-08-19, LensMode.tsx 4개 포맷 탭에서
              // 실제로 채운 경우) — 있으면 정적 목업 대신 진짜 콘텐츠를 그린다.
              // 유튜브·네이버TV 판별은 /video 페이지와 같은 유틸(resolveVideo)을
              // 재사용한다.
              const realWebtoonCuts = format === 'webtoon' && l.images && l.images.length > 0 ? l.images : null;
              const realVideo = format === 'video' && l.video_url ? resolveVideo(l.video_url) : null;
              const realPodcast = format === 'podcast' && l.media_url ? resolveVideo(l.media_url) : null;
              // 유튜브·네이버TV가 아닌 직링크(S3 등에 직접 올린 mp4/mp3) —
              // resolveVideo()는 그 두 플랫폼만 인식해 null을 돌려주므로,
              // URL 자체는 있는데 매칭이 안 될 때만 <video>/<audio> 태그로
              // 직접 재생한다(2026-08-20, 실제 샘플 파일 업로드 대응).
              const directVideoUrl = format === 'video' && l.video_url && !realVideo ? l.video_url : null;
              const directPodcastUrl = format === 'podcast' && l.media_url && !realPodcast ? l.media_url : null;
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
                    // 왼쪽 규칙선(레일)도, 선택 직후 잠깐 배경을 물들이던
                    // 클릭 피드백도 뺐다(2026-08-18, "유형 누르면 뜨는 배경색
                    // 없애달라"). 위 타일 선택 상태 자체가 이미 색+테두리+
                    // 그림자+체크 4중으로 표시되고 있어서, 본문까지 색을
                    // 끌고 오지 않아도 "누구의 시선인지"는 위 타일과 "시선
                    // {ordinal} · {full}" 텍스트로 충분히 전달된다.
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

                  {/* 포맷 배지 — 실제 미디어(2026-08-19, LensMode.tsx 4개
                      포맷 탭에서 admin이 채운 것)가 있으면 "목업" 문구를
                      뺀다. letter는 지금 실제 운영 중인 형태라 배지 없이
                      그대로 둔다. */}
                  {format !== 'letter' && (
                    <p
                      className="flex items-center"
                      style={{ gap: 6, fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 14 }}
                    >
                      {format === 'webtoon' && <Images size={13} aria-hidden />}
                      {format === 'podcast' && <Headphones size={13} aria-hidden />}
                      {format === 'video' && <Video size={13} aria-hidden />}
                      {format === 'webtoon' && (realWebtoonCuts ? '웹툰' : '웹툰 형식 목업 · 아직 생성 파이프라인 미연결')}
                      {format === 'podcast' && (realPodcast || directPodcastUrl ? '팟캐스트' : '팟캐스트 형식 목업 · 아직 생성 파이프라인 미연결')}
                      {format === 'video' && (realVideo || directVideoUrl ? '영상' : '영상 형식 목업 · 아직 생성 파이프라인 미연결')}
                    </p>
                  )}

                  {/* 질문 — 카드 안 시각적 정점(32). 장식 없이 세리프 크기만으로
                      끌어올린다. */}
                  {format === 'letter' && l.question && (
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

                  {/* 레터 본문 — 데모 오버라이드가 있는 기사는 뉴스레터
                      문단으로(2026-08-18, "카드뉴스 거 그대로 가져온거라서"
                      지적 — 레터가 카드뉴스와 같은 불릿 목록을 그대로 쓰고
                      있던 걸 고침). AI LENS 편집장 프롬프트의 문체 가이드
                      (친근한 -했어요체, 문단당 2~3문장)를 따른다. */}
                  {format === 'letter' && letterParagraphs && (
                    <div className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {letterParagraphs.map((para, pi) => (
                        <p
                          key={pi}
                          style={{
                            fontSize: 'calc(16px * var(--lens-font-scale, 1))',
                            lineHeight: 1.8,
                            color: '#374151',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {para}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 앞서는 큰
                      질문 다음에 사실이 그냥 나열돼서 둘이 Q&A 한 쌍이라는 게
                      드러나지 않았고, 그래서 구획이 끝났는지도 애매했다.
                      개수를 함께 보여주면 얼마나 읽어야 하는지도 예측된다.
                      데모 문단 오버라이드가 없는 기사(대부분)는 지금처럼
                      CMS 불릿을 그대로 쓴다. */}
                  {format === 'letter' && !letterParagraphs && l.bullets.length > 0 && (
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

                  {format === 'letter' && !letterParagraphs && !l.question && l.bullets.length === 0 && (
                    <p style={{ fontSize: 14, color: '#6b7280' }}>이 시선은 아직 준비 중이에요.</p>
                  )}

                  {/* 카드뉴스 목업 — 인스타 카드뉴스처럼 한 번에 한 장만
                      크게 보여주고 화살표(또는 스와이프)로 넘긴다
                      (2026-08-18, "가로 스크롤 필름스트립은 촌스럽다" 지적
                      → /design 캔버스로 방향 스케치 후 승인받고 반영).
                      실제 카드뉴스 규격(8컷, 비주얼시스템)은 볼트
                      01_카드뉴스_제작템플릿.md 참조 — 여기선 개수·구조
                      컨셉만 보여준다. */}
                  {/* 실제 웹툰 컷(2026-08-19) — admin이 LensMode.tsx 웹툰
                      탭에서 WebtoonPanelsEditor로 올린 이미지+캡션이 있으면
                      아래 목업 캐러셀 대신 실제 컷을 순서대로 보여준다. */}
                  {format === 'webtoon' && realWebtoonCuts && (
                    <div className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {realWebtoonCuts.map((cut, ci) => (
                        <figure key={ci} style={{ margin: 0 }}>
                          {/* pipelines/webtoon이 실제로 만드는 컷은 1536x1024(3:2
                              가로) — 예전 인스타 카드뉴스(4:5 세로) 전제로 aspect-ratio
                              4/5 + cover를 썼더니 좌우가 크게 잘려서, 말풍선이 화면
                              가장자리에 있으면(BUBBLE_RULES가 "상단·측면 배치"를
                              지시함) 통째로 잘려 보이는 문제가 있었다(2026-08-20
                              사용자 리포트). contain으로 바꿔 잘림 없이 전체를
                              보여준다 — 비율이 정확히 3:2면 레터박스도 안 생긴다. */}
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', borderRadius: 14, overflow: 'hidden', background: '#f3f4f6' }}>
                            <Image src={cut.url} alt={cut.caption || ''} fill sizes="(min-width: 920px) 700px, 100vw" style={{ objectFit: 'contain' }} />
                          </div>
                          {cut.caption && (
                            <figcaption style={{ marginTop: 8, fontSize: 13.5, color: '#374151', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                              {cut.caption}
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  )}

                  {/* 카드뉴스형 목업 — 실제 컷이 없을 때만(위 realWebtoonCuts
                      분기 참조). 인스타 카드뉴스처럼 한 번에 한 장만 크게
                      보여주고 화살표(또는 스와이프)로 넘긴다(2026-08-18,
                      "가로 스크롤 필름스트립은 촌스럽다" 지적 → /design
                      캔버스로 방향 스케치 후 승인받고 반영). */}
                  {format === 'webtoon' && !realWebtoonCuts && (
                    <CardnewsCarousel
                      photo={photo}
                      coverHeadline={webtoonHeadline || ''}
                      ordinal={p.ordinal}
                      full={p.full}
                      color={p.color}
                      tint={p.tint}
                      Icon={p.icon}
                      cards={scriptBullets.map((b) => {
                        const parts = b.split(' — ');
                        return parts.length === 2
                          ? { hook: parts[0], caption: parts[1] }
                          : { hook: null, caption: b };
                      })}
                    />
                  )}

                  {/* 실제 팟캐스트 미디어(2026-08-19) — admin이 LensMode.tsx
                      팟캐스트 탭에서 YouTube 등 링크를 채운 경우 실제 플레이어를
                      임베드한다(/video 페이지와 같은 resolveVideo 유틸). */}
                  {format === 'podcast' && realPodcast && (
                    <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
                      <iframe
                        src={realPodcast.embedUrl}
                        title={l.question || '팟캐스트'}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}

                  {/* 직링크 오디오(2026-08-20) — S3 등에 직접 올린 mp3. 유튜브가
                      아니라 iframe 임베드가 안 되므로 네이티브 <audio>로 재생. */}
                  {format === 'podcast' && directPodcastUrl && (
                    <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
                      <p
                        style={{
                          fontFamily: '"Noto Serif KR", serif',
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#111827',
                          letterSpacing: '-0.01em',
                          wordBreak: 'keep-all',
                          marginBottom: 12,
                        }}
                      >
                        {l.question || '오늘의 브리핑'}
                      </p>
                      <audio controls preload="none" src={directPodcastUrl} style={{ width: '100%' }} />
                    </div>
                  )}

                  {/* 팟캐스트 목업 — 실제 미디어가 없을 때만(위 realPodcast/
                      분기 참조). 재생 버튼·진행바는 정적 장식(실제 오디오
                      없음). 오늘(2026-08-18) 레터 상세에서 "대부분 오디오가
                      없어 빈 회색 카드로 보인다"는 이유로 미니 플레이어를
                      뺐던 것과 같은 함정을 피하려고, 여기서도 실제 재생 상태를
                      흉내내지 않고 컨셉만 고정 표시한다.
                      디자인(2026-08-18 다듬기): tint 채움 카드 → 흰 바탕 +
                      공용 그림자·테두리 토큰. 챕터 라벨을 굵은 인라인 텍스트
                      대신 알약 배지로 바꿔 목록이 표처럼 정렬되게 했다. */}
                  {format === 'podcast' && !realPodcast && !directPodcastUrl && (
                    <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
                      <div className="flex items-center" style={{ gap: 14 }}>
                        <span
                          aria-hidden
                          className="flex items-center justify-center flex-shrink-0"
                          style={{ width: 46, height: 46, borderRadius: 999, background: p.color, color: '#fff' }}
                        >
                          <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p
                            style={{
                              fontFamily: '"Noto Serif KR", serif',
                              fontSize: 16,
                              fontWeight: 700,
                              color: '#111827',
                              letterSpacing: '-0.01em',
                              wordBreak: 'keep-all',
                              marginBottom: 4,
                            }}
                          >
                            {l.question || '오늘의 브리핑'}
                          </p>
                          <p style={{ fontSize: 12.5, color: '#9ca3af' }}>약 {mockDuration(scriptBullets.length)} · AI 음성 브리핑</p>
                        </div>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'rgba(17,24,39,0.07)', margin: '18px 0 16px', overflow: 'hidden' }}>
                        <div style={{ width: '18%', height: '100%', borderRadius: 999, background: p.color }} />
                      </div>
                      {scriptBullets.length > 0 && (
                        <>
                          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
                            이 브리핑이 다루는 것 {scriptBullets.length}
                          </p>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                          {scriptBullets.map((b, bi) => (
                            <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#374151', wordBreak: 'keep-all' }}>
                              <span
                                style={{
                                  flexShrink: 0,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: p.color,
                                  background: p.tint,
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  marginTop: 1,
                                }}
                              >
                                챕터 {bi + 1}
                              </span>
                              <span style={{ lineHeight: 1.6 }}>{b}</span>
                            </li>
                          ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {/* 실제 영상(2026-08-19) — admin이 LensMode.tsx 영상 탭에서
                      YouTube 등 링크를 채운 경우 실제 플레이어를 임베드한다
                      (/video 페이지와 같은 resolveVideo 유틸). */}
                  {format === 'video' && realVideo && (
                    <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
                      <iframe
                        src={realVideo.embedUrl}
                        title={l.question || '영상'}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}

                  {/* 직링크 영상(2026-08-20) — S3 등에 직접 올린 mp4(예: Remotion
                      렌더 결과). 유튜브가 아니라 iframe 임베드가 안 되므로
                      네이티브 <video>로 재생. */}
                  {format === 'video' && directVideoUrl && (
                    <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
                      <video controls preload="none" src={directVideoUrl} className="w-full h-full" style={{ objectFit: 'contain' }} />
                    </div>
                  )}

                  {/* 영상 목업 — 실제 영상이 없을 때만(위 realVideo/
                      directVideoUrl 분기 참조). 기사 사진을 썸네일로 재사용,
                      재생 버튼 오버레이만 정적으로 얹는다.
                      디자인(2026-08-18 다듬기): 플레이어 아래 캡션·타임라인을
                      팟캐스트 챕터와 같은 알약 배지 톤으로 맞춰 두 오디오/영상
                      포맷이 한 세트로 읽히게 했고, 카드 전체에 공용 그림자를
                      둘러 다른 포맷 카드들과 무게감을 맞췄다. */}
                  {format === 'video' && !realVideo && !directVideoUrl && (
                    <div style={{ borderRadius: 16, background: '#fff', boxShadow: LENS_CARD_SHADOW, padding: 14 }}>
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '16/9',
                          borderRadius: 12,
                          overflow: 'hidden',
                          background: '#111827',
                        }}
                      >
                        {photo && (
                          <Image src={photo} alt="" fill sizes="640px" style={{ objectFit: 'cover', opacity: 0.65 }} />
                        )}
                        <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.15)' }} />
                        <span
                          aria-hidden
                          className="flex items-center justify-center"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            margin: 'auto',
                            width: 58,
                            height: 58,
                            borderRadius: 999,
                            background: '#fff',
                            color: p.color,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                          }}
                        >
                          <Play size={22} fill="currentColor" style={{ marginLeft: 3 }} />
                        </span>
                        <span
                          style={{
                            position: 'absolute',
                            right: 10,
                            bottom: 10,
                            fontSize: 11,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: '#fff',
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: 4,
                            padding: '2px 7px',
                          }}
                        >
                          {mockDuration(scriptBullets.length)}
                        </span>
                      </div>
                      {l.question && (
                        <p
                          style={{
                            fontFamily: '"Noto Serif KR", serif',
                            fontSize: 16,
                            fontWeight: 700,
                            color: '#111827',
                            letterSpacing: '-0.01em',
                            margin: '14px 0 10px',
                            wordBreak: 'keep-all',
                          }}
                        >
                          {l.question}
                        </p>
                      )}
                      {scriptBullets.length > 0 && (
                        <>
                          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
                            이 영상이 다루는 것 {scriptBullets.length}
                          </p>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                          {scriptBullets.map((b, bi) => (
                            <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#374151', wordBreak: 'keep-all' }}>
                              <span
                                style={{
                                  flexShrink: 0,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  fontVariantNumeric: 'tabular-nums',
                                  color: p.color,
                                  background: p.tint,
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  marginTop: 1,
                                }}
                              >
                                0:{String((bi + 1) * 12).padStart(2, '0')}
                              </span>
                              <span style={{ lineHeight: 1.6 }}>{b}</span>
                            </li>
                          ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {/* 시선 간 연결 — 네 포맷이 따로 떨어져 보인다는 지적
                      (2026-08-18, "이 4개의 순서가... 연결점, 스토리텔링이
                      자연스러우면 좋겠다" — 전화영어 서비스 레슨 플로우처럼)
                      에 따라, 마지막(video)만 빼고 각 포맷 끝에 다음 시선으로
                      넘어가는 한 줄을 둔다. 데모 문구가 없는 기사·포맷은
                      다음 시선의 role명으로 자동 생성해 어떤 기사에도 동작. */}
                  {format !== 'video' && i + 1 < count && (
                    <button
                      type="button"
                      onClick={() => {
                        select(i + 1);
                        tabRefs.current[i + 1]?.focus();
                      }}
                      className="flex items-center"
                      style={{
                        gap: 6,
                        marginTop: 20,
                        paddingTop: 16,
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        borderTop: '1px solid rgba(17,24,39,0.08)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: lensPerspectiveAt(i + 1).color,
                        wordBreak: 'keep-all',
                      }}
                    >
                      <span>{articleBridgeSample(lens.id, format) ?? `다음 시선 — ${lensPerspectiveAt(i + 1).full}`}</span>
                      <ArrowRight size={14} aria-hidden />
                    </button>
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
                marginBottom: 16,
              }}
            >
              네 시선 모두 같은 기사를 바탕으로 정리했어요.
            </p>

            {/* AI 생성 콘텐츠 고지(2026-08-21, 사용자 요청 — 서울경제 영문
                CMS의 "AI-translated from Korean..." 박스를 레퍼런스로
                "면책조항 걸어주세요"). 원문 링크는 이 박스 안으로 흡수 —
                위 문단에 있던 "원문 기사" 인라인 링크는 중복이라 뺐다. */}
            <AiDisclaimer sourceUrl={lens.source_url} />
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

          {/* 2026-08-18엔 본문 칼럼 안쪽 .lw div의 paddingTop(clamp(28px,
              4.5vw,40px), 헤드라인 전용 여백)을 사이드바에도 그대로
              줬었다("사이드바가 헤더에 바짝 붙어 보인다" 피드백) — 그런데
              2026-08-23에 사용자가 이번엔 반대로 "홈에 비해 사이드바가
              아래로 쏠려 보인다"고 지적했다. 비교 기준이 이 페이지 안의
              본문이 아니라 홈의 사이드바 위치였던 것 — 그래서 바깥 grid
              wrapper에 홈과 같은 clamp(8px,2vw,16px) 위 패딩을 추가하고
              (위 주석 참조), 사이드바 자체의 paddingTop 오버라이드는
              없앤다. 본문 헤드라인의 28~40px 여백은 그대로 유지 — 헤더와
              헤드라인 사이 간격 자체는 2026-08-17에 확정한 의도적인 값. */}
          <HomeSideBar className="hidden lg:block" />
        </div>
      </div>
    </div>
  );
}
