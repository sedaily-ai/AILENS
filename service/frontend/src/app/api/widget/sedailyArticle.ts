// 서울경제 본지 기사 주소 ↔ 조회 키. 본지 "MBTI로 읽기" 위젯(public/widget/mbti-button.js)과 조회 API가 같은 규칙을 쓴다.
// 기사 주소는 https://www.sedaily.com/article/20099720 꼴이고(시그널은 signal.sedaily.com), AI LENS 글의 source_url에도 이 주소가 들어 있다.
// www·m·도메인만(sedaily.com) 주소는 같은 기사로 본다. 시그널은 번호 체계가 따로일 수 있어 키를 나눈다.

export type SedailySite = 'www' | 'signal';

export const SEDAILY_SITES: readonly SedailySite[] = ['www', 'signal'];

/** 본지 기사 주소 → { site, id }. 서울경제 기사 주소가 아니면 null. */
export function parseSedailyArticle(url: string | null | undefined): { site: SedailySite; id: string } | null {
  if (!url) return null;
  const m = /^https?:\/\/((?:[a-z0-9-]+\.)*)sedaily\.com\/article\/(\d{5,12})(?:[/?#]|$)/i.exec(url.trim());
  if (!m) return null;
  const sub = m[1].toLowerCase();
  if (sub === 'signal.') return { site: 'signal', id: m[2] };
  if (sub === '' || sub === 'www.' || sub === 'm.') return { site: 'www', id: m[2] };
  return null;
}

/** 조회 키("www:20099720"). */
export function sedailyArticleKey(url: string | null | undefined): string | null {
  const a = parseSedailyArticle(url);
  return a ? `${a.site}:${a.id}` : null;
}
