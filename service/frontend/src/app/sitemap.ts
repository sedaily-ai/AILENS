import { ERAS, DECADES } from '@/shared/data/timelineEvents';
import type { MetadataRoute } from 'next';
import { fetchAllLensPosts, fetchPaperDates, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { kstTodayStr } from '@/shared/lib/date/date';
// 게임 목록은 단일 출처(shared/data/games.ts)에서 가져온다. page 모듈에서 가져오면 FSD 경계를 위반하고 프로덕션 빌드를 막는다.
import { GAMES } from '@/shared/data/games';

// AI LENS sitemap — freshness 기반 우선순위 (en.sedaily.com AEO 보고서 패턴).

import { SITE_URL as BASE } from '@/shared/constants/site';
import { lensPath } from '@/shared/lib/content/lensUrl';

// MetadataRoute.Sitemap의 video/image 확장은 텍스트 필드를 자동 이스케이프하지 않는다.
// 제목의 "&"(예: "E&S", "M&A")가 그대로 들어가면 XML 파싱 오류로 사이트맵 전체를 읽을 수 없으므로 직접 이스케이프한다.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 정적 라우트 — 항상 노출되는 핵심 페이지
// lastModified는 라우트 파일의 실제 수정일을 수기로 갱신한다. 요청 시각(new Date())을 쓰면 크롤러에 거짓 신선도 신호가 된다.
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; lastModified: string }[] = [
  { path: '/',             priority: 1.0, changeFrequency: 'hourly',  lastModified: '2026-08-08' }, // 메인 피드
  // 카테고리 9개(2026-10-09 분류 개편). shared/constants/econCategories.ts의 슬러그와 일치해야 한다.
  // priority/changeFrequency를 개별 판단하므로 .map() 생성 대신 수동 나열한다.
  { path: '/markets',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-09' }, // 시그널(옛 증시+시그널)
  { path: '/property',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 부동산
  { path: '/economy',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-09' }, // 경제
  { path: '/finance',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-09' }, // 금융
  { path: '/industry',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 산업
  { path: '/politics',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-09' }, // 정치
  { path: '/national',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-09' }, // 사회
  { path: '/international', priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 국제
  { path: '/culture',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-20' }, // 문화
  { path: '/lens',         priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-12' }, // 오늘의 이슈, 4가지 시선 목록
  { path: '/games',        priority: 0.5, changeFrequency: 'monthly', lastModified: '2026-10-05' },
  { path: '/words',        priority: 0.6, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 단어장 — 레터 키워드 기반, 매일 갱신
  { path: '/style',        priority: 0.3, changeFrequency: 'monthly', lastModified: '2026-08-08' },
  // 서비스 소개 랜딩이며 푸터 링크 대상이므로 색인 대상이다.
  { path: '/onboarding',   priority: 0.4, changeFrequency: 'yearly',  lastModified: '2026-08-07' },
  // 사주(/saju)는 별도 서비스(saju.sedaily.ai)이므로 포함하지 않는다.
  { path: '/timeline',     priority: 0.7, changeFrequency: 'weekly',  lastModified: '2026-08-12' }, // 입력 화면 — 실제 콘텐츠는 /timeline/{date}
  // 시대 페이지(연표) — 정적 데이터(shared/data/timelineEras.ts), 시대가 늘면 자동으로 올라간다.
  { path: '/timeline/chronicle', priority: 0.8, changeFrequency: 'monthly' as const, lastModified: '2026-10-04' },
  ...DECADES.map((d) => ({ path: `/timeline/decade/${d.key}`, priority: 0.7, changeFrequency: 'monthly' as const, lastModified: '2026-10-04' })),
  ...ERAS.map((era) => ({ path: `/timeline/era/${era.slug}`, priority: 0.7, changeFrequency: 'monthly' as const, lastModified: '2026-10-04' })),
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

function videoSitemapExtension(l: CmsLens): Pick<MetadataRoute.Sitemap[number], 'videos'> {
  const v = l.lenses?.find((x) => x.label === '영상' && x.video_url);
  if (!v?.video_url) return {};
  const title = seoHeadline(l.headline);
  return {
    videos: [
      {
        title: escapeXml(title),
        // Next는 videos 필드를 이스케이프하지 않으며 `&t=24s` 같은 쿼리가 그대로 나가면 사이트맵 전체가 파싱 오류가 된다.
        thumbnail_loc: escapeXml(v.thumbnail_url || l.cover_image_url || `${BASE}/og-image.png`),
        description: escapeXml(l.context || title),
        content_loc: escapeXml(v.video_url),
        publication_date: l.published_at || `${l.date}T07:00:00+09:00`,
        family_friendly: 'yes',
      },
    ],
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const lensPromise = fetchAllLensPosts();

  // 정적 라우트
  for (const r of STATIC_ROUTES) {
    entries.push({
      url: `${BASE}${r.path}`,
      lastModified: r.lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    });
  }

  // 레터 상세는 sitemap에 포함하지 않는다. 신규 발행이 중단되었고 사이트 내 링크가 없는 고아 페이지라 크롤 예산을 낭비한다.
  // 페이지 자체는 기존 백링크·북마크를 위해 유지한다.

  // 웹툰(/webtoon/{id})·영상(/video/{id}) 상세는 canonical이 기사 페이지라 사이트맵에 넣지 않는다(lensCanonical.ts). 이미지·영상 신호는 아래 기사 항목의 images·videos 확장으로 알린다.

  // 오늘의 이슈(4가지 시선) — 하루 하나씩 실제 발행된 글만 존재하므로 전부 포함해도 안전하다.
  try {
    // 최신 1,000건 상한을 넘는 과거 글까지 전부 포함한다(fetchAllLensPosts 참조).
    const lensPosts = await lensPromise;
    for (const l of lensPosts) {
      const daysOld = daysBetween(l.date);
      entries.push({
        url: `${BASE}${lensPath(l)}`,
        // lastmod는 최초 발행 시각이다. updated_at은 일괄 백필 시 저장 시각으로 덮여 대부분 같은 날짜가 되므로 쓰지 않는다.
        // 실제 수정일이 아니면 구글이 lastmod를 신뢰하지 않으며, changeFrequency 'never'와도 일관된다.
        lastModified: new Date(l.published_at || l.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
        // 웹툰 채널 글은 panels가 비어 있어 images가 나가지 않으므로, lens 글의 웹툰 형식(lenses[].images) 이미지를 대표 이미지와 함께 알린다.
        images: Array.from(
          new Set(
            [l.cover_image_url, ...(l.lenses ?? []).flatMap((x) => (x.images ?? []).map((im) => im.url))].filter(
              (u): u is string => Boolean(u),
            ),
          ),
        ),
        // 영상 형식이 있으면 기사 페이지에 있는 영상(VideoObject와 같은 값)을 알린다. content_loc가 없으면 넣지 않는다.
        ...videoSitemapExtension(l),
      });
    }
  } catch {
    /* lens API 불통이면 생략 */
  }

  // 지난 지면 — 편성된 날짜별 페이지. 이후 바뀌지 않으므로 lastmod는 발행일 오전 7시(KST)로 둔다.
  try {
    for (const date of await fetchPaperDates()) {
      entries.push({
        url: `${BASE}/paper/${date}`,
        lastModified: new Date(`${date}T07:00:00+09:00`),
        changeFrequency: 'never',
        priority: freshnessPriority(daysBetween(date)),
      });
    }
  } catch {
    /* 지면 날짜 조회 실패 시 생략 */
  }

  // 오디오(/listen/{id})·웹툰·영상 상세는 본문이 기사 페이지와 대부분 중복이라 canonical을 lens 기사 페이지로 지정하고(lensCanonical.ts) 사이트맵에서 제외한다.

  // 타임라인 날짜별 페이지 — 최근 24개월만 포함한다. 전체(13,000+일)를 넣으면 얇은 페이지가 늘고 sitemap 생성이 느려진다.
  // 기사가 없는 날짜는 [date]/page.tsx의 generateMetadata가 robots:{index:false}로 스스로 제외하므로 sitemap은 발견 경로만 제공한다.
  // 날짜는 KST 기준(shared/lib/date.ts)이다. 서버가 UTC이면 new Date().toISOString()은 자정~09시(KST)에 "오늘"이 하루 밀린다.
  // kstTodayStr()의 연/월/일로 Date.UTC 타임스탬프를 만들어 타임존 재개입을 막는다.
  const TIMELINE_SITEMAP_DAYS = 730; // 최근 24개월
  const todayIso = kstTodayStr();
  const [ty, tm, td] = todayIso.split('-').map((s) => parseInt(s, 10));
  for (let i = 0; i < TIMELINE_SITEMAP_DAYS; i += 1) {
    const iso = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10);
    entries.push({
      url: `${BASE}/timeline/${iso}`,
      lastModified: iso,
      // 오늘 날짜만 계속 갱신된다. 지난 날짜는 지면이 확정되어 바뀌지 않는다.
      changeFrequency: iso === todayIso ? 'hourly' : 'never',
      priority: freshnessPriority(i),
    });
  }

  // 게임 상세 — shared/data/games.ts의 목록을 재사용한다.
  for (const { slug } of GAMES) {
    entries.push({
      url: `${BASE}/games/play/${slug}`,
      lastModified: '2026-08-11',
      changeFrequency: 'monthly',
      priority: 0.4,
    });
  }

  return entries;
}
