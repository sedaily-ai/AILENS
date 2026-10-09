import { describe, expect, it } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostTypes';
import { buildCompareCard, clip, plainText } from './compareCard';

const lens = (over: Partial<CmsLens> = {}): CmsLens => ({
  id: '2026-10-08-씨젠-3분기',
  editor_id: 'e',
  headline: '산업 | 씨젠 3분기 영업이익 93% 늘어난다고? 📈',
  context: '',
  date: '2026-10-08',
  cover_image_url: null,
  source_url: 'https://www.sedaily.com/article/20099000',
  category: '산업',
  is_cms: true,
  lenses: [
    {
      label: '레터',
      question: 'q',
      bullets: ['핵심 1'],
      paragraphs: ['◾ 📉 숫자 확인: 소제목', '증권사 리포트를 열었다가 **한 줄**에 눈이 멈추신 적 있나요. 영업이익이 93% 늘어난다는데요.'],
    },
    { label: '웹툰', question: '웹툰 질문', bullets: [], images: [{ url: 'a', caption: '컷 하나' }, { url: 'b', caption: '컷 둘' }, { url: 'c', caption: '컷 셋' }] },
    { label: '팟캐스트', question: 'q', bullets: [], transcript: '진단키트 회사의 여름은 어떤 계절일까요. 매출이 줄어드는데요.\n\n같은 뉴스, 네 가지 시선. AILENS입니다.\n\n다음 문단' },
    { label: '영상', question: 'q', bullets: [], transcript: '영업이익이 93% 늘어나요\n\n그런데 줄어든다는데요\n\n유럽 휴가철이거든요\n\n넷째 줄' },
  ],
  ...over,
});

describe('plainText', () => {
  it('서식 기호·이모지·소제목 기호를 걷어 낸다', () => {
    expect(plainText('◾ 📉 **숫자** 확인 -> *끝*')).toBe('숫자 확인 → 끝');
  });
});

describe('clip', () => {
  it('문장 단위로 max자 안에서 잇는다', () => {
    expect(clip('가나다. 라마바사. 아자차카타파하.', 10)).toBe('가나다. 라마바사.');
  });
  it('숫자 안의 마침표에서 끊지 않는다', () => {
    expect(clip('수익률 3.5% 올랐다. 다음 문장.', 13)).toBe('수익률 3.5% 올랐다.');
  });
  it('첫 문장부터 넘치면 말줄임표로 자른다', () => {
    expect(clip('아주아주긴첫문장입니다', 6)).toBe('아주아주긴…');
  });
  it('컷·자막 조각은 조각 단위로, 넘치는 첫 문장은 단어 경계에서 자른다', () => {
    expect(clip('가나다 / 라마바사 / 아자차', 12)).toBe('가나다 / 라마바사');
    expect(clip('매출은 전년비 14% 늘어난 1296억 원 전망이다', 20)).toBe('매출은 전년비 14% 늘어난…');
  });
});

describe('buildCompareCard', () => {
  it('형식마다 첫 마디를 뽑는다', () => {
    const card = buildCompareCard(lens(), 200);
    expect(card.headline).toBe('씨젠 3분기 영업이익 93% 늘어난다고?');
    expect(card.date).toBe('2026.10.08');
    expect(card.entries.map((e) => e.label)).toEqual(['레터', '웹툰', '팟캐스트', '영상']);
    expect(card.entries[0].text).toBe('증권사 리포트를 열었다가 한 줄에 눈이 멈추신 적 있나요. 영업이익이 93% 늘어난다는데요.');
    expect(card.entries[1].text).toBe('컷 하나 / 컷 둘');
    expect(card.entries[2].text).toBe('진단키트 회사의 여름은 어떤 계절일까요. 매출이 줄어드는데요. 다음 문단');
    expect(card.entries[3].text).toBe('영업이익이 93% 늘어나요 / 그런데 줄어든다는데요 / 유럽 휴가철이거든요');
  });

  it('본문이 비면 30초 핵심·질문으로 대신하고, 그마저 없으면 그 형식을 뺀다', () => {
    const card = buildCompareCard(
      lens({
        lenses: [
          { label: '레터', question: '', bullets: ['핵심만'] },
          { label: '웹툰', question: '웹툰 질문', bullets: [] },
          { label: '팟캐스트', question: '', bullets: [] },
          { label: '영상', question: '', bullets: [], transcript: '' },
        ],
      }),
      200,
    );
    expect(card.entries.map((e) => [e.label, e.text])).toEqual([
      ['레터', '핵심만'],
      ['웹툰', '웹툰 질문'],
    ]);
  });
});
