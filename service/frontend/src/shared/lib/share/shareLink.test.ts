import { describe, expect, it, vi } from 'vitest';
import { shareLink, SHARE_MESSAGE } from './shareLink';

const data = { title: '기사 제목', url: 'https://ailens.sedaily.ai/economy/2026/10/19/a' };
const abort = () => Object.assign(new Error('Share canceled'), { name: 'AbortError' });

describe('기사 공유 결과', () => {
  it('터치 기기는 기기 공유 창을 쓰고, 완료하면 공유로 표시한다', async () => {
    const share = vi.fn().mockResolvedValue(undefined), copy = vi.fn();
    expect(await shareLink(data, { share, copy, touch: true })).toBe('shared');
    expect(share).toHaveBeenCalledWith(data);
    expect(copy).not.toHaveBeenCalled();
  });

  it('공유 창을 닫으면 취소로 끝내고 복사도 성공 안내도 하지 않는다', async () => {
    const copy = vi.fn();
    expect(await shareLink(data, { share: vi.fn().mockRejectedValue(abort()), copy, touch: true })).toBe('cancelled');
    expect(copy).not.toHaveBeenCalled();
    expect(SHARE_MESSAGE.cancelled).toBe('');
  });

  it('기기 공유가 취소 아닌 이유로 실패하면 링크 복사로 넘어간다', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { share: vi.fn().mockRejectedValue(new Error('NotAllowedError')), copy, touch: true })).toBe('copied');
    expect(copy).toHaveBeenCalledWith(data.url);
  });

  it('컴퓨터는 기기 공유 창 대신 링크를 복사한다', async () => {
    const share = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { share, copy, touch: false })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
  });

  it('복사에 실패하거나 복사 기능이 없으면 실패로 표시한다(성공으로 보이지 않는다)', async () => {
    expect(await shareLink(data, { copy: vi.fn().mockRejectedValue(new Error('denied')), touch: false })).toBe('failed');
    expect(await shareLink(data, { touch: false })).toBe('failed');
    expect(await shareLink(data, { share: vi.fn().mockRejectedValue(new Error('x')), touch: true })).toBe('failed');
    expect(SHARE_MESSAGE.failed).toContain('복사하지 못했어요');
    expect(SHARE_MESSAGE.copied).toBe('링크를 복사했어요');
  });
});
