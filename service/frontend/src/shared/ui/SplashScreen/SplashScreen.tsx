'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import './splash.css';

/**
 * AI LENS 스플래시 — 2026-08-24 신설.
 *
 * 피그마 "AI LENS — Splash"(file 1zZLeqJYPfOdj3yc5Q67aW, Page 1 / row A,
 * 01 Empty → 08 Handoff) 핸드오프를 그대로 옮긴 것. 스타일은 디자이너가 넘긴
 * splash.css 를 **손대지 않고** 그대로 두고(수정한 것은 전달 과정에서 깨진
 * 주석의 —·×·° 문자 복원뿐), 이 컴포넌트는 그 CSS가 요구하는 DOM 구조와
 * 진입/이탈 타이밍만 담당한다.
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
 * 타임라인(splash.css 변수와 1:1): 조각 4개가 100~460ms에 차례로 들어오고,
 * 780ms에 임팩트 펄스, 1000/1100/1200ms에 카피가 올라온다. 즉 진입 완료가
 * 약 1600ms — holdMs 기본값이 그 값이다.
 */

/** 진입 연출이 끝나는 시각(ms) — splash.css의 --ails-t-pub + --ails-d-copy. */
const ENTRY_DONE_MS = 1600;
/** 이탈 트랜지션 길이(ms) — splash.css의 --ails-d-exit. */
const EXIT_MS = 360;

export function SplashScreen({
  wordmark = 'AI LENS',
  tagline,
  publisher = '서울경제신문',
  holdMs = ENTRY_DONE_MS,
  onDone,
}: {
  /** 07 Lockup의 워드마크. */
  wordmark?: string;
  /** 워드마크 아래 한 줄. 넘기지 않으면 그 줄을 렌더하지 않는다(빈 자리를 남기지 않음). */
  tagline?: string;
  /** 하단 발행처. */
  publisher?: string;
  /** 진입 완료 후 이탈까지 머무는 시간. */
  holdMs?: number;
  /** 이탈 트랜지션까지 끝난 뒤 호출 — 호출부가 이 노드를 언마운트한다. */
  onDone?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // onDone을 ref로 잡는다 — 호출부가 인라인 화살표 함수를 넘기면 매 렌더마다
  // 새 함수가 와서, deps에 넣으면 타이머가 계속 재설정된다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(() => {
    onDoneRef.current?.();
  }, []);

  useEffect(() => {
    // 움직임을 줄이라는 설정이면 연출을 기다리지 않고 곧장 넘긴다 —
    // splash.css도 같은 조건에서 애니메이션을 끈다(스티어링 §2).
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const hold = reduce ? 0 : holdMs;

    const toLeave = window.setTimeout(() => setLeaving(true), hold);
    // 이탈 트랜지션이 끝나면 호출부에 알린다. transitionend에 의존하지 않는
    // 이유: opacity 트랜지션이 취소되거나(탭 백그라운드 전환 등) reduced-motion
    // 으로 0ms가 되면 이벤트가 안 오는 경우가 있어 완주가 보장되지 않는다.
    const toDone = window.setTimeout(finish, hold + EXIT_MS);
    return () => {
      window.clearTimeout(toLeave);
      window.clearTimeout(toDone);
    };
  }, [holdMs, finish]);

  return (
    // 장식 오버레이라 스크린리더에는 노출하지 않는다 — 아래 실제 페이지
    // 콘텐츠가 이미 DOM에 있고, 이 화면에는 읽을 새 정보가 없다.
    <div className={`ails${leaving ? ' is-leaving' : ''}`} aria-hidden>
      <div className="ails__stack">
        <div className="ails__mark-exit">
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
