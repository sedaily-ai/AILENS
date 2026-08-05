import { API_URL } from "@/shared/config/api";
import type { CommunityPost, CommunityComment } from "@/features/community";
import { authFetch } from "@/shared/lib/authFetch";

const BASE = `${API_URL}/api/posts`;

// All write operations (create, vote, comment) go through `authFetch` so the
// Cognito ID token reaches the backend, which now derives `user_id` from the
// verified `sub` claim instead of trusting the body. Reads remain anonymous.

// ── Posts ────────────────────────────────────────────────────────────────────

export async function fetchCommunityPosts(
  date: string,
  tag?: string | null,
): Promise<CommunityPost[]> {
  const params = new URLSearchParams({ date, limit: "30" });
  if (tag) params.append("tag", tag);

  try {
    const res = await fetch(`${BASE}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts ?? []).map(apiPostToLocal);
  } catch {
    return [];
  }
}

export async function createCommunityPost(payload: {
  user_id: string;
  user_name: string;
  user_mbti: string;
  user_avatar: string;
  archived_sentence: string;
  user_comment: string;
  article_id?: string;
  article_title?: string;
  tags?: string[];
}): Promise<CommunityPost | null> {
  try {
    const res = await authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return apiPostToLocal(data);
  } catch {
    return null;
  }
}

// ── Votes ────────────────────────────────────────────────────────────────────

export async function votePost(
  postId: string,
  userId: string,
  voteType: "up" | "down",
): Promise<{ delta: number } | null> {
  try {
    const res = await authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vote", post_id: postId, user_id: userId, vote_type: voteType }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function fetchComments(postId: string): Promise<CommunityComment[]> {
  try {
    const res = await fetch(`${BASE}/${postId}?type=comments`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.comments ?? []).map(apiCommentToLocal);
  } catch {
    return [];
  }
}

export async function addComment(
  postId: string,
  payload: {
    user_id: string;
    user_name: string;
    user_mbti: string;
    user_avatar: string;
    text: string;
  },
): Promise<CommunityComment | null> {
  try {
    const res = await authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "comment", post_id: postId, ...payload }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return apiCommentToLocal(data);
  } catch {
    return null;
  }
}

// ── Mappers ──────────────────────────────────────────────────────────────────

interface ApiPost {
  id: string;
  userName: string;
  userMbti: string;
  userAvatar: string;
  archivedSentence: string;
  userComment: string;
  articleTitle: string;
  tags: string[];
  upvotes: number;
  commentCount: number;
  timeAgo: string;
}

interface ApiComment {
  id: string;
  userName: string;
  userMbti: string;
  userAvatar: string;
  text: string;
  likes: number;
  timeAgo: string;
}

function apiPostToLocal(p: ApiPost): CommunityPost {
  return {
    id: p.id,
    userName: p.userName,
    userMbti: p.userMbti,
    userAvatar: p.userAvatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${p.userName}&scale=90`,
    timeAgo: p.timeAgo,
    archivedSentence: p.archivedSentence,
    userComment: p.userComment,
    articleTitle: p.articleTitle,
    tags: p.tags ?? [],
    upvotes: p.upvotes ?? 0,
    commentCount: p.commentCount ?? 0,
    commentList: [],  // loaded lazily when expanded
  };
}

function apiCommentToLocal(c: ApiComment): CommunityComment {
  return {
    id: c.id,
    userName: c.userName,
    userMbti: c.userMbti,
    userAvatar: c.userAvatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${c.userName}&scale=90`,
    text: c.text,
    timeAgo: c.timeAgo,
    likes: c.likes ?? 0,
  };
}
