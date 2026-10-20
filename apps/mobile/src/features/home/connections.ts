// "이어져요" — 최근 읽은 글과 같은 분야이면서 아직 안 읽은 기사를 이유 문구와 함께 고른다(순수 함수).
export interface PostLike {
  id: string;
  headline: string;
  category?: string | null;
  date?: string;
  photo_image_url?: string | null;
}
export interface ReadRef {
  id: string;
  title: string;
  category?: string | null;
  at: number;
}
export interface Connection {
  post: PostLike;
  /** "어제 읽은 글과 이어져요 · 시그널" 같은 한 줄. */
  reason: string;
  from: ReadRef;
}

/** 가장 최근에 읽은 글(분야가 있는 것)에서 시작해, 같은 분야의 안 읽은 기사 최대 limit 건. 읽은 글이 없으면 빈 배열. */
export function connections(posts: PostLike[], read: ReadRef[], limit = 2, now = Date.now()): Connection[] {
  const readIds = new Set(read.map((r) => r.id));
  const recent = read.filter((r) => r.category).sort((a, b) => b.at - a.at);
  const out: Connection[] = [];
  const used = new Set<string>();
  for (const from of recent) {
    if (out.length >= limit) break;
    const hit = posts.find((p) => p.category === from.category && !readIds.has(p.id) && !used.has(p.id));
    if (!hit) continue;
    used.add(hit.id);
    const days = Math.floor((now - from.at) / 86400000);
    const when = days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
    out.push({ post: hit, from, reason: `${when} 읽은 글과 이어져요 · ${from.category}` });
  }
  return out;
}
