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

// trend_card 채널은 2026-08-17 폐기(admin/backend/routes/posts.py,
// service/backend cms_posts_public.py 둘 다 _VALID_CHANNELS에서 제거) —
// "요즘 화제의 경제 이슈" 홈 섹션을 "이슈 톡톡"에 흡수 통합하면서, 실사용
// 데이터 0건이던 이 채널도 함께 정리했다.
export type CmsChannel = "letters" | "paper" | "feed" | "webtoon" | "video" | "lens" | "home_player";
// "용어 해설"/"이슈 톡톡" — 오늘의 이슈/깊은 이야기와 같은 방식의 분류
// (2026-08-12, 이슈 톡톡을 별도 채널에서 되돌렸다가 삭제 후 다시 부활).
// "trend"(딥다이브)는 2026-08-17 제거 — 이슈 톡톡에 흡수 통합.
export type CmsCardSection = "column" | "glossary" | "issue_talk";
export type CmsStatus = "draft" | "published" | "archived";

// 경제 버티컬 카테고리(2026-08-17) — 발행된 51건을 실제로 다시 읽고 분류하며
// 확정. 처음엔 "글로벌"이었다가 "그거 금융 아닌가요?" 피드백으로 축 정리를
// 고민했는데, 서울경제 영문사이트(Markets/Property/Finance/Business/
// Technology/International)도 International을 금융·마켓과 별도 섹션으로
// 두고 있어(실제 신문사들의 일반적 관행 — 외신 소재면 국제, 국내 영향이
// 중심이면 금융/마켓/산업) "국제"로 이름만 맞추고 유지하기로 확정. "재테크"는
// 서울경제 본지엔 없는 섹션 — 개인 관점 리라이팅이라는 AI LENS 자체
// 차별점(사업계획서 "인지양식 기반 리라이팅")이라 남겨둔다. 정치/사회/문화/
// 스포츠는 뺐다 — 지금 발행 콘텐츠가 100% 경제/비즈니스라 그 탭들은 계속
// 비어있게 된다(뉴닉·서울경제 전체 구조를 그대로 못 가져오는 이유).
export const ECON_CATEGORIES = ["증시", "부동산", "산업", "금융·정책", "국제", "재테크"] as const;
export type EconCategory = (typeof ECON_CATEGORIES)[number];

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
  // channels: ["letters"] 글의 분류 태그 — "이슈 톡톡"(기본값)과 "인사이트"
  // (section: "column")를 가른다. category 는 카드에 붙는 짧은 라벨
  // (예: 증시, 투자 인사이트).
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
  /** 유튜브 등 웹 링크 — 있으면 홈 하단 플레이어가 TTS 대신 이걸 임베드 재생. */
  media_embed_url: string | null;
  /** channels:["home_player"] 항목의 재생 순서(오름차순). 다른 채널은 안 씀. */
  display_order: number | null;
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
  media_embed_url?: string | null;
  display_order?: number | null;
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
