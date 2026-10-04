/**
 * Today Letters API client.
 *
 * GET /api/v2/today-letters?date=YYYY-MM-DD
 *
 * 호출하는 곳: letters/[id], archive, news-feed 등 — fetchTodayLetters 참조.
 */
import { fetchCmsPosts, fetchLensPosts, type CmsLens } from './cmsPostsApi';
import { displayHeadline, headlineSection } from '@/shared/lib/content/displayHeadline';
import { letterHref } from '@/shared/lib/content/letterHref';
import { lensPath } from '@/shared/lib/content/lensUrl';
import type { ApiLetter } from "./letterTypes";
// API 응답 스키마 (backend/v2/handlers/today_letters.py 와 1:1)

export interface ApiTodayLettersResponse {
  date: string;
  mode: 'A' | 'C' | null;
  letters: ApiLetter[];
}

// 프론트 표시용 — TodayLetterCard 와 호환되는 확장형
export interface DisplayLetter extends ApiLetter {
  editorName: string;
  editorRole: string;
  editorAvatar: string;
  accent: string;
  accentBg: string;
}

// 단일 명의 — MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) 이후 모든 레터가
// 이 표시 정보를 공유한다. 백엔드 EDITORIAL_BYLINE("서울경제 편집부")과 같은 톤.
const DEFAULT_META: Omit<DisplayLetter, keyof ApiLetter> = {
  editorName: 'AI LENS',
  editorRole: '팀이 함께 정리했어요',
  editorAvatar: '/icon-512.png',
  accent: '#111827',
  accentBg: '#f3f4f6',
};

export function withDisplayMeta(letter: ApiLetter): DisplayLetter {
  return { ...letter, ...DEFAULT_META };
}

// 진행 중 요청 묶기(in-flight coalescing) — 같은 date 를 여러 곳(FollowingFeed
// lookback, SideRail, NewsletterCTA 등)이 동시에 부를 때 fetch 를 하나로
// 공유한다. **시간 기반 캐시가 아니다** — 응답이 오는 즉시 지운다. 다음
// 호출은 항상 새 네트워크 요청이라 admin 발행/수정/삭제가 즉시 반영된다
// (2026-08-08, "무조건 실시간성" 요구 — sessionStorage 에 결과를 남겨뒀던
// 이전 버전은 탭을 새로고침해도 옛 값이 몇 분간 남아있어 삭제한 글이 계속
// 보이는 문제가 있었다. cmsPostsApi.ts 의 동일 패턴 참조).
const lettersCache = new Map<string, Promise<ApiTodayLettersResponse>>();

export async function fetchTodayLetters(date?: string): Promise<ApiTodayLettersResponse> {
  const key = date ?? '__today__';
  const inFlight = lettersCache.get(key);
  if (inFlight) return inFlight;

  const promise = fetchTodayLettersLive(date);
  lettersCache.set(key, promise);
  promise.finally(() => lettersCache.delete(key));
  return promise;
}

async function fetchTodayLettersLive(date: string | undefined): Promise<ApiTodayLettersResponse> {
  // 라이브 단일 소스 (mock fallback 제거 2026-07-24). 해당 날짜에 레터가
  // 없으면 letters:[] — 호출측이 빈 상태/직전일 lookback 처리.
  //
  // 2026-09-03 — today-letters API 호출 자체를 제거했다. 이 엔드포인트는
  // 2026-08-04 RDS 삭제로 영구히 빈 응답만 주는 죽은 경로였고(CLAUDE.md
  // 참조), 태그 없는 `next: { revalidate: 60 }` fetch라 이 함수를 호출하는
  // 모든 페이지(홈·/lens·/lens/[slug]·/letters/[id]·카테고리)의 실효 ISR
  // TTL을 조용히 60초로 깔아뭉개고 있었다(ISR 재설계 감사로 발견) — 실제
  // 콘텐츠는 옆의 태그 달린 fetchCmsPosts('letters', date) 호출이 이미 전부
  // 담당하므로, 죽은 fetch를 지우고 빈 응답을 로컬에서 바로 구성한다.
  const cmsPosts = await fetchCmsPosts('letters', date);
  const data: ApiTodayLettersResponse = { date: date ?? '', mode: null, letters: [] };

  // 관리자가 쓴 글을 앞에 배치 — 편집 의도가 AI 레터보다 우선한다.
  return cmsPosts.length
    ? { ...data, letters: [...cmsPosts, ...data.letters] }
    : data;
}

