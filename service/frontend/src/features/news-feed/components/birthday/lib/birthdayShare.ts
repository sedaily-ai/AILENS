import type { BirthdayResult, ViewMode } from '../data/birthdayTypes';
import type { BigKindsArticle } from '@/shared/lib/api/timelineApi';
import { SITE_URL } from '@/shared/constants/site';
import { kstTodayStr } from '@/shared/lib/date/date';
import { RECEIPT_QR_ROWS, cardQrUrl, qrRows } from '../data/birthdayQr';
import type { AssetBase, AssetCell } from './birthdayAssets';
import { elapsedLabel, hundredMillionNow, manwon, number, times, WAGE_NOW } from './birthdayModel';
import { nb } from './keepTogether';
import { TORN_AMPLITUDE, tornBottomOutline, tornOutline, tornSeed } from './tornPaper';

/** 인스타 스토리·카톡에 바로 올리는 9:16 카드. */
export const SHARE_CARD = { width: 1080, height: 1920 };
/** receipt = 생일 영수증(그때와 지금의 숫자), front = 그날 신문 카드(그날 서울경제 기사 제목). */
export type ShareVariant = 'receipt' | 'front';

export interface ShareContent {
  variant: ShareVariant;
  mode: ViewMode;
  /** 영수증에 월·일까지 표시할지(사용자가 고른 경우만). 그날 신문 카드는 항상 날짜를 쓴다. */
  includeDay: boolean;
  /** 생일 당일 서울경제 기사(지면에 보인 순서). 영수증에는 월·일을 표시할 때만 첫 제목을 담는다. */
  front: BigKindsArticle[];
  /** 계산된 100만 원 칸(고정 순서). 없으면 묶음을 그리지 않는다. */
  assets: AssetCell[];
  /** 100만 원 묶음 소제목의 기준일(스무 살 생일·태어난 날). 칸이 없으면 null. */
  assetBase: AssetBase | null;
  /**
   * 그날 신문 카드의 지면 위쪽에 넣는 그날 서울경제 1면 사진(같은 출처라 캔버스를 오염시키지 않는다). 없거나 못 불러왔으면 null·생략이고,
   * 그러면 사진 없이 글자 제호(서울경제 + 날짜)로 지면을 그린다. 영수증은 쓰지 않는다.
   */
  photo?: HTMLImageElement | null;
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

/**
 * 영수증 출처 한 줄 — 이미지만 따로 퍼져도 출처가 남게 한다. 숫자 대부분(1억 원·100만 원 줄)이 ECOS라 '한국은행 ECOS'와 찍힌 줄의
 * 작성기관(정기예금·달러·금 한국은행, 1억 원 국가데이터처, 아파트 한국부동산원)을 앞에 두고, 시급(최저임금위원회)·연금(국민연금공단)·
 * 그날 서울경제 제목(빅카인즈)은 '외'로 묶는다. ECOS 숫자가 없으면 찍힌 줄의 출처만 적고, 출처를 밝힐 줄이 없으면 ''.
 */
export function receiptSourceLine(result: BirthdayResult, assets: AssetCell[], headline: boolean) {
  const orgs = [
    ...(assets.some(cell => cell.id !== 'apartment') ? ['한국은행'] : []),
    ...(result.cpi ? ['국가데이터처'] : []),
    ...(assets.some(cell => cell.id === 'apartment') ? ['한국부동산원'] : []),
  ];
  // receiptLines와 같은 조건(시급·연금 줄), 빅카인즈는 그날 서울경제 제목이 찍힐 때만.
  const others = [...(result.wage ? ['최저임금위원회'] : []), ...(result.calendar?.points[1] ? ['국민연금공단'] : []), ...(headline ? ['빅카인즈'] : [])];
  const main = orgs.length ? `한국은행 ECOS(${orgs.join('·')} 작성)${others.length ? ' 외' : ''}` : others.join('·');
  return main ? `출처 ${main}` : '';
}

/** 그날 신문 카드 출처 한 줄 — 서울경제 기사 제목을 빅카인즈 보관본에서 가져왔다는 것. 실제 지면이 아니라서 면 번호를 말하지 않는다. */
export const FRONT_CARD_SOURCE = '출처 빅카인즈 보관본';

/** 100만 원 묶음 소제목 — 기준일이 스무 살 생일인지 태어난 날인지. */
export function receiptAssetHeading(base: AssetBase) {
  return base.kind === 'twentieth' ? '스무 살에 100만 원을 뒀다면' : '태어난 날 100만 원을 뒀다면';
}

/** 영수증 합계 — 태어난 날부터 오늘까지. 연도만 공유된 결과는 연 단위. */
export function receiptElapsed(result: BirthdayResult, mode: ViewMode, today = kstTodayStr()) {
  return mode === 'year' ? `약 ${Number(today.slice(0, 4)) - result.date.year}년` : elapsedLabel(result.birthDate, today);
}

/** 생일 영수증에 월·일을 찍는 체크박스 이름. 공유 버튼 위 안내(shareDayNotice)도 이 이름을 그대로 쓴다. */
export const DAY_TOGGLE_LABEL = '내 생일 넣기';
/** '내 생일 넣기' 기본값 — 켜짐. 결과가 새로 그려질 때(친구 생일로 해보기 포함)마다 이 값으로 시작한다. */
export const INCLUDE_DAY_DEFAULT = true;

/** '내 생일 넣기'를 보이는가 — 생일 영수증이고 날짜가 있는 결과일 때만. 연도 공유(mode year)에는 없다. */
export const dayToggleShown = (variant: ShareVariant, mode: ViewMode) => variant === 'receipt' && mode !== 'year';

/**
 * 공유·이미지 저장 버튼 바로 위 안내 — 이미지에 생일 날짜가 찍힐 때마다(그날 신문 카드는 늘, 영수증은 '내 생일 넣기'가 켜졌을 때).
 * 영수증은 빼는 방법을 체크박스 이름 그대로 함께 쓴다. 날짜가 찍히지 않으면 null.
 */
export function shareDayNotice(variant: ShareVariant, mode: ViewMode, includeDay: boolean) {
  if (variant === 'front') return '생일 날짜가 이미지에 찍혀요.';
  if (!includeDay || mode === 'year') return null;
  return `생일 날짜가 이미지에 찍혀요. 빼려면 ${nb(`'${DAY_TOGGLE_LABEL}'를`)} ${nb('끄세요.')}`;
}

export function shareText(result: BirthdayResult, variant: ShareVariant) {
  return variant === 'front' ? `내 생일날 서울경제는? ${result.date.year}년 ${result.date.month}월 ${result.date.day}일 · 내 생일 타임머신` : `${result.date.year}년생의 생일 영수증 · 내 생일 타임머신`;
}

const SANS = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
const SERIF = '"Noto Serif KR", "Apple Myungjo", serif';
// 바탕은 금빛 노랑 — 흰 영수증·지면이 스토리 화면에서 또렷하게 뜨고, 사이트 파랑과 겹치지 않는다.
const BACKDROP = '#ffd84d', BACKDROP_DEEP = '#f5c400';
const INK = '#111827', GRAY = '#4b5563', SOFT = '#6b7280', RULE = '#9ca3af';
// 찢어 낸 가장자리 속살(뒷장)의 색 — 흰 지면보다 한 단계 어두운 아이보리.
const PAPER_EDGE = '#e9e4d3';
// 영수증 '발행 완료' 도장 — 서비스 강조색(파랑) 하나만 쓴다.
const STAMP = '#1d4ed8';
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

