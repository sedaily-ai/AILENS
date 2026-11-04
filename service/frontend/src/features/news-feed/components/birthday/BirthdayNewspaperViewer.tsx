'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  clampView, DEFAULT_ASPECT, DOUBLE_TAP_ZOOM, FIT_VIEW, fitSize, maxZoom, panBy, pinchMetrics, toCenter, wheelFactor, zoomAround, ZOOM_STEP,
  type Point, type Size, type View,
} from './lib/newspaperZoom';
import styles from './birthdayStory.module.css';

const KEY_PAN = 80;
const TAP_GAP_MS = 320;
const TAP_DISTANCE = 24;

/**
 * "1면 크게 보기" 안쪽 — 사진을 보는 영역에 통째로 맞춰 열고(자르지 않는다), 버튼·마우스 휠·두 손가락·더블탭으로 확대하며,
 * 확대하면 끌어서 옮긴다. 원본 받기와 닫기를 둔다. 계산은 lib/newspaperZoom.ts(순수 함수)에 있다.
 * 움직임은 바로 반영한다(전환 효과 없음) — 손을 따라가야 해서이고 움직임 줄이기 설정과도 충돌하지 않는다.
 * 열려 있는 동안에만 그려지므로 닫으면 확대 상태는 사라진다.
 */
