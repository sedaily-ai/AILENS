import { describe, expect, it } from 'vitest';
import { parseSedailyArticle, sedailyArticleKey } from './sedailyArticle';

describe('parseSedailyArticle', () => {
  it('본지·모바일·시그널 기사 주소를 읽는다', () => {
    expect(parseSedailyArticle('https://www.sedaily.com/article/20099720')).toEqual({ site: 'www', id: '20099720' });
    expect(parseSedailyArticle('https://m.sedaily.com/article/20099720?ref=x')).toEqual({ site: 'www', id: '20099720' });
    expect(parseSedailyArticle('https://sedaily.com/article/20099720#top')).toEqual({ site: 'www', id: '20099720' });
    expect(parseSedailyArticle('https://signal.sedaily.com/article/10012345/')).toEqual({ site: 'signal', id: '10012345' });
  });

  it('서울경제 기사 주소가 아니면 null', () => {
    expect(parseSedailyArticle(null)).toBeNull();
    expect(parseSedailyArticle('https://www.sedaily.com/NewsList/GA')).toBeNull();
    expect(parseSedailyArticle('https://en.sedaily.com/article/20099720')).toBeNull();
    expect(parseSedailyArticle('https://evil.com/?u=https://www.sedaily.com/article/20099720')).toBeNull();
    expect(parseSedailyArticle('https://www.sedaily.com.evil.com/article/20099720')).toBeNull();
  });
});

describe('sedailyArticleKey', () => {
  it('site:id 키를 만든다', () => {
    expect(sedailyArticleKey('https://www.sedaily.com/article/20099720')).toBe('www:20099720');
    expect(sedailyArticleKey('https://signal.sedaily.com/article/20099720')).toBe('signal:20099720');
  });
});
