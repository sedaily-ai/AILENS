import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';

// 웹툰·영상·오디오 상세의 검색·공유·서지 보강 메타(기사 상세 lensArticlePageShared와 같은 구성). keywords·authors·hreflang·news_keywords·Dublin Core를 한 곳에서 만든다.
export function mediaSeoExtras(input: {
  headline: string; // 정제한 제목(seoHeadline)
  description: string;
  url: string;
  publishedIso: string;
  kind: '웹툰' | '영상' | '오디오';
}): Pick<Metadata, 'keywords' | 'authors' | 'category' | 'other'> & { languages: Record<string, string> } {
  const keywords = [...new Set([input.headline, input.kind, `경제 ${input.kind}`, '오늘의 이슈', '4가지 시선', 'AI LENS', '서울경제'])];
  return {
    keywords,
    authors: [{ name: 'AI LENS 편집팀', url: `${SITE_URL}/about` }],
    category: input.kind,
    languages: { 'ko-KR': input.url },
    other: {
      news_keywords: keywords.join(', '),
      'article:publisher': 'https://www.facebook.com/seouleconomydaily/',
      'DC.title': input.headline,
      'DC.creator': 'AI LENS 편집팀',
      'DC.subject': keywords.join(', '),
      'DC.description': input.description,
      'DC.date': input.publishedIso,
      'DC.identifier': input.url,
      'DC.type': input.kind === '오디오' ? 'Sound' : input.kind === '영상' ? 'MovingImage' : 'Image',
    },
  };
}
