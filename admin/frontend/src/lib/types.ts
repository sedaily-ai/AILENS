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

/** 프롬프트 실험 챗랩 우측 패널 전용 — 설명/지침/파일 개별 저장(2026-09-15).
 *  PromptDetail(발행된 프로덕션 프롬프트 버전 스냅샷)과는 별개 저장소. */
export interface PromptLabFile {
  id: number;
  name: string;
  size: number;
  updated_at: string | null;
}

export interface PromptLabDoc {
  description: string;
  instructions: string;
  files: PromptLabFile[];
}

/** 프롬프트 실험 챗랩 좌측 사이드바 — 대화 스레드/메시지(2026-09-15).
 *  PromptLabDoc과도 별개 저장소 — 순수 대화 기록만 담는다. */
export interface ChatThreadSummary {
  id: number;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChatThreadMessage {
  id: number;
  role: "user" | "assistant";
  created_at: string | null;
  text?: string;
  step1?: unknown;
  storyboard?: { coreQuestion: string; cuts: unknown[] };
  imagePreview?: { cut: number; imageUrl: string; model?: string };
  /** storyboard 메시지에만 딸려온다 — 화면 표시용 storyboard 필드는
   *  요약본이라, 컷 이미지 재요청까지 이어가려면 원본 전체 cuts가
   *  따로 필요하다(WebtoonStoryboardCut[]). */
  fullCuts?: WebtoonStoryboardCut[];
}

export interface ChatThreadDetail extends ChatThreadSummary {
  messages: ChatThreadMessage[];
}

export interface PromptLabFileContent {
  id: number;
  name: string;
  content: string;
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
// 중심이면 금융/마켓/산업) "국제"로 이름만 맞추고 유지하기로 확정. 정치/
// 사회/문화/스포츠는 뺐다 — 지금 발행 콘텐츠가 100% 경제/비즈니스라 그
// 탭들은 계속 비어있게 된다(뉴닉·서울경제 전체 구조를 그대로 못 가져오는
// 이유).
//
// 2026-09-11 — "재테크"(서울경제 본지엔 없던 섹션, 개인 관점 리라이팅
// 차별점으로 신설했었음) 제거. 원문 뉴스 최상위 카테고리 어디에도
// "재테크"에 대응하는 태그가 없어 자동 파이프라인이 분류할 방법이
// 사실상 없었고, service/frontend의 /investing이 처음부터 계속 0건
// 이었다(사용자 신고로 발견) — 하위 태그 기반 보조 매칭도 실측 하루
// 1건 수준이라 카테고리 자체를 없앴다.
export const ECON_CATEGORIES = ["증시", "부동산", "산업", "금융·정책", "국제", "문화"] as const;
export type EconCategory = (typeof ECON_CATEGORIES)[number];

// 웹툰 전용 카테고리 — 2026-08-21에 "경제/금융/기업/정치/사회/국제/문화" 7개로
// 독립시켰다가, 같은 날 사용자가 "경제 레터(ECON_CATEGORIES)와 같은 라벨
// 세트로 통일해 달라"고 확정을 뒤집어 ECON_CATEGORIES와 동일한 세트로
// 되돌렸다("재테크" 제거도 2026-09-11 같이 반영). 값은 서로 같지만 타입을
// 분리해 둔 이유는 이후 웹툰만 다른 카테고리가 필요해지면 이 한 곳만
// 바꾸면 되게 하기 위해서다.
export const WEBTOON_CATEGORIES = ["증시", "부동산", "산업", "금융·정책", "국제", "문화"] as const;
export type WebtoonCategory = (typeof WEBTOON_CATEGORIES)[number];

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
  // 레거시 필드 — "분류"(이슈 톡톡/인사이트/용어해설) 축은 2026-08-19
  // 카테고리로 완전히 대체됐다. 관리자 UI 어디서도 더 이상 쓰거나 읽지
  // 않는다. 과거 발행 글에 남아있는 값을 깨뜨리지 않으려고 타입만 유지.
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
  // channels: ["webtoon"] 전용 — 시리즈 제목(2026-08-21). 같은 문자열을 쓴
  // 편들이 하나의 시리즈로 묶인다. 시리즈 마스터 테이블 없이 매 편에 자유
  // 텍스트로 중복 저장하는 가장 얕은 방법 — WebtoonMode.tsx가 기존 시리즈
  // 제목을 datalist로 자동완성해서 오타로 시리즈가 갈라지는 걸 줄인다.
  series_title?: string;
}

export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
  /** "레터" 포맷 전용 — 실제 문단 산문(2026-08-19). 비어있으면 서비스
   *  프런트가 question+bullets로 폴백한다(LensViewClient.tsx). */
  paragraphs?: string[];
  /** "웹툰" 포맷 전용(2026-08-19) — 컷(이미지+캡션) 목록. WebtoonMode.tsx의
   *  WebtoonPanelsEditor와 같은 컴포넌트를 재사용하되, 저장 위치는 이 슬롯
   *  (channels:["webtoon"] 글의 body_inline.images와는 별개)이다. */
  images?: CmsImage[];
  /** "영상" 포맷 전용(2026-08-19) — YouTube 등 외부 임베드 URL.
   *  VideoMode.tsx(body.video_url)와 같은 입력 패턴, 저장 위치만 이 슬롯. */
  video_url?: string;
  /** "팟캐스트" 포맷 전용(2026-08-19) — YouTube 등 외부 오디오/영상 링크.
   *  home-player(media_embed_url)와 같은 "제목+링크" 패턴, 저장 위치만
   *  이 슬롯. */
  media_url?: string;
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
  /** 2026-09-11 — true면 이 글은 자동 파이프라인이 만든 "4가지 시선" 번들의
   *  한 포맷 슬라이스를 보여주는 것뿐이다(admin_channel='lens', 이 채널의
   *  렌디션만 있어 이 목록/편집 화면에 같이 떴다). 단일 포맷 편집기(웹툰/
   *  영상/홈플레이어)에서 저장하면 서버가 거부한다(body_inline 전체가
   *  이 슬라이스 하나짜리 모양으로 덮여써져 나머지 포맷이 유실되기
   *  때문) — 프론트는 이 값이 true면 편집 자체를 잠그고 "4가지 시선"
   *  편집 화면으로 안내해야 한다. */
  is_lens_bundle?: boolean;
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

// --- 웹툰 이미지 실험 (backend/admin/routes/webtoon_lab.py 와 1:1, 2026-09-05) ---
// Bedrock Stable Diffusion 호출이 30초~9분 걸려 API Gateway 통합 타임아웃(30초 고정)을
// 넘길 수 있으므로 동기 응답이 없다 — job 생성(POST generate) 후 상태(GET {job_id})를
// 폴링한다.

export interface WebtoonLabGenerateInput {
  scene: string;
  camera: string;
  /** 비워두면 백엔드가 pipelines/common/webtoon_image.py의 기본 STYLE/FIXED_CHARACTERS를 쓴다. */
  style?: string;
  char_female?: string;
  char_male?: string;
  scene_reinforce?: boolean;
  char_reinforce?: boolean;
}

export interface WebtoonLabJob {
  job_id: string;
  status: "pending" | "done" | "error";
  image_url: string | null;
  s3_key: string | null;
  error: string | null;
  scene: string | null;
  camera: string | null;
  style: string | null;
  char_female: string | null;
  char_male: string | null;
  scene_reinforce: boolean | null;
  char_reinforce: boolean | null;
  prompt_preview: string | null;
  created_at: string | null;
}

/** 히스토리 항목 — prompt_preview·error는 목록엔 없음(job_id로 상세 조회해야 함). */
export type WebtoonLabHistoryItem = Omit<WebtoonLabJob, "error" | "prompt_preview">;

/** 단계별 생성 (2026-09-18) — admin/backend/routes/webtoon_lab.py "단계별
 *  생성" 섹션과 1:1 대응. "pipeline" 모델의 각 단계(번역/인물/배경/합성/
 *  화풍)를 독립적으로 호출·재시도할 수 있게 한다(사용자 요청 — "단계별로
 *  컨트롤 하고 싶은 니즈가 있어서"). */
export interface WebtoonStageTranslateResult {
  job_id: string;
  subjects: "A" | "B" | "BOTH" | "NONE";
  brief: string;
  character_prompt_a: string;
  character_prompt_b: string;
  background_prompt: string;
  style_prompt: string;
}

export interface WebtoonStageImageResult {
  job_id: string;
  image_url?: string;
  s3_key?: string;
  status?: "pending" | "done" | "error";
}

export type WebtoonStageName = "translate" | "character" | "background" | "composite" | "style";

/** GET /admin/webtoon-lab/stage/history 항목 — 컷별로 지금까지 시도한
 *  모든 단계 호출을 시간 역순으로 보여준다(사용자 요청 — "생성된
 *  이미지들을 볼 수 있어야하고, 버전별로요... 설정한 값들도 투명하게
 *  기록이 히스토리쪽에 남는게 중요"). */
export interface WebtoonStageHistoryItem {
  job_id: string;
  stage: WebtoonStageName;
  cut: number | null;
  status: "pending" | "done" | "error";
  character: "A" | "B" | null;
  prompt: string | null;
  params: Record<string, unknown> | null;
  image_url: string | null;
  s3_key: string | null;
  error: string | null;
  created_at: string | null;
}

/** GPU IP-Adapter 인스턴스 상태(2026-09-14) — "실제 품질" 컷 생성 중 클로즈업
 *  컷(A/B 단독)에서만 실제로 쓰인다. ec2 DescribeInstances의 State.Name 값. */
export interface WebtoonGpuStatus {
  state: "running" | "stopped" | "stopping" | "pending" | "shutting-down" | "terminated";
}

/** 프로덕션 기본 STYLE/FIXED_CHARACTERS — 패널 텍스트 필드를 항상 이 값으로 채운다. */
export interface WebtoonLabDefaults {
  style: string;
  char_female: string;
  char_male: string;
}

/** 화풍·인물 참조 이미지(2026-09-16) — routes/webtoon_lab.py::handle_image_assets_get.
 *  키가 아직 없으면(이론상만 — 세 키 다 시딩해둠) null. */
export interface WebtoonImageAssetUrls {
  style_url: string | null;
  char_female_url: string | null;
  char_male_url: string | null;
}

export type WebtoonImageAssetKind = "style" | "char_female" | "char_male";

export interface WebtoonImageAssetPresign {
  upload_url: string;
  key: string;
  expires_in: number;
}

/** 참조 이미지 갤러리(2026-09-16) — routes/webtoon_lab.py::handle_image_assets_gallery.
 *  asset 하나의 업로드 이력, 최신순. active=true인 항목이 지금 실제
 *  생성에 쓰이는 정본과 같은 내용(ETag로 판별, 위 라우트 주석 참고). */
export interface WebtoonImageAssetGalleryItem {
  key: string;
  url: string;
  uploaded_at: string;
  active: boolean;
}

// 웹툰 스토리보드 테스트(2026-09-11) — 기사 원문 → 1단계(스크립트)+2단계
// (장면 연출)를 체인 호출해 8컷을 한 번에 반환한다(routes/prompts.py::
// handle_storyboard_test). 3단계(컷별 이미지)는 이 응답의 camera/scene을
// WebtoonLabGenerateInput에 그대로 넣어 기존 webtoon-lab/generate를 컷마다
// 호출한다 — 새 이미지 생성 엔드포인트를 만들지 않고 기존 것을 재사용.

export interface WebtoonStoryboardDialogueLine {
  speaker: string;
  line: string;
  tone?: string;
}

export interface WebtoonStoryboardCut {
  cut: number;
  narration: string;
  caption: string;
  dialogue: WebtoonStoryboardDialogueLine[];
  /** 2단계 산출물 — 컷 카드에서 그대로 편집 가능(이미지 생성 전 손볼 수 있게). */
  camera: string;
  scene: string;
  /** 1단계 산출물 — "실제 품질" 컷 이미지 생성(2026-09-14)에서 compose_text.py가
   *  제목 알약·컷8 마무리 자막을 그리는 데 쓴다. 이전엔 백엔드 cuts.append()가
   *  버리고 있었음(컷 카드 화면엔 표시하지 않음, 생성 요청 시에만 그대로 전달). */
  title?: string;
  title_keyword?: string;
  closing_caption?: string;
}

export interface WebtoonStoryboardResult {
  core_question: string | null;
  characters: Record<string, string> | null;
  cuts: WebtoonStoryboardCut[];
}

// 2026-09-11 — 테스트 실행·스토리보드 테스트를 GPT-4o에서 각 채널의 실제
// 프로덕션 모델(Bedrock Claude — 레터는 Opus 5)로 바꾸면서 비동기(작업+
// 폴링)로 전환했다. 실측 결과 레터(Opus 5)는 max_tokens을 1500까지
// 줄여도 25초에 480자밖에 못 뽑아 API Gateway 30초 벽 안에 동기 응답이
// 불가능했다 — WebtoonLabJob과 같은 job/poll 패턴을 그대로 따른다.

export interface PromptTestJob {
  job_id: string;
  status: "pending" | "done" | "error";
  output: string | null;
  error: string | null;
}

