import type { ApiLetter } from "./letterTypes";

// CMS 글 응답 타입 — 채널별 조회 함수(cmsPostsApi)와 분리해 타입만 필요한 곳이 함수 모듈을 끌어오지 않게 한다.
export type CmsChannel = 'letters' | 'paper' | 'feed' | 'webtoon' | 'video' | 'lens';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * "trend"/"column" 태그 카드 모양. letters와 달리 리치텍스트 본문이 없는 가벼운 카드이며,
 * letters+section 태그를 이 모양으로 변환해 쓴다(타입 이름은 레거시지만 계약은 유효하다).
 */
export interface CmsTrendCard {
  id: string;
  section: 'trend' | 'column';
  category: string;
  title: string;
  excerpt: string;
  date: string;
  is_cms: true;
}

export interface CmsWebtoon {
  id: string;
  editor_id: string;
  title: string;
  excerpt: string;
  date: string;
  /** 발행 완료 시각(ISO, UTC). kstDateTimeLabel()이 시:분까지 표기하며, 없으면(옛 글) date만 폴백한다. */
  published_at?: string | null;
  cover_image_url: string | null;
  panels: CmsWebtoonPanel[];
  is_cms: true;
  /**
   * 주제 분류. letters/lens와 같은 저장 위치(body_inline.category, ECON_CATEGORIES 라벨 문자열)를 읽으며,
   * /webtoon 목록 상단 카테고리 칩이 이 값으로 거른다. 값이 없는 편이 정상이다(카테고리 입력 도입 이전 발행분).
   * 목록은 데이터에 실제로 있는 카테고리만 칩으로 그리고, 전부 비어 있으면 칩 바를 렌더하지 않는다.
   */
  category?: string | null;
  /**
   * 편집국 추천 순서(작을수록 앞). admin이 값을 넣은 편만 /webtoon 목록의 "편집국 추천" 레일에 올라간다.
   * 조회수·클릭수 지표가 시스템에 없어 인기순은 만들 수 없으므로 편집자가 고른 순서를 쓴다.
   * home_player 재생 순서용으로 최상위 스키마에 이미 있던 필드를 재사용한다.
   */
  display_order?: number | null;
  /** lens("4가지 시선")의 웹툰 포맷에서 파생된 카드일 때만 채워진다(shared/lib/lensMediaFeed.ts). 기본 `/webtoon/{id}` 대신 이 경로로 링크한다. */
  href?: string;
  /** 시리즈 제목(admin WebtoonMode 자유 입력). 시리즈 화면은 쓰지 않아 표시에 쓰이지 않는다. */
  series_title?: string | null;
}

/**
 * video 채널 응답. YouTube 등 외부 임베드 URL 하나만 있는 가벼운 포맷이다
 * (backend cms_posts_public.py _shape_video 와 1:1).
 */
export interface CmsVideo {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  /** 발행 완료 시각(ISO, UTC). kstDateTimeLabel()이 시:분까지 표기하며, 없으면(옛 글) date만 폴백한다. */
  published_at?: string | null;
  video_url: string;
  thumbnail_url: string | null;
  /** 홈 영상 섹션 전용. 같은 이슈 기사(lens)의 사진이다. 영상 프레임(thumbnail_url)은 전환 도중 글자가 잘려 찍히는 일이 많아 이 사진을 우선 쓴다. */
  poster_url?: string | null;
  is_cms: true;
  /** lens("4가지 시선")의 영상 포맷에서 파생된 카드일 때만 채워진다(shared/lib/lensMediaFeed.ts). 기본 `/video/{id}` 대신 이 경로로 링크한다. */
  href?: string;
}

/**
 * lens 채널 응답. "오늘의 이슈, 4가지 시선": 하루 하나의 이슈를 4개 고정 렌즈로 훑는 포맷이다
 * (backend cms_posts_public.py _shape_lens 와 1:1).
 */
