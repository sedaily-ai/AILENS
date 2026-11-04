import { expect, test } from 'vitest';
import { clampView, FIT_VIEW, fitSize, maxZoom, panBy, pinchMetrics, toCenter, wheelFactor, zoomAround, ZOOM_STEP } from './newspaperZoom';

// 1996-06-01 사진(4416×6208, 세로로 긴 신문)과 휴대폰·넓은 화면의 보는 영역.
const natural = { width: 4416, height: 6208 };
const phone = { width: 375, height: 692 };
const desktop = { width: 1280, height: 680 };

test('맞춤: 영역 안에 사진 전체가 들어가고 잘리지 않는다', () => {
  for (const stage of [phone, desktop, { width: 800, height: 800 }]) {
    const fit = fitSize(stage, natural);
    expect(fit.width).toBeLessThanOrEqual(stage.width + 1e-9);
    expect(fit.height).toBeLessThanOrEqual(stage.height + 1e-9);
    // 가로세로 비율은 그대로
    expect(fit.width / fit.height).toBeCloseTo(natural.width / natural.height, 9);
  }
});

test('맞춤: 휴대폰은 폭에, 넓은 화면은 높이에 맞는다(둘 중 빡빡한 쪽)', () => {
  const onPhone = fitSize(phone, natural);
  expect(onPhone.width).toBeCloseTo(375, 6);
  expect(onPhone.height).toBeLessThan(692);
  const onDesktop = fitSize(desktop, natural);
  expect(onDesktop.height).toBeCloseTo(680, 6);
  expect(onDesktop.width).toBeLessThan(1280);
});

