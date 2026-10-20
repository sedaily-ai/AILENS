import { markStep } from '../home/dailyProgress';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { listPosts, type HomePlayerPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';

interface PlayerValue {
  queue: HomePlayerPost[];
  index: number;
  current: HomePlayerPost | null;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  rate: number;
  /** 큐를 지정해 index 번째부터 재생한다. 같은 곡이면 이어서 재생/일시정지만 토글한다. */
  playQueue: (items: HomePlayerPost[], index: number) => void;
  /** 큐가 없을 때 오늘의 오디오 목록을 받아 처음부터 재생한다(미니 플레이어의 재생 버튼). */
  playDefault: () => Promise<void>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

/**
 * 앱 전체에서 하나의 오디오 플레이어를 공유한다(미니 플레이어·듣기 탭·오디오 상세가 같은 상태를 본다).
 * 큐는 "오늘의 뉴스를 귀로"(home_player) 목록. 끝나면 다음 곡으로 자동 이동한다.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  if (!playerRef.current) playerRef.current = createAudioPlayer(null);
  const player = playerRef.current;
  const status = useAudioPlayerStatus(player);

  const [queue, setQueue] = useState<HomePlayerPost[]>([]);
  const [index, setIndex] = useState(0);
  const [rate, setRateState] = useState(1);
  const [loading, setLoading] = useState(false);
  const loadedId = useRef<string | null>(null);

  // 한 번만: 무음 모드·백그라운드 재생·잠금화면 컨트롤을 위해 doNotMix.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: true }).catch(() => {});
    return () => player.remove();
  }, [player]);

  const load = useCallback(
    (items: HomePlayerPost[], i: number) => {
      const item = items[i];
      if (!item?.media_embed_url) return;
      loadedId.current = item.id;
      setLoading(true);
      player.replace({ uri: item.media_embed_url });
      player.setPlaybackRate(rate);
      player.play();
      void markStep('format');
      player.setActiveForLockScreen(true, { title: displayHeadline(item.title), artist: 'AI LENS · 오늘의 뉴스를 귀로' });
    },
    [player, rate]
  );

  useEffect(() => {
    if (status.isLoaded) setLoading(false);
  }, [status.isLoaded]);

  const playQueue = useCallback(
    (items: HomePlayerPost[], i: number) => {
      const item = items[i];
      if (!item) return;
      setQueue(items);
      setIndex(i);
      if (loadedId.current === item.id) {
        if (!player.playing) player.play();
        return;
      }
      load(items, i);
    },
    [load, player]
  );

  const step = useCallback(
    (delta: number) => {
      const i = index + delta;
      if (i < 0 || i >= queue.length) return;
      setIndex(i);
      load(queue, i);
    },
    [index, queue, load]
  );

  // 곡이 끝나면 다음 곡으로(마지막이면 멈춤).
  useEffect(() => {
    if (status.didJustFinish) step(1);
  }, [status.didJustFinish, step]);

  const playDefault = useCallback(async () => {
    const items = (await listPosts<HomePlayerPost>('home_player', { limit: 50 })).filter((p) => p.media_embed_url);
    if (items.length) playQueue(items, 0);
  }, [playQueue]);

  const value = useMemo<PlayerValue>(
    () => ({
      queue,
      index,
      current: queue[index] ?? null,
      playing: status.playing,
      loading: loading || status.isBuffering,
      position: status.currentTime,
      duration: status.duration,
      rate,
      playQueue,
      playDefault,
      toggle: () => (player.playing ? player.pause() : player.play()),
      next: () => step(1),
      prev: () => {
        // 3초 넘게 들었으면 처음으로, 아니면 이전 곡(일반적인 플레이어 동작).
        if (status.currentTime > 3) void player.seekTo(0);
        else step(-1);
      },
      seekTo: (s) => void player.seekTo(Math.max(0, s)),
      setRate: (r) => {
        setRateState(r);
        player.setPlaybackRate(r);
      },
      close: () => {
        player.pause();
        player.clearLockScreenControls();
        loadedId.current = null;
        setQueue([]);
        setIndex(0);
      },
    }),
    [queue, index, status, loading, rate, playQueue, playDefault, player, step]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer 는 <PlayerProvider> 안에서만 쓸 수 있습니다.');
  return ctx;
}
