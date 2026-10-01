/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { CMS_API_URL } from '@/shared/config/apiClient';
import type { ApiLetter } from './todayLettersApi';

export type CmsChannel = 'letters' | 'paper' | 'feed' | 'webtoon' | 'video' | 'lens';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * "trend"/"column" 태그 카드 모양 — letters 와 달리 리치텍스트 본문이 없는
 * 가벼운 카드. 원래는 별도 trend_card 채널(2026-08-17 폐기, 실사용 0건)
 * 응답 모양이었는데, fetchSectionCards()가 letters+section 태그를 이
 * 모양으로 변환해서 계속 쓴다 — 타입 이름은 레거시지만 계약 자체는 유효.
 */
export interface CmsTrendCard {
  id: string;
  section: 'trend' | 'column';
  category: string;
  title: string;
  excerpt: string;
  date: string;
  is_cms: true;
}

/**
 * webtoon 채널 응답 — 연재 웹툰 파일럿(2026-08-06). 컷(이미지+캡션) 나열뿐인
 * 가벼운 포맷 (backend cms_posts_public.py _shape_webtoon 과 1:1).
 */
export interface CmsWebtoonPanel {
  url: string;
  caption: string;
}

export interface CmsWebtoon {
  id: string;
  editor_id: string;
  title: string;
  excerpt: string;
  date: string;
  /** 발행 완료 시각(ISO, UTC) — 2026-08-23, kstDateTimeLabel()로 시:분까지
   *  표기. 없으면(옛 글) date만 폴백. */
  published_at?: string | null;
  cover_image_url: string | null;
  panels: CmsWebtoonPanel[];
  is_cms: true;
  /**
   * 주제 분류(2026-08-21) — letters/lens 와 같은 저장 위치(body_inline.category,
   * ECON_CATEGORIES 라벨 문자열)를 그대로 읽는다. /webtoon 목록 상단 카테고리
   * 칩이 이 값으로 걸러낸다.
   *
   * 값이 없는 편이 정상이다 — admin WebtoonMode 에 카테고리 입력이 2026-08-21에
   * 처음 생겼으므로 그 전에 발행된 편은 비어 있다. 목록은 "데이터에 실제로
   * 있는 카테고리만" 칩으로 그려서, 전부 비어 있으면 칩 바 자체를 렌더하지
   * 않는다(눌러도 0건인 칩을 세워두지 않는다).
   */
  category?: string | null;
  /**
   * 편집국 추천 순서(2026-08-21) — 작을수록 앞이다. admin 이 값을 넣은 편만
   * /webtoon 목록의 "편집국 추천" 레일에 올라간다.
   *
   * "인기순"이 아니다. 조회수·클릭수 같은 지표가 시스템에 없어서(GA4 는
   * 단방향 전송만 한다) 인기 순위를 만들 방법이 없고, 최신순에 "인기" 라벨을
   * 붙이는 건 하지 않기로 했다. 대신 편집자가 고른 순서를 쓴다.
   *
   * 필드 자체는 원래 home_player 재생 순서용으로 최상위 스키마에 이미 있던
   * 것을 그대로 재사용한다 — 새 필드도 새 인덱스도 만들지 않았다.
   */
  display_order?: number | null;
  /** lens("4가지 시선")의 웹툰 포맷에서 파생된 카드일 때만 채워짐(2026-08-20,
   *  shared/lib/lensMediaFeed.ts) — 기본 `/webtoon/{id}` 대신 이 경로로
   *  링크한다. 실제 webtoon 채널 글은 이 필드가 없다. */
  href?: string;
  /**
   * 시리즈 제목(2026-08-21) — "여러 개의 독립된 웹툰 시리즈" 재구조화.
   * 같은 문자열을 쓴 편들이 하나의 시리즈다(admin WebtoonMode의 자유 텍스트
   * 입력, 시리즈 마스터 테이블 없음 — cms_posts_public.py _shape_webtoon 참조).
   * 비어 있으면(과거 발행분·미입력) 그 편 제목 자체를 시리즈명으로 취급하는
   * "단편" 시리즈로 shared/lib/webtoonSeries.ts가 폴백한다.
   */
  series_title?: string | null;
}

