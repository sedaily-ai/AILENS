import type { MetadataRoute } from 'next';
import { fetchWebtoons } from '@/shared/lib/cmsPostsApi';

// AI LENS sitemap — freshness 기반 우선순위 (en.sedaily.com AEO 보고서 패턴).
// posts:letters 태그로 캐시(2026-08-08) — admin 발행 시 POST /api/revalidate
// 가 이 태그를 깨서 sitemap도 같이 갱신된다. force-dynamic은 일부러 안 쓴다
// — 태그 캐시로 가면 Next가 이 라우트를 Full Route Cache 대상으로 취급해
// revalidateTag() 가 라우트 자체까지 무효화해주는 게 맞는 방향이라, 매 요청
// 강제 재생성(force-dynamic)은 오히려 손해다.

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
        cache: 'force-cache',
        next: { tags: ['posts:letters'], revalidate: 5 },
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
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/',             priority: 1.0, changeFrequency: 'hourly'  }, // 메인 피드 — 매일 갱신
  { path: '/letters',      priority: 0.9, changeFrequency: 'daily'   }, // 레터 전체 아카이브
  { path: '/webtoon',      priority: 0.7, changeFrequency: 'daily'   }, // 웹툰 목록
  { path: '/words',        priority: 0.6, changeFrequency: 'daily'   }, // 단어장 — 레터 키워드 기반, 매일 갱신
  { path: '/style',        priority: 0.3, changeFrequency: 'monthly' },
  { path: '/fortune',      priority: 0.9, changeFrequency: 'daily'   }, // 일진 매일 바뀜
  { path: '/saju-match',   priority: 0.8, changeFrequency: 'weekly'  },
  { path: '/timemachine',  priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/timeline',     priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/about',        priority: 0.3, changeFrequency: 'yearly'  },
  { path: '/contact',      priority: 0.3, changeFrequency: 'yearly'  },
  { path: '/terms',        priority: 0.2, changeFrequency: 'yearly'  },
  { path: '/privacy',      priority: 0.2, changeFrequency: 'yearly'  },
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
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // 정적 라우트
  for (const r of STATIC_ROUTES) {
    entries.push({
      url: `${BASE}${r.path}`,
      lastModified: now,
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

  return entries;
}
