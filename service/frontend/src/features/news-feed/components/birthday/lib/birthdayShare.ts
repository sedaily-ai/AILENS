import type { BirthdayResult, ViewMode } from '../data/birthdayTypes';
import type { BigKindsArticle } from '@/shared/lib/api/timelineApi';
import { SITE_URL } from '@/shared/constants/site';
import { kstTodayStr } from '@/shared/lib/date/date';
import { RECEIPT_QR_ROWS } from '../data/birthdayQr';
import type { AssetBase, AssetCell } from './birthdayAssets';
import { elapsedLabel, hundredMillionNow, manwon, number, times, WAGE_NOW } from './birthdayModel';

/** 인스타 스토리·카톡에 바로 올리는 9:16 카드. */
export const SHARE_CARD = { width: 1080, height: 1920 };
/** receipt = 생일 영수증(그때와 지금의 숫자), front = 그날 1면 스크랩. */
export type ShareVariant = 'receipt' | 'front';

export interface ShareContent {
  variant: ShareVariant;
  mode: ViewMode;
  /** 영수증에 월·일까지 표시할지(사용자가 고른 경우만). 1면 카드는 항상 날짜를 쓴다. */
  includeDay: boolean;
  /** 그날 1면 기사(본문이 긴 순). 영수증에는 월·일을 표시할 때만 첫 제목을 담는다. */
  front: BigKindsArticle[];
  /** 계산된 100만 원 칸(고정 순서). 없으면 묶음을 그리지 않는다. */
  assets: AssetCell[];
  /** 100만 원 묶음 소제목의 기준일(스무 살 생일·태어난 날). 칸이 없으면 null. */
  assetBase: AssetBase | null;
}

/** 영수증 한 줄. */
export interface ReceiptLine { label: string; detail?: string; value: string }

/** 영수증 본문 — 확인된 숫자만. 날짜 일부만 공유된 결과(연도 공유)는 연 단위로 쓴다. */
export function receiptLines(result: BirthdayResult, mode: ViewMode): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  if (result.wage) lines.push({ label: '최저시급', detail: `${number(result.wage, 1)}원 → ${number(WAGE_NOW)}원`, value: times(WAGE_NOW / result.wage) });
  if (result.cpi) lines.push({ label: '그때 1억 원', detail: '지금 돈으로', value: manwon(hundredMillionNow(result.cpi)) });
  const event = result.heroAge;
  if (event) lines.push({ label: `${event.title} 때`, detail: event.date.replaceAll('-', '.'), value: event.age === null ? `${event.yearsAfter}년 뒤` : `만 ${event.age}세` });
  const normal = result.calendar?.points[1];
  if (normal) lines.push({ label: '국민연금 정상 수령', detail: `만 ${normal.age}세부터`, value: mode === 'year' ? `${normal.start.slice(0, 4)}년` : normal.start.replace('-', '.') });
  return lines;
}

/** 100만 원 줄 — 계산된 칸만, 받은 순서(고정 순서) 그대로. 서울 아파트는 지수 비율이라 배수. 물가 줄은 넣지 않는다(위에 '그때 1억 원' 줄이 있다). */
export function receiptAssetLines(cells: AssetCell[]): ReceiptLine[] {
  return cells.map(cell => ({
    label: cell.name,
    value: cell.nowAmount === null ? times(cell.multiple) : manwon(cell.nowAmount),
  }));
}

/** 100만 원 묶음 소제목 — 기준일이 스무 살 생일인지 태어난 날인지. */
export function receiptAssetHeading(base: AssetBase) {
  return base.kind === 'twentieth' ? '스무 살에 100만 원을 뒀다면' : '태어난 날 100만 원을 뒀다면';
}

/** 영수증 합계 — 태어난 날부터 오늘까지. 연도만 공유된 결과는 연 단위. */
export function receiptElapsed(result: BirthdayResult, mode: ViewMode, today = kstTodayStr()) {
  return mode === 'year' ? `약 ${Number(today.slice(0, 4)) - result.date.year}년` : elapsedLabel(result.birthDate, today);
}

