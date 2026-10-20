import { expect, test } from 'vitest';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { calculate } from './birthdayModel';
import { defaultAssetResults } from './birthdayAssets';
import { receiptAssetLines, receiptElapsed, receiptLines } from './birthdayShare';
import { RECEIPT_QR_ROWS, RECEIPT_QR_URL } from '../data/birthdayQr';
import { BIRTHDAY_MARKET_PATH } from '../data/birthdayRoutes';
import { SITE_URL } from '@/shared/constants/site';

const snapshot = { ...raw, events: EVENTS };

test('생일 영수증은 확인된 숫자만 찍는다 — 최저시급·1억 원·그 순간 나이(대표 순간)·연금', () => {
  expect(receiptLines(calculate('1996-06-01', snapshot), 'personal')).toEqual([
    { label: '최저시급', detail: '1,275원 → 10,320원', value: '8.1배' },
    { label: '그때 1억 원', detail: '지금 돈으로', value: '2억 2,075만 원' },
    { label: '2002 한일 월드컵 개막 때', detail: '2002.05.31', value: '만 5세' },
    { label: '국민연금 정상 수령', detail: '만 65세부터', value: '2061.07' },
  ]);
  const year = receiptLines(calculate('1996-01-01', snapshot, 'year'), 'year');
  expect(year.find(line => line.label === '2002 한일 월드컵 개막 때')!.value).toBe('6년 뒤');
  expect(year.find(line => line.label === '국민연금 정상 수령')!.value).toBe('2061년');
  // 1940년생은 최저임금·물가·연금 규칙 자료가 없어 그때 나이만 남는다.
  expect(receiptLines(calculate('1940-01-01', snapshot), 'personal').map(line => line.label)).toEqual(['2002 한일 월드컵 개막 때']);
});

test('시세가 없는 자산은 이름만 찍고 값은 준비 중으로 둔다', () => {
  const lines = receiptAssetLines(defaultAssetResults(calculate('1996-06-01', snapshot)));
  expect(lines.map(line => line.label)).toEqual(['삼성전자', 'SK하이닉스', '서울 아파트', '비트코인 적립', '금 1돈']);
  expect(lines.every(line => line.value === '준비 중' && line.pending)).toBe(true);
});

test('영수증 QR은 결과 페이지 주소(영수증 유입 표시 포함)를 담은 37×37 무늬다', () => {
  expect(RECEIPT_QR_URL).toBe(`${SITE_URL}${BIRTHDAY_MARKET_PATH}?utm_source=birthday_receipt`);
  expect(RECEIPT_QR_ROWS).toHaveLength(37);
  expect(RECEIPT_QR_ROWS.every(row => /^[01]{37}$/.test(row))).toBe(true);
  // 세 모서리의 위치 찾기 무늬(7×7) 윗줄
  expect(RECEIPT_QR_ROWS[0].slice(0, 7)).toBe('1111111');
  expect(RECEIPT_QR_ROWS[0].slice(-7)).toBe('1111111');
  expect(RECEIPT_QR_ROWS[36].slice(0, 7)).toBe('1111111');
});

test('합계(지나온 시간)는 연도 공유면 연 단위로 쓴다', () => {
  expect(receiptElapsed(calculate('1996-06-01', snapshot), 'personal', '2026-10-20')).toBe('30년 4개월');
  expect(receiptElapsed(calculate('1996-01-01', snapshot, 'year'), 'year', '2026-10-20')).toBe('약 30년');
});
