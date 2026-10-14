import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listPosts,
  type HomePlayerPost,
  type LensPost,
  type LetterPost,
  type VideoPost,
  type WebtoonPost,
} from '@ailens/api-client';
import { buildLatest, type FeedItem } from './model';

export interface HomeData {
  lens: LensPost[];
  latest: FeedItem[];
  webtoons: WebtoonPost[];
  videos: VideoPost[];
  audio: HomePlayerPost[];
}

export type HomeState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: HomeData };

const ok = <T,>(r: PromiseSettledResult<T[]>): T[] => (r.status === 'fulfilled' ? r.value : []);

/**
 * 홈 데이터를 한 번에 병렬로 받는다. 웹 홈처럼 섹션 단위로 fail-open: 일부 채널이 실패해도 나머지는 보여 주고,
 * 핵심 채널(letters·lens)이 둘 다 실패했을 때만 오류 화면(재시도)으로 간다.
 */
export function useHomeData() {
  const [state, setState] = useState<HomeState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async (silent: boolean) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (silent) setRefreshing(true);
    else setState({ status: 'loading' });
    const { signal } = c;
    const [letters, lens, webtoons, videos, audio] = await Promise.allSettled([
      listPosts<LetterPost>('letters', { limit: 100, signal }),
      listPosts<LensPost>('lens', { limit: 100, signal }),
      listPosts<WebtoonPost>('webtoon', { limit: 20, signal }),
      listPosts<VideoPost>('video', { limit: 20, signal }),
      listPosts<HomePlayerPost>('home_player', { limit: 20, signal }),
    ]);
    if (signal.aborted) return;
    setRefreshing(false);
    if (letters.status === 'rejected' && lens.status === 'rejected') {
      setState({ status: 'error', message: '네트워크 상태를 확인해 주세요.' });
      return;
    }
    setState({
      status: 'ready',
      data: {
        lens: ok(lens),
        latest: buildLatest(ok(letters), ok(lens)),
        webtoons: ok(webtoons),
        videos: ok(videos),
        audio: ok(audio),
      },
    });
  }, []);

  useEffect(() => {
    void load(false);
    return () => ctrl.current?.abort();
  }, [load]);

  return { state, refreshing, reload: () => load(false), refresh: () => load(true) };
}