export function shareText(result: BirthdayResult, variant: ShareVariant) {
  return variant === 'front' ? `내 생일날 서울경제 1면은? ${result.date.year}년 ${result.date.month}월 ${result.date.day}일 · 내 생일 타임머신` : `${result.date.year}년생의 생일 영수증 · 내 생일 타임머신`;
}

const SANS = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
const SERIF = '"Noto Serif KR", "Apple Myungjo", serif';
// 바탕은 금빛 노랑 — 흰 영수증·지면이 스토리 화면에서 또렷하게 뜨고, 사이트 파랑과 겹치지 않는다.
const BACKDROP = '#ffd84d', BACKDROP_DEEP = '#f5c400';
const INK = '#111827', GRAY = '#4b5563', SOFT = '#6b7280', RULE = '#9ca3af';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (year: number, month: number, day: number) => WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

export function drawShare(canvas: HTMLCanvasElement, result: BirthdayResult, content: ShareContent) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const font = (size: number, weight: number, family = SANS) => { context.font = `${weight} ${size}px ${family}`; };
  /** 한 줄 — 넘치면 글자 크기를 줄인다. */
  const text = (value: string, x: number, y: number, size: number, color: string, weight: number, maxWidth = 936, family = SANS) => {
    context.fillStyle = color;
    let fontSize = size;
    font(fontSize, weight, family);
    while (context.measureText(value).width > maxWidth && fontSize > 18) { fontSize--; font(fontSize, weight, family); }
    context.fillText(value, x, y);
  };
  /** 글자 단위 줄바꿈 — lines줄까지, 넘치면 말줄임표. */
  const wrap = (value: string, size: number, weight: number, family: string, maxWidth: number, lines: number) => {
    font(size, weight, family);
    const rows: string[] = [];
    let current = '';
    for (const char of value) {
      if (context.measureText(current + char).width > maxWidth) { rows.push(current); current = char.trimStart(); } else current += char;
    }
    if (current) rows.push(current);
    const shown = rows.slice(0, lines);
    if (rows.length > lines) shown[lines - 1] = `${shown[lines - 1].slice(0, -1)}…`;
    return shown;
  };
  const dashed = (x1: number, x2: number, y: number) => {
    context.save();
    context.strokeStyle = RULE; context.lineWidth = 3; context.setLineDash([12, 10]);
    context.beginPath(); context.moveTo(x1, y); context.lineTo(x2, y); context.stroke();
    context.restore();
  };
  /** 살짝 기울인 종이 — 그림자를 깔고 안쪽을 그린다. */
  const tilted = (angle: number, centerY: number, body: () => void) => {
    context.save();
    context.translate(540, centerY); context.rotate(angle); context.translate(-540, -centerY);
    body();
    context.restore();
  };
  const shadow = (on: boolean) => {
    context.shadowColor = on ? 'rgba(17, 24, 39, 0.22)' : 'transparent';
    context.shadowBlur = on ? 48 : 0; context.shadowOffsetY = on ? 20 : 0;
  };

  /** 결과 페이지로 가는 QR(data/birthdayQr.ts). 칸 경계를 정수 좌표로 맞춰 흐려지지 않게 한다. 주변 여백(흰 바탕)은 부르는 쪽이 둔다. */
  const qr = (x: number, y: number, size: number) => {
    const count = RECEIPT_QR_ROWS.length;
    const edge = (index: number) => Math.round(index * size / count);
    context.fillStyle = INK;
    RECEIPT_QR_ROWS.forEach((row, r) => {
      for (let c = 0; c < count; c++) if (row[c] === '1') context.fillRect(x + edge(c), y + edge(r), edge(c + 1) - edge(c), edge(r + 1) - edge(r));
    });
  };

  canvas.width = SHARE_CARD.width; canvas.height = SHARE_CARD.height;
  context.textAlign = 'left';
  context.fillStyle = BACKDROP;
  context.fillRect(0, 0, SHARE_CARD.width, SHARE_CARD.height);
  const { year, month, day } = result.date;
  const hasFront = content.front.length > 0;

  const drawFront = () => {
    text(`${month}월 ${day}일, 내가 태어난 날`, 72, 300, 80, INK, 800);
    text('서울경제 1면은', 72, 400, 80, INK, 800);
    const lead = wrap(content.front[0].title, 64, 900, SERIF, 776, 3);
    const rest = content.front.slice(1, 5).map(article => wrap(article.title, 36, 700, SERIF, 776, 1)[0]);
    const top = 500, leadTop = top + 300;
    const bottom = leadTop + (lead.length - 1) * 84 + rest.length * 84 + 72;
    tilted(0.012, (top + bottom) / 2, () => {
      shadow(true); context.fillStyle = '#fff'; context.fillRect(96, top, 888, bottom - top); shadow(false);
      context.textAlign = 'center';
      text('서울경제', 540, top + 112, 64, INK, 900, 776, SERIF);
      text(`${year}년 ${month}월 ${day}일 ${weekday(year, month, day)}요일 · 1면`, 540, top + 168, 28, GRAY, 500);
      context.textAlign = 'left';
      context.fillStyle = INK; context.fillRect(152, top + 200, 776, 4); context.fillRect(152, top + 210, 776, 2);
      font(64, 900, SERIF);
      lead.forEach((row, index) => context.fillText(row, 152, leadTop + index * 84));
      let cursor = leadTop + (lead.length - 1) * 84;
      for (const title of rest) {
        context.fillStyle = '#d1d5db'; context.fillRect(152, cursor + 28, 776, 2);
        cursor += 84;
        context.fillStyle = INK; font(36, 700, SERIF); context.fillText(title, 152, cursor);
      }
    });
    if (bottom + 140 < 1500) text(String(year), 56, 1660, 320, BACKDROP_DEEP, 900, 680);
    // QR은 흰 칸(사방 4칸 이상 여백) 위에 둔다 — 노란 바탕 위에서는 판독기가 테두리를 잘못 잡을 수 있다.
    const box = 232, pad = 24;
    context.fillStyle = '#fff';
    context.beginPath(); context.roundRect(1008 - box, 1848 - box, box, box, 16); context.fill();
    qr(1008 - box + pad, 1848 - box + pad, box - pad * 2);
    text('내 생일 1면도 찾아보기', 72, 1780, 40, INK, 800, 680);
    text('QR을 찍으면 바로 열려요', 72, 1836, 28, GRAY, 500, 680);
  };

  /** 생일 영수증 — 높이를 먼저 재고(draw=false) 가운데에 맞춰 그린다. 넘치면 줄 간격을 줄인다(compact). */
  const drawReceipt = () => {
    const left = 120, right = 960, inLeft = 176, inRight = 904, width = inRight - inLeft;
    const lines = receiptLines(result, content.mode);
    const assetLines = content.assetBase ? receiptAssetLines(content.assets) : [];
    const assetHeading = content.assetBase ? receiptAssetHeading(content.assetBase) : '';
    const headline = content.includeDay && hasFront ? wrap(content.front[0].title, 40, 900, SERIF, width, 2) : [];
    const birth = content.includeDay ? `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${weekday(year, month, day)})` : `${year}년생`;
    const issued = kstTodayStr().replaceAll('-', '.');

    const layout = (draw: boolean, compact: boolean) => {
      let y = 0;
      const gap = compact ? 8 : 0;
      const at = (fn: () => void) => { if (draw) fn(); };
      y += 104;
      at(() => { context.textAlign = 'center'; text('AI LENS', 540, y, 64, INK, 800); });
      y += 56;
      at(() => { text('내 생일 영수증', 540, y, 34, GRAY, 600); context.textAlign = 'left'; });
      y += 48; at(() => dashed(inLeft, inRight, y)); y += 64;
      for (const [label, value] of [['출생', birth], ['발행', issued]]) {
        at(() => { text(label, inLeft, y, 30, GRAY, 500); context.textAlign = 'right'; text(value, inRight, y, 30, INK, 700); context.textAlign = 'left'; });
        y += 48;
      }
      y += 8; at(() => dashed(inLeft, inRight, y)); y += 72;
      for (const line of lines) {
        at(() => {
          text(line.label, inLeft, y, 34, INK, 700, width * 0.58);
          context.textAlign = 'right'; text(line.value, inRight, y, 40, INK, 800, width * 0.4); context.textAlign = 'left';
          if (line.detail) text(line.detail, inLeft, y + 40, 26, SOFT, 500, width * 0.58);
        });
        y += (line.detail ? 104 : 68) - gap;
      }
      if (assetLines.length) {
        at(() => dashed(inLeft, inRight, y - 24));
        y += 40;
        at(() => text(assetHeading, inLeft, y, 28, GRAY, 700));
        y += 60;
        for (const line of assetLines) {
          at(() => {
            text(line.label, inLeft, y, 32, INK, 600, width * 0.6);
            context.textAlign = 'right'; text(line.value, inRight, y, 32, INK, 800, width * 0.38); context.textAlign = 'left';
          });
          y += 56 - gap;
        }
        y += 8;
      }
      if (headline.length) {
        at(() => dashed(inLeft, inRight, y - 24));
        y += 40;
        at(() => text('그날 서울경제 1면', inLeft, y, 28, GRAY, 700));
        y += 60;
        for (const row of headline) { at(() => { context.fillStyle = INK; font(40, 900, SERIF); context.fillText(row, inLeft, y); }); y += 56; }
        y += 8;
      }
      at(() => { context.save(); context.fillStyle = INK; context.fillRect(inLeft, y - 20, width, 4); context.fillRect(inLeft, y - 10, width, 2); context.restore(); });
      y += 72;
      at(() => { text('지나온 시간', inLeft, y, 36, INK, 800); context.textAlign = 'right'; text(receiptElapsed(result, content.mode), inRight, y, 56, INK, 900, width * 0.6); context.textAlign = 'left'; });
      y += 64;
      // QR 줄 — 왼쪽 QR(흰 영수증 바탕이 여백 구실을 한다), 오른쪽 안내. QR과 글자 사이는 4칸 이상 띄운다.
      const code = 208;
      at(() => {
        qr(inLeft, y, code);
        const textLeft = inLeft + code + 40, textWidth = inRight - textLeft;
        text(new URL(SITE_URL).host, textLeft, y + 64, 32, INK, 800, textWidth);
        text('내 생일 영수증 뽑기', textLeft, y + 112, 32, INK, 800, textWidth);
        text('QR을 찍으면 바로 열려요', textLeft, y + 164, 26, SOFT, 500, textWidth);
      });
      y += code + 56;
      at(() => { context.textAlign = 'center'; text('과거 자료로 계산한 가정이며 투자 권유가 아니에요.', 540, y, 24, SOFT, 500, width); context.textAlign = 'left'; });
      y += 64;
      return y;
    };

    const room = SHARE_CARD.height - 120;
    const compact = layout(false, false) > room;
    const height = Math.min(layout(false, compact), room);
    const top = Math.round((SHARE_CARD.height - height) / 2);
    const tooth = 14, step = 28;
    tilted(-0.018, top + height / 2, () => {
      shadow(true);
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(left, top + tooth);
      for (let x = left; x < right; x += step) { context.lineTo(x + step / 2, top); context.lineTo(Math.min(x + step, right), top + tooth); }
      context.lineTo(right, top + height - tooth);
      for (let x = right; x > left; x -= step) { context.lineTo(x - step / 2, top + height); context.lineTo(Math.max(x - step, left), top + height - tooth); }
      context.closePath();
      context.fill();
      shadow(false);
      context.translate(0, top);
      layout(true, compact);
    });
    canvas.setAttribute('aria-label', `AI LENS 내 생일 영수증. 출생 ${birth}. ${[...lines, ...assetLines].map(line => `${line.label} ${line.value}`).join(', ')}${headline.length ? `. 그날 서울경제 1면 ${content.front[0].title}` : ''}. 지나온 시간 ${receiptElapsed(result, content.mode)}`);
  };

  if (content.variant === 'front' && hasFront) {
    drawFront();
    canvas.setAttribute('aria-label', `AI LENS 내 생일 타임머신 1면 카드. ${shareText(result, 'front')}. ${content.front.slice(0, 4).map(article => article.title).join(', ')}`);
  } else drawReceipt();
}
