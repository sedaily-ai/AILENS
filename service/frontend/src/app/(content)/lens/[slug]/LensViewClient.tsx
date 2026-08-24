'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
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
import { HomeSideBar } from '@/features/news-feed';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/ArticlePrintButton';
import { ArticleAudioPlayer } from '@/shared/ui/ArticleAudioPlayer';
import { ArticleVideoPlayer } from '@/shared/ui/ArticleVideoPlayer';
import { LensFormatArt } from '@/shared/ui/icons/LensFormatArt';
import { Calendar, type LucideIcon } from 'lucide-react';

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
 * 재생 길이 표기 — 2026-08-21부터 **실측값만** 쓴다.
 *
 * 이전엔 mockDuration(불릿 개수 × 18초 + 15초)으로 "그럴듯한 추정치"를
 * 만들어 붙였다. 실제 오디오·영상이 붙은 뒤에도 그 추정치가 그대로
 * 노출돼서, 화면에 적힌 "1:33"과 플레이어가 재생하는 실제 길이가 서로
 * 달랐다 — 뉴스 서비스에서 지어낸 숫자를 화면에 박아두면 안 된다.
 * 이제 <audio>/<video>의 loadedmetadata에서 받은 duration만 표시하고,
 * 아직 모르면 길이 자리를 비워둔다(포맷 이름만 보여준다).
 */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 레터 예상 읽기 시간. 한글 묵독 속도를 분당 500자로 잡는다(보수적 추정 —
 * 통상 600~700자로 보지만 경제 기사엔 수치·고유명사가 많아 느려진다).
 * 이건 추정임을 문구에서도 "약 N분"으로 밝힌다.
 */
function readMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 500));
}

/**
 * 형식 탭에 붙는 **실제 분량** — 이 기사를 이 형식으로 보면 얼마나 되는지
 * (약 2분 / 8컷 / 3:24 / 준비 중).
 *
 * 2026-08-21에 추가했다. 그 전 탭은 아이콘 + 이름뿐이라 넷 중 무엇을 고를
 * 근거가 화면에 없었고, 결국 하나씩 눌러 확인해야 했다. 그런데 이 서비스가
 * 다른 데서 못 보여주는 것이 바로 "같은 기사 = 네 가지 분량"이다 — 그걸
 * 선택 시점에 나란히 놓는다.
 *
 * 동시에 "준비 중"을 결정 시점으로 끌어올린다. 앞서는 형식을 고른 **뒤에야**
 * 음성이 없다는 걸 알렸는데, 고르기 전에 알려주는 게 맞다.
 *
 * 오디오·영상 길이는 loadedmetadata가 오기 전까지는 모르므로 그때까지
 * "음성"/"영상"이라고만 쓴다. 지어낸 길이는 쓰지 않는다(clock() 주석 참조).
 */
