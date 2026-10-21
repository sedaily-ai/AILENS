// 공유용 카드 이미지 생성 — 인스타그램 스토리 비율(1080×1920)로 Canvas 2D API에 직접 그린다.
// 의존성을 늘리지 않기 위해 DOM→이미지 변환 라이브러리를 사용하지 않는다.
// 폰트는 layout.tsx가 로드한 "Noto Serif KR" 웹폰트를 사용하며, 시스템 폰트로 대체되어 그려지지 않도록
// document.fonts 준비를 기다린 뒤 그린다.
// 레이아웃: textBaseline을 'top'으로 통일해 큰 폰트의 어센트로 인한 줄 겹침을 방지하고,
// 중간 콘텐츠 블록 높이를 먼저 계산해 위/아래 고정 블록 사이에서 세로 중앙 정렬한다.
// 가운데에는 그날 대표 헤드라인만 둔다. 수익률·배수 같은 숫자는 넣지 않는다(2026-10-22 지수·가상자산 카드 제거와 함께 정리).
export interface ShareCardData {
  date: string; // YYYY-MM-DD
  dateLabel: string; // "1997년 11월 21일"
  headline?: string; // 대표 헤드라인 1건(첫 분야의 첫 기사)
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

  // ── 중간 콘텐츠: 문단 높이를 먼저 계산해 위/아래 고정 블록 사이에서 세로 중앙 정렬 ──
  const middleTop = topRuleY + 60;
  const middleBottom = bottomRuleY - 50;
  const paragraphs: Paragraph[] = [];

  if (data.headline) {
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
