// Backend admin API response shapes (verified from backend/admin/routes/*.py).

export interface LoginResponse {
  token: string;
  expires_at: string;
}

export type RuleState = "ENABLED" | "DISABLED" | "UNKNOWN";

export type CronPreset =
  | "5m"
  | "30m"
  | "1h"
  | "3h"
  | "6h"
  | "12h"
  | "daily-22kst"
  | "daily-04kst"
  | "custom";

export interface DriverRule {
  name: string;
  state: RuleState;
  schedule: string;
  preset: CronPreset;
}

export interface DriversResponse {
  rules: DriverRule[];
  feature_flags: Record<string, boolean>;
  thresholds: Record<string, number>;
}

export interface PromptListItem {
  id: string;
  active_version: number;
  updated_at: string;
}

export interface PromptHistoryEntry {
  version: number;
  created_at: string;
  actor: string;
}

export interface PromptDetail {
  id: string;
  active_content: string;
  active_version: number;
  history: PromptHistoryEntry[];
  /** 섹션 편집기(PromptDrawer)가 저장한 구조. 옛 버전·평문 저장에는 없다.
   *  신뢰할 수 없는 경계값이라 unknown 으로 두고 lib/prompt.ts 가 검증한다. */
  sections?: unknown;
}

export interface CostEntry {
  input_tokens?: number;
  output_tokens?: number;
  cost_usd: number;
}

export interface CostResponse {
  by_lambda: Record<string, Record<string, CostEntry>>;
  total_7d_usd: number;
  note: string;
}

export interface AuditEntry {
  ts: string;
  action: string;
  detail?: Record<string, unknown> | null;
  actor?: string | null;
  session?: string | null;
  source_ip?: string | null;
}

export interface AuditResponse {
  audits: AuditEntry[];
  count: number;
}

export interface NewsletterSubscriber {
  email: string; // masked (e.g., t****2@naver.com)
  status: string | null;
  created_at: string | null;
}

// --- CMS posts (backend/admin/routes/posts.py 와 1:1) ---

export type CmsChannel = "letters" | "paper" | "feed" | "trend_card" | "webtoon" | "video" | "lens";
// "용어 해설"/"이슈 톡톡" — 오늘의 이슈/머니 트렌드/깊은 이야기와 같은
// 방식의 분류(2026-08-12, 이슈 톡톡을 별도 채널에서 되돌렸다가 삭제 후
// 다시 부활).
export type CmsCardSection = "trend" | "column" | "glossary" | "issue_talk";
export type CmsStatus = "draft" | "published" | "archived";

export interface CmsKeyword {
  term: string;
  explain: string;
}

export interface CmsImage {
  url: string;
  caption?: string;
}

export interface CmsPostBody {
  body: string[];
  // 리치텍스트 에디터(Tiptap) 결과물. 있으면 렌더러가 이걸 우선하고 body[] 는
  // 무시한다 — AI 레터(daily_letters)는 여전히 body[] + 마커 방식이라 이 필드가
  // 비어있고, CMS 수동 글(cms_posts)만 여기 채운다.
  body_html?: string;
  key_points: string[];
  keywords: CmsKeyword[];
  images: CmsImage[];
  // channels: ["trend_card"] 글만 씀 — "요즘 화제의 경제 이슈"/"이번 주 인기
  // 칼럼" 두 섹션을 채널 하나로 묶고 이 값으로 가른다(v2/handlers/cms_posts_public.py
  // _shape_trend_card 참조). category 는 카드에 붙는 짧은 라벨(예: 증시, 투자 인사이트).
  section?: CmsCardSection;
  category?: string;
  // channels: ["video"] 글만 씀 — YouTube 등 외부 임베드 URL 원문 그대로.
  video_url?: string;
  // channels: ["lens"] 글만 씀 — "오늘의 이슈, 4가지 시선"(2026-08-12).
  // 하루 한 이슈를 원인/사람/내 일/숫자, 4개 고정 렌즈로 훑는다. 핵심요약은
  // 별도 필드 없이 기존 subtitle(모든 채널 공용 "요약" 필드)을 그대로 쓴다 —
  // lenses는 항상 4개(LENS_LABELS 순서 고정).
  lenses?: CmsLensItem[];
  // channels: ["lens"] 전용 — 텍스트가 박히지 않은 "순수 기사 사진"(2026-08-14).
  // cover_image_url 은 인스타 카드뉴스 완성형 그래픽이라 헤드라인·날짜가 이미
  // 이미지 안에 그려져 있어서, 웹 카드의 사진 칸에 쓰면 텍스트가 중복된다.
  // 이 필드가 채워지면 서비스 프런트가 사진 칸에 이걸 쓴다(없으면 사진 칸을
  // 아예 비운다 — service/frontend pickLensPhoto 참조).
  photo_image_url?: string | null;
}