/**
 * video 채널 응답 — 영상 콘텐츠(2026-08-06). YouTube 등 외부 임베드 URL
 * 하나만 있는 가벼운 포맷 (backend cms_posts_public.py _shape_video 와 1:1).
 */
export interface CmsVideo {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  /** 발행 완료 시각(ISO, UTC) — 2026-08-23, kstDateTimeLabel()로 시:분까지
   *  표기. 없으면(옛 글) date만 폴백. */
  published_at?: string | null;
  video_url: string;
  thumbnail_url: string | null;
  is_cms: true;
  /** lens("4가지 시선")의 영상 포맷에서 파생된 카드일 때만 채워짐(2026-08-20,
   *  shared/lib/lensMediaFeed.ts) — 기본 `/video/{id}` 대신 이 경로로
   *  링크한다. 실제 video 채널 글은 이 필드가 없다. */
  href?: string;
}

// 진행 중 요청 묶기(in-flight coalescing) — 홈 화면 섹션 다수(트렌드/칼럼/
// 단어퀴즈/미니헤드라인 등)가 같은 파라미터로 fetchCmsPosts/fetchTrendCards
// 를 각자 따로 불러서, 동일한 응답을 기다리는 중복 요청이 여러 개 동시에
// 나가고 있었다(2026-08-07, "섹션들이 한번에 안 뜨고 딜레이 있다" 피드백).
// **시간 기반 캐시가 아니다** — 요청이 "진행 중"인 동안만 같은 Promise 를
// 공유하고, 응답이 오는 즉시 캐시에서 지운다. 그 다음 호출은 무조건 새
// 네트워크 요청이라 admin 발행/수정/삭제가 항상 즉시 반영된다(2026-08-08,
// "무조건 실시간성" 요구 — sessionStorage 에 결과를 남겨뒀던 이전 버전은
// 탭을 새로고침해도 옛 값이 몇 분간 남아있어 삭제한 글이 계속 보이는 문제가
// 있었다).
const requestCache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const inFlight = requestCache.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const p = run().finally(() => requestCache.delete(key));
  requestCache.set(key, p);
  return p;
}

// 캐시 정책 v2(2026-08-16, "홈 속도가 느리다" 피드백으로 재도입) — 2026-08-09에
// 태그 캐시를 완전히 껐던 이유는 캐싱 자체가 문제가 아니라 무효화 호출 한 줄이
// 버그였다: revalidateTag(tag, 'max')의 'max'는 "즉시·완전 무효화"가 아니라
// Next 내장 cache-life 프로파일(stale:5분/revalidate:30일/expire:영구) 이름이라
// admin이 webhook을 한 번만 쏴도 그 태그 캐시가 최대 30일짜리로 재고정되는
// 사고였다(node_modules/next/cache.d.ts 참조, 실측: /webtoon 이
// s-maxage=31536000으로 나옴). "그때부터 admin 발행이 반영 안 됨" 재발을 막으려
// 아예 캐시를 껐던 건데, 그 대가로 매 방문마다 EC2→API(us-east-1) 왕복을
// 그대로 겪어 홈 TTFB가 1.5~1.7초까지 늘어났다(2026-08-16 실측, CloudWatch
// 확인 결과 Lambda 실행 자체는 150~300ms로 빠름 — 병목은 no-store로 캐시가
// 아예 없다는 것 자체).
// 이번엔 두 번째 인자('max') 없이 revalidateTag(tag)만 호출한다(service/frontend/
// src/app/api/revalidate/route.ts) — 이건 Next 표준 on-demand 무효화로, 프로파일을
// 재설정하는 게 아니라 그 태그가 걸린 캐시 항목을 즉시 stale 처리한다. admin이
// 글을 발행/수정/삭제/발행취소할 때마다(admin/backend/shared/notify.py →
// admin/backend/routes/posts.py 4곳) 이 webhook이 호출되므로 "즉시 반영"은
// 캐시를 껐을 때와 동일하게 유지되고, 그 사이 방문자들은 캐시된 응답을 받아
// EC2→API 왕복 없이 즉시 렌더링된다.
// 2026-09-03 — ISR 재설계로 [slug] page.tsx들이 `export const revalidate`를
// 명시할 때 이 값을 그대로 참조하도록 export한다(라우트 레벨 선언과 fetch
// 레벨 안전망이 서로 다른 숫자로 갈라지는 걸 방지).
export const CACHE_TTL_FALLBACK_SECONDS = 300; // 웹훅이 유실돼도 5분 뒤엔 자동 갱신(안전망).

