/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { API_URL } from '@/shared/config/api';
import type { ApiLetter } from './todayLettersApi';

export type CmsChannel = 'letters' | 'paper' | 'feed' | 'trend_card' | 'webtoon' | 'video';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * trend_card 채널 응답 — 홈 피드 "요즘 화제의 경제 이슈"/"이번 주 인기 칼럼"
 * 카드. letters 와 달리 리치텍스트 본문이 없는 가벼운 카드라 모양이 다르다
 * (backend/v2/handlers/cms_posts_public.py _shape_trend_card 와 1:1).
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
  cover_image_url: string | null;
  panels: CmsWebtoonPanel[];
  is_cms: true;
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
  video_url: string;
  thumbnail_url: string | null;
  is_cms: true;
}

// 요청 단위 캐시 — 홈 화면 섹션 다수(트렌드/칼럼/단어퀴즈/미니헤드라인 등)가
// 같은 파라미터로 fetchCmsPosts/fetchTrendCards 를 각자 따로 불러서, 동일한
// 응답을 기다리는 중복 요청이 여러 개 동시에 나가고 있었다(2026-08-07,
// "섹션들이 한번에 안 뜨고 딜레이 있다" 피드백). in-memory 캐시로 그건
// 고쳤지만, in-memory 는 페이지를 새로고침하거나 다른 페이지 갔다 오면
// 초기화돼서 "그때그때 또 로딩한다"는 재피드백(같은 날)으로 이어졌다 —
// sessionStorage 에도 같이 적어서 같은 탭 세션 안에서는 재방문·새로고침해도
// 캐시 히트로 즉시 렌더되게 한다(stale-while-revalidate: 캐시가 있으면 그걸
// 먼저 돌려주고, 동시에 백그라운드로 새로 받아와 다음 번을 위해 갱신).
// TTL 20초 — SSR 전환(2026-08-08) 이후 이 모듈스코프 Map은 브라우저 세션이
// 아니라 EC2 위 Node 프로세스가 떠있는 내내 "전체 방문자가 공유하는 서버
// 캐시"로 의미가 바뀐다(정적 export 시절엔 빌드 1회성 dedup 용도였음).
// admin 발행이 재빌드 없이 거의 즉시 반영돼야 한다는 요구 때문에 짧게 잡되,
// 완전히 0으로는 안 둔다 — 같은 페이지에 동시 접속이 몰릴 때 API Gateway/
// Lambda로 나가는 중복 요청을 여전히 줄여준다(공개 콘텐츠라 사용자 간
// 캐시 공유는 안전). 새 탭/새 세션은 sessionStorage 캐시가 없어 항상 새로
// 받아온다.
const REQUEST_CACHE_TTL_MS = 20 * 1000;
const SESSION_PREFIX = 'ailens-cms-cache:';
const requestCache = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

function readSession<T>(key: string): { value: T; expiresAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown, expiresAt: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify({ value, expiresAt }));
  } catch {
    // 세션스토리지 용량 초과 등 — 캐시는 그냥 최적화라 실패해도 무시.
  }
}

function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const memHit = requestCache.get(key);
  if (memHit && memHit.expiresAt > Date.now()) return memHit.promise as Promise<T>;

  const expiresAt = Date.now() + REQUEST_CACHE_TTL_MS;
  const store = (p: Promise<T>) => {
    requestCache.set(key, { promise: p, expiresAt });
    p.then((v) => writeSession(key, v, expiresAt)).catch(() => requestCache.delete(key));
    return p;
  };

  const sessionHit = readSession<T>(key);
  if (sessionHit) {
    // 캐시 즉시 반환 + 다음 호출을 위해 백그라운드에서 조용히 갱신(결과를
    // 기다리는 현재 호출자에게는 옛 값을 그대로 준다 — 화면이 있다가 없다가
    // 하는 깜빡임 없이, 새로고침 한 번 더 하면 최신값이 보이는 정도로 충분).
    store(run());
    return Promise.resolve(sessionHit.value);
  }

  return store(run());
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
      // cache: 'no-store'였다가 제거(2026-08-07, fetchWebtoons와 동일 이유) —
      // 빌드 시 여러 워커가 동시에 같은 URL을 fetch할 때 Next의 요청
      // 중복제거까지 꺼버려서 간헐적 실패를 유발했다. API 응답의
      // Cache-Control(max-age=300)을 그대로 따르면 admin 발행/수정/삭제가
      // 최대 5분간 안 보이는 문제는, 이 함수 자체가 이미 cached()로 5분
      // TTL을 걸고 있어 실질적 차이가 없다 — 그 TTL이 실제 신선도 계약이다.
      const res = await fetch(`${API_URL}/api/v2/posts?${qs}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLetter[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// trend_card 는 letters 와 모양이 달라 fetchCmsPosts 의 CmsLetter[] 반환 타입을
// 못 쓴다 — 같은 엔드포인트를 별도 함수로 감싼다.
export async function fetchTrendCards(): Promise<CmsTrendCard[]> {
  return cached('trend_card', async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/posts?channel=trend_card`); // no-store 제거 이유는 fetchCmsPosts 참조
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsTrendCard[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  return cached('webtoon', async () => {
    try {
      // cache: 'no-store'였다가 제거(2026-08-07) — 빌드 시 이 함수를 부르는
      // generateStaticParams/generateMetadata 등이 워커 여러 개에서 동시에
      // 같은 URL을 fetch하는데, no-store는 Next의 빌드타임 요청 중복제거
      // (Data Cache)까지 꺼버려서 동시 요청이 전부 개별 네트워크 호출이 되고
      // 그중 일부가 실패했다(/webtoon/[slug] 정적 생성이 간헐적으로
      // "찾을 수 없어요"로 떨어지던 원인). 기본값(요청 중복제거)이면 같은
      // 빌드 내 동일 URL 호출은 하나로 묶여 훨씬 안정적이다 — 클라이언트
      // 런타임에서도 이 함수 자체가 cached() 로 5분 캐시를 이미 감싸고 있어
      // 신선도에 실질적 차이는 없다.
      const res = await fetch(`${API_URL}/api/v2/posts?channel=webtoon`);
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=webtoon`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsWebtoon };
    return data.post ?? null;
  } catch {
    return null;
  }
}

export async function fetchVideos(): Promise<CmsVideo[]> {
  return cached('video', async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/posts?channel=video`); // no-store 제거 이유는 fetchCmsPosts 참조
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsVideo[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// mbti_group 없이 발행된 CMS 글(letterHref 가 slug 를 그대로 id 로 씀)을
// /letters/view?id=<slug> 로 열 때 사용 — 날짜/그룹 기반 목록 조회로는 못 찾는다.
export async function fetchCmsPostBySlug(
  channel: CmsChannel,
  slug: string,
): Promise<CmsLetter | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}