export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
  /** "레터" 포맷 전용 문단 산문. 비어 있으면 question+bullets로 폴백한다(LensViewClient.tsx). */
  paragraphs?: string[];
  /** "웹툰" 포맷 전용 컷(이미지+캡션). 비어 있으면 불릿 기반 카드뉴스형 목업으로 폴백한다. */
  images?: CmsWebtoonPanel[];
  /** "영상" 포맷 전용 YouTube 등 임베드 URL. 없으면 정적 목업으로 폴백한다. */
  video_url?: string | null;
  /** "영상" 포맷 전용 썸네일(렌더된 영상에서 뜬 프레임). 업로드한 mp4 원본은 resolveVideo()가 썸네일을 뽑지 못해 따로 채운다(lensMediaFeed.ts 참조). */
  thumbnail_url?: string | null;
  /** "팟캐스트" 포맷 전용 오디오/영상 링크. 없으면 정적 목업으로 폴백한다. */
  media_url?: string | null;
  /** "팟캐스트"·"영상" 포맷 전용 전체 대본 텍스트(접근성용). 타임스탬프 동기화 없이 플레이어 아래에 전체 텍스트로 보여준다. */
  transcript?: string | null;
  /** "레터" 포맷 전용 용어 하이라이트(term+explain 쌍). 본문에서 wrapWithTerms()로 감싸 형광펜 마커+툴팁을 붙인다. 나머지 세 포맷은 항상 빈 배열이다. */
  keywords?: Array<{ term: string; explain: string }>;
}

export interface CmsLens {
  id: string;
  editor_id: string;
  headline: string;
  context: string;
  date: string;
  /**
   * 인스타 카드뉴스용 완성형 그래픽(1080x1350). 사진 위에 "lens" 라벨·헤드라인·날짜가 픽셀로 박혀 있고
   * 원본의 광고 문구·인포그래픽 표까지 노출되므로, 웹 카드의 사진 칸에는 쓰지 말고 카드 전체를 통으로 보여주는 용도에만 쓴다.
   */
  cover_image_url: string | null;
  /** 텍스트가 없는 순수 기사 사진(backend _shape_lens가 body_inline.photo_image_url을 그대로 내려준다). 웹의 "사진 칸"은 이 값만 쓴다(pickLensPhoto() 참조). */
  photo_image_url?: string | null;
  /** 원문 기사 URL. 서울경제 원본 취재 기사 링크(SEO/GEO/AEO). */
  source_url: string | null;
  /** 마지막 수정 시각(ISO). JSON-LD dateModified용. */
  updated_at?: string | null;
  /** 발행 완료 시각(ISO, UTC, 초 단위). date는 YYYY-MM-DD까지만이라 shared/lib/date.ts의 kstDateTimeLabel()이 이 값으로 KST 시:분까지 표기한다. 옛 글에는 없을 수 있다. */
  published_at?: string | null;
  /** 대분류 라벨(시그널·부동산·경제·금융·산업·정치·사회·국제·문화, shared/constants/econCategories.ts). 옛 글에는 '증시'·'금융·정책'이 남아 있을 수 있다. 없으면(미분류) 어느 카테고리 페이지에도 뜨지 않는다. */
  category?: string | null;
  /** 하위 카테고리. 대분류 안의 한 단계 더 세분된 분류(예: 시그널 → 국내증시/해외증시/IB&Deal)이며
   * shared/constants/econSubcategories.ts의 라벨과 매칭한다. 값이 없으면 하위 탭이 뜨지 않는다(CategoryArchiveClient.tsx). */
  subcategory?: string | null;
  /** "지면 특별 코너" 전용 배치 필드. category와 별개이며 "전체"/"증권"/"산업"/"시그널" 중 하나여야 LensPreviewSection의 해당 탭에 뜬다.
   * 없으면 지면 특별 코너에는 뜨지 않고 category 기반 카테고리 페이지에만 남는다. */
  paper_section?: string | null;
  /** 지면 특별 코너 내 명시적 정렬 키. 값이 있으면 오름차순으로 우선 배치되고, 없으면 publish_date/published_at 정렬을 따른다(LensPreviewSection.tsx 참조). */
  display_order?: number | null;
  lenses: CmsLensItem[];
  is_cms: true;
}

/**
 * webtoon 채널 응답. 컷(이미지+캡션) 나열뿐인 가벼운 포맷이다
 * (backend cms_posts_public.py _shape_webtoon 과 1:1).
 */
export interface CmsWebtoonPanel {
  url: string;
  caption: string;
  /** true면 나레이션 띠가 이미지에 박혀 있지 않고, 컷 아래 흰 여백에 caption을 글자로 보여준다. */
  text_caption?: boolean;
}