test('맞춤: 크기를 모르면 0으로 돌려 그리지 않는다', () => {
  expect(fitSize({ width: 0, height: 100 }, natural)).toEqual({ width: 0, height: 0 });
  expect(fitSize(phone, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
});

test('확대 한계: 원본 픽셀까지, 작은 사진도 최소 2배, 너무 큰 값은 8배', () => {
  const fit = fitSize(phone, natural);
  expect(maxZoom(fit, natural)).toBe(8);
  const small = { width: 1283, height: 1769 }; // 1989년 작은 해상도 사진
  expect(maxZoom(fitSize(phone, small), small)).toBeCloseTo(1283 / 375, 6);
  const tiny = { width: 500, height: 700 };
  expect(maxZoom(fitSize(phone, tiny), tiny)).toBe(2);
  expect(maxZoom({ width: 0, height: 0 }, natural)).toBe(1);
});

test('전체 보기에서는 항상 가운데이고, 확대하면 이동 범위 안으로 붙잡힌다', () => {
  const fit = fitSize(phone, natural);
  const max = maxZoom(fit, natural);
  expect(clampView({ zoom: 1, x: 50, y: -80 }, fit, phone, max)).toEqual(FIT_VIEW);
  const zoomed = clampView({ zoom: 2, x: 9999, y: -9999 }, fit, phone, max);
  // 맞춤 폭 375가 2배 → 750, 영역 375 → 좌우로 187.5까지만
  expect(zoomed.x).toBeCloseTo((fit.width * 2 - phone.width) / 2, 6);
  expect(zoomed.y).toBeCloseTo(-(fit.height * 2 - phone.height) / 2, 6);
  // 배율 자체도 1~최대로 제한
  expect(clampView({ zoom: 0.2, x: 0, y: 0 }, fit, phone, max).zoom).toBe(1);
  expect(clampView({ zoom: 99, x: 0, y: 0 }, fit, phone, max).zoom).toBe(max);
});

test('영역보다 작게 보이는 방향은 이동하지 못하고 가운데에 선다', () => {
  // 넓은 화면: 맞춤 폭(약 484)이 영역 폭(1280)보다 훨씬 작다. 1.5배(약 726)가 돼도 가로는 가운데.
  const fit = fitSize(desktop, natural);
  const max = maxZoom(fit, natural);
  const view = clampView({ zoom: 1.5, x: 300, y: 300 }, fit, desktop, max);
  expect(view.x).toBe(0);
  // 세로는 680 → 1020으로 커졌으니 위아래로 170까지 이동
  expect(view.y).toBeCloseTo(170, 6);
});

test('확대 중심: 손가락·마우스 밑의 사진 부분이 제자리에 있다', () => {
  const fit = fitSize(phone, natural);
  const max = maxZoom(fit, natural);
  const focus = toCenter({ x: 300, y: 200 }, phone); // 영역 안의 한 점
  const before = FIT_VIEW;
  const after = zoomAround(before, 2, focus, fit, phone, max);
  // 사진 좌표(맞춤 크기 기준): p = (focus - offset) / zoom. 확대 전후가 같아야 한다.
  const pBefore = { x: (focus.x - before.x) / before.zoom, y: (focus.y - before.y) / before.zoom };
  const pAfter = { x: (focus.x - after.x) / after.zoom, y: (focus.y - after.y) / after.zoom };
  expect(pAfter.x).toBeCloseTo(pBefore.x, 6);
  expect(pAfter.y).toBeCloseTo(pBefore.y, 6);
  expect(after.zoom).toBe(2);
});

test('가장자리를 누르고 확대해도 사진이 영역 밖으로 달아나지 않는다', () => {
  const fit = fitSize(phone, natural);
  const max = maxZoom(fit, natural);
  const corner = toCenter({ x: 0, y: 0 }, phone);
  const view = zoomAround(FIT_VIEW, 4, corner, fit, phone, max);
  const limitX = (fit.width * 4 - phone.width) / 2;
  const limitY = (fit.height * 4 - phone.height) / 2;
  expect(Math.abs(view.x)).toBeLessThanOrEqual(limitX + 1e-9);
  expect(Math.abs(view.y)).toBeLessThanOrEqual(limitY + 1e-9);
});

test('축소하면 맞춤 크기(1배) 아래로 내려가지 않고 가운데로 돌아온다', () => {
  const fit = fitSize(phone, natural);
  const max = maxZoom(fit, natural);
  const zoomedIn = zoomAround(FIT_VIEW, 3, { x: 100, y: 100 }, fit, phone, max);
  const out = zoomAround(zoomedIn, zoomedIn.zoom / ZOOM_STEP / ZOOM_STEP / ZOOM_STEP, { x: 0, y: 0 }, fit, phone, max);
  expect(out).toEqual(FIT_VIEW);
});

test('끌기: 이동량만큼 움직이되 범위를 넘지 않는다', () => {
  const fit = fitSize(phone, natural);
  const max = maxZoom(fit, natural);
  const start = zoomAround(FIT_VIEW, 3, { x: 0, y: 0 }, fit, phone, max);
  const moved = panBy(start, -40, 25, fit, phone, max);
  expect(moved.x).toBeCloseTo(start.x - 40, 6);
  expect(moved.y).toBeCloseTo(start.y + 25, 6);
  const far = panBy(start, -1e6, 1e6, fit, phone, max);
  expect(far.x).toBeCloseTo(-(fit.width * 3 - phone.width) / 2, 6);
  expect(far.y).toBeCloseTo((fit.height * 3 - phone.height) / 2, 6);
  // 맞춤 상태에서는 끌어도 그대로
  expect(panBy(FIT_VIEW, 30, 30, fit, phone, max)).toEqual(FIT_VIEW);
});

test('두 손가락: 거리와 한가운데', () => {
  const m = pinchMetrics({ x: 0, y: 0 }, { x: 30, y: 40 });
  expect(m.distance).toBe(50);
  expect(m.center).toEqual({ x: 15, y: 20 });
});

test('휠: 위로 굴리면 확대, 아래로 굴리면 축소, 한 번에 튀지 않는다', () => {
  expect(wheelFactor(-100)).toBeGreaterThan(1);
  expect(wheelFactor(100)).toBeLessThan(1);
  expect(wheelFactor(0)).toBe(1);
  // 트랙패드의 큰 값도 상한이 있다
  expect(wheelFactor(-10000)).toBeCloseTo(wheelFactor(-240), 9);
  expect(wheelFactor(-240)).toBeLessThan(2);
});

test('영역 모서리 기준 좌표를 한가운데 기준으로 바꾼다', () => {
  expect(toCenter({ x: 0, y: 0 }, phone)).toEqual({ x: -187.5, y: -346 });
  expect(toCenter({ x: 187.5, y: 346 }, phone)).toEqual({ x: 0, y: 0 });
});
