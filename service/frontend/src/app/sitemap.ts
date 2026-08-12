import type { MetadataRoute } from 'next';
import { fetchWebtoons, fetchVideos, fetchLensPosts } from '@/shared/lib/cmsPostsApi';
import { kstTodayStr } from '@/shared/lib/date';
import { GAMES } from './games/play/[slug]/page';

// AI LENS sitemap — freshness 기반 우선순위 (en.sedaily.com AEO 보고서 패턴).
// 무캐시(2026-08-09) — posts:letters 태그 캐시를 쓰다가, revalidateTag(tag,
// 'max')가 실제로는 "30일 캐시 프로파일 재고정"이라는 걸 확인하고 뺐다
// (cmsPostsApi.ts 상단 주석 참조).

const BASE = 'https://ailens.sedaily.ai';

// mock 제거(2026-07-24) 후 최근 발행 레터를 API 에서 가져온다. 최근 SEED_DAYS
// 일로 조회 범위를 제한(sitemap 크기·응답시간 관리 목적). API 불통이면 레터
// URL 생략.
const API_BASE = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
const SEED_DAYS = 14;

// 단일 명의(AI LENS) 체계(2026-08-07) 이후 letter id 는 `{group}-{date}` 가 아니라
// API가 주는 letter.id 그대로다 — 날짜를 id에서 역산할 수 없으니 조회한 시점의
// iso 날짜를 같이 들고 다닌다.
interface SeedLetter {
  id: string;
  date: string;
}

