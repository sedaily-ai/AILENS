import type { ApiLetter } from "./letterTypes";

// CMS 글 응답 타입 — 채널별 조회 함수(cmsPostsApi)와 분리해 타입만 필요한 곳이 함수 모듈을 끌어오지 않게 한다.
export type CmsChannel = 'letters' | 'paper' | 'feed' | 'webtoon' | 'video' | 'lens';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * "trend"/"column" 태그 카드 모양 — letters 와 달리 리치텍스트 본문이 없는
 * 가벼운 카드. 원래는 별도 trend_card 채널(2026-08-17 폐기, 실사용 0건)
 * 응답 모양이었는데, fetchSectionCards()가 letters+section 태그를 이
 * 모양으로 변환해서 계속 쓴다 — 타입 이름은 레거시지만 계약 자체는 유효.
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
  /** 발행 완료 시각(ISO, UTC) — 2026-08-23, kstDateTimeLabel()로 시:분까지
   *  표기. 없으면(옛 글) date만 폴백. */
  published_at?: string | null;
  cover_image_url: string | null;
  panels: CmsWebtoonPanel[];
  is_cms: true;
  /**
   * 주제 분류(2026-08-21) — letters/lens 와 같은 저장 위치(body_inline.category,
   * ECON_CATEGORIES 라벨 문자열)를 그대로 읽는다. /webtoon 목록 상단 카테고리
   * 칩이 이 값으로 걸러낸다.
   *
   * 값이 없는 편이 정상이다 — admin WebtoonMode 에 카테고리 입력이 2026-08-21에
   * 처음 생겼으므로 그 전에 발행된 편은 비어 있다. 목록은 "데이터에 실제로
   * 있는 카테고리만" 칩으로 그려서, 전부 비어 있으면 칩 바 자체를 렌더하지
   * 않는다(눌러도 0건인 칩을 세워두지 않는다).
   */
  category?: string | null;
  /**
   * 편집국 추천 순서(2026-08-21) — 작을수록 앞이다. admin 이 값을 넣은 편만
   * /webtoon 목록의 "편집국 추천" 레일에 올라간다.
   *
   * "인기순"이 아니다. 조회수·클릭수 같은 지표가 시스템에 없어서(GA4 는
   * 단방향 전송만 한다) 인기 순위를 만들 방법이 없고, 최신순에 "인기" 라벨을
   * 붙이는 건 하지 않기로 했다. 대신 편집자가 고른 순서를 쓴다.
   *
   * 필드 자체는 원래 home_player 재생 순서용으로 최상위 스키마에 이미 있던
   * 것을 그대로 재사용한다 — 새 필드도 새 인덱스도 만들지 않았다.
   */
  display_order?: number | null;
  /** lens("4가지 시선")의 웹툰 포맷에서 파생된 카드일 때만 채워짐(2026-08-20,
   *  shared/lib/lensMediaFeed.ts) — 기본 `/webtoon/{id}` 대신 이 경로로
   *  링크한다. 실제 webtoon 채널 글은 이 필드가 없다. */
  href?: string;
  /**
   * 시리즈 제목(2026-08-21) — "여러 개의 독립된 웹툰 시리즈" 재구조화.
   * 같은 문자열을 쓴 편들이 하나의 시리즈다(admin WebtoonMode의 자유 텍스트
   * 입력, 시리즈 마스터 테이블 없음 — cms_posts_public.py _shape_webtoon 참조).
   * 비어 있으면(과거 발행분·미입력) 그 편 제목 자체를 시리즈명으로 취급하는
   * "단편" 시리즈로 shared/lib/webtoonSeries.ts가 폴백한다.
   */
  series_title?: string | null;
}

/**
 * video 채널 응답 — 영상 콘텐츠(2026-08-06). YouTube 등 외부 임베드 URL
 * 하나만 있는 가벼운 포맷 (backend cms_posts_public.py _shape_video 와 1:1).
 */
export interface CmsVideo {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  /** 발행 완료 시각(ISO, UTC) — 2026-08-23, kstDateTimeLabel()로 시:분까지
   *  표기. 없으면(옛 글) date만 폴백. */
  published_at?: string | null;
  video_url: string;
  thumbnail_url: string | null;
  /** 홈 영상 섹션 전용(2026-10-04) — 같은 이슈 기사(lens)의 사진. 영상 프레임(thumbnail_url)은 전환 도중 글자가 잘려 찍히는 일이 많아 이 사진을 우선 쓴다. */
  poster_url?: string | null;
  is_cms: true;
  /** lens("4가지 시선")의 영상 포맷에서 파생된 카드일 때만 채워짐(2026-08-20,
   *  shared/lib/lensMediaFeed.ts) — 기본 `/video/{id}` 대신 이 경로로
   *  링크한다. 실제 video 채널 글은 이 필드가 없다. */
  href?: string;
}

/**
 * lens 채널 응답 — "오늘의 이슈, 4가지 시선"(2026-08-12). 하루 하나의 이슈를
 * 원인/사람/내 일/숫자, 4개 고정 렌즈로 훑는 포맷. Instagram @ailens
 * 카드뉴스를 그대로 웹으로 옮긴다 (backend cms_posts_public.py _shape_lens 와 1:1).
 */
