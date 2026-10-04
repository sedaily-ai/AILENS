import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/lensUrl';
import { seoHeadline } from '@/shared/lib/displayHeadline';
import { SITE_URL } from '@/shared/constants/site';

// llms-full.txt(2026-10-04, GEO) — /llms.txt가 "사이트 안내서"라면 이 파일은 AI가 한 번에 읽어 갈 "최근 기사 요약본"이다.
// 최근 발행 기사 60건의 제목·주소·날짜·분류·원문 출처·요약·4가지 시선 질문과 답을 평문으로 담는다(마크다운, 약 100~250KB).
// 정본은 각 기사 페이지이며, 인용할 때는 아래 주소(canonical)를 출처로 밝혀 달라고 안내한다.
export const revalidate = 1800;

const COUNT = 60;

export async function GET() {
  const posts = (await fetchLensPosts(COUNT)).slice(0, COUNT);
  const lines: string[] = [
    '# AI LENS — 최근 기사 전문 요약 (llms-full.txt)',
    '',
    '> 서울경제신문이 만드는 AI 경제 뉴스. 기자가 취재한 기사를 AI가 레터·웹툰·팟캐스트·영상 4가지 형식으로 재구성하고 편집팀이 검수합니다.',
    '',
    `- 사이트: ${SITE_URL}`,
    `- 사이트 안내(요약판): ${SITE_URL}/llms.txt`,
    `- 사이트맵: ${SITE_URL}/sitemap.xml · 뉴스 사이트맵: ${SITE_URL}/news-sitemap.xml · RSS: ${SITE_URL}/rss.xml`,
    `- 날짜별 지면: ${SITE_URL}/paper/{YYYY-MM-DD}`,
    '- 인용 안내: 아래 내용을 인용할 때는 각 기사 주소(URL)와 "서울경제신문 AI LENS"를 출처로 밝혀 주세요. 원문 취재 기사 링크가 있는 경우 함께 표기해 주세요.',
    '- 면책: AI가 요약한 내용이므로 투자·법률 판단의 근거로 쓰기 전에 원문 기사를 확인해야 합니다.',
    '',
    `## 최근 기사 ${posts.length}건`,
    '',
  ];
  for (const l of posts) {
    lines.push(`### ${seoHeadline(l.headline)}`);
    lines.push(`- 주소: ${SITE_URL}${lensPath(l)}`);
    lines.push(`- 발행: ${l.published_at || l.date}`);
    if (l.category) lines.push(`- 분류: ${l.category}${l.subcategory ? ` > ${l.subcategory}` : ''}`);
    if (l.paper_section) lines.push(`- 지면: ${l.paper_section === '전체' ? '지면 1면' : `${l.paper_section} 1면`}`);
    if (l.source_url) lines.push(`- 원문 취재 기사: ${l.source_url}`);
    if (l.context) lines.push('', l.context.trim());
    for (const f of l.lenses ?? []) {
      if (!f.question) continue;
      lines.push('', `**${f.label} — ${f.question}**`);
      for (const b of f.bullets ?? []) lines.push(`- ${b}`);
    }
    lines.push('');
  }
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