export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
}

export interface CmsPost {
  id: string;
  slug: string;
  status: CmsStatus;
  channels: CmsChannel[];
  publish_date: string;
  editor_id: string | null;
  headline: string;
  subtitle: string | null;
  closing_line: string | null;
  body_inline: CmsPostBody;
  cover_image_url: string;
  /** 원문 기사 URL — 서울경제 원본 취재 기사 링크. SEO/GEO/AEO 신뢰 신호
   * (2026-08-13). 채널 무관하게 채울 수 있다. */
  source_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 생성·수정 payload — 부분 수정이므로 전부 선택적. */
export interface CmsPostInput {
  headline?: string;
  subtitle?: string | null;
  closing_line?: string | null;
  publish_date?: string;
  channels?: CmsChannel[];
  editor_id?: string | null;
  body_inline?: CmsPostBody;
  cover_image_url?: string | null;
  source_url?: string | null;
}

// --- 용어 퀴즈 (backend/admin/repo/quiz_repo.py 와 1:1) ---
// 레터 안 "퀴즈·투표" 위젯(AiQuizData)과 다르다 — 홈 화면 "오늘의 단어 퀴즈"
// 전용 독립 콘텐츠. options/correctIndex 없이 term/explain만 저장하고, 오답
// 선택지는 공개 화면(WordsPreviewSection.tsx)이 다른 용어 풀에서 그때그때 뽑는다.

export interface Quiz {
  id: string;
  term: string;
  explain: string;
  /** 오답 3개 — 홈 화면에 정답(term)과 섞여 보기로 나간다. 발행하려면 3개 다 채워야 한다. */
  options: string[];
  status: "draft" | "published";
  publish_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 생성·수정 payload — 부분 수정이므로 전부 선택적. */
export interface QuizInput {
  term?: string;
  explain?: string;
  options?: string[];
  publish_date?: string | null;
}

export interface PresignResponse {
  upload_url: string;
  public_url: string;
  key: string;
  expires_in: number;
}

// --- AI 레터 편집 (backend/admin/routes/letters.py 와 1:1) ---

export interface AiLetter {
  id: string;
  letter_date: string;
  editor_id: string;
  headline: string;
  subtitle: string | null;
  closing_line: string | null;
  body_inline: { body?: string[]; key_points?: string[] };
  keywords: CmsKeyword[];
  mode: string;
  created_at: string;
  /** article_id 기반 자동 생성이 안 되는 레터를 위한 수동 업로드 팟캐스트 URL. */
  podcast_audio_url?: string | null;
}

/** 레터 수정 payload — 정체성 필드(editor_id·letter_date)는 없다. */
export interface AiLetterInput {
  headline?: string;
  subtitle?: string | null;
  closing_line?: string | null;
  body_inline?: { body: string[]; key_points: string[] };
  keywords?: CmsKeyword[];
  podcast_audio_url?: string | null;
}

export interface NewsletterStatsResponse {
  subscribers: {
    total: number;
    active: number;
    recent: NewsletterSubscriber[];
  };
  metrics: {
    days: number;
    send: number;
    delivery: number;
    open: number;
    click: number;
    bounce: number;
    complaint: number;
    open_rate: number;
    click_rate: number;
    delivery_rate: number;
  };
}
