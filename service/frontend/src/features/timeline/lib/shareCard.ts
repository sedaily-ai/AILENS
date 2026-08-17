// 공유용 카드 이미지 생성 — 인스타그램 스토리 비율(1080×1920)로 캔버스에
// 직접 그린다(2026-08-17, "인스타/카카오톡에 바이럴 공유" 요청). 이 코드베이스는
// 무거운 라이브러리를 안 들이는 편이라(framer-motion도 없음) html2canvas 같은
// DOM→이미지 변환 라이브러리 대신 Canvas 2D API로 직접 그린다 — 타이포그래피도
// 더 정교하게 제어할 수 있다. 폰트는 layout.tsx가 이미 로드해둔 "Noto Serif KR"
// 웹폰트를 그대로 쓰되, 캔버스는 document.fonts가 준비될 때까지 기다려야
// 텍스트가 시스템 폰트로 깨져 그려지는 걸 막을 수 있다.
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

async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load('700 100px "Noto Serif KR"'),
      document.fonts.load('600 44px "Noto Serif KR"'),
      document.fonts.load('500 32px "Noto Serif KR"'),
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

export async function generateShareCardBlob(data: ShareCardData): Promise<Blob | null> {
  await ensureFontsReady();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const ACCENT = '#8a6d3f';
  const INK = '#2a2622';
  const MUTED = '#96876f';
  const CREAM = '#fdfcf9';

  // 배경
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  // 안쪽 여백 테두리 — 인쇄물 같은 절제된 프레임
  ctx.strokeStyle = '#ede4d0';
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  const centerX = W / 2;

  // 마스트헤드 — AI LENS / 타임머신
  ctx.textAlign = 'center';
  ctx.fillStyle = ACCENT;
  ctx.font = '700 30px "Noto Serif KR", serif';
  ctx.fillText('AI LENS · 타임머신', centerX, 200);

  // 날짜
  ctx.fillStyle = INK;
  ctx.font = '600 56px "Noto Serif KR", serif';
  ctx.fillText(data.dateLabel, centerX, 300);

  // 짧은 액센트 룰
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX - 40, 340);
  ctx.lineTo(centerX + 40, 340);
  ctx.stroke();

  let cursorY = 470;

  if (data.heroLabel && data.heroValue) {
    ctx.fillStyle = MUTED;
    ctx.font = '500 36px "Noto Serif KR", serif';
    const labelLines = wrapLines(ctx, data.heroLabel, W - 220);
    for (const line of labelLines) {
      ctx.fillText(line, centerX, cursorY);
      cursorY += 50;
    }

    cursorY += 60;
    ctx.fillStyle = INK;
    ctx.font = '700 168px "Noto Serif KR", serif';
    ctx.fillText(data.heroValue, centerX, cursorY);
    cursorY += 110;

    if (data.story) {
      ctx.fillStyle = MUTED;
      ctx.font = '400 30px "Noto Serif KR", serif';
      const storyLines = wrapLines(ctx, data.story, W - 260);
      for (const line of storyLines) {
        ctx.fillText(line, centerX, cursorY);
        cursorY += 44;
      }
    }
  } else if (data.headline) {
    ctx.fillStyle = INK;
    ctx.font = '600 44px "Noto Serif KR", serif';
    const lines = wrapLines(ctx, data.headline, W - 220);
    for (const line of lines) {
      ctx.fillText(line, centerX, cursorY);
      cursorY += 62;
    }
  }

  // 하단 서명 — 얇은 룰 + URL
  ctx.strokeStyle = '#ede4d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 100, H - 220);
  ctx.lineTo(centerX + 100, H - 220);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = '500 28px "Noto Serif KR", serif';
  ctx.fillText(data.url, centerX, H - 160);

  ctx.fillStyle = ACCENT;
  ctx.font = '700 26px "Noto Serif KR", serif';
  ctx.fillText('서울경제 · AI LENS', centerX, H - 116);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
  });
}