// 이 파일의 함수들은 서버 컴포넌트(app/page.tsx의 SSR Promise.all)뿐 아니라
// TrendingEconomySection/ColumnPreviewSection 등 다수의 'use client' 컴포넌트가
// useEffect로 브라우저에서 직접 호출한다(2026-08-16, "요즘 화제의 경제 이슈
// 이미지가 항상 늦게 최신화" 피드백으로 발견). cache:'force-cache' + next.tags는
// Next.js가 SSR 중에만 해석하는 확장 옵션이고, 브라우저의 fetch()에서는
// `next.tags`를 그냥 무시하고 표준 RequestCache 값인 `cache:'force-cache'`만
// 살아남아 **브라우저 자체 HTTP 캐시**를 켜버린다 — 이건 /api/revalidate가
// 전혀 손댈 수 없는 별개의 캐시라, admin이 발행해도 그 브라우저에서는 계속
// 옛 응답이 나온다. 그래서 브라우저에서 호출될 때는 예전처럼 no-store로
// 완전히 캐시를 끄고, 서버(SSR)에서 호출될 때만 태그 캐시를 쓴다.
function cacheOpts(tag: string): RequestInit {
  if (typeof window !== 'undefined') {
    return { cache: 'no-store' };
  }
  return { cache: 'force-cache', next: { tags: [tag], revalidate: CACHE_TTL_FALLBACK_SECONDS } };
}

