'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './splash.css';

/**
 * AI LENS 스플래시 — 2026-08-24 신설, 2026-08-25 핸드오프 문서 반영.
 *
 * 피그마 "AI LENS — Splash"(file 1zZLeqJYPfOdj3yc5Q67aW, Page 1 / row A,
 * 01 Empty → 08 Handoff) 핸드오프를 옮긴 것. 전체 스펙은
 * docs/design-system/notes/2026-08-25-ai-lens-splash-handoff.md 참조.
 *
 * 스타일은 디자이너가 넘긴 splash.css 를 **손대지 않고** 그대로 둔다(수정한
 * 것은 전달 과정에서 깨진 주석의 —·×·° 문자 복원뿐). 이 컴포넌트는 그 CSS가
 * 요구하는 DOM 구조와 진입/이탈 타이밍만 담당한다.
 *
 * ⚠️ 이 파일은 프로젝트의 일반 관례(컴포넌트 안 인라인 <style>)와 다르게
 * 별도 .css 를 import 한다. 핸드오프 산출물을 원본 그대로 보존해서 피그마가
 * 갱신되면 파일만 갈아끼울 수 있게 하려는 의도다.
 *
 * DOM 구조(CSS 클래스가 이 계층을 전제한다):
 *   .ails                     전체 오버레이(fixed, 이탈 시 is-leaving)
 *     .ails__stack            마크 + 카피 묶음(광학 중심보다 13px 위)
 *       .ails__mark-exit      이탈 스케일 담당(진입 펄스와 transform 충돌 방지)
 *         .ails__mark         05 Impact 펄스 담당
 *           .ails__piece--tl / --tr / --br / --bl
 *       .ails__copy           워드마크 + 태그라인
 *     .ails__publisher-exit   하단 발행처
 *       .ails__publisher
 *
 * ── 이탈 제어 ──
 * 진입은 자동 재생, 이탈은 앱이 제어한다(핸드오프 §4). `ready`가 true가 되고
 * 최소 노출 시간(MIN_VISIBLE_MS)이 지나야 이탈이 시작된다 — 앱이 더 빨리
 * 준비돼도 진입 시퀀스가 중간에 끊기지 않고, 로딩이 더 걸리면 락업 상태로
 * 계속 대기한다. 이탈 트랜지션이 끝나면 onDone 으로 알려 호출부가 언마운트한다.
 */

/**
 * 최소 노출 시간(ms) — 진입 시퀀스가 끝나는 시각. splash.css 의
 * --ails-t-pub(1200) + --ails-d-copy(400) 과 같은 값이다. 핸드오프 §4 기준.
 */
const MIN_VISIBLE_MS = 1600;
/** 이탈 트랜지션 길이(ms) — splash.css 의 --ails-d-exit. */
const EXIT_MS = 360;

export function SplashScreen({
  ready = true,
  wordmark = 'AI LENS',
  tagline = '같은 이슈, 네 가지 시선',
  publisher = '서울경제신문',
  minVisibleMs = MIN_VISIBLE_MS,
  onDone,
}: {
  /**
   * 앱 준비 완료 여부. false 인 동안에는 최소 노출 시간이 지나도 락업 상태로
   * 계속 기다린다(핸드오프 §4). 기본값 true — 별도 부팅 게이트가 없는
   * 웹에서는 최소 노출 시간만 채우고 넘어간다.
   */
  ready?: boolean;
  /** 07 Lockup 워드마크. */
  wordmark?: string;
  /** 워드마크 아래 한 줄. 빈 값이면 그 줄을 렌더하지 않는다. */
  tagline?: string;
  /** 하단 발행처. */
  publisher?: string;
  /** 최소 노출 시간 — 길게 느껴지면 이 값만 줄인다(핸드오프 §4). */
  minVisibleMs?: number;
  /** 이탈 트랜지션까지 끝난 뒤 호출 — 호출부가 이 노드를 언마운트한다. */
  onDone?: () => void;
}) {
  // 최소 노출 시간을 채웠는지. 이탈 여부는 이 값과 ready 의 AND 로 **파생**
  // 시킨다 — 별도 leaving 상태를 두고 effect 에서 set 하면 렌더가 한 번 더
  // 돌고(react-hooks/set-state-in-effect) 두 상태가 어긋날 여지도 생긴다.
  const [minElapsed, setMinElapsed] = useState(false);
  // onDone 을 ref 로 잡는다 — 호출부가 인라인 화살표 함수를 넘기면 매 렌더마다
  // 새 함수가 와서, deps 에 넣으면 타이머가 계속 재설정된다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // 움직임을 줄이라는 설정이면 대기 없이 넘긴다 — splash.css 도 같은 조건에서
  // 애니메이션을 끄고 락업 상태로 즉시 표시한다(핸드오프 §5).
  const reduceRef = useRef(false);
  useEffect(() => {
    reduceRef.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduceRef.current ? 0 : minVisibleMs;
    const t = window.setTimeout(() => setMinElapsed(true), hold);
    return () => window.clearTimeout(t);
  }, [minVisibleMs]);

  const finish = useCallback(() => {
    onDoneRef.current?.();
  }, []);

  // 진입 시퀀스를 다 보여주고(minElapsed) 앱도 준비됐으면(ready) 이탈한다.
  const leaving = minElapsed && ready;

  useEffect(() => {
    if (!leaving) return;
    // 이탈 트랜지션이 끝나면 호출부에 알린다. transitionend 에 의존하지 않는
    // 이유: 탭이 백그라운드로 가 트랜지션이 취소되거나 reduced-motion 으로
    // 0ms 가 되면 이벤트가 안 오는 경우가 있어 완주가 보장되지 않는다.
    const t = window.setTimeout(finish, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving, finish]);

  return (
    // 핸드오프 §5 — 컨테이너에 role="status" + aria-label 로 "로딩 중"을 한 번
    // 알리고, 마크(장식)는 aria-hidden 으로 감춘다. 워드마크·발행처 텍스트는
    // 그대로 읽히되 status 라이브 리전 안이라 한 번만 전달된다.
    <div
      className={`ails${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-label="AI LENS 시작 중"
    >
      <div className="ails__stack">
        <div className="ails__mark-exit" aria-hidden>
          <div className="ails__mark">
            <span className="ails__piece ails__piece--tl" />
            <span className="ails__piece ails__piece--tr" />
            <span className="ails__piece ails__piece--br" />
            <span className="ails__piece ails__piece--bl" />
          </div>
        </div>

        <div className="ails__copy">
          <p className="ails__wordmark">{wordmark}</p>
          {tagline && <p className="ails__tagline">{tagline}</p>}
        </div>
      </div>

      <div className="ails__publisher-exit">
        <p className="ails__publisher">{publisher}</p>
      </div>
    </div>
  );
}
