import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** 비동기 조회 훅. 언마운트·재조회 시 이전 요청을 abort 하고, reload() 로 재시도한다. */
export function useAsync<T>(run: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    run(ctrl.signal).then(
      (data) => setState({ status: 'ready', data }),
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' });
      }
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, reload };
}