export async function fetchCmsPosts(
  channel: CmsChannel,
  date?: string,
  limit?: number,
): Promise<CmsLetter[]> {
  return cached(`posts|${channel}|${date ?? ''}|${limit ?? ''}`, async () => {
    try {
      const qs = new URLSearchParams({ channel });
      if (date) qs.set('date', date);
      if (limit) qs.set('limit', String(limit));
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?${qs}`, cacheOpts(`posts:${channel}`));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLetter[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// trend_card 채널 폐기(2026-08-17) — "요즘 화제의 경제 이슈" 섹션을 "이슈
// 톡톡"에 흡수 통합하면서, 백엔드 _VALID_CHANNELS에서도 trend_card를 뺐다
// (실사용 데이터 0건 확인됨). 이 함수를 호출하는 6곳(archive/column/trend
// 아카이브 페이지들)은 여전히 CmsTrendCard[] 모양을 기대하므로 시그니처는
// 남기고 몸통만 즉시 빈 배열 — 이제 존재하지 않는 채널로 매 방문마다 400을
// 받는 대신, 애초에 요청을 보내지 않는다.
export async function fetchTrendCards(): Promise<CmsTrendCard[]> {
  return [];
}

// fetchSectionCards()/CmsSectionCard — ColumnPreviewSection("이번 주 인사이트"
// 홈 섹션)이 쓰던 fetch 로직이었는데, 2026-08-17 홈 구조 개편(LatestGridSection
// + CategoryRailSection x6, 뉴닉 홈 참고)으로 그 섹션 자체가 삭제되며 호출자가
// 0이 됐다 — 같이 삭제(archive/column 아카이브 페이지들은 buildArchiveItems를
// 직접 쓰지 이 함수를 거치지 않았다).

// 홈 웹툰 미리보기(WebtoonPreviewSection) 전용 축약본(2026-09-03, lens/
// 오디오 축약과 같은 문제) — 그 컴포넌트는 항상 상위 4개만 그리고
// cover_image_url 하나만 쓰는데(panels는 안 읽음, 컷 갤러리는 상세
// 페이지 전용), app/page.tsx는 fetchWebtoons()의 최대 1000건 전체
// (건마다 컷 이미지+캡션 배열 panels 포함)를 그대로 넘기고 있었다.
export function toWebtoonPreviewSummaries(webtoons: CmsWebtoon[]): CmsWebtoon[] {
  return webtoons.slice(0, 4).map((w) => ({ ...w, panels: [] }));
}

// 웹툰 시리즈 페이지(webtoon/series/[slug]/page.tsx) 전용 축약본
// (2026-09-03, ISR 재설계 감사로 발견) — 그 페이지는 groupIntoSeries()가
// "전체 채널 기준 회차 번호"를 정확히 매기기 위해 웹툰 전체 목록(최대
// 1000건)을 전달받아야 하지만(단순히 series.episodes만 넘기면 번호가
// 깨짐), panels(컷 이미지+캡션 배열)는 이 페이지가 전혀 안 읽는다(표지
// 썸네일만 씀) — 개수는 그대로 두고 무거운 필드만 뺀다. 위
// toWebtoonPreviewSummaries와 달리 slice(0,4)를 하면 안 되는 게 핵심
// 차이(번호 매김이 전체 목록에 의존).
export function toWebtoonSeriesListPayload(webtoons: CmsWebtoon[]): CmsWebtoon[] {
  return webtoons.map((w) => ({ ...w, panels: [] }));
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  return cached('webtoon', async () => {
    try {
      // limit=1000(2026-08-28, 100→1000) — 100은 2026-08-11에 백엔드
      // 기본값(20) 잘림을 막으려고 넣은 값이었는데, 08-23 웹툰 채널
      // 분리 이후 발행량이 하루 최대 96건까지 늘면서 100건짜리 상한도
      // 며칠 만에 다시 뚫려 오래된 화가 목록에서 사라졌다(archive 재설계
      // 논의 중 발견). 백엔드가 이미 1000까지는 DB 읽기 비용 증가 없이
      // 지원한다(cms_posts_public.py 참조 — 항상 전체를 읽은 뒤 슬라이스).
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=webtoon&limit=1000`, cacheOpts('posts:webtoon'));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsWebtoon[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchWebtoonBySlug(slug: string): Promise<CmsWebtoon | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=webtoon`, cacheOpts('posts:webtoon'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsWebtoon };
    return data.post ?? null;
  } catch {
    return null;
  }
}

// 홈 영상 미리보기(VideoPreviewSection) 전용 축약본(2026-09-03) — 항상
// 상위 4개만 쓰는데 최대 1000건 전체를 넘기고 있었다. CmsVideo 자체엔
// 무거운 필드가 없어(대본 등 없음) 개수만 줄여도 충분하다.
export function toVideoPreviewSummaries(videos: CmsVideo[]): CmsVideo[] {
  return videos.slice(0, 4);
}

export async function fetchVideos(): Promise<CmsVideo[]> {
  return cached('video', async () => {
    try {
      // limit=1000(2026-08-28, 100→1000) — fetchWebtoons()와 같은 이유.
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=video&limit=1000`, cacheOpts('posts:video'));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsVideo[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchVideoBySlug(slug: string): Promise<CmsVideo | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=video`, cacheOpts('posts:video'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsVideo };
    return data.post ?? null;
  } catch {
    return null;
  }
}

/**
 * lens 채널 응답 — "오늘의 이슈, 4가지 시선"(2026-08-12). 하루 하나의 이슈를
 * 원인/사람/내 일/숫자, 4개 고정 렌즈로 훑는 포맷. Instagram @ailens
 * 카드뉴스를 그대로 웹으로 옮긴다 (backend cms_posts_public.py _shape_lens 와 1:1).
 */
export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
  /** "레터" 포맷 전용 문단 산문(2026-08-19) — 비어있으면 question+bullets로
   *  폴백한다(LensViewClient.tsx). */
  paragraphs?: string[];
  /** "웹툰" 포맷 전용 컷(이미지+캡션, 2026-08-19) — 비어있으면 기존
   *  카드뉴스형 목업(불릿 기반)으로 폴백한다. */
  images?: CmsWebtoonPanel[];
  /** "영상" 포맷 전용 YouTube 등 임베드 URL(2026-08-19) — 있으면 실제
   *  임베드, 없으면 정적 목업으로 폴백한다. */
  video_url?: string | null;
  /** "영상" 포맷 전용 썸네일(2026-08-20) — 렌더된 영상 자체에서 뜬 프레임.
   *  YouTube 링크는 resolveVideo()가 자동으로 뽑아주지만 우리가 렌더링해
   *  올린 mp4 원본은 그게 안 돼서 별도로 채운다(lensMediaFeed.ts 참조). */
  thumbnail_url?: string | null;
  /** "팟캐스트" 포맷 전용 오디오/영상 링크(2026-08-19) — 있으면 실제
   *  임베드, 없으면 정적 목업으로 폴백한다. */
  media_url?: string | null;
  /** "팟캐스트"·"영상" 포맷 전용 전체 대본 텍스트(2026-08-23, 사용자 요청 —
   *  청각장애인 접근성용). 타임스탬프 동기화는 없고 그냥 플레이어 아래에
   *  전체 텍스트로 보여준다. */
  transcript?: string | null;
  /** "레터" 포맷 전용 용어 하이라이트(term+explain 쌍, 2026-09-11) —
   *  본문에서 이 단어들을 wrapWithTerms()로 감싸 형광펜 마커+툴팁을 붙인다.
   *  나머지 세 포맷은 항상 빈 배열. */
  keywords?: Array<{ term: string; explain: string }>;
}

export interface CmsLens {
  id: string;
  editor_id: string;
  headline: string;
  context: string;
  date: string;
  /**
   * 인스타 카드뉴스용 완성형 그래픽(1080x1350) — 사진 위에 "lens" 라벨,
   * 헤드라인, 날짜가 **픽셀로 박혀** 있다. 웹 카드의 사진 칸에 쓰면 우리 HTML
   * 헤드라인과 텍스트가 중복되고, 원본에 있던 광고 문구·인포그래픽 표까지
   * 같이 노출된다. 카드 전체를 통으로 보여주는 용도에만 쓸 것.
   */
  cover_image_url: string | null;
  /**
   * 텍스트가 없는 순수 기사 사진(2026-08-14 신설, backend _shape_lens 가
   * body_inline.photo_image_url 을 그대로 내려준다). 웹의 "사진 칸"은 이 값만
   * 쓴다 — pickLensPhoto() 참조.
   */
  photo_image_url?: string | null;
  /** 원문 기사 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO 감사). */
  source_url: string | null;
  /** 마지막 수정 시각(ISO, 2026-08-18 공개 API에 추가) — JSON-LD dateModified용. */
  updated_at?: string | null;
  /** 발행 완료 시각(ISO, UTC, 초 단위 — 2026-08-23 공개 API에 추가). date는
   *  YYYY-MM-DD까지만이라 "언제 발행됐는지"에 시:분이 없었다 — 이 필드로
   *  shared/lib/date.ts의 kstDateTimeLabel()이 KST 시:분까지 표기한다.
   *  옛 글엔 없을 수 있어 옵셔널. */
  published_at?: string | null;
  /** 경제 카테고리 라벨(증시/부동산/산업/금융·정책/국제/재테크) — letters와 같은
   * 6개 값. 2026-08-20 추가, /markets 등 카테고리 페이지에 lens 글도 같이
   * 노출하기 위함. 없으면(미분류) 어느 카테고리 페이지에도 안 뜬다. */
  category?: string | null;
  /** 하위 카테고리(2026-10-01 신설) — category(6개 주제) 안에서 한 단계 더
   * 들어간 분류(예: 증시 → 국내증시/해외증시/IB&Deal/...).
   * shared/constants/econSubcategories.ts의 라벨과 매칭. 아직 증시·산업만
   * 백필돼 있고, 다른 카테고리는 분량이 얇아(국제·부동산·금융·정책·문화)
   * 당장은 비어있다 — 값이 없으면 하위 탭 자체가 안 뜬다
   * (CategoryArchiveClient.tsx). */
  subcategory?: string | null;
  /** "지면 특별 코너" 전용 배치 필드(2026-08-21) — 위 category와 별개.
   * "전체"/"증권"/"산업"/"시그널" 중 하나여야 LensPreviewSection의 해당
   * 탭에 뜬다. 없으면 지면 특별 코너엔 아예 안 뜨고 category 기반
   * 일반 카테고리 페이지에만 남는다(LensPreviewSection.tsx 상단 주석
   * 참조 — category 필드를 두 용도로 겹쳐 쓰다 생긴 버그를 이 필드
   * 분리로 해결). */
  paper_section?: string | null;
  /** 지면 특별 코너 내 명시적 정렬 키(2026-08-21, home_player 채널의
   * display_order와 같은 패턴). 값이 있으면 오름차순으로 우선 배치되고,
   * 없으면(대부분의 기존 글) publish_date/published_at 정렬을 그대로
   * 따른다 — published_at을 정렬 키인 척 수동 재기록하던 임시방편을
   * 대체한다(LensPreviewSection.tsx 참조). */
  display_order?: number | null;
  lenses: CmsLensItem[];
  is_cms: true;
}

// 홈 "오늘의 이슈, 4가지 시선"(LensPreviewSection) 전용 축약본(2026-09-03,
// 페이지 속도 감사) — 그 컴포넌트는 포맷당 question 한 줄만 보여주는데,
// app/page.tsx가 fetchLensPosts() 결과(최대 100건 × 4포맷의 bullets·
// paragraphs·transcript 등 본문 전체)를 initialItems prop으로 그대로
// 클라이언트에 직렬화하고 있었다 — Lighthouse 실측 결과 홈 HTML이
// 6.7MB(gzip 1.78MB)까지 부푼 주된 원인. buildArchiveItems()는 lenses[]를
// 아예 안 읽어서 이 축약이 영향 없다(archiveItems.ts 참조).
export function toLensPreviewSummaries(lenses: CmsLens[]): CmsLens[] {
  return lenses.map((l) => ({
    ...l,
    lenses: (l.lenses ?? []).map((f) => ({ label: f.label, question: f.question, bullets: [] })),
  }));
}

export async function fetchLensPosts(): Promise<CmsLens[]> {
  return cached('lens', async () => {
    // limit=1000(2026-09-03, webtoon/video와 통일) — 100/250이었던 이유는
    // lens 채널이 글마다 4포맷 전체(문단·웹툰 컷·팟캐스트/영상 대본
    // 전문)를 통째로 담아 너무 무거워서, 300건 근처만 돼도 백엔드가
    // Lambda 동기 응답 6MB 한도를 넘겨 500을 던졌기 때문이다(2026-09-02
    // 홈 "오늘의 지면" 실종 장애 원인). 근본 수정 완료 — 목록(다건)
    // 응답은 이제 백엔드가 축약판(label/question/bullets만, 나머지 무거운
    // 필드는 단건 조회에서만)을 돌려준다(cms_posts_shaping.py의
    // shape_lens_summary 참조, 글당 크기 ~90% 감소 실측). 그 덕에
    // 상한을 다시 올려도 안전하다 — webtoon/video가 1000에서 정상인 것과
    // 같은 이유.
    const url = `${CMS_API_URL}/api/v2/posts?channel=lens&limit=1000`;
    // 2026-10-01 — 이 fetch가 실패하면(간헐적으로 재현, 원인 미확정) 조용히
    // 빈 배열을 돌려줘서 홈 "오늘의 이슈, 4가지 시선" 히어로 전체가 아무
    // 로그도 없이 통째로 사라지는 실제 장애가 반복됐다(2026-09-02에도 같은
    // 증상 — 주석 기록으로 확인). 재시도 1회 + 실패 시 로그를 남겨
    // (a) 한 번의 일시적 실패로 전체 섹션이 비는 걸 줄이고 (b) 다음에
    // 또 발생하면 CloudWatch 로그로 원인 추적이 가능하게 한다.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, cacheOpts('posts:lens'));
        if (!res.ok) {
          console.error(`fetchLensPosts: HTTP ${res.status} (attempt ${attempt}/2)`);
          continue;
        }
        const data = (await res.json()) as { posts?: CmsLens[] };
        return data.posts ?? [];
      } catch (e) {
        console.error(`fetchLensPosts: fetch threw (attempt ${attempt}/2):`, e);
      }
    }
    return [];
  });
}

export async function fetchLensBySlug(slug: string): Promise<CmsLens | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=lens`, cacheOpts('posts:lens'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLens };
    return data.post ?? null;
  } catch {
    return null;
  }
}

// mbti_group 없이 발행된 CMS 글(letterHref 가 slug 를 그대로 id 로 씀)을
// /letters/view?id=<slug> 로 열 때 사용 — 날짜/그룹 기반 목록 조회로는 못 찾는다.
export async function fetchCmsPostBySlug(
  channel: CmsChannel,
  slug: string,
): Promise<CmsLetter | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, cacheOpts(`posts:${channel}`));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}
