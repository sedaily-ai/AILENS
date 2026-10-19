import { describe, expect, it, vi } from 'vitest';
vi.mock('@/entities/user', () => ({ useAuth: () => ({}) }));
vi.mock('@/shared/lib/api/archiveApi', () => ({ listArchiveSentences: vi.fn(), deleteArchiveSentence: vi.fn() }));
import { ARCHIVE_PAGE_SIZE, appendArchivePage, mergeArchiveFirstPage } from './useDashboardArchive';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';

// i가 클수록 오래된 문장(저장 시각을 1분씩 앞당긴다).
const sentence = (i: number): ArchiveSentenceResponse => ({
  id: `s${i}`, text: `문장 ${i}`, article_id: `a${i}`, article_title: `기사 ${i}`, article_published_at: '2026-10-01T00:00:00+00:00',
  created_at: new Date(Date.UTC(2026, 9, 19, 12, 0) - i * 60000).toISOString(),
});
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => sentence(from + k));

describe('내 서랍 이전 문장 더 보기', () => {
  it('다음 묶음을 붙이고 경계 시각으로 다시 온 문장은 한 번만 남긴다', () => {
    const first = range(0, ARCHIVE_PAGE_SIZE);
    const page = range(ARCHIVE_PAGE_SIZE - 1, ARCHIVE_PAGE_SIZE * 2 - 1); // 첫 묶음의 마지막 문장이 다시 포함됨
    const result = appendArchivePage(first, page);
    expect(result.sentences).toHaveLength(ARCHIVE_PAGE_SIZE * 2 - 1);
    expect(new Set(result.sentences.map((item) => item.id)).size).toBe(result.sentences.length);
    expect(result.hasMore).toBe(true);
  });

  it('덜 찬 묶음이나 새 문장이 없는 묶음이면 끝으로 본다', () => {
    const first = range(0, ARCHIVE_PAGE_SIZE);
    expect(appendArchivePage(first, range(ARCHIVE_PAGE_SIZE, ARCHIVE_PAGE_SIZE + 3)).hasMore).toBe(false);
    expect(appendArchivePage(first, first).hasMore).toBe(false);
  });

  it('첫 묶음을 다시 받아도 더 보기로 불러온 오래된 문장은 유지한다', () => {
    const loaded = range(0, ARCHIVE_PAGE_SIZE + 50);
    const refreshed = [sentence(-1), ...range(0, ARCHIVE_PAGE_SIZE - 1)]; // 새 문장 1개가 앞에 추가됨
    const merged = mergeArchiveFirstPage(refreshed, loaded);
    expect(merged[0].id).toBe('s-1');
    expect(merged.map((item) => item.id)).toContain(`s${ARCHIVE_PAGE_SIZE + 49}`);
    expect(new Set(merged.map((item) => item.id)).size).toBe(merged.length);
  });

  it('첫 묶음이 다 차지 않았으면 그것이 전체 목록이다(삭제된 옛 문장을 되살리지 않는다)', () => {
    const loaded = range(0, ARCHIVE_PAGE_SIZE + 10);
    const refreshed = range(0, 5);
    expect(mergeArchiveFirstPage(refreshed, loaded)).toEqual(refreshed);
  });
});
