import type { InteractiveBlockData } from '@/features/news-feed';
import type { ApiLetter } from '@/shared/lib/api/todayLettersApi';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';

// 본문 HTML 가공용 순수 함수들. React 의존이 없다(JSX가 필요한 TermTooltip.tsx는 별도 파일).

// 본문 안에 AI 퀴즈가 심겨있는 마커 두 가지:
//   1) <!--AI_QUIZ:{...}-->            — 초기에 DB에 직접 심었던 구형 마커
//   2) <div data-ai-quiz="{...}"></div> — admin PostForm 퀴즈 위젯(Tiptap
//      aiQuiz 노드)이 저장하는 신형 마커. 브라우저가 속성값을 HTML 엔티티로
//      이스케이프해서 내보내므로 파싱 전에 디코딩한다.
// 마커 안 JSON이 깨져 있으면(수기 편집 실수 등) 조용히 건너뛰고 나머지
// HTML은 그대로 렌더.
export type BodyHtmlPart =
  | { type: 'html'; content: string }
  | { type: 'interactive'; data: InteractiveBlockData };

export function decodeHtmlEntities(s: string): string {
  if (typeof document === 'undefined') return s;
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

// admin 에디터는 이미지를 <img alt="..."> 한 줄로만 저장한다(에디터 재로딩 시 스키마 불일치를 피하려고 저장 형태는 바꾸지 않음 — admin/frontend/src/components/resizableImageExtension.tsx 참고).
// alt를 사진 밑 캡션으로 보여주는 것은 읽는 화면의 몫이므로, alt가 있는 이미지를 렌더 시점에만 <figure>+<figcaption>으로 감싼다(admin 미리보기 모달과 동일).
export function injectImageCaptions(html: string): string {
  if (typeof document === 'undefined' || !html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img[alt]').forEach((img) => {
    const alt = img.getAttribute('alt');
    if (!alt?.trim() || img.parentElement?.tagName === 'FIGURE') return;
    const figure = doc.createElement('figure');
    figure.setAttribute('style', 'margin:0;');
    img.replaceWith(figure);
    figure.appendChild(img);
    const caption = doc.createElement('figcaption');
    caption.textContent = alt;
    caption.setAttribute(
      'style',
      'margin-top:8px;font-size:12.5px;font-style:italic;color:#9ca3af;text-align:center;',
    );
    figure.appendChild(caption);
  });
  return doc.body.innerHTML;
}

export function splitBodyHtml(html: string): BodyHtmlPart[] {
  const parts: BodyHtmlPart[] = [];
  const markerRe = /<!--AI_QUIZ:([\s\S]*?)-->|<div data-ai-quiz="([^"]*)"[^>]*>\s*<\/div>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(html))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }
    const raw = match[1] ?? decodeHtmlEntities(match[2] ?? '');
    try {
      parts.push({ type: 'interactive', data: JSON.parse(raw) });
    } catch {
      // 마커가 깨졌으면 원본 그대로 유지(눈에는 안 보이거나 빈 div, 데이터 손실 없음)
      parts.push({ type: 'html', content: match[0] });
    }
    lastIndex = markerRe.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push({ type: 'html', content: html.slice(lastIndex) });
  }
  return parts;
}

// 부제(letter.subtitle) 정제 — 일부 레터는 subtitle에 본문 마커 문법(■ 섹션헤더, [라벨] 태그)이 그대로 들어 있다.
// 헤드라인 바로 아래에 노출되므로 데이터는 건드리지 않고 표시 시점에만 앞쪽 마커를 제거한다.
export function cleanSubtitle(raw: string): string {
  return raw
    .replace(/^■\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .trim();
}

// 헤더 배지 라벨 — letter.editorName은 모든 레터가 "AI LENS"로 고정이라 카테고리 정보가 없고 사이트 로고와 겹친다.
// 실제 분류 필드(category → section)를 쓰고, 둘 다 없으면 콘텐츠 형식을 가리키는 "AI 레터"로 폴백한다.
const SECTION_LABEL: Record<NonNullable<ApiLetter['section']>, string> = {
  trend: '트렌드',
  column: '칼럼',
  issue_talk: '이슈 브리핑',
};
export function letterCategoryLabel(letter: DisplayLetter): string {
  return letter.category?.trim() || (letter.section ? SECTION_LABEL[letter.section] : null) || 'AI 레터';
}
