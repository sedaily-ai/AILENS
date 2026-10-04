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

// 단일 명의: 모든 레터가 이 표시 정보를 공유한다. 백엔드 EDITORIAL_BYLINE("서울경제 편집부")과 같은 톤이다.
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

// 진행 중 요청 묶기(in-flight coalescing). 같은 date를 여러 곳이 동시에 부를 때 fetch를 하나로 공유하며,
// 시간 기반 캐시가 아니라 응답이 오면 즉시 지운다(admin 발행/수정/삭제가 즉시 반영된다. cmsPostsApi.ts의 동일 패턴 참조).
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
  // 라이브 단일 소스. 해당 날짜에 레터가 없으면 letters:[]이며 호출측이 빈 상태/직전일 lookback을 처리한다.
  //
  // today-letters API는 호출하지 않는다. 이 엔드포인트는 RDS 삭제로 항상 빈 응답이며(CLAUDE.md 참조),
  // 태그 없는 `next: { revalidate: 60 }` fetch는 이 함수를 쓰는 모든 페이지의 ISR TTL을 60초로 낮춘다.
  // 실제 콘텐츠는 태그가 달린 fetchCmsPosts('letters', date)가 담당한다.
  const cmsPosts = await fetchCmsPosts('letters', date);
  const data: ApiTodayLettersResponse = { date: date ?? '', mode: null, letters: [] };

  // 관리자가 쓴 글을 앞에 배치한다(편집 의도가 AI 레터보다 우선).
  return cmsPosts.length
    ? { ...data, letters: [...cmsPosts, ...data.letters] }
    : data;
}

// TodayLetterCard 매핑 (mockTodayFeed.ts 와 동일 schema).
// mock 자리에 그대로 끼울 수 있도록 1:1 변환하며, mock에만 있던 deliveryHint 같은 메타는 페르소나별 고정값으로 fallback한다.

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

// firstProseLine은 body[]의 마커를 거르지만 subtitle 필드에 "[주요 이슈 브리핑] ■ ..." 같은 마커가 그대로 올 수 있다.
// subtitle에도 같은 마커 제거를 적용한다.
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

// CMS(admin PostForm "post" 모드) 글은 body[]가 비고 body_html만 채워져 firstProseLine(body)가 항상 ''를 반환한다.
// 태그만 걷어내고 평문으로 붙인다(CMS는 텍스트 마커 없이 실제 <h2>/<strong> 태그를 쓴다).
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function estimateReadMinutes(body: string[], bodyHtml?: string | null): number {
  // 한국어 분당 약 600자. body_html(CMS 리치텍스트)이 있으면 태그를 걷어내고 센다(그 경우 body[]가 비어 있다).
  const chars = bodyHtml
    ? bodyHtml.replace(/<[^>]+>/g, '').length
    : body.reduce((sum, p) => sum + p.length, 0);
  return Math.max(2, Math.min(5, Math.round(chars / 600)));
}

export interface TodayLetterCardLike {
  letterId: string;
  // 상세로 이동할 링크. 소스에 따라 /letters/{id} 또는 /lens/{id}로 갈리므로 호출부는 letterHref()를 직접 부르지 않고
  // 이 값을 쓴다(어댑터 toTodayLetterCard/toLensLetterCard가 채운다).
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
  // subtitle이 있으면 그것을, 없으면 본문 첫 문장을 200자까지 쓴다(카드 요약용).
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
    // photo_image_url(실제 기사 사진)을 우선하고 cover_image_url(웹툰 첫 컷일 수 있음)은 폴백으로만 쓴다. toLensLetterCard()와 같은 우선순위.
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

// letters 채널은 자동 파이프라인 신규 발행이 없다(레터 포맷이 lens.lenses[]로 흡수됨). 따라서 룩백 방식은 빈 화면이 되므로
// lens(내부 letter 포맷, 항상 lenses[0], LENS_FORMATS 순서)를 대체 소스로 쓴다.
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

// 최신 레터 카드 목록. 현재 HotLettersRail("요즘 가장 많이 읽힌 글")이 쓴다. 이름은 홈 "이슈 톡톡"(FollowingFeed) 시절의 것이다.
const FOLLOWING_MAX_DISPLAY = 4;

// limit은 호출부가 고르며 기본값은 기존 동작을 유지한다.
// letters 대신 lens를 소스로 쓴다(toLensLetterCard 주석 참조). fetchLensPosts()가 최신순으로 내려주므로 단순 slice로 충분하다.
export async function fetchFollowingLetters(limit: number = FOLLOWING_MAX_DISPLAY): Promise<TodayLetterCardLike[]> {
  try {
    // 분류(증시·산업 등)가 있는 글만 홈과 같은 최신 100건 캐시에서 고른다(레일 라벨이 항상 붙고 요청도 추가되지 않는다).
    const posts = await fetchLensPosts(100);
    return posts.filter((p) => p.category || headlineSection(p.headline)).slice(0, limit).map(toLensLetterCard);
  } catch {
    return [];
  }
}

export type { LetterChart, LetterImage, ApiLetter } from "./letterTypes";