export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
  /** "레터" 포맷 전용 문단 산문(2026-08-19) — 비어있으면 question+bullets로
   *  폴백한다(LensViewClient.tsx). */
  paragraphs?: string[];
  /** "웹툰" 포맷 전용 컷(이미지+캡션, 2026-08-19) — 비어있으면 기존
   *  카드뉴스형 목업(불릿 기반)으로 폴백한다. */
  images?: CmsWebtoonPanel[];
  /** "영상" 포맷 전용 YouTube 등 임베드 URL(2026-08-19) — 있으면 실제
   *  임베드, 없으면 정적 목업으로 폴백한다. */
  video_url?: string | null;
  /** "영상" 포맷 전용 썸네일(2026-08-20) — 렌더된 영상 자체에서 뜬 프레임.
   *  YouTube 링크는 resolveVideo()가 자동으로 뽑아주지만 우리가 렌더링해
   *  올린 mp4 원본은 그게 안 돼서 별도로 채운다(lensMediaFeed.ts 참조). */
  thumbnail_url?: string | null;
  /** "팟캐스트" 포맷 전용 오디오/영상 링크(2026-08-19) — 있으면 실제
   *  임베드, 없으면 정적 목업으로 폴백한다. */
  media_url?: string | null;
  /** "팟캐스트"·"영상" 포맷 전용 전체 대본 텍스트(2026-08-23, 사용자 요청 —
   *  청각장애인 접근성용). 타임스탬프 동기화는 없고 그냥 플레이어 아래에
   *  전체 텍스트로 보여준다. */
  transcript?: string | null;
  /** "레터" 포맷 전용 용어 하이라이트(term+explain 쌍, 2026-09-11) —
   *  본문에서 이 단어들을 wrapWithTerms()로 감싸 형광펜 마커+툴팁을 붙인다.
   *  나머지 세 포맷은 항상 빈 배열. */
  keywords?: Array<{ term: string; explain: string }>;
}

export interface CmsLens {
  id: string;
  editor_id: string;
  headline: string;
  context: string;
  date: string;
  /**
   * 인스타 카드뉴스용 완성형 그래픽(1080x1350) — 사진 위에 "lens" 라벨,
   * 헤드라인, 날짜가 **픽셀로 박혀** 있다. 웹 카드의 사진 칸에 쓰면 우리 HTML
   * 헤드라인과 텍스트가 중복되고, 원본에 있던 광고 문구·인포그래픽 표까지
   * 같이 노출된다. 카드 전체를 통으로 보여주는 용도에만 쓸 것.
   */
  cover_image_url: string | null;
  /**
   * 텍스트가 없는 순수 기사 사진(2026-08-14 신설, backend _shape_lens 가
   * body_inline.photo_image_url 을 그대로 내려준다). 웹의 "사진 칸"은 이 값만
   * 쓴다 — pickLensPhoto() 참조.
   */
  photo_image_url?: string | null;
  /** 원문 기사 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO 감사). */
  source_url: string | null;
  /** 마지막 수정 시각(ISO, 2026-08-18 공개 API에 추가) — JSON-LD dateModified용. */
  updated_at?: string | null;
  /** 발행 완료 시각(ISO, UTC, 초 단위 — 2026-08-23 공개 API에 추가). date는
   *  YYYY-MM-DD까지만이라 "언제 발행됐는지"에 시:분이 없었다 — 이 필드로
   *  shared/lib/date.ts의 kstDateTimeLabel()이 KST 시:분까지 표기한다.
   *  옛 글엔 없을 수 있어 옵셔널. */
  published_at?: string | null;
  /** 경제 카테고리 라벨(증시/부동산/산업/금융·정책/국제/재테크) — letters와 같은
   * 6개 값. 2026-08-20 추가, /markets 등 카테고리 페이지에 lens 글도 같이
   * 노출하기 위함. 없으면(미분류) 어느 카테고리 페이지에도 안 뜬다. */
  category?: string | null;
  /** 하위 카테고리(2026-10-01 신설) — category(6개 주제) 안에서 한 단계 더
   * 들어간 분류(예: 증시 → 국내증시/해외증시/IB&Deal/...).
   * shared/constants/econSubcategories.ts의 라벨과 매칭. 아직 증시·산업만
   * 백필돼 있고, 다른 카테고리는 분량이 얇아(국제·부동산·금융·정책·문화)
   * 당장은 비어있다 — 값이 없으면 하위 탭 자체가 안 뜬다
   * (CategoryArchiveClient.tsx). */
  subcategory?: string | null;
  /** "지면 특별 코너" 전용 배치 필드(2026-08-21) — 위 category와 별개.
   * "전체"/"증권"/"산업"/"시그널" 중 하나여야 LensPreviewSection의 해당
   * 탭에 뜬다. 없으면 지면 특별 코너엔 아예 안 뜨고 category 기반
   * 일반 카테고리 페이지에만 남는다(LensPreviewSection.tsx 상단 주석
   * 참조 — category 필드를 두 용도로 겹쳐 쓰다 생긴 버그를 이 필드
   * 분리로 해결). */
  paper_section?: string | null;
  /** 지면 특별 코너 내 명시적 정렬 키(2026-08-21, home_player 채널의
   * display_order와 같은 패턴). 값이 있으면 오름차순으로 우선 배치되고,
   * 없으면(대부분의 기존 글) publish_date/published_at 정렬을 그대로
   * 따른다 — published_at을 정렬 키인 척 수동 재기록하던 임시방편을
   * 대체한다(LensPreviewSection.tsx 참조). */
  display_order?: number | null;
  lenses: CmsLensItem[];
  is_cms: true;
}

/**
 * webtoon 채널 응답 — 연재 웹툰 파일럿(2026-08-06). 컷(이미지+캡션) 나열뿐인
 * 가벼운 포맷 (backend cms_posts_public.py _shape_webtoon 과 1:1).
 */
export interface CmsWebtoonPanel {
  url: string;
  caption: string;
  /** 2026-10-04 — true면 나레이션 띠가 이미지에 박혀 있지 않고, 컷 아래 흰 여백에 caption을 글자로 보여준다. */
  text_caption?: boolean;
}


