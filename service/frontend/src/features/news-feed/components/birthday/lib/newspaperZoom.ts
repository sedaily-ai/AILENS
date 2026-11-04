// "1면 크게 보기"의 확대·이동 계산. 화면 요소를 모르는 순수 함수라 시험으로 확인한다.
// 좌표는 모두 "보는 영역(stage)의 한가운데"를 원점으로 한 화면 픽셀이다. 사진은 처음에 영역 안에 통째로 들어가게(contain) 맞추고,
// zoom은 그 맞춤 크기에 대한 배율이다(1 = 전체 보기). 자르지 않는 것이 기본이다.

export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
/** zoom: 맞춤 크기 대비 배율, x·y: 사진 한가운데가 영역 한가운데에서 벗어난 거리(px). */
export interface View { zoom: number; x: number; y: number }

export const FIT_VIEW: View = { zoom: 1, x: 0, y: 0 };
/** 사진을 아직 못 읽었을 때 쓰는 가로세로 비율(요구사항 표본 1.37~1.41배, 표시 규칙 5:7). */
export const DEFAULT_ASPECT = { width: 5, height: 7 };
/** 버튼·키보드로 한 번에 바꾸는 배율. */
export const ZOOM_STEP = 1.5;
/** 더블탭·더블클릭으로 확대할 때의 배율(최대 배율보다 크면 최대까지). */
export const DOUBLE_TAP_ZOOM = 2.5;

/** 영역 안에 사진 전체가 들어가는 가장 큰 크기. 가로·세로 중 빡빡한 쪽에 맞는다. */
export function fitSize(stage: Size, natural: Size): Size {
  if (stage.width <= 0 || stage.height <= 0 || natural.width <= 0 || natural.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(stage.width / natural.width, stage.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

/**
 * 확대 한계. 원본 픽셀보다 크게 키워도 흐려질 뿐이라 원본 크기(1:1)까지만 허용하되,
 * 작은 사진(1988~89년 등)도 최소 2배는 키울 수 있게 하고 너무 큰 값은 8배로 막는다.
 */
export function maxZoom(fit: Size, natural: Size): number {
  if (fit.width <= 0 || natural.width <= 0) return 1;
  return Math.min(8, Math.max(2, natural.width / fit.width));
}

/** 확대한 사진이 영역 밖으로 달아나지 않게 한다. 영역보다 작으면 가운데에 둔다. */
export function clampView(view: View, fit: Size, stage: Size, max: number): View {
  const zoom = Math.min(Math.max(view.zoom, 1), Math.max(max, 1));
  const limitX = Math.max(0, (fit.width * zoom - stage.width) / 2);
  const limitY = Math.max(0, (fit.height * zoom - stage.height) / 2);
  return {
    zoom,
    x: zoom === 1 ? 0 : Math.min(Math.max(view.x, -limitX), limitX),
    y: zoom === 1 ? 0 : Math.min(Math.max(view.y, -limitY), limitY),
  };
}

/** focus(영역 한가운데 기준 좌표) 밑에 있는 사진 부분이 그 자리에 그대로 있도록 nextZoom으로 바꾼다. */
export function zoomAround(view: View, nextZoom: number, focus: Point, fit: Size, stage: Size, max: number): View {
  const zoom = Math.min(Math.max(nextZoom, 1), Math.max(max, 1));
  const ratio = zoom / view.zoom;
  return clampView({ zoom, x: focus.x - (focus.x - view.x) * ratio, y: focus.y - (focus.y - view.y) * ratio }, fit, stage, max);
}

/** 사진을 끌어서 옮긴다. */
export function panBy(view: View, dx: number, dy: number, fit: Size, stage: Size, max: number): View {
  return clampView({ zoom: view.zoom, x: view.x + dx, y: view.y + dy }, fit, stage, max);
}

/** 두 손가락의 거리와 한가운데. */
export function pinchMetrics(a: Point, b: Point) {
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** 마우스 휠 한 칸의 배율. 위로 굴리면 확대(deltaY < 0)다. 한 번에 너무 튀지 않게 크기를 제한한다. */
export function wheelFactor(deltaY: number): number {
  const limited = Math.min(Math.max(deltaY, -240), 240);
  return Math.exp(-limited * 0.0025);
}

/** 영역의 왼쪽 위 모서리 기준 좌표를 한가운데 기준으로 바꾼다. */
export function toCenter(point: Point, stage: Size): Point {
  return { x: point.x - stage.width / 2, y: point.y - stage.height / 2 };
}