  /** QR 무늬(data/birthdayQr.ts)를 그린다. rows를 안 주면 영수증의 결과 페이지 QR이다. 칸 경계를 정수 좌표로 맞춰 흐려지지 않게 한다. 주변 여백(흰 바탕)은 부르는 쪽이 둔다. */
  const qr = (x: number, y: number, size: number, rows: readonly string[] = RECEIPT_QR_ROWS) => {
    const count = rows.length;
    const edge = (index: number) => Math.round(index * size / count);
    context.fillStyle = INK;
    rows.forEach((row, r) => {
      for (let c = 0; c < count; c++) if (row[c] === '1') context.fillRect(x + edge(c), y + edge(r), edge(c + 1) - edge(c), edge(r + 1) - edge(r));
    });
  };

  /** 점들을 이은 닫힌 길(찢어 낸 가장자리). */
  const outline = (points: Array<[number, number]>) => {
    context.beginPath();
    points.forEach(([x, y], index) => { if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
    context.closePath();
  };
  /**
   * 1면 사진의 윗부분을 상자에 그린다 — 가로는 통째로, 세로는 위에서부터 상자 비율만큼(제호와 톱 기사가 들어오는 높이).
   * 아래 가장자리는 신문에서 찢어 낸 것처럼 들쭉날쭉하다(시드 = 날짜라서 다시 그려도 같은 모양). 테두리는 지면 줄과 같은 회색.
   */
  const drawPhoto = (image: HTMLImageElement, box: { x: number; y: number; width: number; height: number }, seed: number) => {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = Math.min(image.naturalHeight, Math.round(sourceWidth * box.height / box.width));
    const torn = tornBottomOutline(box, seed, 9);
    context.save();
    outline(torn); context.clip();
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, box.x, box.y, box.width, box.height);
    context.restore();
    context.strokeStyle = RULE; context.lineWidth = 2;
    outline(torn); context.stroke();
  };

  canvas.width = SHARE_CARD.width; canvas.height = SHARE_CARD.height;
  context.textAlign = 'left';
  context.fillStyle = BACKDROP;
  context.fillRect(0, 0, SHARE_CARD.width, SHARE_CARD.height);
  const { year, month, day } = result.date;
  const hasFront = content.front.length > 0;

  const drawFront = () => {
    text(`${month}월 ${day}일, 내가 태어난 날`, 72, 300, 80, INK, 800);
    text('서울경제는', 72, 400, 80, INK, 800);
    const lead = wrap(content.front[0].title, 64, 900, SERIF, 776, 3);
    const rest = content.front.slice(1, 5).map(article => wrap(article.title, 36, 700, SERIF, 776, 1)[0]);
    // 1면 사진이 있으면 지면 위쪽을 사진(제호·톱 기사와 그 아래 사진 일부)으로 채우고 글자 제호는 그리지 않는다. 사진 속 날짜는 이 크기에서 읽히지 않아
    // 연도가 사라지므로 날짜는 지면 맨 아래 출처 줄 오른쪽에 둔다. 사진이 있는 만큼 지면이 길어져 위쪽을 30px 당긴다(QR 상자와 겹치지 않는 한도).
    const photo = content.photo && content.photo.naturalWidth > 0 ? content.photo : null;
    const top = photo ? 470 : 500;
    const photoBox = { x: 136, y: top + 32, width: 808, height: 344 };
    const dateLine = `${year}년 ${month}월 ${day}일 ${weekday(year, month, day)}요일`;
    const seed = tornSeed(year, month, day);
    const leadTop = top + (photo ? 468 : 300);
    // 지면 맨 아래에 출처 한 줄(영수증 출처 줄과 같은 24px·SOFT)을 두는 자리 40px을 더한다. 제목이 가장 많아도(3줄 + 4줄) 1416px.
    const bottom = leadTop + (lead.length - 1) * 84 + rest.length * 84 + 112;
    tilted(0.012, (top + bottom) / 2, () => {
      // 신문 한 조각을 찢어 낸 모양 — 같은 조각을 조금 크게 다른 모양으로 한 장 더 뒤에 깔아(그림자는 이 장에만) 찢긴 가장자리에 종이 속살과 두께가 보이게 한다.
      // 모양은 날짜에서 정해져서 카드를 다시 그려도(글꼴·사진이 도착할 때) 바뀌지 않는다.
      const sheet = { x: 96, y: top, width: 888, height: bottom - top };
      shadow(true); context.fillStyle = PAPER_EDGE; outline(tornOutline(sheet, seed + 1, TORN_AMPLITUDE, 6)); context.fill(); shadow(false);
      context.fillStyle = '#fff'; outline(tornOutline(sheet, seed, TORN_AMPLITUDE)); context.fill();
      context.textAlign = 'center';
      if (photo) {
        drawPhoto(photo, photoBox, seed + 2);
        context.textAlign = 'left';
      } else {
        text('서울경제', 540, top + 112, 64, INK, 900, 776, SERIF);
        text(dateLine, 540, top + 168, 28, GRAY, 500);
        context.textAlign = 'left';
        context.fillStyle = INK; context.fillRect(152, top + 200, 776, 4); context.fillRect(152, top + 210, 776, 2);
      }
      // 글자색은 여기서 정한다 — 바로 위에서 무엇을 그렸는지(사진·날짜·제호 줄)에 기대면 흰 지면 위에 흰 글자가 된다.
      context.fillStyle = INK;
      font(64, 900, SERIF);
      lead.forEach((row, index) => context.fillText(row, 152, leadTop + index * 84));
      let cursor = leadTop + (lead.length - 1) * 84;
      for (const title of rest) {
        context.fillStyle = '#d1d5db'; context.fillRect(152, cursor + 28, 776, 2);
        cursor += 84;
        context.fillStyle = INK; font(36, 700, SERIF); context.fillText(title, 152, cursor);
      }
      text(FRONT_CARD_SOURCE, 152, cursor + 68, 24, SOFT, 500, 440);
      if (photo) {
        // 날짜는 출처와 같은 줄의 오른쪽 끝에 맞춘다.
        context.textAlign = 'right';
        text(dateLine, 928, cursor + 68, 24, GRAY, 500, 300);
        context.textAlign = 'left';
      }
    });
    if (bottom + 140 < 1500) text(String(year), 56, 1660, 320, BACKDROP_DEEP, 900, 680);
    // QR은 흰 칸(사방 4칸 이상 여백) 위에 둔다 — 노란 바탕 위에서는 판독기가 테두리를 잘못 잡을 수 있다.
    const box = 232, pad = 24;
    context.fillStyle = '#fff';
    context.beginPath(); context.roundRect(1008 - box, 1848 - box, box, box, 16); context.fill();
    // 카드에 찍힌 생일의 도착 페이지(그날 신문)로 가는 QR — 날짜가 카드에 이미 찍혀 있으므로 주소에 담아도 새로 드러나는 것이 없다.
    // '내 생일 신문도 찾아보기' 버튼은 그 도착 페이지에 있다. 같은 행동은 같은 이름을 쓴다.
    qr(1008 - box + pad, 1848 - box + pad, box - pad * 2, qrRows(cardQrUrl(result.birthDate)));
    text('그날 서울경제 더 보기', 72, 1780, 40, INK, 800, 680);
    text('QR을 찍으면 바로 열려요', 72, 1836, 28, GRAY, 500, 680);
  };

  /**
   * 생일 영수증 — 높이를 먼저 재고(draw=false) 가운데에 맞춰 그린다. 넘치면 줄 간격과 QR 앞뒤 간격을 줄인다(compact).
   * 줄이 가장 많은 경우(본문 4줄·100만 원 4줄·그날 서울경제 제목 2줄)에도 맨 아래 고지와 출처 줄이 영수증 안에 들도록 compact 간격을 잡았다(1792 ≤ 1800).
   */
  const drawReceipt = () => {
    const left = 120, right = 960, inLeft = 176, inRight = 904, width = inRight - inLeft;
    const lines = receiptLines(result, content.mode);
    const assets = content.assetBase ? content.assets : [];
    const assetLines = receiptAssetLines(assets);
    const assetHeading = content.assetBase ? receiptAssetHeading(content.assetBase) : '';
    const headline = content.includeDay && hasFront ? wrap(content.front[0].title, 40, 900, SERIF, width, 2) : [];
    const source = receiptSourceLine(result, assets, headline.length > 0);
    const birth = content.includeDay ? `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${weekday(year, month, day)})` : `${year}년생`;
    const issued = kstTodayStr().replaceAll('-', '.');
    // 영수증 번호는 생일 날짜에서 만든다. 날짜가 찍히지 않는 영수증('내 생일 넣기'를 껐거나 연도 공유)에는 번호도 없다 — 번호로 생일이 드러나면 안 된다.
    const receiptNo = content.includeDay ? `NO. ${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}` : '';

    const layout = (draw: boolean, compact: boolean) => {
      let y = 0;
      const gap = compact ? 12 : 0;
      const at = (fn: () => void) => { if (draw) fn(); };
      y += 104;
      at(() => { context.textAlign = 'center'; text('AI LENS', 540, y, 64, INK, 800); });
      y += 56;
      at(() => { text(receiptNo ? `내 생일 영수증  ·  ${receiptNo}` : '내 생일 영수증', 540, y, 34, GRAY, 600); context.textAlign = 'left'; });
      y += 48; at(() => dashed(inLeft, inRight, y)); y += 64;
      for (const [label, value] of [['출생', birth], ['발행', issued]]) {
        at(() => { text(label, inLeft, y, 30, GRAY, 500); context.textAlign = 'right'; text(value, inRight, y, 30, INK, 700); context.textAlign = 'left'; });
        y += 48;
      }
      y += 8; at(() => dashed(inLeft, inRight, y)); y += 72;
      // 영수증답게 열 제목과 실선 — 아래 줄들이 '품목 / 금액'이 된다.
      at(() => { text('품목', inLeft, y, 26, GRAY, 600); context.textAlign = 'right'; text('금액', inRight, y, 26, GRAY, 600); context.textAlign = 'left'; });
      y += 18; at(() => { context.fillStyle = RULE; context.fillRect(inLeft, y, width, 2); });
      y += 56 - gap;
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
        at(() => text('그날 서울경제', inLeft, y, 28, GRAY, 700));
        y += 60;
        for (const row of headline) { at(() => { context.fillStyle = INK; font(40, 900, SERIF); context.fillText(row, inLeft, y); }); y += 56; }
        y += 8;
      }
      at(() => { context.save(); context.fillStyle = INK; context.fillRect(inLeft, y - 20, width, 4); context.fillRect(inLeft, y - 10, width, 2); context.restore(); });
      y += 72;
      at(() => { text('합계', inLeft, y, 36, INK, 800); context.textAlign = 'right'; text(receiptElapsed(result, content.mode), inRight, y, 56, INK, 900, width * 0.6); context.textAlign = 'left'; });
      y += 64 - gap;
      // 영수증 끝맺음 한 줄 — 숫자를 새로 만들지 않고, 합계가 무엇을 센 것인지만 차분히 말한다. 연도만 공유된 영수증은 해 단위로 센 합계라서 말도 해 단위다.
      at(() => text(content.mode === 'year' ? '※ 태어난 해부터 올해까지의 기록이에요' : '※ 태어난 날부터 오늘까지의 기록이에요', inLeft, y, 26, GRAY, 500, width));
      y += 44;
      // QR 줄 — 왼쪽 QR(흰 영수증 바탕이 여백 구실을 한다), 오른쪽 안내. QR과 글자 사이는 4칸 이상 띄운다.
      const code = 208;
      at(() => {
        qr(inLeft, y, code);
        // 글자는 오른쪽 도장(지름 160) 앞까지만 쓴다.
        const textLeft = inLeft + code + 40, textWidth = inRight - textLeft - 168;
        text(new URL(SITE_URL).host, textLeft, y + 64, 32, INK, 800, textWidth);
        text('내 생일 영수증 뽑기', textLeft, y + 112, 32, INK, 800, textWidth);
        text('QR을 찍으면 바로 열려요', textLeft, y + 164, 26, SOFT, 500, textWidth);
        // '발행 완료' 도장 — 영수증과 함께 기울어지고 QR·글자와 겹치지 않는 오른쪽 빈 곳에 찍힌다.
        context.save();
        context.translate(inRight - 76, y + 108); context.rotate(-0.28); context.globalAlpha = 0.9;
        context.strokeStyle = STAMP; context.fillStyle = STAMP;
        context.lineWidth = 8; context.beginPath(); context.arc(0, 0, 80, 0, Math.PI * 2); context.stroke();
        context.lineWidth = 3; context.beginPath(); context.arc(0, 0, 67, 0, Math.PI * 2); context.stroke();
        context.textAlign = 'center'; font(36, 900); context.fillText('발행', 0, -4); context.fillText('완료', 0, 36);
        context.restore();
      });
      y += code + 56 - gap;
      at(() => { context.textAlign = 'center'; text('과거 자료로 계산한 가정이며 투자 권유가 아니에요.', 540, y, 24, SOFT, 500, width); context.textAlign = 'left'; });
      // 출처는 고지 바로 아래, 같은 크기·색(작은 글씨 두 줄이 한 묶음).
      if (source) {
        y += 32;
        at(() => { context.textAlign = 'center'; text(source, 540, y, 24, SOFT, 500, width); context.textAlign = 'left'; });
      }
      y += 64;
      return y;
    };

    // 간격을 줄여도(compact) 카드에 안 들어가면 영수증 전체를 같은 비율로 줄인다(글자가 잘리거나 겹치는 것보다 낫다).
    const room = SHARE_CARD.height - 120;
    const compact = layout(false, false) > room;
    const height = layout(false, compact);
    const scale = Math.min(1, room / height);
    const top = Math.round((SHARE_CARD.height - height * scale) / 2);
    const tooth = 14, step = 28;
    tilted(-0.018, top + height * scale / 2, () => {
      // 영수증 맨 위 가운데를 원점으로 줄인다. scale이 1이면 이전과 같다.
      context.translate(540, top); context.scale(scale, scale); context.translate(-540, 0);
      shadow(true);
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(left, tooth);
      for (let x = left; x < right; x += step) { context.lineTo(x + step / 2, 0); context.lineTo(Math.min(x + step, right), tooth); }
      context.lineTo(right, height - tooth);
      for (let x = right; x > left; x -= step) { context.lineTo(x - step / 2, height); context.lineTo(Math.max(x - step, left), height - tooth); }
      context.closePath();
      context.fill();
      shadow(false);
      layout(true, compact);
    });
    canvas.setAttribute('aria-label', `AI LENS 내 생일 영수증. 출생 ${birth}. ${[...lines, ...assetLines].map(line => `${line.label} ${line.value}`).join(', ')}${headline.length ? `. 그날 서울경제 ${content.front[0].title}` : ''}. 지나온 시간 ${receiptElapsed(result, content.mode)}${source ? `. ${source}` : ''}`);
  };

  if (content.variant === 'front' && hasFront) {
    drawFront();
    canvas.setAttribute('aria-label', `AI LENS 내 생일 타임머신 그날 신문 카드. ${shareText(result, 'front')}. ${content.front.slice(0, 4).map(article => article.title).join(', ')}. ${FRONT_CARD_SOURCE}`);
  } else drawReceipt();
}
