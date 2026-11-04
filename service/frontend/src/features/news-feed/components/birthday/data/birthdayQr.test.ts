import { expect, test } from 'vitest';
import { SITE_URL } from '@/shared/constants/site';
import { CARD_QR_SOURCE, RECEIPT_QR_ROWS, RECEIPT_QR_URL, cardQrUrl, qrRows } from './birthdayQr';
import { BIRTHDAY_MARKET_PATH } from './birthdayRoutes';

// 같은 주소를 라이브러리(qrRows)로 만든 결과가 미리 만들어 둔 영수증 무늬와 같다 — 라이브러리가 표준대로 만든다는 확인이고, 영수증 QR을 상수로 두어도 되는 근거다.
test('영수증 QR 상수는 같은 주소를 qrRows로 만든 무늬와 같다', () => {
  expect(qrRows(RECEIPT_QR_URL)).toEqual([...RECEIPT_QR_ROWS]);
});

test('그날 신문 카드 QR 주소는 카드에 찍힌 날짜의 도착 페이지이고 영수증과 따로 집계된다', () => {
  expect(cardQrUrl('2026-11-02')).toBe(`${SITE_URL}${BIRTHDAY_MARKET_PATH}/2026-11-02?utm_source=birthday_card`);
  expect(CARD_QR_SOURCE).toBe('birthday_card');
  expect(CARD_QR_SOURCE).not.toBe(new URL(RECEIPT_QR_URL).searchParams.get('utm_source'));
});

test('어느 날짜든 카드 QR은 영수증과 같은 37×37(버전 5)이라 카드 위 크기가 달라지지 않는다', () => {
  // 주소가 84바이트(버전 5, 오류 복구 M의 바이트 용량)를 넘으면 칸 수가 늘어 같은 크기에서 칸이 작아진다.
  for (const date of ['1960-08-01', '1990-01-01', '1996-06-01', '2026-11-02', '2026-12-31']) {
    const url = cardQrUrl(date);
    expect(new TextEncoder().encode(url).length).toBeLessThanOrEqual(84);
    const rows = qrRows(url);
    expect(rows).toHaveLength(37);
    expect(rows.every(row => /^[01]{37}$/.test(row))).toBe(true);
    // 세 모서리의 위치 찾기 무늬(7×7) 윗줄
    expect(rows[0].slice(0, 7)).toBe('1111111');
    expect(rows[0].slice(-7)).toBe('1111111');
    expect(rows[36].slice(0, 7)).toBe('1111111');
  }
});

test('날짜가 다르면 무늬가 다르고, 같은 주소는 늘 같은 무늬다', () => {
  const a = qrRows(cardQrUrl('1996-06-01'));
  expect(qrRows(cardQrUrl('1996-06-01'))).toEqual(a);
  expect(qrRows(cardQrUrl('1996-06-02'))).not.toEqual(a);
});
