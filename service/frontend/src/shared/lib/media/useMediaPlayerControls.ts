'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * ArticleAudioPlayer.tsx/ArticleVideoPlayer.tsx가 공유하는 비-시각 상태 로직: 북마크 localStorage 동기화, 배속 드롭다운 열림/닫힘,
 * 재생-일시정지-탐색-되감기 이벤트 배선. 포맷 함수(clock/spoken 등)는 mediaPlayerFormat.tsx에 있다.
 * 커버아트/파형/대본 탭(오디오 전용), buffered 진행률/음소거/전체화면(영상 전용)처럼 두 미디어 타입이 실제로 다른 부분은
 * 강제로 합치면 과잉 추상화가 되므로 각 컴포넌트에 둔다.
 */

/** 북마크 상태 + localStorage 동기화. src가 바뀌면(다른 미디어로 전환) 다시 읽는다. */
export function useMediaBookmark(src: string, storageKey: string) {
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const set: string[] = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 동기화, src 변경 시 재확인 필요
        setBookmarked(set.includes(src));
      }
    } catch {
      // localStorage 접근 불가(시크릿 모드 등) — 조용히 무시, 기본값(false) 유지.
    }
  }, [src, storageKey]);

  const toggleBookmark = useCallback(() => {
    setBookmarked((prev) => {
      const next = !prev;
      try {
        const raw = window.localStorage.getItem(storageKey);
        const set: string[] = raw ? JSON.parse(raw) : [];
        const updated = next ? [...new Set([...set, src])] : set.filter((s) => s !== src);
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // 저장 실패해도 이번 세션 내 UI 상태는 유지.
      }
      return next;
    });
  }, [src, storageKey]);

  return { bookmarked, toggleBookmark };
}

/** 배속 선택 드롭다운 — 열림 상태, 바깥 클릭·Escape로 닫기, 선택 시 el.playbackRate 반영. */
export function usePlaybackRateMenu(
  ref: RefObject<HTMLMediaElement | null>,
  rates: readonly number[],
) {
  const [rateIdx, setRateIdx] = useState(1); // 1.0×
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const rateMenuRef = useRef<HTMLDivElement | null>(null);
  const rateTriggerRef = useRef<HTMLButtonElement | null>(null);

  const selectRate = useCallback(
    (idx: number) => {
      const el = ref.current;
      setRateIdx(idx);
      if (el) el.playbackRate = rates[idx];
      setRateMenuOpen(false);
      rateTriggerRef.current?.focus();
    },
    [ref, rates],
  );

  // 메뉴 바깥 클릭·Escape로 닫는다 — 열려 있는 동안에만 리스너를 붙여 평소엔 비용이 없다.
  useEffect(() => {
    if (!rateMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rateMenuRef.current && !rateMenuRef.current.contains(e.target as Node)) {
        setRateMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRateMenuOpen(false);
        rateTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rateMenuOpen]);

  return { rateIdx, rateMenuOpen, setRateMenuOpen, selectRate, rateMenuRef, rateTriggerRef };
}

/**
 * 재생/일시정지·현재위치·길이·탐색·되감기/앞으로감기·재시도(audio/video 공용, HTMLMediaElement).
 * loadedmetadata/timeupdate/ended/play/pause/error 6개 이벤트만 배선하고, 영상 전용 이벤트(buffered progress·volumechange·fullscreen)는
 * 호출부(ArticleVideoPlayer.tsx)가 별도 effect로 얹는다.
 */
export function useMediaTransport(
  ref: RefObject<HTMLMediaElement | null>,
  opts: { looping: boolean; onDuration?: (sec: number) => void },
) {
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [failed, setFailed] = useState(false);

  // onDuration을 ref로 잡는다 — 호출부가 인라인 화살표 함수를 넘기면 매
  // 렌더마다 새 함수가 와서, deps에 넣으면 리스너를 계속 붙였다 뗀다.
  const onDurationRef = useRef(opts.onDuration);
  useEffect(() => {
    onDurationRef.current = opts.onDuration;
  }, [opts.onDuration]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMeta = () => {
      const d = el.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      setDur(d);
      onDurationRef.current?.(d);
    };
    const onTime = () => {
      setCur(el.currentTime);
    };
    const onEnd = () => {
      if (opts.looping) {
        el.currentTime = 0;
        void el.play().catch(() => setFailed(true));
        return;
      }
      setPlaying(false);
      setCur(0);
      el.currentTime = 0;
    };
    // play/pause는 엘리먼트에서 받는다 — 잠금화면·헤드셋 버튼처럼 우리 UI를
    // 거치지 않는 조작이 있어도 버튼 모양이 실제 상태와 안 어긋난다.
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      setFailed(true);
      setPlaying(false);
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onErr);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onErr);
    };
  }, [ref, opts.looping]);

  const toggle = useCallback(() => {
    setFailed(false);
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }, [ref]);

  const seekTo = useCallback(
    (sec: number) => {
      const el = ref.current;
      if (!el || !Number.isFinite(el.duration)) return;
      const next = Math.min(el.duration, Math.max(0, sec));
      el.currentTime = next;
      setCur(next);
    },
    [ref],
  );

  const nudge = useCallback(
    (delta: number) => {
      const el = ref.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [ref, seekTo],
  );

  const retry = useCallback(() => {
    setFailed(false);
    const el = ref.current;
    if (!el) return;
    el.load();
    void el.play().catch(() => setFailed(true));
  }, [ref]);

  return { playing, cur, dur, failed, toggle, seekTo, nudge, retry };
}
