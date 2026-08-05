/**
 * Podcast API client — audio briefing operations.
 *
 * Replaces the mock audio progress simulation with real podcast generation
 * and presigned S3 URL playback.
 */

import { API_URL } from '@/shared/config/api';
import { authFetch } from '@/shared/lib/authFetch';

export interface PodcastInfo {
  podcast_id: string;
  article_id: string;
  mbti_group: string;
  title: string;
  duration_seconds: number;
  s3_audio_uri: string;
  status: 'creating' | 'completed' | 'failed';
  created_at: string;
  voice_id: string;
  audio_url?: string;       // presigned URL (only from GET /api/podcast/{id})
  error_message?: string;
}

/**
 * Check if a podcast already exists for an article.
 * Returns the most recent completed podcast, or null.
 */
export async function getArticlePodcast(
  articleId: string,
  mbtiGroup?: string,
): Promise<PodcastInfo | null> {
  const res = await fetch(`${API_URL}/api/podcast/article/${encodeURIComponent(articleId)}`);

  if (!res.ok) return null;

  const data = await res.json();
  const podcasts: PodcastInfo[] = data.podcasts || [];

  // Find completed podcast matching MBTI group (or any completed)
  const match = podcasts.find(
    p => p.status === 'completed' && (!mbtiGroup || p.mbti_group === mbtiGroup),
  ) || podcasts.find(p => p.status === 'completed');

  return match || null;
}

/**
 * Get podcast details including presigned audio URL.
 */
export async function getPodcast(podcastId: string): Promise<PodcastInfo | null> {
  const res = await fetch(`${API_URL}/api/podcast/${encodeURIComponent(podcastId)}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Request podcast generation for an article.
 * Returns immediately with podcast_id and status='creating'.
 */
export async function generatePodcast(
  articleId: string,
  mbtiGroup: string,
): Promise<PodcastInfo> {
  // /generate calls Bedrock-Haiku + Polly per request — auth required so the
  // endpoint isn't an open cost vector for unauthenticated callers. Read
  // routes (article, get, list) stay anonymous.
  const res = await authFetch(`${API_URL}/api/podcast/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_id: articleId, mbti_group: mbtiGroup }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Podcast generation failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Poll podcast status until completed or failed.
 * Returns the completed podcast with audio_url, or throws on failure/timeout.
 *
 * @param podcastId - Podcast ID from generatePodcast
 * @param intervalMs - Poll interval (default 5000ms)
 * @param timeoutMs - Max wait time (default 120000ms = 2 minutes)
 */
export async function waitForPodcast(
  podcastId: string,
  intervalMs: number = 5000,
  timeoutMs: number = 120000,
): Promise<PodcastInfo> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const podcast = await getPodcast(podcastId);

    if (!podcast) {
      throw new Error('Podcast not found');
    }

    if (podcast.status === 'completed' && podcast.audio_url) {
      return podcast;
    }

    if (podcast.status === 'failed') {
      throw new Error(podcast.error_message || 'Podcast generation failed');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Podcast generation timed out (2 minutes)');
}

/**
 * List podcasts for a date.
 */
export async function listPodcastsByDate(
  date: string,
): Promise<PodcastInfo[]> {
  const res = await fetch(`${API_URL}/api/podcast/list?date=${encodeURIComponent(date)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.podcasts || [];
}