export function BirthdayNewspaperViewer({ src, label, fileName, onClose }: { src: string; label: string; fileName: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const [natural, setNatural] = useState<Size>({ width: DEFAULT_ASPECT.width, height: DEFAULT_ASPECT.height });
  const [view, setView] = useState<View>(FIT_VIEW);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);

  const fit = fitSize(stage, natural);
  const max = maxZoom(fit, natural);
  // 영역이 바뀌어(화면 회전·창 크기) 이동 범위가 줄어도 사진이 밖으로 나가지 않게, 그릴 때마다 현재 위치를 범위 안으로 맞춘 값을 쓴다.
  const shown = clampView(view, fit, stage, max);
  // 이벤트 처리기는 한 번만 달고 최신 값은 ref로 읽는다(휠·포인터가 빠르게 이어져도 낡은 값을 쓰지 않는다). ref는 그린 뒤에 갱신한다.
  const live = useRef({ view: shown, fit, stage, max });
  useEffect(() => { live.current = { view: shown, fit, stage, max }; });

  // 보는 영역 크기: 처음과 화면 회전·창 크기 변경 때 다시 잰다.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setStage({ width: rect.width, height: rect.height }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const apply = useCallback((next: View) => setView(next), []);
  const zoomTo = useCallback((nextZoom: number, focus: Point = { x: 0, y: 0 }) => {
    const now = live.current;
    apply(zoomAround(now.view, nextZoom, focus, now.fit, now.stage, now.max));
  }, [apply]);
  const reset = useCallback(() => apply(FIT_VIEW), [apply]);
  // 더블탭·더블클릭: 맞춤이면 눌린 곳을 확대하고, 이미 확대돼 있으면 맞춤으로 돌아간다.
  const toggleAt = useCallback((focus: Point) => {
    const now = live.current;
    if (now.view.zoom > 1.05) reset();
    else zoomTo(Math.min(DOUBLE_TAP_ZOOM, now.max), focus);
  }, [reset, zoomTo]);

  // 마우스 휠로 확대·축소. 브라우저 기본 동작(스크롤)을 막아야 해서 passive가 아닌 처리기를 직접 단다.
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const now = live.current;
      const focus = toCenter({ x: event.clientX - rect.left, y: event.clientY - rect.top }, now.stage);
      apply(zoomAround(now.view, now.view.zoom * wheelFactor(event.deltaY), focus, now.fit, now.stage, now.max));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [apply]);

  // 포인터(마우스·손가락): 한 개는 끌기, 두 개는 모으기/벌리기.
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number } | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);
  const lastType = useRef<string>('mouse');
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    lastType.current = event.pointerType;
    // 사진 영역을 누르면 포커스가 영역 밖(본문)으로 옮겨 + − 0 방향키가 처리기에 닿지 않는다. 영역 자체에 포커스를 두어 키 입력을 이어 받는다.
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: pinchMetrics(a, b).distance };
      setDragging(false);
    } else if (pointers.current.size === 1) {
      setDragging(live.current.view.zoom > 1);
    }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const now = live.current;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const metrics = pinchMetrics(a, b);
      if (pinch.current.distance > 0) {
        apply(zoomAround(now.view, now.view.zoom * (metrics.distance / pinch.current.distance), toCenter(metrics.center, now.stage), now.fit, now.stage, now.max));
      }
      pinch.current = { distance: metrics.distance };
    } else if (pointers.current.size === 1 && now.view.zoom > 1) {
      apply(panBy(now.view, point.x - previous.x, point.y - previous.y, now.fit, now.stage, now.max));
    }
  }
  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
    // 손가락 더블탭(마우스는 onDoubleClick이 맡는다). 사이가 짧고 거의 같은 자리일 때만 센다.
    if (event.type === 'pointerup' && event.pointerType === 'touch' && start) {
      const now = Date.now();
      const point = local(event);
      const prev = lastTap.current;
      if (prev && now - prev.time < TAP_GAP_MS && Math.hypot(point.x - prev.point.x, point.y - prev.point.y) < TAP_DISTANCE) {
        lastTap.current = null;
        toggleAt(toCenter(point, live.current.stage));
      } else {
        lastTap.current = { time: now, point };
      }
    }
  }
  function onDoubleClick(event: React.MouseEvent<HTMLDivElement>) {
    // 손가락 더블탭이 이미 처리한 경우 브라우저가 한 번 더 보내는 dblclick은 무시한다.
    if (lastType.current === 'touch') return;
    toggleAt(toCenter(local(event), live.current.stage));
  }

  // 키보드: + − 0 방향키. Tab은 이 안의 버튼들 사이를 돈다(화면 밖으로 나가지 않는다). Esc는 <dialog>가 닫는다.
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    const now = live.current;
    switch (event.key) {
      case '+': case '=': event.preventDefault(); zoomTo(now.view.zoom * ZOOM_STEP); break;
      case '-': case '_': event.preventDefault(); zoomTo(now.view.zoom / ZOOM_STEP); break;
      case '0': event.preventDefault(); reset(); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        if (now.view.zoom <= 1) return;
        // 방향키가 버튼 사이 이동으로 쓰이지 않는 이 화면에서는 사진 이동으로 쓴다.
        event.preventDefault();
        const dx = event.key === 'ArrowLeft' ? KEY_PAN : event.key === 'ArrowRight' ? -KEY_PAN : 0;
        const dy = event.key === 'ArrowUp' ? KEY_PAN : event.key === 'ArrowDown' ? -KEY_PAN : 0;
        apply(panBy(now.view, dx, dy, now.fit, now.stage, now.max));
        break;
      }
      default:
    }
  }

  const percent = Math.round(shown.zoom * 100);
  return <div ref={rootRef} className={styles.zoomRoot} onKeyDown={onKeyDown}>
    <div className={styles.zoomBar}>
      <p className={styles.zoomTitle}>{label}</p>
      {/* 열릴 때 포커스를 두는 버튼 — 내용은 showModal() 뒤에 그려져 브라우저가 첫 버튼을 고르지 못한다. */}
      <button type="button" className={styles.zoomButton} autoFocus onClick={onClose}>닫기</button>
    </div>
    {/* tabIndex -1: Tab 순서에는 넣지 않고(버튼 5개만 돈다), 누르거나 코드로 포커스를 줄 때만 키 입력을 받는다. 포커스 링은 사진을 가려서 그리지 않는다(버튼에는 그린다). */}
    <div ref={stageRef} className={styles.zoomStage} tabIndex={-1} data-zoomed={shown.zoom > 1 || undefined} data-dragging={dragging || undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onDoubleClick={onDoubleClick}>
      {failed
        ? <p className={styles.zoomFailed} role="alert">사진을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
        // eslint-disable-next-line @next/next/no-img-element -- 같은 출처의 원본 JPEG(브라우저 캐시)를 변환 없이 보여 준다(이미지 최적화 대상 아님).
        : <img className={styles.zoomImg} src={src} alt={label} draggable={false}
            style={{ width: fit.width || undefined, height: fit.height || undefined, transform: `translate(calc(-50% + ${shown.x}px), calc(-50% + ${shown.y}px)) scale(${shown.zoom})` }}
            onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setFailed(true)} />}
    </div>
    <div className={styles.zoomTools}>
      <button type="button" className={styles.zoomButton} aria-label="축소" onClick={() => zoomTo(shown.zoom / ZOOM_STEP)}>−</button>
      <button type="button" className={styles.zoomButton} aria-label={`전체 보기, 지금 ${percent}%`} onClick={reset}>전체 보기</button>
      <button type="button" className={styles.zoomButton} aria-label="확대" onClick={() => zoomTo(shown.zoom * ZOOM_STEP)}>+</button>
      {/* 같은 출처의 원본이라 download로 바로 받는다. */}
      <a className={styles.zoomButton} href={src} download={fileName} aria-label={`${label} 원본 받기`}>원본 받기</a>
    </div>
  </div>;
}
