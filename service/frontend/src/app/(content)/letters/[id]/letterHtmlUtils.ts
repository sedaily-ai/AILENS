import type { InteractiveBlockData } from '@/features/news-feed';
import type { ApiLetter } from '@/shared/lib/api/todayLettersApi';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해) — 본문 HTML
// 가공용 순수 함수들. React 의존 없음(TermTooltip.tsx만 JSX가 필요해서
// 별도 파일).

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

// admin 에디터가 저장하는 이미지는 <img alt="..."> 한 줄뿐이다(에디터
// 재로딩 시 스키마 불일치를 피하려고 저장 형태 자체는 손대지 않음 —
// admin/frontend/src/components/resizableImageExtension.tsx 참고). alt를
// 실제로 사진 밑 캡션처럼 보여주는 건 "읽는 화면"의 몫이라, alt가 있는
// 이미지를 렌더 시점에만 <figure>+<figcaption>으로 감싼다(네이버 블로그
// 참고 — admin 미리보기 모달과 같은 방식).
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

// 부제(letter.subtitle) 정제(2026-08-18, "크기나 레이아웃 개선해쥣죠") —
// 일부 레터는 subtitle 필드에 본문 마커 문법(■ 섹션헤더, [라벨] 태그)이
// 그대로 들어있다("■AI 프리즘 [신입 직장인 뉴스] ..."). 헤드라인 바로
// 아래 노출되는 자리라 마커가 그대로 보이면 파싱 안 된 원본이 새어나온
// 것처럼 읽힌다 — 데이터 자체는 안 건드리고 표시 시점에만 앞쪽 마커를
// 걷어낸다.
export function cleanSubtitle(raw: string): string {
  return raw
    .replace(/^■\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .trim();
}

// 헤더 배지 라벨(2026-08-18, "이거 카테고리 뭔가요?") — letter.editorName은
// MBTI 4-페르소나 폐지(2026-08-07) 이후 모든 레터가 항상 "AI LENS" 한
// 값이라 카테고리 정보가 전혀 없고, 사이트 로고와 텍스트가 겹쳐 거슬렸다.
// 실제 분류 필드(category → section)로 교체 — 둘 다 없으면 lens의
// "4가지 시선"처럼 이 콘텐츠 형식 자체를 가리키는 "AI 레터"로 폴백.
const SECTION_LABEL: Record<NonNullable<ApiLetter['section']>, string> = {
  trend: '트렌드',
  column: '칼럼',
  issue_talk: '이슈 브리핑',
};
export function letterCategoryLabel(letter: DisplayLetter): string {
  return letter.category?.trim() || (letter.section ? SECTION_LABEL[letter.section] : null) || 'AI 레터';
}
