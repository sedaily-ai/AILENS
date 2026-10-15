import type { SetStateAction } from 'react';

export interface PlayerState {
  index: number;
  playing: boolean;
  progress: number;
}

export type PlayerAction =
  | { type: 'index'; next: SetStateAction<number> }
  | { type: 'playing'; value: boolean }
  | { type: 'progress'; value: number };

/** 트랙 선택과 재생 표시를 함께 갱신한다. 같은 트랙 선택은 재생을 유지한다. */
export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'index': {
      const index = typeof action.next === 'function' ? action.next(state.index) : action.next;
      return index === state.index ? state : { index, playing: false, progress: 0 };
    }
    case 'playing': return { ...state, playing: action.value };
    case 'progress': return { ...state, progress: action.value };
  }
}
