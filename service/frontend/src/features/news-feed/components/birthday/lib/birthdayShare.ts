import type { BirthdayResult } from '../data/birthdayTypes';
import { SITE_URL } from '@/shared/constants/site';
import { comparableAnnual, number, percent } from './birthdayModel';
import { changeColor } from './birthdayChangeColor';
import { selectShareComparisons } from './birthdayShareSelection';

export function drawShare(canvas: HTMLCanvasElement, result: BirthdayResult, includeDay = false) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { rising, falling, unchanged } = selectShareComparisons(comparableAnnual(result));
  const period = result.date.year > 2025 ? '2025년까지의 자료 · 출생연도 비교 준비 중' : `${result.date.year}년에서 2025년까지 · 같은 연간 기준`;
  const text = (value: string, x: number, y: number, size = 30, color = '#111827', weight = 500, maxWidth = 936) => {
    context.fillStyle = color;
    let fontSize = size;
    const font = () => `${weight} ${fontSize}px Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif`;
    context.font = font();
    while (context.measureText(value).width > maxWidth && fontSize > 18) { fontSize--; context.font = font(); }
    context.fillText(value, x, y);
  };
  const line = (y: number) => { context.fillStyle = '#e5e7eb'; context.fillRect(72, y, 936, 2); };
  context.textAlign = 'left';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // 사이트 헤더의 AI LENS 워드마크를 같은 서체·굵기로 표시한다.
  text('AI LENS', 72, 112, 54, '#111827', 800);
  context.textAlign = 'right';
  text('서울경제신문', 1008, 106, 25, '#6b7280');
  context.textAlign = 'left';
  text('생일 시세 타임머신', 72, 165, 27, '#1d4ed8', 650);
  line(208);
  text(`${result.date.year}년, 내가 태어난 해`, 72, 302, 64, '#111827', 750);
  text('그때와 지금의 경제', 72, 386, 68, '#111827', 800);
  text(includeDay ? `${result.date.month}월 ${result.date.day}일 생일의 경제 기록` : '나의 출생연도로 살펴본 변화', 72, 442, 28, '#6b7280');
  text(period, 72, 510, 28, '#374151', 600);
  let y = 584;
  for (const [title, values] of [
    ['더 오른 지표', rising],
    ['더 내린 지표', falling],
  ] as const) {
    text(`${title}  ${values.length}`, 72, y, 28, '#374151', 650);
    y += 46;
    if (!values.length) { text('이 기간에 확인된 해당 지표가 없어요.', 72, y, 26, '#6b7280'); y += 36; }
    for (const item of values) {
      text(item.title, 72, y, 32, '#111827', 650, 590);
      context.textAlign = 'right';
      text(percent(item.change), 1008, y, 35, changeColor(item.change), 750, 320);
      context.textAlign = 'left';
      y += 32;
      text(`${number(item.before, 2)} → ${number(item.after, 2)} ${item.unit}`, 72, y, 24, '#6b7280');
      y += 44;
    }
    y += 18;
  }
  line(1180);
  text(unchanged ? `변화가 없는 지표 ${unchanged}개는 순위에서 제외했어요.` : '변화율이 큰 순서로 상승·하락 각각 최대 3개', 72, 1222, 24, '#374151', 600);
  text('출처: 한국은행 ECOS · 소비자물가, 1인당 국민총소득', 72, 1262, 22, '#6b7280');
  text(`자료 확인 ${result.snapshot.retrievedAt.replaceAll('-', '.')} · ${new URL(SITE_URL).host}`, 72, 1304, 22, '#6b7280');
  canvas.setAttribute('aria-label', `AI LENS. ${result.date.year}년, 내가 태어난 해. 그때와 지금의 경제. ${period}. ${[...rising, ...falling].map(item => `${item.title} ${percent(item.change)}`).join(', ') || '확인된 상승·하락 지표 없음'}${includeDay ? `. 생일 ${result.birthDate}` : '. 출생연도만 표시'}`);
}