function formatAmount(
  lens: CmsLens,
  i: number,
  durSec: number | undefined,
): { text: string; spoken: string } {
  const l = (lens.lenses ?? [])[i];
  const nope = { text: '준비 중', spoken: '준비 중' };
  if (!l) return nope;
  const format = lensFormatAt(i);

  if (format === 'letter') {
    const paras =
      articleFormatSample(lens.id, 'letter') ?? (l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : null);
    const chars = (paras ?? l.bullets).join('').length;
    if (chars === 0) return nope;
    const m = readMinutes(chars);
    return { text: `약 ${m}분`, spoken: `약 ${m}분 분량` };
  }

  if (format === 'webtoon') {
    const cuts = l.images?.length ?? 0;
    return cuts > 0 ? { text: `${cuts}컷`, spoken: `${cuts}컷` } : nope;
  }

  // 오디오·영상은 파일에서 길이를 읽어야 안다. 아직 안 왔으면 "⋯"만 둔다 —
  // 형식 이름을 한 번 더 쓰면("영상 · 영상") 중복이고, "--:--"는 있지도 않은
  // 플레이어 상태를 흉내내는 것이고, 지어낸 길이는 애초에 금지다.
  // 스크린리더에는 "길이 확인 중"으로 또박또박 읽힌다.
  const url = format === 'podcast' ? l.media_url : l.video_url;
  if (!url) return nope;
  if (!durSec) return { text: '⋯', spoken: '길이 확인 중' };
  const m = Math.floor(durSec / 60);
  const s = durSec % 60;
  return { text: clock(durSec), spoken: s === 0 ? `${m}분` : `${m}분 ${s}초` };
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
  formatName,
  cards,
  color,
  tint,
  Icon,
}: {
  photo: string | null;
  coverHeadline: string;
  /** 형식 이름("웹툰") — 예전엔 인물 설명(full, "그림으로 가볍게 보고 싶은
   *  사람")과 서수(②)를 표지에 박았는데, 같은 것을 페이지 다른 곳에서는
   *  "웹툰"이라고 불러서 이름이 둘로 갈렸다. 서수는 이제 화면 어디에도
   *  안 쓰므로(선택기가 위치를 보여준다) 여기서도 뺐다(2026-08-21). */
  formatName: string;
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

  // ⚠️ stopPropagation 필수 — 2026-08-21에 패널 전체에도 가로 스와이프(형식
  // 전환)가 붙었다. 여기서 막지 않으면 컷을 넘기려는 스와이프가 형식 전환까지
  // 같이 발동해 웹툰에서 팟캐스트로 튄다. 컨테이너에 data-own-swipe도 달아
  // 두었으니(아래) 두 겹으로 막힌다.
  const onTouchStart = (e: ReactTouchEvent) => {
    e.stopPropagation();
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    e.stopPropagation();
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 32) return;
    go(dx < 0 ? 1 : -1);
  };

  return (
    <div data-own-swipe style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 36×36 → 44×44(.fmt-arrow). 터치 타겟 최소치를 못 넘겼고, 테두리도
            흰 배경 대비 1.1:1(rgba(0,0,0,0.06))이라 "누를 수 있는 것"으로
            보이지 않았다. 2026-08-21. */}
        <button
          type="button"
          aria-label="이전 컷"
          disabled={index === 0}
          onClick={() => go(-1)}
          className="fmt-arrow"
          style={{ marginRight: 8 }}
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
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: photo ? 'rgba(255,255,255,0.78)' : 'rgba(17,24,39,0.5)',
                }}
              >
                AI LENS
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* 10.5 → 13px, 흰 글자 불투명도 0.7 → 0.86. 사진 위 작은
                    글자는 원래도 읽기 어려운 조건인데 최소 캡션 크기(13px)
                    아래였다. 인물명(full) 대신 형식 이름을 쓴다 — 페이지의
                    다른 곳과 이름을 하나로 통일했다. */}
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: photo ? 'rgba(255,255,255,0.86)' : '#6b7280' }}>
                  {formatName}
                </span>
                <span
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 20,
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
                      fontSize: 20,
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
                <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.65, wordBreak: 'keep-all', margin: 0 }}>{cards[index - 1]?.caption}</p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="다음 컷"
          disabled={index === total - 1}
          onClick={() => go(1)}
          className="fmt-arrow"
          style={{ marginLeft: 8 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      {/* #9ca3af(2.54:1) → #6b7280(4.87:1). 진행 위치는 보조 정보라도
          읽혀야 하는 정보다. */}
      <p style={{ fontSize: 14, color: '#4b5563', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
        {index + 1} / {total}
      </p>
    </div>
  );
}

export function LensViewClient({
  slug,
  initialLens = undefined,
}: {
  slug: string;
  initialLens?: CmsLens | null;
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  // 실제 오디오·영상 길이(초). loadedmetadata에서만 채운다 — 지어낸 길이를
  // 쓰지 않기 위해서다(clock() 주석 참조).
  const [mediaDur, setMediaDur] = useState<Record<number, number>>({});
  // 방금 어느 방향으로 이동했는지(-1 왼쪽 / 0 없음 / +1 오른쪽). 인디케이터가
  // 움직인 방향과 본문이 들어오는 방향을 맞추는 데만 쓴다.
  const [dir, setDir] = useState(0);
  // 형식 설명(.fmt-toast) 표시 여부 — 2026-08-21, 사용자 요청("팟캐스트
  // 클릭했을 때 보였으면 좋겠어, 항상 본문에 있는게 아니라"). 처음엔 탭을
  // 고른 순간에만 나타나 2.6초 뒤 스스로 사라지게 만들었는데, 그 자동 소멸이
  // 문제였다 — 사용자가 아무것도 안 눌러도 타이머가 끝나면 이 블록이 DOM에서
  // 빠지면서 아래 본문이 위로 당겨졌다("화면이 리셋되며 위아래로 움직인다"
  // 리포트의 원인). 지금은 한 번 탭을 고르면 다음에 다른 탭을 고르기 전까지
  // 계속 떠 있는다 — 저절로 사라지지 않으니 저절로 화면이 움직일 일도 없다. */
  const [showDesc, setShowDesc] = useState(false);
  // 웹툰 대사 전문 펼침 — 컷 아래 캡션을 걷어내고 전문을 접힌 목록으로
  // 옮겼다(아래 .strip 주석 참조). 형식별로 나누지 않는다: 한 번에 한
  // 패널만 보이므로 상태 하나로 충분하다.
  const [showScript, setShowScript] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // 패널 가로 스와이프 시작점. 세로 스크롤·텍스트 선택과 다투지 않게
  // 가로 우세를 확실히 요구한다(onPanelTouchEnd 참조).
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const noteDur = useCallback((i: number, raw: number) => {
    if (!Number.isFinite(raw) || raw <= 0) return;
    const sec = Math.round(raw);
    setMediaDur((cur) => (cur[i] === sec ? cur : { ...cur, [i]: sec }));
  }, []);

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
    // 딥링크 진입은 설명(showDesc)을 안 띄운다 — 최초 진입은 항상
    // 최상단부터 보여야 하고(주석대로), 설명 문구까지 열려 있으면 그
    // 원칙과 부딫힌다. 사용자가 탭을 직접 누르면(select()) 그때 뜬다.
  }, [count]);

  // 클릭 직후 아래 내용이 바뀐 걸 못 느낀다는 피드백(2026-08-18, "클릭했는데
  // 화면이 안 바뀐 것처럼 느낄 수 있다")으로 스크롤 보정을 뒀었으나, 배경을
  // 잠깐 물들이는 클릭 피드백은 같은 날 "그 배경색 없애달라"는 요청으로
  // 뺐다 — 위 타일 선택 상태(색 테두리+그림자+체크)만으로도 선택은 이미
  // 충분히 보인다. 딥링크(?v=N) 최초 진입은 여전히 select()가 아니라
  // setActive()를 직접 불러서(위 useEffect) 이 스크롤이 안 걸린다 —
  // "항상 최상단부터 랜딩" 원칙은 그대로 유지.
  const select = useCallback((i: number) => {
    setDir(i > active ? 1 : i < active ? -1 : 0);
    setActive(i);
    setShowDesc(true);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(i + 1));
    window.history.replaceState(null, '', url);
    // ⚠️ rAF 안에서 스크롤한다. 앞선 버전은 setActive() 직후 같은 tick에
    // scrollIntoView를 불렀는데, 그 시점의 대상 패널은 아직 hidden(=박스가
    // 없는 상태)이라 브라우저가 스크롤을 아예 하지 않았다 — 보정이 있는
    // 것처럼 보였지만 실제로는 동작하지 않았다. 특히 긴 레터를 읽다가 짧은
    // 포맷으로 바꾸면 문서 높이가 줄면서 스크롤이 하단으로 클램프돼 마감부에
    // 떨어지는 문제가 있었다.
    //
    // 스크롤 목적지 = 형식 설명(#lens-desc), 패널 자체(lens-N)가 아니다
    // (2026-08-21 변경). "레터, 약 2분 분량"을 눌렀는데 화면이 리드 이유가
    // 여기 있었다 — 목적지가 본문 패널이면 그 패널 상단(=질문·리드 첫
    // 줄)까지만 당겨오고, 방금 누른 탭 바로 아래에 뜨는 설명 문구는 화면
    // 밖에 남을 수 있었다. 이제 "레터를 누르면 그 설명이 보이는 지점"을
    // 목적지로 잡는다 — 설명 문구가 곧 그 탭을 누른 결과이기 때문이다.
    // block:'nearest' — 이미 화면 안에 있으면 움직이지 않고, 밖으로
    // 밀려나 있을 때만 최소한으로 당겨온다. 상단 오프셋은 CSS
    // scroll-margin-top(.lens-panel)이 sticky 헤더+형식 바 높이만큼 잡아준다.
    requestAnimationFrame(() => {
      const el = document.getElementById('lens-desc') ?? document.getElementById(lensPanelId(i));
      if (!el) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    });
  }, [active]);

  /**
   * 패널 가로 스와이프로 형식 넘기기 — 이 서비스는 "출퇴근길에 한 손으로"가
   * 기본 사용 맥락인데, 앞서는 형식을 바꿀 방법이 탭 하나뿐이었다. 스와이프를
   * 붙이면 네 형식이 "나란히 놓인 페이지"로 느껴져서, 인디케이터가 옆으로
   * 미끄러지는 것과 조작 감각이 일치한다.
   *
   * 탭은 그대로 남는다 — 스와이프는 발견 가능한 조작이 아니므로 유일한
   * 수단이 되면 안 된다(스와이프만 아는 사람은 없다).
   */
  const onPanelTouchStart = useCallback((e: ReactTouchEvent) => {
    const t = e.touches[0];
    // 오디오 스크러버·임베드·자체 스와이프를 가진 캐러셀 위에서는 안 잡는다.
    if (!t || (e.target as HTMLElement).closest?.('audio, video, iframe, [data-own-swipe]')) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onPanelTouchEnd = useCallback(
    (e: ReactTouchEvent, i: number) => {
      const start = swipe.current;
      swipe.current = null;
      if (!start || count < 2) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // 56px 이상 + 세로 이동의 1.6배 이상 — 세로 스크롤 중의 손떨림이나
      // 텍스트 드래그가 형식 전환으로 오인되지 않는 최소 조건.
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const next = dx < 0 ? i + 1 : i - 1;
      if (next < 0 || next >= count) return;
      select(next);
    },
    [count, select],
  );

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
  // 지금 고른 형식 — 슬라이딩 인디케이터 색(--c/--t)과 설명 토스트가 쓴다.
  const activeP = lensPerspectiveAt(active);
  const ActiveIcon = activeP.icon;

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* ⚠️ 아래 <style> 안의 주석은 CSS 문자열이라 **HTML 응답에 그대로
          실려 나간다**(SSR 페이지라 매 요청마다). 그래서 설계 근거는 전부
          여기 JSX 주석에 둔다 — 이건 빌드 때 사라진다. CSS 블록 안에는
          한 줄짜리 힌트만 남긴다. 2026-08-21에 이 규칙을 정하기 전까지는
          약 4.5KB의 주석이 매 요청 함께 나가고 있었다.

          ── 레이아웃(.lw / .lm) ──
          폭을 하나로 통일한다(2026-08-14 최종). 앞서 헤드라인용 넓은 폭(1080)과
          본문용 좁은 폭(748)을 나눴는데, 두 값을 어떻게 배치해도 문제가 났다 —
          형제로 두고 각자 중앙 정렬하면 좌측선이 166px 어긋나고, 자식으로
          중첩하고 마진을 없애면 본문이 넓은 영역의 왼쪽 끝에 붙어 화면 전체가
          왼쪽으로 쏠렸다. 해결: 컬럼은 하나(.lw)만 두고 모든 블록을 그 안에서
          대칭으로 중앙 배치한다.
          .lm 은 원래 읽기 폭(680px)을 위한 것이었는데 2026-08-14에 "본문 폭 =
          사진 폭" 요청으로 100%가 됐다. 트레이드오프: 16px 기준 한 줄이 약
          50자가 되어 스티어링 권장(25~40자)을 넘는다 — 정렬 일관성을 우선한
          선택이고, 지금도 유효하다.

          ── 형식 선택기(.fmt-*) — 2026-08-21 재설계 ──
          직전 버전은 인물 일러스트가 들어간 148px 타일 2×2(모바일)였다. 첫
          사용자가 이 페이지를 이해하지 못하는 원인이 대부분 이 컨트롤에 있었다:

           1. 선택기가 스크롤과 함께 사라졌다. 한 번 본문으로 들어가면 "지금
              무슨 형식을 보고 있는지"도, "다른 형식으로 바꾸는 방법"도 화면에
              없다. 그래서 sticky로 고정한다 — 이 페이지에서 유일하게 항상
              닿아야 하는 컨트롤이다.
           2. 일러스트가 형식을 설명하지 않았다. /lens/role-1-newcomer.png 라는
              파일명 그대로, 옛 "사회초년생·직장인·자영업자·투자자" 페르소나 축에서
              남은 인물 그림이다. 넷 다 같은 톤의 회색 라인아트라 "레터"와
              "팟캐스트"를 구별해주지 못한다. 형식을 뜻하는 아이콘(BookOpen/
              Image/Headphones/Video)으로 바꿨다 — 이미 lensPerspectives.ts에
              있는데 여태 작은 배지에만 쓰고 있었다.
           3. 타일이 세로로 320px을 먹었다. 375px에서 태그라인("구조와 흐름까지
              제대로 알고 싶다면")이 4줄로 감겨서, 아무 내용도 안 읽기 전에 화면
              절반을 선택지가 차지했다. 태그라인은 선택기에서 빼고, 고른 형식의
              설명을 탭 직후 잠깐 뜨는 토스트(.fmt-toast, 2026-08-21부터)로
              보여준다 — 상시 노출 줄이었다가, 항상 화면에 붙어 있지 않고
              "누른 순간에만" 뜨도록 바꿨다(사용자 요청).

          ── 2차(같은 날) — "너무 일차원적" 피드백 반영 ──
          1차 결과는 아이콘 + 이름만 든 검은 알약 4개였다. 규칙은 다 지켰지만
          정보가 없었다. 세 가지를 더했다:

           a. **분량을 탭 안으로.** 각 탭이 이 기사를 그 형식으로 보면 얼마나
              되는지 함께 보여준다(약 2분 / 8컷 / 3:24 / 준비 중,
              formatAmount()). 이건 이 서비스만 보여줄 수 있는 정보다 — 같은
              기사의 네 가지 분량. 덕분에 (1) 고르기 전에 판단 근거가 생기고,
              (2) "준비 중"이 고른 뒤가 아니라 고르기 전에 밝혀진다.
              1행 이름 / 2행 아이콘+분량 2단 구성인 이유: 375px 칸 안쪽이
              69.75px인데 1행에 아이콘(18)+"팟캐스트"(56)를 같이 넣으면 넘친다.
              아이콘이 분량 옆에 오면 "약 2분"이 읽는 시간인지 듣는 시간인지도
              같이 구분해준다.

           b. **슬라이딩 인디케이터(.fmt-thumb).** 알약마다 배경을 켜고 끄면
              전환이 "깜빡임"이지만, 하나가 옆으로 미끄러지면 넷이 나란히 놓인
              하나의 대상이 된다 — 형식 간 인접 관계를 나르는 유일한 요소다.
              색도 그 형식 색으로 물들어서 아래 설명 토스트(.fmt-toast)와
              소속이 이어진다.
              라벨은 절대 흰색으로 반전시키지 않는다 — 반전시키면 thumb가
              지나가는 180ms 동안 흰 글자가 흰 배경 위에 놓여 사라진다.
              대신 채움(10% 워시) + 컬러 룰 3px + 굵기(600→800) + 색
              (#6b7280→#111827) 네 겹으로 표시한다. 색 없이도(굵기·명도·룰 위치)
              구별되므로 색각 이상에서도 동일하게 읽힌다.
              컬러 룰은 thumb 아래, 흰 배경 위에 둔다 — tint 위에 얹으면
              앰버(#d97706)가 2.81:1로 UI 요소 기준(3:1)을 못 넘긴다.

           c. **가로 스와이프(onPanelTouchStart/End) + 방향성 전환.** 출퇴근길
              한 손 사용이 기본 맥락인데 형식을 바꿀 방법이 탭 하나뿐이었다.
              스와이프한 방향 = 인디케이터가 미끄러지는 방향 = 새 본문이
              들어오는 방향(swap-fwd/swap-back)으로 셋을 일치시킨다.
              웹툰 컷 캐러셀은 자기 스와이프를 갖고 있어 stopPropagation +
              data-own-swipe 로 두 겹 차단한다.

          패널 제목줄(.fmt-head, "레터 · 약 2분 읽기")은 없앴다 — 그 정보가
          탭으로 올라갔고 탭은 sticky라 항상 보인다. 같은 말을 두 번 하지 않는다.

          "이어서 웹툰으로 보기" 같은 다음 형식 이동 버튼(.fmt-next)은
          2026-08-21에 완전히 뺐다(사용자 요청) — 근거는 각 패널 마지막의
          JSX 주석 참조. 그 CSS 규칙도 함께 지웠다. */}
      <style>{`
        .lw { max-width: 880px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        .lm { max-width: 100%; }
        .rule { height: 1px; background: rgba(17,24,39,0.1); }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* ── 이 페이지의 공통 문법 3개 ───────────────────────────────────
           1. .ovl  구역 이름표. 크기로 소리치지 않고 자간·굵기로만 구분한다.
           2. .rule 구역 경계. 이게 **유일한** 구분 장치다(카드·컬러 룰 없음).
           3. .lnk  보조 링크. 위치·크기·밑줄이 전부 같아서 서로 경쟁하지 않는다.
           2026-08-21에 이 셋으로 통일했다 — 그 전엔 카드 테두리+그림자,
           전폭 헤어라인, 3px 컬러 왼쪽 룰이 섞여 있어서 어디까지가 한 덩어리인지
           읽히지 않았다("너무 분산돼 보인다"). */
        /* 13 → 18px(2026-08-21). 13px 자간 0.06em 오버라인은 "세련되지만
           안 읽히는" 쪽이었다 — 구역 이름은 스크롤하며 훑을 때 가장 먼저
           잡혀야 하는 글자다. 넓은 자간도 뺐다: 18px 한글에 0.06em을 주면
           글자가 흩어져 오히려 덩어리로 안 읽힌다. h1(26~36px)과는 여전히
           명확히 차이 나므로 위계는 유지된다. */
        .ovl { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: #111827; }
        /* 크기 이력: 14 → 16 → 14px. 가시성 개선으로 한 번 올렸는데(구역
           이름표·탭과 같이 키움) 16px은 본문과 같은 크기라 "기사 원문 보기"가
           리드 문단만큼 무거워졌다 — 이건 페이지를 떠나는 보조 동작이고
           주인공이 아니다. 14px로 되돌린다(캡션 최소치 13px보다 위, 대비
           7.56:1). 히트 영역은 min-height 44px로 그대로 유지하므로 글자만
           작아지고 누르기 쉬운 정도는 안 변한다. */
        .lnk { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          border: none; background: none; cursor: pointer;
          color: #4b5563; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.28); }
        .lnk:hover { color: #111827; text-decoration-color: currentColor; }
        .lnk:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* padding-bottom 2px = thumb 아래 컬러 룰 두께. 이게 없으면 룰이 바
           밖으로 삐져나와 아래 본문 위에 얹힌다.
           2026-08-24 — 룰을 3 → 2px로 얇혔다(사용자 요청: "스트록이 좀 더
           얇아져야"). 대비는 색 기준이라 두께와 무관(앰버 3.19:1 유지).
           바 높이 = 8(위 패딩) + 60(탭: 8+20+4+20+8) + 2(룰) + 1(경계선) = 71px. */
        .fmt-bar { position: sticky; top: 56px; z-index: 20; background: #fff;
          padding: 8px 0 2px; border-bottom: 1px solid rgba(17,24,39,0.12); }
        .fmt-row { position: relative; display: grid; gap: 8px;
          grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }

        /* 슬라이딩 인디케이터. 형식 간 "인접 관계"를 나르는 유일한 요소다 —
           칸을 하나 건너뛰면 두 칸을 지나가고, 색도 그 형식 색으로 물든다. */
        .fmt-thumb { position: absolute; inset: 0 auto 0 0; pointer-events: none;
          width: calc((100% - (var(--n) - 1) * 8px) / var(--n));
          transform: translateX(calc(var(--ai) * (100% + 8px)));
          border-radius: 10px 10px 0 0;
          /* 2026-08-24 (재조정) — 탭 칸 전체를 틴트로 채우던 방식은 "칠한
             사각형"처럼 무거워 보였다(사용자: "이상해, 더 세련되고 고급지게").
             편집형 지면의 고급 세그먼트 탭처럼 채움을 거의 없애고, 밑줄에서
             아주 은은하게 피어오르는 바텀 글로우만 남긴다 — 위쪽 55%는 완전
             투명, 맨 아래만 형식 색 9% 워시라 "칠한 블록"이 아니라 "밑줄에서
             배어나온 빛"으로 읽힌다. 활성 라벨(#111827)은 투명 구간에 놓여
             대비가 흰 배경 그대로다.
             color-mix 미지원 브라우저는 앞 줄의 soft 틴트로 폴백. */
          background: var(--t);
          background: linear-gradient(180deg,
            transparent 0%, transparent 48%,
            color-mix(in srgb, var(--c) 14%, #ffffff) 100%);
          transition: transform .3s cubic-bezier(.22,.85,.2,1); }
        /* 컬러 룰 — 2026-08-24, 원색이 쨍해서 흰색을 섞어 파스텔로 낮췄다
           (사용자: "색이 더 파스텔 톤이여도 될 것 같아"). 파스텔이라 밑줄
           단독 대비는 3:1 아래로 내려가지만, 선택 상태는 굵은 잉크 라벨(800)
           + 바텀 글로우 채움으로도 함께 전달돼 색에만 의존하지 않는다.
           2px + 파스텔 색의 부드러운 글로우로 은은하게 떠 보이게 한다. */
        .fmt-thumb::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px;
          height: 2px; border-radius: 2px 2px 0 0;
          background: color-mix(in srgb, var(--c) 62%, #ffffff);
          box-shadow: 0 1px 9px -1px color-mix(in srgb, var(--c) 34%, transparent); }

        .fmt { position: relative; z-index: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 4px;
          min-height: 56px; padding: 8px 4px; border: none; background: none;
          border-radius: 10px 10px 0 0; cursor: pointer; }
        /* font-weight 는 트랜지션에 넣지 않는다 — 가변 폰트라 보간은 되지만
           글자 폭이 함께 변해 라벨이 미세하게 흔들린다. 굵기는 즉시 바뀌고
           색만 부드럽게 따라간다.
           크기 이력: 14 → 16 → 14px. 가시성 개선으로 한 번 16px까지 올렸는데
           이름 4개가 본문과 같은 크기로 나란히 서니 sticky 바가 무거워졌다
           (바 높이도 64 → 76px까지 늘었다). 분량 표기(14px)와 한 단계 차이만
           두고 되돌린다 — 굵기(선택 시 800)와 슬라이딩 인디케이터가 이미
           존재감을 내고 있어서 크기까지 키울 필요가 없다. */
        .fmt-name { font-size: 14px; font-weight: 600; color: #6b7280;
          letter-spacing: -0.01em; white-space: nowrap; transition: color .2s ease; }
        .fmt-amt { display: flex; align-items: center; gap: 4px; font-size: 14px; color: #6b7280;
          font-variant-numeric: tabular-nums; white-space: nowrap; transition: color .2s ease; }
        /* 형식 손그림 아이콘(LensFormatArt) — 2026-08-24, 이모지 대체.
           currentColor를 따르므로 비활성은 아래 .fmt-amt 회색, 활성은
           형식 색으로 물든다(아래 규칙). */
        .fmt-art { display: inline-flex; flex-shrink: 0; color: #9ca3af; }
        .fmt[aria-selected='true'] .fmt-art { color: var(--c); }
        .fmt[aria-selected='false']:hover .fmt-art { color: #6b7280; }
        /* 선택된 형식은 이름이 그 형식 색으로 물든다(2026-08-24, 사용자 요청:
           "레터 누르면 레터 텍스트가 보라색으로"). --c는 활성 형식 색이고
           활성 탭만 aria-selected=true라 정확히 그 탭에만 적용된다. 볼드(800)
           14px라 3:1 기준 대상 — 네 브랜드 색 모두 흰 배경에서 통과한다. */
        .fmt[aria-selected='true'] .fmt-name { color: var(--c); font-weight: 800; }
        .fmt[aria-selected='true'] .fmt-amt { color: #4b5563; }
        .fmt[aria-selected='false']:hover .fmt-name,
        .fmt[aria-selected='false']:hover .fmt-amt { color: #111827; }
        .fmt:focus-visible { outline: 2px solid #111827; outline-offset: -2px; }
        /* 폭 계산(이름 14px 기준)
           375px: 칸 77.75px, 안쪽 69.75px. 1행 "팟캐스트" 14px/800 ≈ 56px,
                  2행 아이콘 14 + 간격 4 + "준비 중" 14px 46px = 64px. 여유 있다.
           320px: 칸 64px, 안쪽 56px — 56px이 딱 닿는다. 좌우 패딩을 4 → 2px로
                  줄여 안쪽 60px을 확보하고 분량만 한 단계 내린다.
           칸 간격 8px은 어느 폭에서도 줄이지 않는다(인접 타겟 최소 간격). */
        @media (max-width: 359px) {
          .fmt { padding: 8px 2px; }
          .fmt-amt { font-size: 13px; gap: 2px; }
        }

        /* 형식 설명 — 탭을 누를 때마다 갈아끼워지는 자리. 3px 컬러 왼쪽 룰을
           걷어냈다(2026-08-21): 이것만 15px 들여쓰여서 위아래 블록과 왼쪽
           시작선이 어긋났고, 헤어라인과 다른 세 번째 구분 문법이었다. 형식과의
           연결은 바로 위 인디케이터(같은 색)와의 거리, 그리고 바뀔 때마다
           다시 도는 슬라이드-인이 담당한다.

           2026-08-21 — 상시 노출 줄(.fmt-desc)에서 "누른 순간에 뜨는 설명"
           (.fmt-toast)으로 바꿨다(사용자 요청: "팟캐스트 클릭했을 때 보였으면
           좋겠어, 항상 본문에 있는게 아니라"). 한 번 뜨면 다른 탭을 고르기
           전까지 계속 떠 있는다 — 자동으로 사라지는 타이머는 없다(있었더니
           타이머가 끝날 때 레이아웃이 갑자기 줄어 화면이 움직였다). 탭 바로
           아래, 탭과 같은 폭에서 뜨게 해 "이 탭에서 나온 설명"으로 읽히도록
           했다 — 본문 칼럼(.lread, 620px)에 붙이면 탭과 시각적으로 끊어진다. */
        .fmt-toast { display: flex; align-items: flex-start; gap: 8px;
          margin-top: 10px; padding: 12px 14px; border-radius: 12px;
          background: color-mix(in srgb, var(--c) 8%, #ffffff);
          font-size: 15px; line-height: 1.6; color: #374151; word-break: keep-all; }
        @media (prefers-reduced-motion: no-preference) {
          .fmt-toast { animation: toast-in .22s ease-out; }
          @keyframes toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        }

        /* 준비 안 된 형식의 정직한 안내 — 탭의 "준비 중"이 결정 시점에
           알리고, 이 줄이 그래서 대신 뭐가 있는지 말한다. */
        .fmt-note { margin-bottom: clamp(16px, 2.4vw, 24px); font-size: 16px; line-height: 1.6;
          color: #6b7280; word-break: keep-all; }

        /* 형식 본문 첫 줄 — 네 형식이 공유한다. 앞서는 같은 스타일을 세
           군데(레터 질문 / 팟캐스트 제목 / 영상 제목)에 인라인으로 손으로
           적어두고 값이 조금씩 어긋나 있었다(letterSpacing -0.03 vs -0.02,
           marginBottom 16 vs 24 vs clamp). 한 곳으로 모아야 탭을 옮겨도
           첫 줄이 같은 자리·같은 무게로 앉는다. */
        .fmt-lede { font-family: "Noto Serif KR", serif;
          font-size: clamp(20px, 2.6vw, 24px); font-weight: 700; color: #111827;
          line-height: 1.5; letter-spacing: -0.02em; word-break: keep-all;
          max-width: 720px; margin-bottom: 24px; }

        /* ── 읽기 지면 ──────────────────────────────────────────────────
           2026-08-24 — 620px → 720px(사용자 요청). 카테고리 탭·상단 요약이
           전체 폭(~824px)이라 620px 본문이 좁아 보였는데, 720px(≈한글 44자)로
           올려 폭 차이를 크게 줄이면서도 긴 산문 가독성(스티어링 25~40자
           권장에 근접)을 지킨다. 왼쪽 기준선은 그대로라 위 요소들과 시작선이
           일치하고, 넓어진 줄은 행간 1.85로 받친다. */
        .lread { max-width: 720px; }
        .lread > p { font-size: calc(16px * var(--lens-font-scale, 1));
          line-height: 1.85; color: #374151; word-break: keep-all; }
        .lread > p + p { margin-top: 24px; }
        /* 리드인 — 첫 문단만 한 단계 크게. 눈이 어디서 시작할지 정해준다. */
        .lread > p.lread-lead { font-size: calc(18px * var(--lens-font-scale, 1));
          line-height: 1.8; color: #1f2937; }
        /* 드롭캡(2026-08-24) — 편지·칼럼의 오프닝 관례. 첫 글자를 세리프로
           크게 흘려 "읽는 편지"의 문을 연다. 형식 색(레터=보라, --lc는
           .lread에 인라인으로 주입)으로 물들여 탭·인디케이터와 한 색으로
           묶는다. ::first-letter는 부모의 커스텀 속성을 상속받는다. */
        .lread > p.lread-lead::first-letter { float: left; font-family: "Noto Serif KR", serif;
          font-size: 3em; line-height: 0.84; font-weight: 700;
          color: var(--lc, #111827); margin: 6px 12px 0 0; }
        /* 레터 사인오프 — 편지 서명. 형식 색 마크 + 발신인 + 위 얇은 룰. */
        .lread-sign { display: flex; align-items: center; gap: 10px;
          margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(17,24,39,0.1); }
        .lread-sign-mark { flex-shrink: 0; width: 22px; height: 3px; border-radius: 999px; }
        .lread-sign-name { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; color: #6b7280; }

        /* 웹툰 — 컷을 붙여 세로로 이어 붙인다. 컷마다 radius를 주면 조각난
           카드 8장이 되므로 위아래 끝만 둥글게 깎고 사이는 2px로 붙인다. */
        .strip { display: flex; flex-direction: column; gap: 2px;
          border-radius: 14px; overflow: hidden; background: #f3f4f6; }

        /* 걸어둔 번호 목록 — 30초 핵심과 같은 장치. 번호 열이 왼쪽에 정렬돼
           목록이 표처럼 안정되고, 알약 배지 같은 추가 장치를 안 쓴다. */
        .hang { display: flex; flex-direction: column; gap: 20px;
          list-style: none; padding: 0; margin: 0; }
        .hang > li { display: flex; align-items: baseline; gap: 14px; word-break: keep-all;
          font-size: calc(16px * var(--lens-font-scale, 1)); line-height: 1.8; color: #374151; }
        .hang-n { flex-shrink: 0; width: 22px; font-size: 14px; font-weight: 800;
          color: #6b7280; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }


        .fmt-arrow { display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid #949494; background: #fff; cursor: pointer; }
        .fmt-arrow:disabled { cursor: default; opacity: .4; }
        .fmt-arrow:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* sticky 헤더(56px) + 형식 바(72px) + 여유 6px. */
        .lens-panel { scroll-margin-top: 134px; }

        @media (prefers-reduced-motion: no-preference) {
          /* 방향성 전환 — 오른쪽 형식으로 갔으면 새 내용이 오른쪽에서 들어온다.
             인디케이터가 움직인 방향과 본문이 들어온 방향이 같아서, 넷이 나란히
             놓인 하나의 대상이라는 게 몸으로 읽힌다. 12px 이상 밀지 않는다 —
             .lw 좌우 여백(최소 20px) 안에 있어야 가로 스크롤바가 생기지 않는다. */
          .panel[data-dir='1'] { animation: swap-fwd .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='-1'] { animation: swap-back .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='0'] { animation: swap-in .22s ease-out; }
          @keyframes swap-fwd { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-back { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
        @media (prefers-reduced-motion: reduce) {
          .fmt-name, .fmt-amt, .lnk { transition: none; }
          .fmt-thumb { transition: none; }
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
                fontSize: 13,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                background: `${LENS_ACCENT}14`,
                color: LENS_ACCENT,
              }}
            >
              4가지 시선
            </span>
            <p className="flex items-center" style={{ gap: 6, fontSize: 14, color: '#4b5563', fontWeight: 600, margin: 0 }}>
              <Calendar className="w-4 h-4" aria-hidden />
              입력 {lens.date.replaceAll('-', '.')}
            </p>
            <a
              href="https://www.google.com/preferences/source?q=ailens.sedaily.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
              style={{ gap: 6, fontSize: 14, color: '#4b5563', textDecoration: 'none' }}
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
              <span style={{ fontSize: 14, color: '#4b5563', fontWeight: 600 }}>공유하기</span>
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
            <p style={{ fontSize: 14, color: '#4b5563', marginTop: 8 }}>
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

          {/* 원문 링크 — 리드 문단 오른쪽 아래(2026-08-21 최종 위치).
              위치 이력: 리드 아래 → 요약 아래 → 다시 리드 아래.
              오른쪽 끝을 flex-end로 붙이면 이 컨테이너 폭 = .lm(리드) 폭 =
              바로 아래 .rule(구분선) 폭이라, 링크 오른쪽 끝이 리드 문단
              오른쪽 끝과 구분선 끝에 정확히 맞는다 — 요청한 "맨 밑줄이랑
              정렬".
              marginTop을 안 준다: .lnk 가 터치 타겟용으로 min-height 44px을
              갖고 있어서 글자가 박스 가운데 오고, 그 여백이 이미 리드와의
              간격 역할을 한다. 여기에 margin을 더하면 리드에서 떨어져
              "어디에도 안 붙은 링크"가 된다. */}
          {lens.source_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a href={lens.source_url} target="_blank" rel="noopener noreferrer" className="lnk">
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

          {/* 핵심 요약("30초 핵심") — 실 데이터 기반(2026-08-20, GEO 개선).
              이전엔 데모 기사 하나에만 하드코딩된 오버라이드였는데,
              coreSummaryBullets()로 교체해 실제 발행된 모든 lens 글에서
              동작한다. 네 시선을 고르기 전에 기사 전체의 핵심(수치·사실
              위주)을 먼저 준다 — data-speakable="summary"를 붙여 위
              리드 문단과 함께 "인용하기 쉬운 요약 블록"으로 묶는다.

              2026-08-21 — 이 카드와 "기사 원문 보기"의 순서를 한 번 바꿨다가
              (리드 → 요약 → 링크) 되돌렸다. 최종: 리드 → 링크 → 요약.
              링크가 리드 문단 오른쪽 아래에 붙어 오른쪽 끝이 리드·구분선과
              한 줄로 맞는 편이 화면에서 훨씬 정돈돼 보인다는 판단(사용자
              지정). 요약 전체의 출처라는 의미는 바로 아래 구분선 하나만
              건너면 되므로 크게 흐려지지 않는다.

              이 카드는 count > 0 게이트 밖(리드와 같은 .lw 블록)에
              옮겼다. 원문 링크가 그 게이트 안에 들어가면 lenses가 빈 글에서
              페이지 안 원문 링크가 하나도 안 남는다(AiDisclaimer도 같은
              게이트 안에 있다). 카드 자체는 coreSummaryBullets()가 lenses를
              읽으므로 lenses가 비면 여전히 안 그려진다 — 동작 변화 없음. */}
          {/* 위 원문 링크의 .lnk 박스가 44px(터치 타겟)이라 그 아래 여백이
              이미 확보돼 있다. 여기에 32를 더하면 구분선이 너무 멀어져
              리드-요약이 남남처럼 보인다 — 24로 줄여 실제 눈에 보이는
              간격을 다른 구역 경계와 같게 맞춘다. */}
          {coreSummaryBullets(lens).length > 0 && (
            <div data-speakable="summary" style={{ marginTop: 24 }}>
              <div className="rule" />
              {/* 카드(테두리 + 그림자 + radius 16 + 안쪽 패딩 16)를 걷어냈다
                  (2026-08-21). 이 파일의 원래 설계 원칙이 "박스를 걷어내고
                  타이포·여백·헤어라인으로만 구조를 만든다"인데 이 카드만 예외로
                  남아 있었고, 그 결과 아래 형식 선택 구역과 다른 문법을 써서
                  둘이 별개 모듈처럼 보였다. 안쪽 패딩 때문에 본문·헤드라인과
                  왼쪽 시작선도 16px 어긋나 있었다.
                  이름표는 아래 "어떻게 볼까요"와 같은 .ovl 하나로 통일 —
                  두 구역이 형제 관계로 읽힌다. Zap 아이콘은 뺐다(다른 이름표엔
                  아이콘이 없어서 이것만 다른 종류의 장치였다). */}
              {/* 리듬 단위를 하나로 고정했다: 32 → 구분선 → 32 → 이름표 →
                  16 → 내용. 두 구역(30초 핵심 / 어떻게 볼까요)이 같은 간격으로
                  반복되니 스크롤하면서 "또 같은 구조가 오는구나"가 예측된다.
                  앞서는 12·4·28~40·0·16·24~32이 섞여 반복 단위가 없었다. */}
              <p className="ovl" style={{ margin: '32px 0 16px' }}>
                30초 핵심
              </p>
              {/* 체크 아이콘 → 번호. 체크는 "완료된 할 일" 기호라 뉴스 요약과
                  뜻이 안 맞고, 세 줄이 서로 대등한 사실이라는 관계도 못 나른다.
                  01·02·03 고정폭 숫자는 신문 키포인트 관례이고, 왼쪽에 정렬된
                  숫자 열이 생겨 목록이 표처럼 안정된다. */}
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 16, listStyle: 'none', padding: 0, margin: 0 }}>
                {coreSummaryBullets(lens).map((s, si) => (
                  <li key={si} style={{ display: 'flex', alignItems: 'baseline', gap: 14, wordBreak: 'keep-all' }}>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 20,
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#6b7280',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {String(si + 1).padStart(2, '0')}
                    </span>
                    <span
                      style={{
                        fontSize: 'calc(16px * var(--lens-font-scale, 1))',
                        lineHeight: 1.7,
                        color: '#1f2937',
                      }}
                    >
                      {s}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 32 }}>
          <div>
            <div className="rule" />

            {/* ── 형식 선택 ──
                히스토리: 밑줄 텍스트 탭 → 인물 일러스트 타일 2×2(2026-08-14)
                → 형식 이름으로 문구 정정(2026-08-20) → 지금의 sticky 세그먼트
                (2026-08-21). 왜 또 바꿨는지는 위 <style> 블록 .fmt-* 주석에
                항목별로 적어뒀다.

                제목 크기를 24 → 20 → 13px(.ovl)까지 내렸다(2026-08-21).
                h1(36px) 아래 20px h2가 오면 주인공이 둘로 갈리고, 무엇보다
                위 "30초 핵심"과 다른 크기 체계를 쓰는 순간 두 구역이 형제로
                안 읽힌다. 이제 둘 다 .ovl 하나를 쓴다 — 구역 이름표는 크기로
                소리치지 않고, 존재감은 바로 아래 탭 바가 낸다.
                (2026-08-14에 "선택기를 회색 16px 텍스트로 낮췄더니 안 보인다"는
                피드백이 있었지만, 그때 약했던 건 **컨트롤 자체**였다. 지금
                컨트롤은 슬라이딩 인디케이터가 달린 탭 바이고 약해진 건
                이름표뿐이다.)
                문구도 줄였다: "이 뉴스, 어떻게 볼까요?" → "어떻게 볼까요" —
                무슨 뉴스인지는 위에서 이미 다 말했다. */}
            {/* "형식 차이 보기"(LensFormatGuide 모달)를 뺐다 — 2026-08-21.
                이 버튼은 탭이 아이콘 + 이름뿐이던 시절, 네 형식이 뭔지 알려줄
                유일한 창구여서 넣은 것이었다. 그 뒤 탭이 이 기사의 실제 분량
                (약 2분 / 8컷 / 3:24 / 준비 중)을 직접 보여주고, 바로 아래
                설명줄이 고른 형식이 뭘 주는지 갈아끼워 보여주게 되면서
                모달이 하는 말과 화면에 이미 있는 말이 겹쳤다. 같은 설명을
                두 경로로 두면 사용자는 어느 쪽이 최신인지 판단해야 한다.
                (모달 자체는 홈 티저 LensPreviewSection에서 계속 쓰인다 —
                거기는 기사를 고르기 전이라 분량을 보여줄 수 없어서 설명이
                여전히 필요하다.) */}
            <h2 className="ovl" style={{ margin: '32px 0 16px' }}>
              어떻게 볼까요
            </h2>

            <div className="fmt-bar">
              <div
                role="tablist"
                aria-label="이 뉴스를 볼 형식"
                aria-orientation="horizontal"
                className="fmt-row"
                style={
                  {
                    '--n': count,
                    '--ai': active,
                    '--c': activeP.color,
                    '--t': activeP.tint,
                  } as CSSProperties
                }
              >
                {/* 슬라이딩 인디케이터 — 탭 뒤에서 움직인다. 형식 색으로 물들며
                    옮겨가므로 "몇 칸 옆으로 갔는지"와 "지금 무슨 형식인지"를
                    한 요소가 같이 말한다. 정보는 이름·분량 텍스트가 나르고
                    이건 관계만 나르므로 aria에서 감춘다. */}
                <span className="fmt-thumb" aria-hidden />
                {lenses.map((l, i) => {
                  const p = lensPerspectiveAt(i);
                  const on = i === active;
                  const amt = formatAmount(lens, i, mediaDur[i]);
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
                      className="fmt"
                      // 분량 텍스트가 "⋯"이나 "8컷"처럼 짧은 기호·단위라
                      // 그대로 읽히면 뜻이 안 통한다. 이름과 분량을 붙여 한
                      // 문장으로 읽어준다.
                      aria-label={`${p.short}, ${amt.spoken}`}
                    >
                      <span className="fmt-name">{p.short}</span>
                      {/* 분량 — 아이콘을 이 줄에 붙였다. 1행에 아이콘+이름을
                          같이 넣으면 375px 칸(69.75px)에 "팟캐스트"(56px) +
                          아이콘(18) + 간격이 안 들어간다. 아이콘이 분량 옆에
                          오면 "약 2분"이 읽는 시간인지 듣는 시간인지도
                          아이콘이 구분해준다. */}
                      <span className="fmt-amt">
                        <span aria-hidden className="fmt-art">
                          <LensFormatArt format={lensFormatAt(i)} size={22} />
                        </span>
                        {amt.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 형식 설명 — 2026-08-21, 사용자 요청으로 상시 노출 줄에서 "탭을
                누른 순간에" 나타나는 방식으로 바꿨다. lensPerspectives.ts의
                content 필드(원래 LensFormatGuide 전용)를 그대로 쓴다.
                탭 바로 아래, 탭과 같은 폭에서 뜬다 — "지금 누른 그 탭에서 나온
                말풍선"으로 읽히게 하려면 본문(.lread, 620px)이 아니라 탭 바
                (전체 폭)에 붙어야 한다.
                처음엔 2.6초 뒤 스스로 사라지게 했었는데, 그 자동 소멸이 원인이
                되어 "탭을 눌렀는데 화면이 리셋되며 위아래로 움직인다"는 문제가
                났다 — 타이머가 끝나 이 블록이 DOM에서 빠지면 아래 본문이 그만큼
                위로 당겨진다. 지금은 한 번 뜨면 다른 탭을 고르기 전까지 계속
                떠 있는다(showDesc는 select()에서 true로만 바뀐다, 저절로 꺼지지
                않음) — 안 사라지니 안 움직인다.
                id="lens-desc"는 select()의 스크롤 목적지다: "레터를 누르면 이
                설명이 보이는 지점"까지 오도록, 탭을 누른 결과 그 자체를
                조준한다. key={active}로 매 선택마다 리마운트해 슬라이드-인이
                항상 다시 돈다. role="status"는 스크린리더에게 "방금 나타난
                부가 정보"로 조용히 읽히게 한다(alert처럼 끼어들지 않음). */}
            {showDesc && (
              <p
                key={active}
                id="lens-desc"
                role="status"
                className="fmt-toast"
                style={{ '--c': activeP.color } as CSSProperties}
              >
                <ActiveIcon size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2, color: activeP.color }} />
                <span>{activeP.content}</span>
              </p>
            )}

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
              // 팟캐스트 대본 전문 — 2026-08-21, "대본이 요약이다, 전체
              // full script로 바꿔달라" 요청. CMS의 팟캐스트 슬롯(l.bullets)엔
              // 짧은 핵심 요약 3~5줄만 저장된다(admin LensMode.tsx에서 이
              // 필드 라벨 자체가 "챕터"). 실제 음성으로 녹음된 8~12분 전체
              // 원고는 텍스트로 저장되지 않는다 — 오디오 파일(media_url)만
              // 있고 그걸 만든 대본 텍스트는 시스템에 없다. 없는 문장을
              // 새로 지어내면 "원문에 없는 것은 만들지 않는다" 원칙에
              // 걸리므로, 같은 기사에 이미 있는 가장 긴 완결된 산문 —
              // 레터 포맷의 전체 문단(lenses[0], 보통 6~7개 문단)을 대신
              // 보여준다. 지어낸 글이 아니라 같은 기사의 실제 CMS 데이터다.
              const letterFullText =
                articleFormatSample(lens.id, 'letter') ??
                (lenses[0]?.paragraphs && lenses[0].paragraphs.length > 0 ? lenses[0].paragraphs : null);
              const podcastScript =
                format === 'podcast' && letterFullText && letterFullText.length > 0
                  ? letterFullText
                  : scriptBullets;
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
              const hasPodcast = Boolean(realPodcast || directPodcastUrl);
              const hasVideo = Boolean(realVideo || directVideoUrl);

              // 준비 안 된 형식의 안내 — 탭의 "준비 중"이 고르기 전에 알리고,
              // 이 줄이 그래서 대신 뭐가 있는지 말한다. 형식 이름·분량을 다시
              // 쓰지 않는다(탭에 이미 있다).
              const note =
                format === 'webtoon' && !realWebtoonCuts
                  ? '웹툰 컷은 아직 준비 중이에요. 아래는 컷에 들어갈 대사예요.'
                  : format === 'podcast' && !hasPodcast
                    ? '음성 파일은 아직 준비 중이에요. 아래는 브리핑에 들어갈 대본이에요.'
                    : format === 'video' && !hasVideo
                      ? '영상은 아직 준비 중이에요. 아래는 영상에 들어갈 대본이에요.'
                      : null;
              return (
                <section
                  key={i}
                  id={lensPanelId(i)}
                  role="tabpanel"
                  aria-labelledby={lensTabId(i)}
                  data-speakable="qa"
                  hidden={!on}
                  className={on ? 'lens-panel panel' : 'lens-panel'}
                  data-dir={on ? dir : undefined}
                  onTouchStart={onPanelTouchStart}
                  onTouchEnd={(e) => onPanelTouchEnd(e, i)}
                  style={{ marginTop: 'clamp(24px, 3.4vw, 32px)' }}
                >
                  {/* 패널 제목줄(형식 이름 + 분량)은 걷어냈다 — 그 정보가
                      2026-08-21에 탭 안으로 올라갔고, 탭은 sticky라 항상
                      화면에 있다. 같은 말을 두 번 하지 않는다. 남은 건
                      "준비 중"일 때의 안내 한 줄뿐이다. */}
                  {note && <p className="fmt-note">{note}</p>}

                  {/* 질문 — 카드 안 시각적 정점(32). 장식 없이 세리프 크기만으로
                      끌어올린다. */}
                  {/* 24~32px → 20~24px(2026-08-21). 네 형식의 첫 줄 무게를
                      하나로 맞춘다 — 탭을 옮길 때마다 첫 줄이 32↔24px로
                      뛰면 "같은 대상의 다른 표면"이 아니라 "다른 페이지"로
                      느껴진다. h1(26~36px)과의 위계는 그대로 유지된다.
                      여백도 clamp 대신 24px 고정 — 위 구역과 같은 리듬 단위. */}
                  {format === 'letter' && l.question && <p className="fmt-lede">{l.question}</p>}

                  {/* 레터 본문 — 데모 오버라이드가 있는 기사는 뉴스레터
                      문단으로(2026-08-18, "카드뉴스 거 그대로 가져온거라서"
                      지적 — 레터가 카드뉴스와 같은 불릿 목록을 그대로 쓰고
                      있던 걸 고침). AI LENS 편집장 프롬프트의 문체 가이드
                      (친근한 -했어요체, 문단당 2~3문장)를 따른다. */}
                  {/* 2026-08-21 — 레터 본문을 "문단 블록 나열"에서 편집 지면으로
                      고쳤다. 앞선 형태는 폭 100%에 16px 문단을 16px 간격으로
                      균일하게 쌓은 것뿐이어서, 어디서 시작해 어디서 끝나는지
                      리듬이 없는 생성형 답변처럼 읽혔다. 셋을 바꿨다:

                       1. **읽기 폭.** .lread 로 620px 상한을 준다(약 38자).
                          .lm은 정렬을 위해 폭 100%(약 50자)를 택한 값인데,
                          긴 산문에서는 줄을 놓치는 폭이다. margin-left를 두지
                          않아 왼쪽 기준선은 사진·요약과 그대로 일치한다 —
                          좁아지는 건 오른쪽 끝뿐이다.
                       2. **첫 문단 리드인.** 첫 문단만 18px. 신문의 리드
                          관례이고, 눈이 어디서 시작할지 정해준다.
                       3. **문단 간격 16 → 24px.** 문단이 덩어리로 분리된다. */}
                  {format === 'letter' && letterParagraphs && (
                    <div className="lread" style={{ ['--lc' as string]: p.color } as CSSProperties}>
                      {letterParagraphs.map((para, pi) => (
                        <p key={pi} className={pi === 0 ? 'lread-lead' : undefined}>
                          {para}
                        </p>
                      ))}
                      {/* 레터 사인오프 — 편지 형식의 마무리(2026-08-24, 사용자
                          요청: "레터 형식에 맞게 디자인 요소 추가"). 앞선 ■
                          하나는 "기사 끝" 신호일 뿐 편지 느낌을 주지 못했다.
                          얇은 룰 + 형식 색 마크 + 발신인 라벨로 뉴스레터
                          서명처럼 닫는다 — 사이트의 헤어라인·자간 오버라인과
                          같은 체계(13px, 자간). 장식이라 aria-hidden. */}
                      <div aria-hidden className="lread-sign">
                        <span className="lread-sign-mark" style={{ background: p.color }} />
                        <span className="lread-sign-name">AI LENS 레터</span>
                      </div>
                    </div>
                  )}

                  {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 앞서는 큰
                      질문 다음에 사실이 그냥 나열돼서 둘이 Q&A 한 쌍이라는 게
                      드러나지 않았고, 그래서 구획이 끝났는지도 애매했다.
                      개수를 함께 보여주면 얼마나 읽어야 하는지도 예측된다.
                      데모 문단 오버라이드가 없는 기사(대부분)는 지금처럼
                      CMS 불릿을 그대로 쓴다. */}
                  {/* 13px 자간 오버라인("이 질문에 답하는 사실 3")을 .ovl로
                      올렸다 — 페이지의 다른 구역 이름과 같은 체계여야 한다.
                      불릿 점은 걸어둔 번호(.hang)로 교체: 위 30초 핵심과 같은
                      장치를 쓰면 "번호가 걸린 목록 = 사실 나열"이라는 규칙이
                      페이지 안에서 한 번만 학습된다. */}
                  {format === 'letter' && !letterParagraphs && l.bullets.length > 0 && (
                    <>
                      <p className="ovl" style={{ marginBottom: 16 }}>
                        이 질문에 답하는 사실 {l.bullets.length}
                      </p>
                      <ol className="hang lread">
                        {l.bullets.map((b, bi) => (
                          <li key={bi}>
                            <span aria-hidden className="hang-n">
                              {String(bi + 1).padStart(2, '0')}
                            </span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  {/* 빈 상태 — "왜 비었는지 + 무엇을 하면 되는지"를 쓴다.
                      앞선 문구("이 시선은 아직 준비 중이에요.")는 앞부분만
                      말하고 다음 행동을 주지 않아서, 사용자는 여기서 막힌다. */}
                  {format === 'letter' && !letterParagraphs && !l.question && l.bullets.length === 0 && (
                    <div style={{ fontSize: 16, lineHeight: 1.7, color: '#374151', wordBreak: 'keep-all' }}>
                      <p>이 기사의 레터는 아직 만들지 않았어요.</p>
                      <p style={{ marginTop: 8, color: '#6b7280' }}>
                        위에서 다른 형식을 골라보거나, 아래 원문 기사에서 전체 내용을 확인할 수 있어요.
                      </p>
                    </div>
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
                  {/* 2026-08-21 — "이미지 + 그 아래 캡션"을 8번 반복하는 형태를
                      **이어지는 한 줄기**로 바꿨다.
                      앞선 형태의 문제: 컷마다 캡션 박스가 끼어들어 18px씩
                      끊기니 만화를 읽는 게 아니라 그림 목록(figure list)을
                      스크롤하게 됐다 — 자동 생성 문서에서 가장 흔한 모양이다.
                      게다가 컷 안의 말풍선 대사와 아래 캡션이 거의 같은 말을
                      두 번 하고 있었다.
                      지금: 컷을 2px 간격으로 붙여 세로로 이어 붙인다(웹툰의
                      기본 읽기 방식). 대사는 (a) 각 이미지 alt에 그대로 남고
                      (b) 아래 "대사로 읽기" 목록에 전문이 있다 — 화면에서
                      사라진 게 아니라 자리를 옮긴 것이라 접근성·SEO 손실이
                      없다(hidden 으로만 감추므로 DOM에 항상 존재). */}
                  {format === 'webtoon' && realWebtoonCuts && (
                    <div className="strip" data-own-swipe>
                      {realWebtoonCuts.map((cut, ci) => (
                        <figure key={ci} style={{ margin: 0 }}>
                          {/* pipelines/webtoon이 실제로 만드는 컷은 1536x1024(3:2
                              가로) — 예전 인스타 카드뉴스(4:5 세로) 전제로 aspect-ratio
                              4/5 + cover를 썼더니 좌우가 크게 잘려서, 말풍선이 화면
                              가장자리에 있으면(BUBBLE_RULES가 "상단·측면 배치"를
                              지시함) 통째로 잘려 보이는 문제가 있었다(2026-08-20
                              사용자 리포트). contain으로 바꿔 잘림 없이 전체를
                              보여준다 — 비율이 정확히 3:2면 레터박스도 안 생긴다. */}
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', background: '#f3f4f6' }}>
                            <Image src={cut.url} alt={cut.caption || `${ci + 1}번째 컷`} fill sizes="(min-width: 920px) 700px, 100vw" style={{ objectFit: 'contain' }} />
                          </div>
                        </figure>
                      ))}
                    </div>
                  )}

                  {/* 대사 전문 — 컷 아래에서 사라진 캡션이 여기로 모인다.
                      기본은 접힘: 대사는 이미 컷 안 말풍선에 있으니 전문은
                      "필요할 때 펼치는 것"이 맞다(소리를 못 듣거나 이미지가
                      안 뜨거나, 인용하려는 경우).
                      hidden 으로만 감춰서 DOM에는 항상 있다 — 검색엔진·
                      스크린리더는 접힘과 무관하게 읽을 수 있고, 접근성 트리
                      상태는 aria-expanded/aria-controls가 정확히 말해준다.
                      <details> 대신 버튼 + hidden 을 쓴 이유: 이 저장소가
                      이미 쓰는 "더보기/접기" 관례(NewsTimeMachineSection,
                      NewsletterCTA)와 모양을 맞추기 위해서다. */}
                  {format === 'webtoon' && realWebtoonCuts && realWebtoonCuts.some((c) => c.caption) && (
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(17,24,39,0.1)' }}>
                      <button
                        type="button"
                        className="lnk"
                        aria-expanded={showScript}
                        aria-controls={`${lensPanelId(i)}-script`}
                        onClick={() => setShowScript((v) => !v)}
                      >
                        대사로 읽기 {realWebtoonCuts.length}컷
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          style={{ transform: showScript ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      <ol id={`${lensPanelId(i)}-script`} hidden={!showScript} className="hang lread" style={{ marginTop: 16 }}>
                        {realWebtoonCuts.map((cut, ci) => (
                          <li key={ci}>
                            <span aria-hidden className="hang-n">
                              {String(ci + 1).padStart(2, '0')}
                            </span>
                            <span>{cut.caption || '(대사 없음)'}</span>
                          </li>
                        ))}
                      </ol>
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
                      formatName={p.short}
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
                      아니라 iframe 임베드가 안 되므로 네이티브 <audio>로 재생.
                      preload="none" → "metadata"로 올렸다: 재생 길이를 화면에
                      표시하려면 메타데이터가 필요하다. 지어낸 길이를 쓰지
                      않기로 했으므로(clock() 주석) 이 요청이 유일한 출처다.
                      본문(오디오 데이터)은 여전히 안 받아온다. */}
                  {/* 카드(테두리+그림자)를 걷어냈다(2026-08-21) — 30초 핵심
                      카드를 없애고 나니 이 구역에서 유일하게 남은 박스라 눈에
                      걸렸다. <audio> 자체가 이미 뚜렷한 형태를 가진 객체여서
                      한 번 더 액자에 넣을 필요가 없다. 제목은 다른 형식들의
                      질문(clamp 20~24 세리프)과 같은 크기로 맞춰, 어느 형식을
                      골라도 본문 첫 줄의 무게가 같아진다. */}
                  {/* 2026-08-21 — 네이티브 <audio controls>를 우리 플레이어로
                      교체했다(shared/ui/ArticleAudioPlayer). 네이티브 컨트롤은
                      브라우저마다 생김새가 완전히 달라(사파리 둥근 회색 알약 /
                      크롬 각진 회색 바) 잘 만든 기사 지면에서 "여기만 남의 UI"로
                      보이는 지점이 정확히 여기였다. 재생 버튼도 20~30px대라
                      터치 타겟 최소치를 못 넘겼다.
                      새 플레이어가 더 주는 것: 탐색 가능한 진행바(네이티브가
                      아니면 이 저장소엔 seek 구현이 아예 없었다), 현재 위치·
                      전체 길이 표기, 15초 뒤로, 배속(브리핑을 1.5배로 듣는 건
                      실제 수요다). 강조색은 지금 화면의 유일한 강조색인 이
                      형식 색을 넘긴다. */}
                  {/* 2026-08-21(재설계) — 바깥 .fmt-lede(질문)를 뺐다. 새
                      플레이어 카드가 레퍼런스 구조를 따라 자체 헤더(배지 +
                      제목 + 바이라인)를 갖게 되면서, 바깥에 같은 질문을
                      한 번 더 적으면 "기사 제목"이 화면에 두 번 나왔다.
                      카드 안 title이 그 역할을 대신한다.
                      cover: 기사 사진(photo, 있으면). byline: 화자 데이터가
                      없어 원문 출처로 대체(0단계 보고에서 확인한 대로),
                      있을 때만 렌더하고 source_url이 있으면 외부 링크로
                      만든다. chapters: 실측 타임코드가 없어(같은 보고서)
                      seek 불가능한 "읽는 대본"으로만 전달 — time 필드를
                      비워서 넘기면 컴포넌트가 자동으로 클릭 탐색을 끈다. */}
                  {format === 'podcast' && directPodcastUrl && (
                    <ArticleAudioPlayer
                      src={directPodcastUrl}
                      accent={p.color}
                      label={p.short}
                      kicker="AI 음성 브리핑"
                      title={l.question || '오늘의 브리핑'}
                      coverImage={photo}
                      byline={lens.source_url ? '서울경제 원문 기사' : null}
                      bylineHref={lens.source_url}
                      chapters={podcastScript.length > 0 ? podcastScript.map((text) => ({ text })) : undefined}
                      onDuration={(sec) => noteDur(i, sec)}
                    />
                  )}

                  {/* 음성이 아직 없는 기사 — 앞선 버전은 여기에 **가짜
                      플레이어**를 그렸다: 형식 색으로 채운 46px 재생 버튼,
                      18%까지 찬 진행바, 불릿 개수로 계산한 가짜 길이("약
                      1:33"). 눌러도 아무 일이 없다. 한 번 눌러본 사용자는
                      그 다음부터 이 페이지의 다른 버튼도 믿지 않는다.
                      가짜 조작부(재생 버튼·진행바·길이)를 걷어내고, 실제로
                      존재하는 것(대본)만 대본으로 밝혀 보여준다. 상태는
                      말하고 있으므로 여기서는 반복하지 않는다 — 형식 탭의
                      "준비 중"과 패널 첫 줄 .fmt-note 가 담당한다. */}
                  {format === 'podcast' && !hasPodcast && (
                    <div>
                      {l.question && <p className="fmt-lede">{l.question}</p>}
                      {/* 회색 알약 배지 → 걸어둔 번호(.hang, 2026-08-21).
                          알약은 이 페이지에서 여기밖에 없는 장치였고, 번호를
                          동그란 칩에 넣으면 "누를 수 있는 것"처럼 보인다.
                          30초 핵심·레터 사실 목록과 같은 .hang 을 쓰면 번호가
                          걸린 목록은 전부 "순서 있는 사실 나열"로 한 번만
                          학습된다. */}
                      {scriptBullets.length > 0 && (
                        <ol className="hang lread">
                          {scriptBullets.map((b, bi) => (
                            <li key={bi}>
                              <span aria-hidden className="hang-n">
                                {String(bi + 1).padStart(2, '0')}
                              </span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}

                  {/* 실제 영상(2026-08-19) — admin이 LensMode.tsx 영상 탭에서
                      YouTube 등 링크를 채운 경우 실제 플레이어를 임베드한다
                      (/video 페이지와 같은 resolveVideo 유틸). */}
                  {format === 'video' && realVideo && (
                    <div>
                      {l.question && <p className="fmt-lede">{l.question}</p>}
                      <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 14, background: '#111827' }}>
                        <iframe
                          src={realVideo.embedUrl}
                          title={l.question || '영상'}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}

                  {/* 직링크 영상(2026-08-20) — S3 등에 직접 올린 mp4(예: Remotion
                      렌더 결과). 유튜브가 아니라 iframe 임베드가 안 되므로
                      네이티브 <video>를 우리 플레이어로 감싼다.
                      2026-08-21(재설계) — 네이티브 <video controls>를
                      팟캐스트와 같은 톤의 커스텀 플레이어(ArticleVideoPlayer)로
                      교체했다("영상 페이지도 팟캐스트 페이지와 비슷한
                      톤앤매너로" 요청). 재생/탐색/±5초/반복/배속/북마크/
                      음소거/전체화면은 전부 실제로 동작한다 — <video>
                      엘리먼트만으로 완결되는 조작이라 백엔드 없이도 진짜
                      기능이다. 자막 버튼만 disabled로 남겼다: 이 파이프라인은
                      자막 데이터를 아예 만들지 않는다(CmsLensItem에 관련
                      필드 없음) — "기능 없이 버튼만 지어내기"는 이 파일이
                      이미 세 번 걷어낸 패턴이라(가짜 재생 버튼·가짜 진행바·
                      가짜 재생시간, 아래 !hasVideo 블록 주석 참조) 반복하지
                      않고, 대신 이유를 밝힌 비활성 버튼으로 "나중에 연결할
                      자리"만 남겼다(스티어링 §4). 대본 패널은 넣지 않았다
                      (2026-08-21, "대본 기능은 빼줘" 요청) — 영상은 이미
                      화면을 보고 있는 상태라 같은 정보를 텍스트로 한 번 더
                      보여줄 필요가 없다는 판단. */}
                  {format === 'video' && directVideoUrl && (
                    <ArticleVideoPlayer
                      src={directVideoUrl}
                      poster={l.thumbnail_url}
                      accent={p.color}
                      label={p.short}
                      kicker="AI 영상 브리핑"
                      title={l.question || '오늘의 영상'}
                      byline={lens.source_url ? '서울경제 원문 기사' : null}
                      bylineHref={lens.source_url}
                      onDuration={(sec) => noteDur(i, sec)}
                    />
                  )}

                  {/* 영상이 아직 없는 기사 — 팟캐스트와 같은 이유로 가짜
                      플레이어를 걷어냈다. 앞선 버전은 (a) 기사 사진을 65%
                      불투명도로 깔고 (b) 그 위에 58px 흰 재생 버튼을 얹고
                      (c) 오른쪽 아래에 가짜 길이를, (d) 대본 항목마다 가짜
                      타임코드("0:12", "0:24" — 12초 등차로 생성)를 붙였다.
                      영상처럼 보이는데 재생되지 않고, 타임코드는 존재하지도
                      않는 영상의 위치를 가리켰다.
                      남긴 것: 실제로 있는 대본. 순번은 타임코드가 아니라
                      그냥 순번으로 표기한다. */}
                  {format === 'video' && !hasVideo && (
                    <div>
                      {l.question && <p className="fmt-lede">{l.question}</p>}
                      {/* 회색 알약 배지 → 걸어둔 번호(.hang, 2026-08-21).
                          알약은 이 페이지에서 여기밖에 없는 장치였고, 번호를
                          동그란 칩에 넣으면 "누를 수 있는 것"처럼 보인다.
                          30초 핵심·레터 사실 목록과 같은 .hang 을 쓰면 번호가
                          걸린 목록은 전부 "순서 있는 사실 나열"로 한 번만
                          학습된다. */}
                      {scriptBullets.length > 0 && (
                        <ol className="hang lread">
                          {scriptBullets.map((b, bi) => (
                            <li key={bi}>
                              <span aria-hidden className="hang-n">
                                {String(bi + 1).padStart(2, '0')}
                              </span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}

                  {/* 시선 간 연결 — 네 포맷이 따로 떨어져 보인다는 지적
                      (2026-08-18, "이 4개의 순서가... 연결점, 스토리텔링이
                      자연스러우면 좋겠다" — 전화영어 서비스 레슨 플로우처럼)
                      에 따라, 마지막(video)만 빼고 각 포맷 끝에 다음 시선으로
                      넘어가는 한 줄을 두고 있었으나, 2026-08-21에 뺐다(사용자
                      요청 — "다 지워줘"). 이 페이지의 유일한 이동 컨트롤은
                      이제 sticky 형식 탭이다. 탭이 항상 화면에 떠 있고 지금
                      보는 형식을 이미 진행 인디케이터로 보여주고 있어서,
                      본문 끝마다 "다음 걸로 가라"고 다시 안내하는 건 같은
                      말을 두 번 하는 것이었다 — 게다가 "이어서 웹툰으로
                      보기"처럼 문구가 항상 다음 인덱스 하나만 가리켜서, 탭을
                      건너뛰어 온 사용자에겐 오히려 안내가 틀렸다. */}
                </section>
              );
            })}

            {/* 구획 마감 — 본문이 끝났는데 아무 표시가 없어 브랜드 문구로 바로
                넘어가는 게 갑작스러웠다. 출처 한 줄로 닫는다: 뉴스에서 "이 사실이
                어디서 왔는지"는 신뢰의 마지막 조각이고, 네 시선이 모두 같은
                기사에서 나왔다는 것도 여기서 확인된다. */}
            {/* 구획 마감도 같은 문법으로 맞췄다(2026-08-21) — 여기만
                borderTop: rgba(17,24,39,0.09)을 <p>에 직접 걸어서, 위 구역들이
                쓰는 .rule(0.1)과 미세하게 다른 네 번째 구분선이 되어 있었다.
                간격도 32 리듬으로 통일. */}
            <div style={{ marginTop: 32 }}>
              <div className="rule" />
              <p style={{ marginTop: 32, fontSize: 14, color: '#4b5563', lineHeight: 1.65, wordBreak: 'keep-all' }}>
                네 형식 모두 같은 기사를 바탕으로 만들었어요. 위에서 형식을 바꿔도 다루는 사실은 같습니다.
              </p>
            </div>
          </div>
          </div>
        )}
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