// today-letters(구 AI 파이프라인)는 2026-08-04 RDS 삭제로 영구히 빈 응답만
// 반환한다 — CMS posts API(channel=letters)로 교체(2026-08-07,
// letters/[id]/page.tsx와 동일 원인·동일 수정).
async function fetchLettersRecent(days: number): Promise<SeedLetter[]> {
  const seen = new Set<string>();
  const out: SeedLetter[] = [];
  const t = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    try {
      const res = await fetch(`${API_BASE}/api/v2/posts?channel=letters&date=${iso}`, {
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { posts?: Array<{ id: string }> };
      for (const l of data.posts ?? []) {
        if (!l.id || seen.has(l.id)) continue;
        seen.add(l.id);
        out.push({ id: l.id, date: iso });
      }
    } catch {
      /* 이 날짜 skip */
    }
  }
  return out;
}

// 정적 라우트 — 항상 노출되는 핵심 페이지
// lastModified는 각 라우트 파일의 최근 git 커밋 날짜(2026-08-11 GEO 감사에서
// 수기 반영) — SSR이라 빌드타임 상수가 없어서 `new Date()`(요청 시각)를 썼었는데,
// 그러면 sitemap을 언제 긁든 "방금 바뀜"으로 보여 AI 크롤러 입장에서 신선도
// 시그널이 항상 거짓이 된다(Search Console 문서도 lastmod 조작을 명시적으로
// 경고). 이 페이지들을 실제로 고치면 그때 날짜도 같이 올릴 것.
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; lastModified: string }[] = [
  { path: '/',             priority: 1.0, changeFrequency: 'hourly',  lastModified: '2026-08-08' }, // 메인 피드
  // 콘텐츠 타입별 페이지 분리(2026-08-11) — /letters가 레터 전용이 되고,
  // /trend·/column·/archive(전체 모아보기) 신설. en.sedaily.com처럼 타입별
  // 진짜 URL을 줘서 카테고리 단위 검색 노출을 노린다.
  { path: '/letters',      priority: 0.9, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 레터 전용 아카이브
  { path: '/trend',        priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 트렌드 전용 아카이브
  { path: '/column',       priority: 0.6, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 인기 칼럼 전용 아카이브
  { path: '/archive',      priority: 0.5, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 전체 모아보기
  { path: '/webtoon',      priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 웹툰 목록
  { path: '/lens',         priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-12' }, // 오늘의 이슈, 4가지 시선 목록
  { path: '/video',        priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 영상 목록
  { path: '/games',        priority: 0.5, changeFrequency: 'monthly', lastModified: '2026-08-11' },
  { path: '/words',        priority: 0.6, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 단어장 — 레터 키워드 기반, 매일 갱신
  { path: '/style',        priority: 0.3, changeFrequency: 'monthly', lastModified: '2026-08-08' },
  // robots.txt Disallow 해제(2026-08-11) — 옛 5단계 질문형 온보딩 폐기 후
  // 순수 소개 랜딩으로 바뀌었는데 그 뒤로도 계속 막혀 있었다. 이제 푸터
  // "서비스 소개" 링크의 대상이라 색인돼야 한다.
  { path: '/onboarding',   priority: 0.4, changeFrequency: 'yearly',  lastModified: '2026-08-07' },
  // '/fortune', '/saju-match'는 2026-08-09 제거 — 사주는 이제 CloudFront
  // 경로 라우팅(/saju*)으로 외부 AI-saju 서비스가 직접 서빙한다. 이 Next.js
  // 앱의 라우트가 아니라서 이 sitemap에 안 들어간다(그쪽 자체 sitemap이 따로 있음).
  // 입력 화면 — 실제 콘텐츠는 /timemachine/{date}(2026-08-12, SSR 분리). /timeline과
  // 달리 여기 날짜는 "최근 N일"이 아니라 생일 등 임의의 과거 날짜(1990~어제)라 어떤
  // 날짜가 실제로 방문될지 신호가 없다 — 홈에도 특정 날짜를 링크하는 티저가 없어서
  // (grep 확인) 무작위로 사전 시딩하면 아무도 안 볼 얇은 페이지만 늘어난다. 개별
  // 날짜 페이지는 직접 방문·공유로는 그대로 색인 가능.
  { path: '/timemachine',  priority: 0.7, changeFrequency: 'weekly',  lastModified: '2026-08-12' },
  { path: '/timeline',     priority: 0.7, changeFrequency: 'weekly',  lastModified: '2026-08-12' }, // 입력 화면 — 실제 콘텐츠는 /timeline/{date}
  { path: '/about',        priority: 0.3, changeFrequency: 'yearly',  lastModified: '2026-08-11' },
  { path: '/contact',      priority: 0.3, changeFrequency: 'yearly',  lastModified: '2026-08-08' },
  { path: '/terms',        priority: 0.2, changeFrequency: 'yearly',  lastModified: '2026-08-08' },
  { path: '/privacy',      priority: 0.2, changeFrequency: 'yearly',  lastModified: '2026-08-08' },
];

// freshness 기반 priority — 최신 레터일수록 높게
function freshnessPriority(daysOld: number): number {
  if (daysOld < 1)   return 1.0;   // 오늘
  if (daysOld < 7)   return 0.9;   // 이번 주
  if (daysOld < 30)  return 0.8;   // 이번 달
  if (daysOld < 90)  return 0.7;
  if (daysOld < 180) return 0.6;
  return 0.5;                       // 오래된 레터
}

function daysBetween(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
  const target = new Date(y, m - 1, d).getTime();
  const today = Date.now();
  return Math.max(0, Math.floor((today - target) / (1000 * 60 * 60 * 24)));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // 정적 라우트
  for (const r of STATIC_ROUTES) {
    entries.push({
      url: `${BASE}${r.path}`,
      lastModified: r.lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    });
  }

  // 레터 상세 — 최근 SEED_DAYS 일의 라이브 발행 레터 (빌드타임 fetch).
  const letters = await fetchLettersRecent(SEED_DAYS);

  for (const { id, date } of letters) {
    const daysOld = daysBetween(date);
    entries.push({
      url: `${BASE}/letters/${id}`,
      // 발행일 = lastModified. 레터는 발행 후 수정 안 함.
      lastModified: new Date(date + 'T07:00:00+09:00'),
      // 기사는 발행 후 변하지 않음 — AI 크롤러에 명확히 시그널
      changeFrequency: 'never',
      priority: freshnessPriority(daysOld),
    });
  }

  // 웹툰 — 경로 기반 전환(2026-08-07) 이후 sitemap에도 추가.
  try {
    const webtoons = await fetchWebtoons();
    for (const w of webtoons) {
      const daysOld = daysBetween(w.date);
      entries.push({
        url: `${BASE}/webtoon/${w.id}`,
        lastModified: new Date(w.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
      });
    }
  } catch {
    /* 웹툰 API 불통이면 생략 — sitemap 나머지는 그대로 반환 */
  }

  // "오늘의 이슈, 4가지 시선" — 웹툰과 같은 이유로 개별 URL을 sitemap에
  // 추가(2026-08-12). /timemachine/{date}와 달리 하루 하나씩 실제로 발행된
  // 것만 있어서(임의 날짜 추정 없음) 전부 시딩해도 안전하다.
  try {
    const lensPosts = await fetchLensPosts();
    for (const l of lensPosts) {
      const daysOld = daysBetween(l.date);
      entries.push({
        url: `${BASE}/lens/${l.id}`,
        lastModified: new Date(l.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
      });
    }
  } catch {
    /* lens API 불통이면 생략 */
  }

  // 영상 — 웹툰과 같은 이유로 개별 URL을 sitemap에 추가(2026-08-11).
  try {
    const videos = await fetchVideos();
    for (const v of videos) {
      const daysOld = daysBetween(v.date);
      entries.push({
        url: `${BASE}/video/${v.id}`,
        lastModified: new Date(v.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
      });
    }
  } catch {
    /* 영상 API 불통이면 생략 */
  }

  // 타임라인 날짜별 페이지(2026-08-12, GEO 감사) — /timeline/{date}가 실제
  // 존재하는지 확인 안 된 과거 날짜까지 통째로 추정해 넣진 않는다(빈
  // 페이지가 sitemap에 잡히면 역효과). 최근 7일은 전국 경제 뉴스가 아예
  // 없었을 가능성이 사실상 없어 안전하게 시딩 — 그보다 오래된 날은
  // 페이지 자체는 동작하지만(직접 방문·공유 가능) sitemap엔 안 올린다.
  //
  // 날짜는 KST 기준(shared/lib/date.ts) — SSR 서버가 보통 UTC 타임존이라
  // `new Date().toISOString()`으로 그냥 계산하면 자정~오전 9시 KST 사이엔
  // "오늘"이 하루 밀린다(발견 당시: 서버 UTC 16:57 = KST 01:57인데 여전히
  // 전날로 계산됨). Date.UTC로 캘린더 날짜만 순수하게 계산해서 이 문제를
  // 피한다 — kstTodayStr()로 얻은 "오늘"의 연/월/일 숫자만 가져다 UTC
  // 타임스탬프를 만들면, 그 뒤 toISOString()이 다시 타임존을 끼워넣을
  // 여지가 없다.
  const todayIso = kstTodayStr();
  const [ty, tm, td] = todayIso.split('-').map((s) => parseInt(s, 10));
  for (let i = 0; i < 7; i += 1) {
    const iso = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10);
    entries.push({
      url: `${BASE}/timeline/${iso}`,
      lastModified: iso,
      // 오늘 날짜만 하루 동안 계속 갱신된다(TimelinePreviewSection의 3분
      // 폴링과 같은 이유) — 지난 날짜는 지면이 이미 확정돼 다시 안 바뀐다.
      changeFrequency: iso === todayIso ? 'hourly' : 'never',
      priority: freshnessPriority(i),
    });
  }

  // 게임 상세 — 정적 슬러그 2개, games/play/[slug]/page.tsx의 GAMES를 그대로 재사용.
  for (const slug of Object.keys(GAMES)) {
    entries.push({
      url: `${BASE}/games/play/${slug}`,
      lastModified: '2026-08-11',
      changeFrequency: 'monthly',
      priority: 0.4,
    });
  }

  return entries;
}
