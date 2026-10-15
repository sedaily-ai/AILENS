import { describe, expect, it } from 'vitest';
import { playerReducer, type PlayerState } from './playerState';

describe('home player track transitions', () => {
  const playing: PlayerState = { index: 1, playing: true, progress: 0.6 };

  it('stops the playback display and clears progress only when the selected track changes', () => {
    expect(playerReducer(playing, { type: 'index', next: 2 })).toEqual({ index: 2, playing: false, progress: 0 });
    expect(playerReducer(playing, { type: 'index', next: 1 })).toBe(playing);
    expect(playing).toEqual({ index: 1, playing: true, progress: 0.6 });
  });

  it('applies queued next/previous requests to the latest track and preserves wrapping', () => {
    let state = playerReducer(playing, { type: 'index', next: (i) => (i + 1) % 3 });
    state = playerReducer(state, { type: 'index', next: (i) => (i + 1) % 3 });
    expect(state.index).toBe(0);
    state = playerReducer(state, { type: 'index', next: (i) => (i - 1 + 3) % 3 });
    expect(state).toEqual({ index: 2, playing: false, progress: 0 });
  });

  it('keeps the current position when paused and resumes without changing the track', () => {
    let state = playerReducer(playing, { type: 'playing', value: false });
    expect(state).toEqual({ index: 1, playing: false, progress: 0.6 });
    state = playerReducer(state, { type: 'playing', value: true });
    state = playerReducer(state, { type: 'progress', value: 0.7 });
    expect(state).toEqual({ index: 1, playing: true, progress: 0.7 });
  });
});
