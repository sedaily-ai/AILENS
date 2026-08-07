/**
 * Today Letters API client.
 *
 * GET /api/v2/today-letters?date=YYYY-MM-DD
 *
 * 호출하는 곳:
 *   - app/today/preview/page.tsx (검증 페이지)
 *   - app/today/TodayLensClient (추후 통합)
 */
import { fetchCmsPosts } from './cmsPostsApi';

const API_BASE = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';

// 이미지 채널 — 코드 렌더용 차트 데이터 (레터 실수치, AI 생성 아님).
export interface LetterChart {
  title: string;
  unit: string;
  series: Array<{ label: string; value: number }>;
}

// 본문 중간 이미지. url 만 필수, 나머지 옵션.
// 여러 장이면 배열 순서대로 세로 스택 렌더.
export interface LetterImage {
  url: string;
  alt?: string;
  caption?: string;
  credit?: string;
  // 이미지 비율 힌트 (e.g., '16/9', '4/3', '1/1'). 미지정 시 자연 비율.
  aspect?: string;
}

// API 응답 스키마 (backend/v2/handlers/today_letters.py 와 1:1)
export interface ApiLetter {
  id: string;
  editor_id: string;
  article_id: string;
  secondary_article_ids: string[];
  archetype: string | null;
  theme: string | null;
  headline: string;
  subtitle: string | null;
  closing_line: string | null;
  body: string[];
  // CMS 글(admin PostForm "post" 모드)이 Tiptap 리치텍스트로 쓴 경우만 존재.
  // 있으면 body[] 대신 이 HTML 을 그대로 렌더한다 (굵게·글머리·이미지 위치 보존).
  body_html?: string | null;
  key_points: string[];
  keywords: Array<{ term: string; explain: string }>;
  chart?: LetterChart; // 이미지 채널 데이터 시각화 (옵션)
  images?: LetterImage[]; // 본문 중간 실 이미지 (옵션, chart 보다 우선)
  // article_id 기반 자동 생성이 안 되는 레터를 위해 admin 이 수동 업로드한 팟캐스트 URL.
  podcast_audio_url?: string | null;
  // 피드 카드 썸네일 (CMS 글 전용 — admin에서 지정 안 하면 null, 에디터 아바타로 폴백).
  cover_image_url?: string | null;
  // 채널 목록 조회(fetchCmsPosts)로 여러 날짜가 섞여 나올 때만 필요 —
  // fetchTodayLetters(date) 호출부는 이미 date 를 알고 있어 안 씀.
  publish_date?: string | null;
  // /letters 아카이브 필터용 가벼운 태그 — channel(letters)은 그대로 두고
  // "트렌드"/"인기 칼럼"으로도 분류하고 싶을 때만 admin 이 지정.
  section?: 'trend' | 'column' | null;
  // section 이 trend/column 일 때 홈 카드 상단 라벨(예: "증시", "투자 인사이트").
  // admin PostForm이 지정하지 않으면 null — 호출측이 editor_id 등으로 폴백.
  category?: string | null;
}

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

// 날짜별 응답 캐시 — 같은 date 의 4편 사이 이동 / 페이지네이션 즉시화.
// Promise 자체를 캐시해 동시 호출(병렬 4편 prefetch)이 같은 fetch 를 공유.
// TTL 로 만료시켜, 세션을 오래 열어둔 사용자가 CMS 수정분·신규 발행을
// 하드 리프레시 없이도 받아보게 한다 (당일 캐시가 무기한 박제되던 버그 수정).
//
// 2026-08-07: sessionStorage 에도 같이 적는다 — FollowingFeed(이슈 톡톡)는
// 오늘자가 비어 있으면 전날·전전날로 직접 날짜를 거슬러 여러 번 fetch 하는데
// (lookback), in-memory 캐시만으로는 페이지를 새로고침하거나 다른 페이지
// 갔다 오면 이 lookback 전체가 매번 처음부터 다시 돈다 — "그때그때 로딩하는
// 것 같다"는 피드백(같은 날)의 핵심 원인. cmsPostsApi.ts 의 동일 패턴 참조.
const CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_PREFIX = 'ailens-letters-cache:';
const lettersCache = new Map<string, { promise: Promise<ApiTodayLettersResponse>; expiresAt: number }>();

