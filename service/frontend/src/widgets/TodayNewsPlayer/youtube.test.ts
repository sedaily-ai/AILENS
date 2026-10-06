import { describe, expect, it } from 'vitest';
import { extractYoutubeVideoId } from './youtube';

describe('extractYoutubeVideoId', () => {
  it('watch / youtu.be / embed / shorts 형태에서 id 추출', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=abc123')).toBe('abc123');
    expect(extractYoutubeVideoId('https://youtu.be/abc123?t=5')).toBe('abc123');
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/abc123')).toBe('abc123');
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/abc123')).toBe('abc123');
  });
  it('유튜브가 아니거나 잘못된 값은 null', () => {
    expect(extractYoutubeVideoId(null)).toBeNull();
    expect(extractYoutubeVideoId('not a url')).toBeNull();
    expect(extractYoutubeVideoId('https://example.com/a.mp3')).toBeNull();
    expect(extractYoutubeVideoId('https://www.youtube.com/channel/xyz')).toBeNull();
  });
});
