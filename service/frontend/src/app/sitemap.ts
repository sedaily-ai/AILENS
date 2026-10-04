import { ERAS, DECADES } from '@/shared/data/timelineEvents';
import type { MetadataRoute } from 'next';
import { fetchAllWebtoons, fetchAllVideos, fetchAllLensPosts, fetchPaperDates } from '@/shared/lib/api/cmsPostsApi';
import { kstTodayStr } from '@/shared/lib/date/date';
// 2026-08-25: `./(content)/games/play/[slug]/page` 에서 가져오던 것을 단일 출처로
// 교체. app → app 참조라 FSD boundaries 위반이기도 했고, 그 page 모듈의 `GAMES`
// export 자체가 프로덕션 빌드를 막고 있었다(shared/data/games.ts 주석 참조).
import { GAMES } from '@/shared/data/games';

// AI LENS sitemap — freshness 기반 우선순위 (en.sedaily.com AEO 보고서 패턴).

import { SITE_URL as BASE } from '@/shared/constants/site';
import { lensPath } from '@/shared/lib/content/lensUrl';

// Next.js의 MetadataRoute.Sitemap video/image 확장은 title/description 같은
// 텍스트 필드를 XML에 그대로 꽂아 넣고 자동 이스케이프하지 않는다(실측
// 확인, 2026-10-01 — 사용자가 "sitemap.xml 파싱 에러" 스크린샷으로 신고).
// 기사 제목에 흔한 "&"("SK이노베이션 E&S", "M&A로 더본코리아" 등)가 그대로
// 들어가면 "&S", "&A"가 유효한 XML 엔티티가 아니라 사이트맵 전체가
// 파싱 에러로 깨진다 — 첫 에러 지점 이후는 구글/크롤러가 아예 못 읽는다.
// video:title/video:description에 넣기 전에 직접 이스케이프한다.
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  // /trend(2026-08-17), /letters·/column(2026-08-18), /issue-talk(2026-08-19)
  // 순서로 전부 폐기하고 /archive로 영구 리다이렉트(next.config.ts) — 상단
  // 탭이 형식(브리핑/인사이트/이슈톡톡) 기준에서 아래 6개 경제 카테고리
  // 기준으로 개편된 뒤 nav 진입점이 전부 없어졌다. sitemap에도 더 이상
  // 별도 URL로 올리지 않는다.
  // 경제 버티컬 카테고리 6개(2026-08-17, 상단 탭 개편) — /letters, /column을
  // 대체해 새 nav 1군이 됐다. shared/constants/econCategories.ts와 슬러그가
  // 반드시 일치해야 한다(수동 나열 — 이 배열 자체가 priority/changeFrequency
  // 같은 편집 판단을 담고 있어 다른 3곳처럼 .map()으로 자동 생성하지 않았다).
  { path: '/markets',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 증시
  { path: '/signal',        priority: 0.8, changeFrequency: 'daily', lastModified: '2026-10-01' }, // 시그널(Market Signal)
  { path: '/property',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 부동산
  { path: '/industry',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 산업
  { path: '/finance',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 금융·정책
  { path: '/international', priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 국제
  { path: '/culture',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-20' }, // 문화
  { path: '/lens',         priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-12' }, // 오늘의 이슈, 4가지 시선 목록
  { path: '/games',        priority: 0.5, changeFrequency: 'monthly', lastModified: '2026-08-11' },
  { path: '/words',        priority: 0.6, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 단어장 — 레터 키워드 기반, 매일 갱신
  { path: '/style',        priority: 0.3, changeFrequency: 'monthly', lastModified: '2026-08-08' },
  // robots.txt Disallow 해제(2026-08-11) — 옛 5단계 질문형 온보딩 폐기 후
  // 순수 소개 랜딩으로 바뀌었는데 그 뒤로도 계속 막혀 있었다. 이제 푸터
  // "서비스 소개" 링크의 대상이라 색인돼야 한다.
  { path: '/onboarding',   priority: 0.4, changeFrequency: 'yearly',  lastModified: '2026-08-07' },
  // '/fortune', '/saju-match'는 2026-08-09 제거 — 사주는 CloudFront 경로
  // 라우팅(/saju*)으로 외부 AI-saju 서비스가 직접 서빙하고, 이 Next.js 앱의
  // 라우트가 아니다(그쪽 자체 sitemap이 따로 있음 — saju.sedaily.ai/sitemap.xml).
  // 그래도 2026-08-16부터 이 sitemap에 /saju 자체는 추가한다 — "AI LENS로
  // 검색하면 사주도 하위 카테고리로 나와야 한다"는 요구로, 이 URL이 AI LENS
  // 사이트 구조의 일부라는 신호를 구글에 준다. 단 canonical 태그
  // (ailens.sedaily.ai/saju 응답 HTML 자체, sedaily-ai/AI-saju 저장소 소관 —
  // 이 레포 밖)는 여전히 saju.sedaily.ai를 가리키고 있어 구글이 실제로 이
  // URL을 AI LENS 소속으로 색인할지는 별개 문제 — sitemap 등재는 필요조건일
  // 뿐 충분조건은 아니다.
  { path: '/saju',         priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-16' }, // 사주매칭 (외부 AI-saju, CDN 경로 마운트)
  // /timemachine 라우트는 2026-08-17 삭제 — 네비게이션 어디서도 링크되지
  // 않는 죽은 기능이었고, 핵심 콘텐츠("그 날짜의 역사적 사건")가 실제
  // 데이터가 아니라 대부분 알고리즘이 지어낸 가짜였다(진짜 데이터가 있는
  // 날짜는 4개뿐). famousBirthdays.ts/economicSnapshots.ts/
  // investmentScenarios.ts/timeMachineApi.ts도 이 라우트 전용이라 같이 삭제.
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  // 세 채널의 전체 목록(상한 밖 과거 글 포함)을 동시에 받는다(2026-10-04) — 순차로 받으면 첫 생성이 14초 걸려 CDN 오리진 대기 한도에 가까워진다.
  // 각 함수는 실패해도 throw하지 않고 빈 배열을 돌려주므로(아래 try 블록은 안전망) 미리 시작해 둬도 안전하다.
  const webtoonsPromise = fetchAllWebtoons();
  const lensPromise = fetchAllLensPosts();
  const videosPromise = fetchAllVideos();

  // 정적 라우트
  for (const r of STATIC_ROUTES) {
    entries.push({
      url: `${BASE}${r.path}`,
      lastModified: r.lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    });
  }

  // 레터 상세 — sitemap 등재 중단(2026-09-03, SEO/GEO 테스트 중 발견).
  // letters 채널은 2026-08-12 이후 신규 발행이 없다(lens 4가지 시선
  // 체계로 흡수됨 — 실제 레터 콘텐츠는 이제 /lens/{id}?v=1로 나간다).
  // 사이트 어디서도 /letters/[id]로 링크가 안 걸린 고아 페이지인 채로
  // 계속 sitemap에만 올라가 있었다 — 매번 "여기 콘텐츠 있다"고 구글에
  // 신호를 주는데 실제로는 3주 넘게 안 바뀌는 채널이라 크롤 예산 낭비이자
  // 오래된/방치된 사이트라는 신호로 읽힐 수 있다. 페이지 자체는 그대로
  // 살려둔다(기존 백링크·북마크로 들어오는 사람은 정상적으로 볼 수 있게)
  // — sitemap 제출만 멈춘다.

  // 웹툰 — 경로 기반 전환(2026-08-07) 이후 sitemap에도 추가.
  // images 확장(2026-09-02, SEO/GEO 감사) — 웹툰은 텍스트 기사보다 시각적
  // 콘텐츠 비중이 커서 구글 이미지 검색 유입 잠재력이 큰데, 그동안 사이트맵이
  // URL만 알려주고 "이 페이지 안에 이런 이미지들이 있다"는 명시적 신호를
  // 안 주고 있었다(next의 MetadataRoute.Sitemap이 images 필드로 표준
  // 이미지 사이트맵 확장을 지원 — Google 이미지 sitemap 문서 참조).
  // 컷 전부 넣는다 — 어느 컷이 검색에 걸릴지 미리 알 수 없다.
  try {
    const webtoons = await webtoonsPromise; // 최신 1,000건 상한 밖 과거 글 포함(2026-10-04)
    for (const w of webtoons) {
      const daysOld = daysBetween(w.date);
      entries.push({
        url: `${BASE}/webtoon/${w.id}`,
        lastModified: new Date(w.published_at || w.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
        // 목록 API는 panels를 비워 내려주므로(응답 경량화) 첫 컷인 대표 이미지를 알린다(2026-10-01 점검).
        images: w.panels.length > 0 ? w.panels.map((p) => p.url) : w.cover_image_url ? [w.cover_image_url] : [],
      });
    }
  } catch {
    /* 웹툰 API 불통이면 생략 — sitemap 나머지는 그대로 반환 */
  }

  // "오늘의 이슈, 4가지 시선" — 웹툰과 같은 이유로 개별 URL을 sitemap에
  // 추가(2026-08-12). /timemachine/{date}와 달리 하루 하나씩 실제로 발행된
  // 것만 있어서(임의 날짜 추정 없음) 전부 시딩해도 안전하다.
  try {
    // 최신 1,000건 상한을 넘는 과거 글까지 전부(2026-10-04) — fetchAllLensPosts 주석 참조.
    const lensPosts = await lensPromise;
    for (const l of lensPosts) {
      const daysOld = daysBetween(l.date);
      entries.push({
        url: `${BASE}${lensPath(l)}`,
        // lastmod는 최초 발행 시각(2026-10-04). 이전엔 updated_at을 우선했는데, 2026-10-01 일괄 백필(카테고리·파싱 보정)이
        // 저장 시각을 now()로 덮어 1,000건 중 750건(75%)이 같은 날짜가 됐다 — 실제 수정일이 아니면 구글은 lastmod를 신뢰하지 않는다.
        // changeFrequency 'never'와도 일관된다. 본문이 실제로 바뀐 시각을 따로 기록하는 필드는 후속 과제(content_updated_at).
        lastModified: new Date(l.published_at || l.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
        // 이미지 사이트맵(2026-10-01) — 위 웹툰 채널 글은 panels가 비어 있어(서비스 API 실측) images가 한 장도 안 나갔다.
        // 실제 웹툰 컷은 이 lens 글의 웹툰 형식(lenses[].images)에 있으므로 대표 이미지와 함께 여기서 알린다.
        images: Array.from(
          new Set(
            [l.cover_image_url, ...(l.lenses ?? []).flatMap((x) => (x.images ?? []).map((im) => im.url))].filter(
              (u): u is string => Boolean(u),
            ),
          ),
        ),
      });
    }
  } catch {
    /* lens API 불통이면 생략 */
  }

  // 지난 지면(2026-10-04) — 지면이 편성된 날짜별 페이지. 그날 이후 바뀌지 않으므로 lastmod는 발행일 오전 7시(KST).
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

  // 영상 — 웹툰과 같은 이유로 개별 URL을 sitemap에 추가(2026-08-11).
  // videos 확장(2026-09-03, GEO 감사) — 웹툰의 images 필드와 같은 논리:
  // sitemap이 URL만 주지 말고 "이 페이지 안에 이런 영상이 있다"는 걸
  // Google 비디오 sitemap 스펙(next의 MetadataRoute.Sitemap[].videos)으로
  // 명시한다. video 채널은 항상 자체 렌더링해 S3에 올린 mp4라 video_url을
  // content_loc(원본 파일 직링크)로 그대로 쓸 수 있다.
  try {
    const videos = await videosPromise; // 최신 1,000건 상한 밖 과거 글 포함(2026-10-04)
    for (const v of videos) {
      const daysOld = daysBetween(v.date);
      entries.push({
        url: `${BASE}/video/${v.id}`,
        lastModified: new Date(v.published_at || v.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
        videos: [
          {
            title: escapeXml(v.title),
            // thumbnail_loc·content_loc도 이스케이프한다(2026-10-04): Next는 videos 필드를 이스케이프하지 않는다(title·description은 위에서 직접 처리).
            // 유튜브 주소의 `&t=24s` 같은 쿼리가 그대로 나가 XML이 깨졌고(서치콘솔 "구문분석 오류 70340행"), 구글이 사이트맵 전체를 0페이지로 읽었다.
            // 과거 영상은 1,000건 상한에 가려져 있다가 이번에 과거 글까지 넣으면서 드러났다.
            thumbnail_loc: escapeXml(v.thumbnail_url || `${BASE}/og-image.png`),
            description: escapeXml(v.excerpt || v.title),
            content_loc: escapeXml(v.video_url),
            publication_date: v.published_at || `${v.date}T07:00:00+09:00`,
            family_friendly: 'yes',
          },
        ],
      });
    }
  } catch {
    /* 영상 API 불통이면 생략 */
  }

  // 오디오(/listen/{id}) 개별 페이지는 사이트맵에서 뺀다(2026-10-01, SEO 감사) — 본문이 기사 페이지와 93% 겹치는 중복 페이지라 canonical을
  // lens 기사 페이지로 지정했다(lensCanonical.ts). 영상(/video/{id})은 서버 HTML에 <video>와 VideoObject가 있는 정식 시청 페이지라
  // 사이트맵·자기 canonical을 유지한다(Search Console 동영상 색인 230건이 이 페이지들 — 기사 페이지는 영상이 숨은 탭 안이라 시청 페이지가 아니다).

  // 타임라인 날짜별 페이지(2026-08-12, GEO 감사) — 처음엔 최근 7일만
  // 시딩했다. 그땐 과거 날짜가 실제 존재하는지 확인이 안 된 상태라(빈
  // 페이지가 sitemap에 잡히면 역효과) 과거 날짜 전체를 추정해 넣지
  // 않았었다.
  //
  // 2026-08-17 확장 — 그사이 빅카인즈 날짜범위검색으로 2026-02-01 이전
  // 구간도 실제 기사 데이터가 확인됐고(features/timeline), 페이지 자체에
  // 이미 자기방어 장치가 있다: [date]/page.tsx의 generateMetadata가 매
  // 요청마다 그 날짜에 기사가 있는지 직접 fetch해서 없으면
  // `robots:{index:false}`로 스스로 빼버린다. 그래서 sitemap이 존재를
  // 보장할 필요가 없다 — sitemap은 "발견 경로"만 주고, 색인 여부의 최종
  // 판단은 페이지가 각자 한다. 이 안전장치를 믿고 최근 24개월로 확장한다.
  // 1990년까지 전체(13,000+일)를 다 넣진 않는다 — "얇은 페이지 다수"
  // 리스크와 sitemap 생성 자체가 느려지는 문제(사용자 확인, 2026-08-17).
  // 그 밖 오래된 날짜는 여전히 직접 방문·공유 링크로만 접근 가능.
  //
  // 날짜는 KST 기준(shared/lib/date.ts) — SSR 서버가 보통 UTC 타임존이라
  // `new Date().toISOString()`으로 그냥 계산하면 자정~오전 9시 KST 사이엔
  // "오늘"이 하루 밀린다(발견 당시: 서버 UTC 16:57 = KST 01:57인데 여전히
  // 전날로 계산됨). Date.UTC로 캘린더 날짜만 순수하게 계산해서 이 문제를
  // 피한다 — kstTodayStr()로 얻은 "오늘"의 연/월/일 숫자만 가져다 UTC
  // 타임스탬프를 만들면, 그 뒤 toISOString()이 다시 타임존을 끼워넣을
  // 여지가 없다.
  const TIMELINE_SITEMAP_DAYS = 730; // 최근 24개월
  const todayIso = kstTodayStr();
  const [ty, tm, td] = todayIso.split('-').map((s) => parseInt(s, 10));
  for (let i = 0; i < TIMELINE_SITEMAP_DAYS; i += 1) {
    const iso = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10);
    entries.push({
      url: `${BASE}/timeline/${iso}`,
      lastModified: iso,
      // 오늘 날짜만 하루 동안 계속 갱신된다(NewsTimeMachineSection의 3분
      // 폴링과 같은 이유) — 지난 날짜는 지면이 이미 확정돼 다시 안 바뀐다.
      changeFrequency: iso === todayIso ? 'hourly' : 'never',
      priority: freshnessPriority(i),
    });
  }

  // 게임 상세 — shared/data/games.ts 의 목록을 그대로 재사용(2026-08-11 SEO
  // 감사에서 /games/play/[slug]가 sitemap 에서 빠져있던 걸 발견해 추가).
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
