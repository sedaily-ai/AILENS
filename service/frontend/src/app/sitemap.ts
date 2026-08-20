import type { MetadataRoute } from 'next';
import { fetchWebtoons, fetchVideos, fetchLensPosts, fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
import { kstTodayStr } from '@/shared/lib/date';
import { GAMES } from './(content)/games/play/[slug]/page';

// AI LENS sitemap — freshness 기반 우선순위 (en.sedaily.com AEO 보고서 패턴).

const BASE = 'https://ailens.sedaily.ai';

// 예전엔 최근 14일(SEED_DAYS)만 date=YYYY-MM-DD로 하루씩 14번 조회해서 그
// 이전에 발행된 레터는 사이트맵에서 통째로 빠졌다(2026-08-18, GEO 점검 —
// en.sedaily.com은 월별 sitemap을 계속 이어붙여 발행분이 영원히 안 빠지는데
// 저희만 14일 지나면 사라짐을 확인). date를 안 주면 백엔드가 전체 발행
// 이력을 최신순으로 정렬해 돌려주므로(cms_posts_ddb_client.py — limit과
// 무관하게 항상 전체를 읽은 뒤 마지막에만 자른다) 하루씩 훑을 필요가 아예
// 없다 — 한 번의 요청으로 교체. limit 상한도 2026-08-18에 100→1000으로
// 올렸다(handlers/cms_posts_public.py).
// fetchCmsPosts()의 캐시(태그 기반, admin 발행 시 즉시 무효화 + 5분 안전망
// — cmsPostsApi.ts 참조)로 충분해서 여기 전용 no-store 우회는 더 안 쓴다.
const LETTERS_FETCH_LIMIT = 1000;

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
  { path: '/property',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 부동산
  { path: '/industry',      priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 산업
  { path: '/finance',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 금융·정책
  { path: '/international', priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 국제
  { path: '/investing',     priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-17' }, // 재테크
  { path: '/culture',       priority: 0.8, changeFrequency: 'daily', lastModified: '2026-08-20' }, // 문화
  { path: '/archive',      priority: 0.5, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 전체 모아보기
  { path: '/webtoon',      priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 웹툰 목록
  { path: '/lens',         priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-12' }, // 오늘의 이슈, 4가지 시선 목록
  { path: '/video',        priority: 0.7, changeFrequency: 'daily',   lastModified: '2026-08-11' }, // 영상 목록
  { path: '/listen',       priority: 0.6, changeFrequency: 'daily',   lastModified: '2026-08-21' }, // 오디오 목록
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

  // 레터 상세 — 전체 발행 이력(2026-08-18부터 14일 제한 없음, 위 주석 참조).
  const letters = await fetchCmsPosts('letters', undefined, LETTERS_FETCH_LIMIT);

  for (const letter of letters) {
    if (!letter.id || !letter.publish_date) continue;
    const daysOld = daysBetween(letter.publish_date);
    // updated_at이 있으면(=admin이 발행 후 수정한 적 있으면) 그걸,
    // 없으면 발행일을 lastModified로 — "발행 후 절대 안 바뀐다"는 가정을
    // 안 하게 됐다(admin이 실제로 발행 후 수정 가능, posts_repo.py 참조).
    const lastModifiedIso = letter.updated_at || `${letter.publish_date}T07:00:00+09:00`;
    entries.push({
      url: `${BASE}/letters/${letter.id}`,
      lastModified: new Date(lastModifiedIso),
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

  // 오디오 — 영상과 같은 이유로 개별 URL을 sitemap에 추가(2026-08-21,
  // /listen 신설). date가 빈 문자열인 항목(옛 home_player 데이터, 백엔드
  // 필드 확장 전)은 lastModified를 못 정하니 건너뛴다.
  try {
    const listen = await fetchHomePlayerPosts();
    for (const it of listen) {
      if (!it.date) continue;
      const daysOld = daysBetween(it.date);
      entries.push({
        url: `${BASE}/listen/${it.id}`,
        lastModified: new Date(it.date + 'T07:00:00+09:00'),
        changeFrequency: 'never',
        priority: freshnessPriority(daysOld),
      });
    }
  } catch {
    /* 오디오 API 불통이면 생략 */
  }

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