// ──────────────────────────────────────────────────────────────────────────
// TodayLetterCard 매핑 (mockTodayFeed.ts 와 동일 schema)
//
// FollowingFeed / 다른 곳의 mock 자리에 그대로 끼울 수 있도록 1:1 변환.
// mock 만 알던 deliveryHint 같은 메타는 페르소나별 고정값으로 fallback.
// ──────────────────────────────────────────────────────────────────────────

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateLabel(isoDate: string): string {
  // "2026-05-14" → "5월 14일 수요일"
  const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 ${dow}요일`;
}

// LetterBlock(app/letters/[id]/LetterDetailClient.tsx) 의 마커 파싱과 동일 패턴 —
// 카드 목록용 요약(excerpt)에는 라벨/헤더 줄 말고 실제 본문 문장이 필요하다.
const IMAGE_MARKER_RE = /^!\[([^\]]*)\]\((\S+)\)$/;
const SECTION_HEADER_RE = /^■\s*(.+)$/;
const BRACKET_LABEL_RE = /^[[〔]([^\]〕]+)[\]〕]\s*([\s\S]*)$/;

// subtitle 이 비어있는 letter(대부분의 AI 레터)를 위한 폴백 — body[] 중
// 라벨/헤더/이미지 마커가 아닌 첫 실제 문장을 찾는다.
// 실제 AI 레터 포맷은 "■ 미중 AI 경쟁: 중국이…" 처럼 ■ 뒤에 순수 제목이 아니라
// 문장 전체가 바로 이어지는 경우가 대부분이라, 뒤에 딸린 내용이 충분히 길면
// (섹션 제목이 아니라 실제 문장으로 보고) 그대로 쓰고, 짧으면 진짜 헤더로 보고 스킵한다.
function firstProseLine(body: string[]): string {
  for (const raw of body) {
    const t = raw.trim();
    if (!t || IMAGE_MARKER_RE.test(t)) continue;

    const section = t.match(SECTION_HEADER_RE);
    if (section) {
      const rest = section[1].trim();
      if (rest.length < 15) continue; // 순수 섹션 제목("■ 핵심 요약")만 있으면 스킵
      return rest;
    }

    const bracket = t.match(BRACKET_LABEL_RE);
    if (bracket) {
      const rest = bracket[2].trim();
      if (!rest) continue; // 라벨만 있는 줄(예: "[글로벌 투자자 관심 뉴스]")은 스킵
      return rest;
    }

    return t;
  }
  return '';
}

// firstProseLine은 body[] 안에서 마커를 걸러내는데, subtitle 필드 자체에
// "[주요 이슈 브리핑] ■ ..." 처럼 마커가 그대로 박혀 오는 경우는 안 걸러졌다
// — "이슈 톡톡" 카드 설명글만 내부 포맷이 그대로 노출돼 정제 안 된 느낌을
// 준다는 지적(2026-08-06)으로 발견. subtitle에도 같은 마커 제거를 적용.
function stripLeadingMarkers(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 3; i++) {
    const bracket = t.match(BRACKET_LABEL_RE);
    if (bracket && bracket[2].trim()) {
      t = bracket[2].trim();
      continue;
    }
    const section = t.match(SECTION_HEADER_RE);
    if (section && section[1].trim()) {
      t = section[1].trim();
      continue;
    }
    break;
  }
  return t;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

// CMS(admin PostForm "post" 모드)로 쓴 글은 body[] 가 비어있고 body_html 만
// 채워진다 — 그 경우 firstProseLine(body) 는 빈 배열이라 항상 '' 를 반환해서
// excerpt 가 비어 보였다. 태그만 걷어내고 평문으로 붙인다(마커 파싱 불필요 —
// CMS 는 실제 <h2>/<strong> 태그를 쓰지 텍스트 마커를 안 씀).
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function estimateReadMinutes(body: string[], bodyHtml?: string | null): number {
  // 한국어 분당 약 600 자. body_html(CMS 리치텍스트)이 있으면 태그를 걷어내고 센다 —
  // body[] 는 그 경우 비어있어서(admin PostForm "post" 모드) 그대로 두면 항상 최솟값이 나온다.
  const chars = bodyHtml
    ? bodyHtml.replace(/<[^>]+>/g, '').length
    : body.reduce((sum, p) => sum + p.length, 0);
  return Math.max(2, Math.min(5, Math.round(chars / 600)));
}

export interface TodayLetterCardLike {
  letterId: string;
  // 상세로 이동할 링크(2026-09-03, letters→lens 전환) — 소스에 따라
  // /letters/{id} 또는 /lens/{id}로 갈리므로, 호출부가 letterHref()를
  // 직접 부르지 않고 이 값을 그대로 쓴다. 어댑터(toTodayLetterCard/
  // toLensLetterCard)가 채운다.
  href: string;
  editorId: string;
  editorName: string;
  editorRole: string;
  editorAvatar: string;
  // CMS에서 지정한 카드 썸네일 — 없으면 null (호출측이 editorAvatar로 폴백).
  thumbnailUrl: string | null;
  archetype: string;
  accent: string;
  accentBg: string;
  title: string;
  subtitle: string;
  // subtitle 이 있으면 그걸, 없으면 본문 첫 문장을 200자까지 — 카드 요약용.
  excerpt: string;
  readMinutes: number;
  deliveryHint: string;
  dateLabel: string;
  newsId: string;
  /** 분류 라벨(증시·산업 등) — 레일의 작은 라벨용. 분류가 없는 글은 비운다. */
  category?: string | null;
}

export function toTodayLetterCard(letter: ApiLetter, letterDate: string): TodayLetterCardLike {
  const meta = DEFAULT_META;
  return {
    letterId: letter.id,
    href: letterHref(letter.id),
    editorId: letter.editor_id,
    editorName: meta.editorName,
    editorRole: meta.editorRole,
    editorAvatar: meta.editorAvatar,
    // v1.32 — photo_image_url(진짜 기사 사진) 우선, cover_image_url(웹툰
    // 첫 컷일 수 있음)은 폴백만. toLensLetterCard()와 같은 우선순위.
    thumbnailUrl: letter.photo_image_url || letter.cover_image_url || null,
    archetype: letter.archetype ?? meta.editorRole,
    accent: meta.accent,
    accentBg: meta.accentBg,
    title: displayHeadline(letter.headline),
    subtitle: letter.subtitle ?? '',
    excerpt: truncate(
      stripLeadingMarkers(letter.subtitle?.trim() || '') ||
        (letter.body_html ? stripHtml(letter.body_html) : firstProseLine(letter.body)),
      200,
    ),
    readMinutes: estimateReadMinutes(letter.body, letter.body_html),
    deliveryHint: '오늘 발행',
    dateLabel: formatDateLabel(letterDate),
    newsId: letter.article_id,
  };
}

// 2026-09-03(ISR 재설계 감사로 발견) — letters 채널은 2026-08-12 이후
// 자동 파이프라인 신규 발행이 없다(레터 포맷이 lens.lenses[]로 완전히
// 흡수됨, frontpage_auto/mustknow_auto 둘 다 channels:["lens"]만 씀).
// HotLettersRail·NewsletterCTA·온보딩 샘플이 위 toTodayLetterCard 경로로
// 14일 룩백을 쓰고 있었는데, 22일째 신규 발행이 없어 매번 룩백 초과 —
// 에러 없이 조용히 빈 화면을 렌더링해왔다. lens(내부 letter 포맷, 항상
// lenses[0] — LENS_FORMATS 순서)를 대체 소스로 쓴다.
export function toLensLetterCard(lens: CmsLens): TodayLetterCardLike {
  const meta = DEFAULT_META;
  const letterFormat = lens.lenses?.[0];
  const subtitle = (lens.context || '').trim();
  return {
    letterId: lens.id,
    href: lensPath(lens),
    editorId: lens.editor_id,
    editorName: meta.editorName,
    editorRole: meta.editorRole,
    editorAvatar: meta.editorAvatar,
    thumbnailUrl: lens.photo_image_url || lens.cover_image_url || null,
    archetype: meta.editorRole,
    accent: meta.accent,
    accentBg: meta.accentBg,
    title: displayHeadline(lens.headline),
    subtitle,
    excerpt: truncate(subtitle || stripLeadingMarkers(letterFormat?.paragraphs?.[0] || ''), 200),
    readMinutes: estimateReadMinutes(letterFormat?.paragraphs || []),
    deliveryHint: '오늘 발행',
    dateLabel: formatDateLabel(lens.date),
    newsId: lens.id,
    category: lens.category ?? headlineSection(lens.headline),
  };
}

// 최신 레터 카드 목록 — 지금은 HotLettersRail("요즘 가장 많이 읽힌 글") 하나만
// 쓴다. 원래 이름·주석은 홈 "이슈 톡톡"(FollowingFeed) 섹션 전용이던 시절
// 것인데, 그 섹션은 2026-08-17 홈 개편으로 카테고리 기반 구조에 흡수됐다
// (NewsFeedTab.tsx 참조) — 함수 자체는 그대로 재사용 중이라 이름은 남겨둔다.
const FOLLOWING_MAX_DISPLAY = 4;

// limit 파라미터화(2026-08-10) — 홈 "이슈 톡톡" 섹션은 4개, 사이드바 "요즘
// 가장 많이 읽힌 글"은 같은 이슈 톡톡 분류를 5개까지 보여달라는 요청으로
// 상한을 호출부가 고를 수 있게 뺐다. 기본값은 기존 FollowingFeed 동작 유지.
//
// 2026-09-03 — letters 대신 lens를 소스로 쓴다(toLensLetterCard 주석
// 참조). fetchLensPosts()가 이미 최신순 정렬로 내려주므로 날짜별
// 역순 조회 루프 자체가 필요 없어졌다 — 단순 slice.
export async function fetchFollowingLetters(limit: number = FOLLOWING_MAX_DISPLAY): Promise<TodayLetterCardLike[]> {
  try {
    // 분류(증시·산업 등)가 있는 글만, 홈과 같은 최신 100건 캐시에서 고른다(2026-10-04) — 레일 라벨이 항상 붙고 요청도 추가되지 않는다.
    const posts = await fetchLensPosts(100);
    return posts.filter((p) => p.category || headlineSection(p.headline)).slice(0, limit).map(toLensLetterCard);
  } catch {
    return [];
  }
}

export type { LetterChart, LetterImage, ApiLetter } from "./letterTypes";
