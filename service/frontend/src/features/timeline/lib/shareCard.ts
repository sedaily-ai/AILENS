// 공유용 카드 이미지 생성 — 인스타그램 스토리 비율(1080×1920)로 캔버스에
// 직접 그린다(2026-08-17, "인스타/카카오톡에 바이럴 공유" 요청). 이 코드베이스는
// 무거운 라이브러리를 안 들이는 편이라(framer-motion도 없음) html2canvas 같은
// DOM→이미지 변환 라이브러리 대신 Canvas 2D API로 직접 그린다 — 타이포그래피도
// 더 정교하게 제어할 수 있다. 폰트는 layout.tsx가 이미 로드해둔 "Noto Serif KR"
// 웹폰트를 그대로 쓰되, 캔버스는 document.fonts가 준비될 때까지 기다려야
// 텍스트가 시스템 폰트로 깨져 그려지는 걸 막을 수 있다.
//
// 2026-08-17 레이아웃 재작성 — 처음 버전은 baseline(문자 밑선) 기준으로
// cursorY를 손으로 더해가며 배치했는데, 168px 같은 큰 폰트는 밑선 위로
// 글자가 훨씬 많이 올라와서(어센트) 바로 위 줄과 겹쳤다("3.6배"가 설명
// 문구를 덮어버림, 실사용 확인). textBaseline을 'top'으로 통일해 "이
// Y좌표부터 글자가 시작한다"로 단순화하고, 전체 중간 콘텐츠 블록의 높이를
// 먼저 계산한 뒤 위/아래 고정 블록 사이 여백 안에서 세로 중앙 정렬한다 —
// 콘텐츠 길이가 짧을 때 아래쪽에 큰 빈 공간이 남던 문제도 같이 해결.
export interface ShareCardData {
  date: string; // YYYY-MM-DD
  dateLabel: string; // "1997년 11월 21일"
  heroLabel?: string; // "코스피에 100만원을 넣었다면"
  heroValue?: string; // "18.6배"
  story?: string | null; // "IMF 외환위기로 코스피가 반토막 났던 그해."
  headline?: string; // 대표 헤드라인 1건(투자 시나리오가 없을 때 대신 씀)
  url: string; // ailens.sedaily.ai/timeline/{date}
}

const W = 1080;
const H = 1920;
const CONTENT_WIDTH = W - 220;

const ACCENT = '#8a6d3f';
const INK = '#2a2622';
const MUTED = '#96876f';
const CREAM = '#fdfcf9';

async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load('700 160px "Noto Serif KR"'),
      document.fonts.load('600 56px "Noto Serif KR"'),
      document.fonts.load('500 34px "Noto Serif KR"'),
      document.fonts.load('400 28px "Noto Serif KR"'),
      document.fonts.ready,
    ]);
  } catch {
    // 폰트 로드 실패해도 시스템 세리프로나마 그린다 — 카드 생성 자체를 막지 않음.
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** 지정한 너비 안에 한 줄로 들어올 때까지 폰트 크기를 줄인다 — "1/8,145,060"
 * 처럼 긴 하이라이트 값이 168px에서 카드 밖으로 삐져나가는 걸 막는다. */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight: number, minSize = 72): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px "Noto Serif KR", serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 6;
  }
  return size;
}

interface Paragraph {
  lines: string[];
  fontSize: number;
  weight: number;
  color: string;
  lineHeight: number;
  marginTopBefore: number;
}

function paragraphHeight(p: Paragraph): number {
  return p.marginTopBefore + p.lines.length * p.fontSize * p.lineHeight;
}

export async function generateShareCardBlob(data: ShareCardData): Promise<Blob | null> {
  await ensureFontsReady();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const centerX = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 배경
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  // 안쪽 여백 테두리 — 인쇄물 같은 절제된 프레임
  ctx.strokeStyle = '#ede4d0';
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  // ── 상단 고정 블록: 마스트헤드 + 날짜 + 룰 ──────────────────────────
  ctx.fillStyle = ACCENT;
  ctx.font = '700 30px "Noto Serif KR", serif';
  ctx.fillText('AI LENS · 타임머신', centerX, 170);

  ctx.fillStyle = INK;
  ctx.font = '600 56px "Noto Serif KR", serif';
  ctx.fillText(data.dateLabel, centerX, 232);

  const topRuleY = 340;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, topRuleY);
  ctx.lineTo(centerX + 40, topRuleY);
  ctx.stroke();

  // ── 하단 고정 블록: 룰 + URL + 서명 ─────────────────────────────────
  const bottomRuleY = H - 280;
  ctx.fillStyle = MUTED;
  ctx.font = '500 28px "Noto Serif KR", serif';
  ctx.fillText(data.url, centerX, H - 214);
  ctx.fillStyle = ACCENT;
  ctx.font = '700 26px "Noto Serif KR", serif';
  ctx.fillText('서울경제 · AI LENS', centerX, H - 160);

  // ── 중간 콘텐츠: 먼저 문단들을 계산하고, 위/아래 고정 블록 사이에서
  //    세로 중앙 정렬한다 ────────────────────────────────────────────
  const middleTop = topRuleY + 60;
  const middleBottom = bottomRuleY - 50;
  const paragraphs: Paragraph[] = [];

  if (data.heroLabel && data.heroValue) {
    ctx.font = '500 34px "Noto Serif KR", serif';
    paragraphs.push({
      lines: wrapLines(ctx, data.heroLabel, CONTENT_WIDTH),
      fontSize: 34,
      weight: 500,
      color: MUTED,
      lineHeight: 1.45,
      marginTopBefore: 0,
    });

    const heroFontSize = fitFontSize(ctx, data.heroValue, CONTENT_WIDTH, 168, 700);
    paragraphs.push({
      lines: [data.heroValue],
      fontSize: heroFontSize,
      weight: 700,
      color: INK,
      lineHeight: 1.15,
      marginTopBefore: 56,
    });

    if (data.story) {
      ctx.font = '400 28px "Noto Serif KR", serif';
      paragraphs.push({
        lines: wrapLines(ctx, data.story, CONTENT_WIDTH - 40),
        fontSize: 28,
        weight: 400,
        color: MUTED,
        lineHeight: 1.55,
        marginTopBefore: 56,
      });
    }
  } else if (data.headline) {
    ctx.font = '600 44px "Noto Serif KR", serif';
    paragraphs.push({
      lines: wrapLines(ctx, data.headline, CONTENT_WIDTH),
      fontSize: 44,
      weight: 600,
      color: INK,
      lineHeight: 1.5,
      marginTopBefore: 0,
    });
  }

  const totalHeight = paragraphs.reduce((sum, p) => sum + paragraphHeight(p), 0);
  const available = Math.max(0, middleBottom - middleTop);
  let y = middleTop + Math.max(0, (available - totalHeight) / 2);

  for (const p of paragraphs) {
    y += p.marginTopBefore;
    ctx.fillStyle = p.color;
    ctx.font = `${p.weight} ${p.fontSize}px "Noto Serif KR", serif`;
    for (const line of p.lines) {
      ctx.fillText(line, centerX, y);
      y += p.fontSize * p.lineHeight;
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}
