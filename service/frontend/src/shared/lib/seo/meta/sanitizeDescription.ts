/**
 * 콘텐츠 상세 페이지 generateMetadata()의 description(메타 디스크립션) 필드용.
 *
 * excerpt는 원본 CMS 기사의 subtitle을 그대로 쓰는데(cms_posts_shaping.py `excerpt = post.get("subtitle") or ""`),
 * 신문 스트레이트 기사의 "■" 소제목이 개행 없이 이어붙은 형태(예: "체험공간차세대 TV·비스포크")이거나
 * 기자 바이라인이 그대로 들어 있는 경우가 있다. Google 가이드가 피하라고 한 키워드 나열식 패턴과 같은 모양이므로 노출 전에 정제한다.
 * letters/webtoon/video/lens/listen 상세 페이지가 공통으로 쓴다.
 */

// 신문 스트레이트 기사 특유의 소제목 불릿 마커. 원본에서 개행이 유실되면
// 이 문자 앞뒤로 단어가 그대로 붙는다("...체험공간■차세대...").
const BULLET_MARKERS = /[■□▶◆●]/g;

// 순수 바이라인으로 보이는 패턴("OOO 기자", "OOO OO부 기자") — 요약으로
// 쓸 정보가 없다. 짧은 텍스트에서만 검사한다(긴 본문 안에 "…기자단…"처럼
// 우연히 들어간 경우까지 걸러내지 않기 위해).
const BYLINE_PATTERN = /기자\s*$/;

// 이보다 짧으면 요약으로서 신뢰하지 않는다(바이라인·태그 한 줄 등).
const MIN_TRUSTWORTHY_LENGTH = 20;

/**
 * excerpt 원본을 메타 디스크립션으로 쓰기 전에 정제한다. 신뢰할 수 없다고
 * 판단되면(너무 짧음, 바이라인으로 보임) null을 돌려주므로, 호출부는
 * 항상 자기 폴백 문구를 준비해야 한다: `sanitizeDescription(x) ?? 폴백`.
 */
function sanitizeDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length < MIN_TRUSTWORTHY_LENGTH) return null;
  if (BYLINE_PATTERN.test(trimmed) && trimmed.length < 40) return null;

  // 불릿 마커 자리에 문장 구분을 넣는다 — 마커 앞에 이미 공백/문장부호가
  // 있으면 마커만 지우고, 없으면(개행 유실로 단어가 바로 붙은 경우)
  // ". "를 넣어 최소한 단어끼리 붙지 않게 한다.
  return trimmed
    .replace(new RegExp(`([^\\s.,!?])\\s*${BULLET_MARKERS.source}\\s*`, 'g'), '$1. ')
    .replace(BULLET_MARKERS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Google 권장 길이(데스크톱 기준 150~160자)로 자른다 — 기존 trimDescription들과 동일 로직, 공용화. */
export function trimToSnippetLength(s: string, max = 155): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:·\s]+$/, '') + '…';
}

/**
 * `trimToSnippetLength(sanitizeDescription(raw) ?? fallback)`를 한 곳으로 묶은 헬퍼.
 * 원본이 정제 후에도 신뢰할 만하면 그것을, 아니면 fallback을 자른다.
 */
export function buildSeoDescription(raw: string | null | undefined, fallback: string, max = 155): string {
  return trimToSnippetLength(sanitizeDescription(raw) ?? fallback, max);
}
