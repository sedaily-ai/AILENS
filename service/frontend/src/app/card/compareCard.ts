import type { CmsLens, CmsLensItem } from '@/shared/lib/api/cmsPostTypes';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { displayCategoryLabel } from '@/shared/constants/econCategories';
import { LENS_FORMATS, lensPerspectiveAt, type LensFormat } from '@/shared/constants/lensPerspectives';

// 비교 카드(신청서 모듈 F "텍스트 기반 비교 카드 자동 생성") — 같은 기사가 레터·웹툰·팟캐스트·영상에서 각각 어떻게 시작하는지
// 첫 마디를 한 장에 나란히 놓는다. 이미지(card/[id]/[file]/route.tsx)와 공유 페이지(card/[id]/page.tsx)가 같은 데이터를 쓴다.
// 사람이 따로 쓰는 문구는 없다 — 발행된 4형식 본문에서 그대로 뽑는다(사실이 바뀌지 않게 요약·재작성하지 않는다).

export interface CompareCardEntry {
  format: LensFormat;
  /** 레터·웹툰·팟캐스트·영상 */
  label: string;
  /** "차분히 읽고 싶은 사람" 같은 형식별 독자 */
  who: string;
  color: string;
  tint: string;
  /** 그 형식의 첫 마디(이미 길이 제한을 적용한 값) */
  text: string;
}

export interface CompareCardData {
  id: string;
  headline: string;
  /** YYYY.MM.DD */
  date: string;
  category: string;
  entries: CompareCardEntry[];
}

// 이모지 본체 + 변형 선택자·ZWJ·키캡·피부색 수식자(displayHeadline.ts와 같은 범위). 카드 렌더러는 이모지 글꼴을 싣지 않는다.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu;

/** 레터 인라인 서식(**굵게**, *기울임*, ->)과 소제목 기호를 걷어 낸 한 줄 텍스트. */
export function plainText(raw: string): string {
  return raw
    .replace(EMOJI, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\s][^*\n]*)\*/g, '$1')
    .replace(/\s*(?:-+|=)>\s*/g, ' → ')
    .replace(/^[\s◾■□▪•·\-–—]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 문장 경계(마침표·물음표·느낌표·말줄임 뒤 공백)로 나눈다. 숫자 안의 마침표(3.5%)는 뒤에 공백이 없어 나뉘지 않는다. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.?!…])\s+/u).map((s) => s.trim()).filter(Boolean);
}

/**
 * max자 안에 들어가는 만큼만 남긴다. 끊는 순서: " / "로 이은 조각(웹툰 컷·영상 자막) → 문장 → 단어.
 * 단어 중간에서는 끊지 않고, 첫 문장부터 넘칠 때만 단어 경계에서 자르고 말줄임표를 붙인다.
 */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const fit = (parts: string[], sep: string): string => {
    let out = '';
    for (const s of parts) {
      const next = out ? `${out}${sep}${s}` : s;
      if (next.length > max) break;
      out = next;
    }
    return out;
  };
  const segs = t.split(' / ');
  const bySeg = segs.length > 1 ? fit(segs, ' / ') : '';
  if (bySeg) return bySeg;
  const bySentence = fit(sentences(segs[0]), ' ');
  if (bySentence) return bySentence;
  const cut = t.slice(0, Math.max(1, max - 1));
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function firstNonEmpty(...xs: Array<string | null | undefined>): string {
  for (const x of xs) {
    const t = x ? plainText(x) : '';
    if (t) return t;
  }
  return '';
}

/** 형식별 "첫 마디" — 그 형식이 독자에게 처음 건네는 말. 없으면 30초 핵심(bullets)·질문 순으로 대신한다. */
function openingOf(format: LensFormat, l: CmsLensItem | undefined): string {
  if (!l) return '';
  const fallback = () => firstNonEmpty(l.bullets?.[0], l.question);
  switch (format) {
    case 'letter': {
      // 레터 문단 중 소제목(◾…)이 아닌 첫 문단 = 리드.
      const lead = (l.paragraphs ?? []).find((p) => p.trim() && !/^\s*[◾■]/u.test(p));
      return firstNonEmpty(lead) || fallback();
    }
    case 'webtoon': {
      // 컷 나레이션 앞 두 컷을 "/"로 잇는다(컷 그림은 텍스트 카드에 넣지 않는다).
      const caps = (l.images ?? []).map((c) => plainText(c.caption ?? '')).filter(Boolean).slice(0, 2);
      return caps.length > 0 ? caps.join(' / ') : fallback();
    }
    case 'podcast': {
      // 매회 같은 인사("같은 뉴스, 네 가지 시선. AILENS입니다.")는 빼고 본론의 첫 마디를 쓴다.
      const body = sentences(plainText(l.transcript ?? ''))
        .filter((x) => !/^같은 뉴스, 네 가지 시선\.?$/.test(x) && !/^AI ?LENS입니다\.?$/i.test(x))
        .join(' ');
      return body || fallback();
    }
    case 'video': {
      // 영상 대본은 자막 한 줄씩 줄바꿈으로 나뉘어 있다 — 앞 세 줄을 "/"로 잇는다.
      const lines = (l.transcript ?? '').split(/\n+/).map(plainText).filter(Boolean).slice(0, 3);
      return lines.length > 0 ? lines.join(' / ') : fallback();
    }
  }
}

export function buildCompareCard(lens: CmsLens, maxChars: number): CompareCardData {
  const entries = LENS_FORMATS.map((format, i) => {
    const p = lensPerspectiveAt(i);
    const text = clip(openingOf(format, lens.lenses?.[i]), maxChars);
    return { format, label: p.short, who: p.full, color: p.color, tint: p.tint, text };
  }).filter((e) => e.text);
  return {
    id: lens.id,
    headline: seoHeadline(lens.headline),
    date: lens.date.replaceAll('-', '.'),
    category: displayCategoryLabel(lens.category) || '',
    entries,
  };
}
