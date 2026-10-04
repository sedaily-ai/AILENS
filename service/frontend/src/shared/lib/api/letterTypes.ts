// 레터 API 응답 타입 — todayLettersApi와 cmsPostsApi가 서로를 import하지 않도록 분리(순환 의존 해소).
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
  // 텍스트 없는 순수 기사 사진. channel=letters 조회가 lens 글도 같이 돌려주는데(letter 포맷 rendition 기준),
  // cover_image_url은 웹툰 첫 컷인 경우가 대부분이라 카드 썸네일에 쓰면 안 된다(shape_lens의 동일 필드·CmsLens.photo_image_url과 같은 이유).
  photo_image_url?: string | null;
  // 원문 기사 URL. 서울경제 원본 취재 기사 링크이며 admin이 채우지 않으면 null이다(JSON-LD의 "취재된 원본을 바탕으로" 소개를 검증 가능하게 한다).
  source_url?: string | null;
  // 채널 목록 조회(fetchCmsPosts)로 여러 날짜가 섞여 나올 때만 필요 —
  // fetchTodayLetters(date) 호출부는 이미 date 를 알고 있어 안 씀.
  publish_date?: string | null;
  // /letters 아카이브 필터용 가벼운 태그. channel(letters)은 그대로 두고 "트렌드"/"인기 칼럼"/"이슈 톡톡"으로도 분류하고 싶을 때만 admin이 지정한다.
  section?: 'trend' | 'column' | 'issue_talk' | null;
  // section 이 trend/column 일 때 홈 카드 상단 라벨(예: "증시", "투자 인사이트").
  // admin PostForm이 지정하지 않으면 null — 호출측이 editor_id 등으로 폴백.
  category?: string | null;
  // 마지막 수정 시각(ISO). JSON-LD dateModified용이며 admin이 글을 만들 때부터 채우는 필드라(admin/backend/repo/posts_repo.py) CMS 글이면 사실상 항상 존재한다.
  updated_at?: string | null;
  /** 발행 완료 시각(ISO, UTC). kstDateTimeLabel()이 시:분까지 표기하며 없으면(옛 글) publish_date만 폴백한다. */
  published_at?: string | null;
}