function readSession(key: string): { value: ApiTodayLettersResponse; expiresAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: ApiTodayLettersResponse; expiresAt: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: ApiTodayLettersResponse, expiresAt: number) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify({ value, expiresAt }));
  } catch {
    // 세션스토리지 용량 초과 등 — 캐시는 최적화일 뿐이라 실패해도 무시.
  }
}

export async function fetchTodayLetters(date?: string): Promise<ApiTodayLettersResponse> {
  const key = date ?? '__today__';
  const cached = lettersCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const expiresAt = Date.now() + CACHE_TTL_MS;
  const sessionHit = readSession(key);
  if (sessionHit) {
    // 캐시 즉시 반환 + 백그라운드로 조용히 갱신(다음 호출을 위해).
    const bg = fetchTodayLettersLive(date, expiresAt);
    lettersCache.set(key, { promise: bg, expiresAt });
    return sessionHit.value;
  }

  const promise = fetchTodayLettersLive(date, expiresAt);
  lettersCache.set(key, { promise, expiresAt });
  return promise;
}

async function fetchTodayLettersLive(date: string | undefined, expiresAt: number): Promise<ApiTodayLettersResponse> {
  const key = date ?? '__today__';
  const promise = (async () => {
    // 라이브 단일 소스 (mock fallback 제거 2026-07-24). 해당 날짜에 레터가
    // 없으면 API 가 letters:[] 를 반환 — 호출측이 빈 상태/직전일 lookback 처리.
    const qs = date ? `?date=${date}` : '';

    // CMS 수동 글을 함께 부른다. 순차가 되지 않게 Promise.all 로 묶는다.
    // fetchCmsPosts 는 실패해도 throw 하지 않고 [] 를 주므로, CMS 가 죽어도
    // 기존 레터는 그대로 렌더된다 (spec §8 fail-open).
    // API 응답의 Cache-Control(max-age=300)을 브라우저가 그대로 따르면 새로고침해도
    // 최대 5분간 옛 응답이 보인다 — no-store 로 우회. 인메모리 캐시(위 CACHE_TTL_MS)는
    // 페이지 재로드 시 어차피 초기화되니 그대로 둔다.
    const [res, cmsPosts] = await Promise.all([
      fetch(`${API_BASE}/api/v2/today-letters${qs}`, { cache: 'no-store' }),
      fetchCmsPosts('letters', date),
    ]);

    if (!res.ok) {
      throw new Error(`today-letters API ${res.status}`);
    }
    const data = (await res.json()) as ApiTodayLettersResponse;

    // 관리자가 쓴 글을 앞에 배치 — 편집 의도가 AI 레터보다 우선한다.
    return cmsPosts.length
      ? { ...data, letters: [...cmsPosts, ...data.letters] }
      : data;
  })();

  // 실패 시 다음 호출에서 재시도되도록 cache 에서 제거. 성공하면 다음
  // 세션/새로고침에서 즉시 히트하도록 sessionStorage 에도 적는다.
  promise.then((v) => writeSession(key, v, expiresAt)).catch(() => lettersCache.delete(key));
  return promise;
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
}

export function toTodayLetterCard(letter: ApiLetter, letterDate: string): TodayLetterCardLike {
  const meta = DEFAULT_META;
  return {
    letterId: letter.id,
    editorId: letter.editor_id,
    editorName: meta.editorName,
    editorRole: meta.editorRole,
    editorAvatar: meta.editorAvatar,
    thumbnailUrl: letter.cover_image_url || null,
    archetype: letter.archetype ?? meta.editorRole,
    accent: meta.accent,
    accentBg: meta.accentBg,
    title: letter.headline,
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
