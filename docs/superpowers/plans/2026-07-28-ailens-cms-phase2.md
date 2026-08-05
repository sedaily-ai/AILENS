# AI LENS CMS — 2단계 (CMS 화면 + 프론트 머지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `mbti-admin.sedaily.ai` 에서 글을 쓰고 발행하면 `ailens.sedaily.ai`
레터 목록에 나타난다. 이 계획이 끝나면 문영광님께 보여줄 데모가 완성된다.

**Architecture:** 기존 admin Next 앱에 `/posts` 목록과 `/posts/edit` 에디터를 더한다.
사용자 프론트는 `fetchTodayLetters` 가 기존 `today-letters` 와 신규 `/api/v2/posts` 를
**병렬로** 불러 합친다 — 기존 읽기 경로를 수정하지 않으므로 머지만 꺼도 즉시 롤백된다.

**Tech Stack:** Next.js 16.2.4 + React 19.2.4 + Tailwind v4 (config-less), TypeScript,
정적 export.

스펙: [`docs/superpowers/specs/2026-07-27-ailens-cms-design.md`](../specs/2026-07-27-ailens-cms-design.md)
선행: [`2026-07-27-ailens-cms-phase0-1.md`](2026-07-27-ailens-cms-phase0-1.md) (백엔드 API 완료)

## Global Constraints

- 커밋 트레일러는 **정확히** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **`admin/AGENTS.md` 하드 룰**: "This is NOT the Next.js you know" — 코드를 쓰기 전에
  `admin/node_modules/next/dist/docs/` 의 관련 문서를 읽는다. 학습 데이터의 Next 관례를
  그대로 쓰지 않는다.
- **정적 export 제약** (문서 `01-app/02-guides/static-exports.md` 확인함): 동적 라우트·
  Server Actions·쿠키·rewrites·Image 기본 loader 전부 **불가**. 그래서:
  - 라우팅은 **쿼리 파라미터** — `/posts/edit?id=<uuid>` (동적 세그먼트 금지)
  - `useSearchParams` 를 쓰는 페이지는 **`<Suspense>` 로 감싼다** (기존 `prompts/edit` 패턴)
- **zero-new-dependency 정책** — `admin/CLAUDE.md`. 새 npm 패키지를 넣지 않는다.
  절약되는 코드가 ~100줄을 넘을 때만 예외이고, 이 계획엔 해당 없음.
- **Tailwind v4 는 config 파일이 없다.** 테마는 `src/app/globals.css` 의 `@theme inline`.
  기존 유틸 재사용: `glass-panel` `glass-panel-strong` `glass-input` `glass-thead`
  `glass-divider` `glass-row-hover` `glass-nav`.
- `any` 금지. 게이트: `npx tsc --noEmit` + `npm run build` (admin·frontend 양쪽).
- 프론트(`service/frontend`)는 FSD — `shared/lib` 수정은 최소 지점만.
- 백엔드 API 는 이미 배포돼 있다. 응답 스키마는 `service/backend/admin/routes/posts.py` 와
  `service/backend/v2/handlers/cms_posts_public.py` 가 정본.

## File Structure

| 파일 | 책임 |
|---|---|
| `admin/src/lib/types.ts` | `CmsPost` 등 타입 추가 (기존 파일 확장) |
| `admin/src/lib/adminClient.ts` | posts 7개 엔드포인트 래퍼 추가 (기존 파일 확장) |
| `admin/src/app/(authenticated)/posts/page.tsx` | 목록 — 필터·상태 뱃지·새 글 진입 |
| `admin/src/app/(authenticated)/posts/edit/page.tsx` | 에디터 — 구조화 폼 + 발행 액션 |
| `admin/src/components/PostForm.tsx` | 폼 본체. 3단계의 AI 레터 편집기와 공유할 단위 |
| `admin/src/components/Nav.tsx` | CMS 메뉴 1줄 추가 |
| `service/frontend/src/shared/lib/cmsPostsApi.ts` | 공개 posts fetch (신규, 얇음) |
| `service/frontend/src/shared/lib/todayLettersApi.ts` | 머지 지점 1곳 |

`PostForm` 을 페이지에서 분리하는 이유: 3단계에서 AI 레터 편집기가 같은 폼을 쓴다.
페이지에 인라인으로 두면 그때 복제가 생긴다.

---

### Task 1: 타입 + API 클라이언트

**Files:**
- Modify: `admin/src/lib/types.ts` (말미에 추가)
- Modify: `admin/src/lib/adminClient.ts` (`adminApi` 객체에 추가)

**Interfaces:**
- Consumes: 기존 `request<T>` 래퍼
- Produces (Task 2·3 이 사용): `CmsPost`, `CmsPostBody`, `CmsChannel`,
  `adminApi.listPosts/getPost/createPost/updatePost/publishPost/unpublishPost/deletePost`

- [ ] **Step 1: 타입 추가** — `admin/src/lib/types.ts` 말미에:

```typescript
// --- CMS posts (backend/admin/routes/posts.py 와 1:1) ---

export type CmsChannel = "letters" | "paper" | "feed";
export type CmsStatus = "draft" | "published" | "archived";
export type MbtiGroup = "NT" | "NF" | "ST" | "SF";

export interface CmsKeyword {
  term: string;
  explain: string;
}

export interface CmsImage {
  url: string;
  caption?: string;
}

export interface CmsPostBody {
  body: string[];
  key_points: string[];
  keywords: CmsKeyword[];
  images: CmsImage[];
}

export interface CmsPost {
  id: string;
  slug: string;
  status: CmsStatus;
  channels: CmsChannel[];
  publish_date: string;
  mbti_group: MbtiGroup | null;
  editor_id: string | null;
  headline: string;
  subtitle: string | null;
  closing_line: string | null;
  body_inline: CmsPostBody;
  cover_image_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 생성·수정 payload — 부분 수정이므로 전부 선택적. */
export interface CmsPostInput {
  headline?: string;
  subtitle?: string | null;
  closing_line?: string | null;
  publish_date?: string;
  channels?: CmsChannel[];
  mbti_group?: MbtiGroup | null;
  editor_id?: string | null;
  body_inline?: CmsPostBody;
  cover_image_url?: string | null;
}
```

- [ ] **Step 2: API 래퍼 추가** — `admin/src/lib/adminClient.ts` 의 import 블록에
`CmsPost`, `CmsPostInput` 을 추가하고, `adminApi` 객체의 `getNewsletterStats` 다음에:

```typescript
  // CMS posts
  listPosts: (params?: { status?: string; channel?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.channel) qs.set("channel", params.channel);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ posts: CmsPost[]; count: number }>(`/admin/posts${suffix}`);
  },
  getPost: (id: string) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}`),
  createPost: (input: CmsPostInput) =>
    request<{ post: CmsPost }>("/admin/posts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updatePost: (id: string, input: CmsPostInput) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  publishPost: (id: string) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    }),
  unpublishPost: (id: string) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}/unpublish`, {
      method: "POST",
    }),
  deletePost: (id: string) =>
    request<{ ok: boolean }>(`/admin/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
```

- [ ] **Step 3: 타입 게이트**

Run: `cd admin && npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 4: Commit**

```bash
git add admin/src/lib/types.ts admin/src/lib/adminClient.ts
git commit -m "feat(admin): CMS posts 타입 + API 클라이언트 7개 엔드포인트

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 글 목록 화면 `/posts`

**Files:**
- Create: `admin/src/app/(authenticated)/posts/page.tsx`
- Modify: `admin/src/components/Nav.tsx` (NAV_ITEMS 1줄)

**Interfaces:**
- Consumes: `adminApi.listPosts` (Task 1)
- Produces: `/posts` 라우트. `/posts/edit?id=` 로 진입 (Task 3 이 받음)

- [ ] **Step 1: 목록 페이지 작성** — `admin/src/app/(authenticated)/posts/page.tsx` 신규.
기존 `prompts/page.tsx` 의 로딩·에러 패턴을 그대로 따른다:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import type { CmsPost, CmsStatus } from "@/lib/types";

const STATUS_LABEL: Record<CmsStatus, string> = {
  draft: "초안",
  published: "발행",
  archived: "보관",
};

const STATUS_STYLE: Record<CmsStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-300",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  archived: "bg-amber-50 text-amber-700 ring-amber-300",
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "draft", label: "초안" },
  { key: "published", label: "발행" },
];

export default function PostsPage() {
  const [posts, setPosts] = useState<CmsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback((s: string) => {
    setPosts(null);
    setError(null);
    adminApi
      .listPosts(s ? { status: s } : undefined)
      .then((r) => setPosts(r.posts))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load(status);
  }, [status, load]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          콘텐츠{" "}
          {posts && (
            <span className="text-slate-600 font-normal text-lg">
              ({posts.length})
            </span>
          )}
        </h1>
        <Link
          href="/posts/edit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          새 글 쓰기
        </Link>
      </div>

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
              status === f.key
                ? "bg-white/70 text-blue-700 ring-1 ring-blue-500/15"
                : "text-slate-700 hover:bg-white/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!posts && !error && <p className="text-sm text-slate-600">로드 중...</p>}

      {posts && posts.length === 0 && (
        <div className="glass-panel rounded-2xl px-6 py-16 text-center">
          <p className="text-sm text-slate-600">아직 글이 없습니다.</p>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="glass-thead">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-800">제목</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-800">상태</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-800">채널</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-800">발행일</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b glass-divider last:border-0 glass-row-hover transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/posts/edit?id=${encodeURIComponent(p.id)}`}
                      className="text-blue-700 hover:text-blue-900 hover:underline font-medium"
                    >
                      {p.headline}
                    </Link>
                    {p.editor_id && (
                      <span className="ml-2 text-xs text-slate-500">{p.editor_id}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">
                    {p.channels.length ? p.channels.join(", ") : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums">
                    {p.publish_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Nav 에 메뉴 추가** — `admin/src/components/Nav.tsx` 의 `NAV_ITEMS` 에서
`{ href: "/", label: "대시보드" },` 다음 줄에 삽입:

```tsx
  { href: "/posts", label: "콘텐츠" },
```

- [ ] **Step 3: 게이트**

Run: `cd admin && npx tsc --noEmit && npm run build`
Expected: 타입 에러 0, 빌드 성공. export 목록에 `/posts` 포함.

- [ ] **Step 4: Commit**

```bash
git add admin/src/app/\(authenticated\)/posts/page.tsx admin/src/components/Nav.tsx
git commit -m "feat(admin): CMS 글 목록 화면 + 네비게이션 진입점

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 에디터 화면 `/posts/edit`

**Files:**
- Create: `admin/src/components/PostForm.tsx`
- Create: `admin/src/app/(authenticated)/posts/edit/page.tsx`

**Interfaces:**
- Consumes: `adminApi.getPost/createPost/updatePost/publishPost/unpublishPost/deletePost`,
  `useToast`
- Produces: `PostForm` 컴포넌트 (3단계 AI 레터 편집기가 재사용).
  props: `{ value: CmsPostInput; onChange: (v: CmsPostInput) => void; }`

- [ ] **Step 1: `PostForm.tsx` 작성** — 구조화 폼 본체. 문단·핵심정리·키워드는 배열 편집:

```tsx
"use client";

import type {
  CmsChannel,
  CmsKeyword,
  CmsPostInput,
  MbtiGroup,
} from "@/lib/types";

const CHANNELS: Array<{ key: CmsChannel; label: string; hint: string }> = [
  { key: "letters", label: "레터 피드", hint: "메인 오늘의 레터 목록" },
  { key: "paper", label: "오늘의 1면", hint: "/paper 지면 목록" },
  { key: "feed", label: "기사 피드", hint: "피드 상단 고정" },
];

// 정본 4인 (CLAUDE.md — 민철/하은/준서/소율). 비우면 'AI LENS 편집팀' 명의.
const EDITORS: Array<{ id: string; group: MbtiGroup; label: string }> = [
  { id: "민철", group: "NT", label: "민철 (NT · 전략 분석)" },
  { id: "하은", group: "NF", label: "하은 (NF · 오피니언)" },
  { id: "준서", group: "ST", label: "준서 (ST · 팩트 큐레이션)" },
  { id: "소율", group: "SF", label: "소율 (SF · 트렌드)" },
];

const LABEL = "block text-xs font-semibold text-slate-700 mb-1.5";

interface Props {
  value: CmsPostInput;
  onChange: (v: CmsPostInput) => void;
}

function StringList({
  label,
  hint,
  items,
  onChange,
  textarea,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (next: string[]) => void;
  textarea?: boolean;
}) {
  const set = (i: number, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <label className={LABEL}>
        {label}
        {hint && <span className="ml-2 font-normal text-slate-500">{hint}</span>}
      </label>
      <div className="space-y-2">
        {items.map((v, i) => (
          <div key={i} className="flex gap-2 items-start">
            {textarea ? (
              <textarea
                value={v}
                onChange={(e) => set(i, e.target.value)}
                rows={3}
                className="glass-input flex-1 rounded-lg px-3 py-2 text-sm"
              />
            ) : (
              <input
                value={v}
                onChange={(e) => set(i, e.target.value)}
                className="glass-input flex-1 rounded-lg px-3 py-2 text-sm"
              />
            )}
            <div className="flex flex-col gap-1 pt-0.5">
              <button type="button" onClick={() => move(i, -1)}
                className="text-xs px-1.5 text-slate-500 hover:text-slate-900">↑</button>
              <button type="button" onClick={() => move(i, 1)}
                className="text-xs px-1.5 text-slate-500 hover:text-slate-900">↓</button>
              <button type="button" onClick={() => remove(i)}
                className="text-xs px-1.5 text-slate-500 hover:text-red-600">×</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="text-xs font-medium text-blue-700 hover:text-blue-900"
        >
          + 추가
        </button>
      </div>
    </div>
  );
}

export function PostForm({ value, onChange }: Props) {
  const body = value.body_inline ?? {
    body: [],
    key_points: [],
    keywords: [],
    images: [],
  };
  const patch = (p: Partial<CmsPostInput>) => onChange({ ...value, ...p });
  const patchBody = (p: Partial<typeof body>) =>
    patch({ body_inline: { ...body, ...p } });

  const toggleChannel = (c: CmsChannel) => {
    const cur = value.channels ?? [];
    patch({
      channels: cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
    });
  };

  const setKeyword = (i: number, k: Partial<CmsKeyword>) =>
    patchBody({
      keywords: body.keywords.map((x, idx) => (idx === i ? { ...x, ...k } : x)),
    });

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div>
          <label className={LABEL}>제목 *</label>
          <input
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className={LABEL}>부제</label>
          <input
            value={value.subtitle ?? ""}
            onChange={(e) => patch({ subtitle: e.target.value })}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>발행일 *</label>
            <input
              type="date"
              value={value.publish_date ?? ""}
              onChange={(e) => patch({ publish_date: e.target.value })}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className={LABEL}>
              에디터 명의
              <span className="ml-2 font-normal text-slate-500">
                비우면 AI LENS 편집팀
              </span>
            </label>
            <select
              value={value.editor_id ?? ""}
              onChange={(e) => {
                const ed = EDITORS.find((x) => x.id === e.target.value);
                patch({
                  editor_id: e.target.value || null,
                  mbti_group: ed ? ed.group : null,
                });
              }}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— 편집팀 명의 —</option>
              {EDITORS.map((ed) => (
                <option key={ed.id} value={ed.id}>{ed.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL}>노출 채널 *</label>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const on = (value.channels ?? []).includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleChannel(c.key)}
                  title={c.hint}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-all ${
                    on
                      ? "bg-blue-50 text-blue-700 ring-blue-300"
                      : "text-slate-600 ring-slate-300 hover:bg-white/50"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 space-y-5">
        <StringList
          label="본문 문단 *"
          hint="한 칸이 한 문단"
          items={body.body}
          onChange={(v) => patchBody({ body: v })}
          textarea
        />
        <StringList
          label="핵심 정리"
          items={body.key_points}
          onChange={(v) => patchBody({ key_points: v })}
        />
        <div>
          <label className={LABEL}>키워드</label>
          <div className="space-y-2">
            {body.keywords.map((k, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={k.term}
                  placeholder="용어"
                  onChange={(e) => setKeyword(i, { term: e.target.value })}
                  className="glass-input w-40 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={k.explain}
                  placeholder="설명"
                  onChange={(e) => setKeyword(i, { explain: e.target.value })}
                  className="glass-input flex-1 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    patchBody({ keywords: body.keywords.filter((_, x) => x !== i) })
                  }
                  className="text-xs px-2 text-slate-500 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchBody({ keywords: [...body.keywords, { term: "", explain: "" }] })
              }
              className="text-xs font-medium text-blue-700 hover:text-blue-900"
            >
              + 추가
            </button>
          </div>
        </div>
        <div>
          <label className={LABEL}>닫는 줄</label>
          <input
            value={value.closing_line ?? ""}
            onChange={(e) => patch({ closing_line: e.target.value })}
            className="glass-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 에디터 페이지 작성** — `admin/src/app/(authenticated)/posts/edit/page.tsx`.
`useSearchParams` 를 쓰므로 **`<Suspense>` 래퍼 필수** (정적 export 규칙):

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm } from "@/components/PostForm";
import type { CmsPost, CmsPostInput } from "@/lib/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

const EMPTY: CmsPostInput = {
  headline: "",
  subtitle: "",
  closing_line: "",
  channels: ["letters"],
  editor_id: null,
  mbti_group: null,
  body_inline: { body: [""], key_points: [], keywords: [], images: [] },
};

// useSearchParams 는 클라이언트 사이드 only — static export 시 Suspense boundary 필수.
export default function PostEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">글</h1>
          <p className="text-sm text-slate-600">로드 중...</p>
        </div>
      }
    >
      <PostEditPage />
    </Suspense>
  );
}

function PostEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const isNew = !id;
  const toast = useToast();

  const [draft, setDraft] = useState<CmsPostInput>({
    ...EMPTY,
    publish_date: todayKST(),
  });
  const [saved, setSaved] = useState<CmsPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getPost(id)
      .then(({ post }) => {
        if (cancelled) return;
        setSaved(post);
        setDraft({
          headline: post.headline,
          subtitle: post.subtitle ?? "",
          closing_line: post.closing_line ?? "",
          publish_date: post.publish_date,
          channels: post.channels,
          mbti_group: post.mbti_group,
          editor_id: post.editor_id,
          body_inline: post.body_inline,
        });
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const guard = (): string | null => {
    if (!(draft.headline ?? "").trim()) return "제목을 입력하세요";
    if (!(draft.publish_date ?? "").trim()) return "발행일을 선택하세요";
    if (!(draft.channels ?? []).length) return "노출 채널을 최소 1개 고르세요";
    return null;
  };

  const save = async () => {
    const bad = guard();
    if (bad) return toast.show(bad, "error");
    setBusy(true);
    try {
      if (isNew) {
        const { post } = await adminApi.createPost(draft);
        toast.show("저장했습니다", "success");
        router.replace(`/posts/edit?id=${encodeURIComponent(post.id)}`);
      } else {
        const { post } = await adminApi.updatePost(id, draft);
        setSaved(post);
        toast.show("저장했습니다", "success");
      }
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<{ post: CmsPost }>, msg: string) => {
    setBusy(true);
    try {
      const { post } = await fn();
      setSaved(post);
      toast.show(msg, "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.deletePost(id);
      toast.show("삭제했습니다", "success");
      router.push("/posts");
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">글</h1>
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/posts" className="text-sm text-blue-700 hover:underline">
          ← 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <Link href="/posts" className="text-sm text-slate-600 hover:text-slate-900">
            ← 목록
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
            {isNew ? "새 글" : "글 수정"}
          </h1>
          {saved && (
            <p className="mt-1 text-xs text-slate-500">
              {saved.status === "published" ? "발행됨" : "초안"} · {saved.slug}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            저장
          </button>
          {saved && saved.status !== "published" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => adminApi.publishPost(saved.id), "발행했습니다")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              발행
            </button>
          )}
          {saved && saved.status === "published" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => adminApi.unpublishPost(saved.id), "내렸습니다")}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              내리기
            </button>
          )}
          {saved && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:text-red-600 hover:ring-red-300 disabled:opacity-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <PostForm value={draft} onChange={setDraft} />
    </div>
  );
}
```

- [ ] **Step 3: 게이트**

Run: `cd admin && npx tsc --noEmit && npm run build`
Expected: 타입 에러 0, 빌드 성공. export 목록에 `/posts/edit` 포함.

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/PostForm.tsx admin/src/app/\(authenticated\)/posts/edit/page.tsx
git commit -m "feat(admin): CMS 에디터 화면 — 구조화 폼 + 발행/내림/삭제

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 사용자 프론트 머지

**Files:**
- Create: `service/frontend/src/shared/lib/cmsPostsApi.ts`
- Modify: `service/frontend/src/shared/lib/todayLettersApi.ts` (fetch 지점 1곳)

**Interfaces:**
- Consumes: `API_URL` (`@/shared/config/api`), 공개 API 응답 (`cms_posts_public.py` 가 정본)
- Produces: `fetchCmsPosts(channel, date?)` — 실패 시 **빈 배열**을 반환한다(throw 하지
  않음). 머지 실패가 기존 레터 렌더를 막지 않게 하기 위함 (spec §8 fail-open).

- [ ] **Step 1: `cmsPostsApi.ts` 작성**

```typescript
/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { API_URL } from '@/shared/config/api';
import type { ApiLetter } from './todayLettersApi';

export type CmsChannel = 'letters' | 'paper' | 'feed';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

export async function fetchCmsPosts(
  channel: CmsChannel,
  date?: string,
): Promise<CmsLetter[]> {
  try {
    const qs = new URLSearchParams({ channel });
    if (date) qs.set('date', date);
    const res = await fetch(`${API_URL}/api/v2/posts?${qs}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsLetter[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: `todayLettersApi.ts` 에 머지 삽입**

파일 상단 import 블록에 추가:

```typescript
import { fetchCmsPosts } from './cmsPostsApi';
```

`fetchTodayLetters` 의 `promise` IIFE 본문을 아래로 교체한다. 기존 fetch 로직은 그대로
두고 `Promise.all` 로 감싸는 것이 전부다 (L88-95 부근):

```typescript
  const promise = (async () => {
    // 라이브 단일 소스 (mock fallback 제거 2026-07-24). 해당 날짜에 레터가
    // 없으면 API 가 letters:[] 를 반환 — 호출측이 빈 상태/직전일 lookback 처리.
    const qs = date ? `?date=${date}` : '';

    // CMS 수동 글을 함께 부른다. 순차가 되지 않게 Promise.all 로 묶는다.
    // fetchCmsPosts 는 실패해도 throw 하지 않고 [] 를 주므로, CMS 가 죽어도
    // 기존 레터는 그대로 렌더된다 (spec §8 fail-open).
    const [res, cmsPosts] = await Promise.all([
      fetch(`${API_BASE}/api/v2/today-letters${qs}`),
      fetchCmsPosts('letters', date),
    ]);

    if (!res.ok) {
      throw new Error(`today-letters API ${res.status}`);
    }
    const data = (await res.json()) as ApiTodayLettersResponse;

    // 관리자가 쓴 글을 앞에 배치 — 편집 의도가 AI 레터보다 우선한다.
    return cmsPosts.length
      ? { ...data, letters: [...cmsPosts, ...data.letters] }
      : data;
  })();
```

**확인 포인트 2가지**: ① 두 fetch 가 `Promise.all` 로 병렬인가 ② CMS 실패가 기존 레터
렌더를 막지 않는가. 캐시(`lettersCache`)는 병합된 결과를 담게 되며, 기존 무효화 동작은
그대로다.

- [ ] **Step 3: 게이트**

Run: `cd service/frontend && npx tsc --noEmit && npm run build`
Expected: 타입 에러 0, 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add service/frontend/src/shared/lib/cmsPostsApi.ts \
        service/frontend/src/shared/lib/todayLettersApi.ts
git commit -m "feat(frontend): CMS 글을 레터 피드에 머지 (fail-open)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 배포 + 엔드투엔드 확인 (운영 — 사용자 확인 게이트)

**Files:** 없음 (배포 절차). **각 배포 전 사용자에게 알린다.**

- [ ] **Step 1: admin 프론트 배포**

Run: `cd admin && ./deploy-admin.sh`
Expected: S3 sync + CloudFront invalidation 성공

- [ ] **Step 2: 사용자 프론트 배포**

Run: `cd service/frontend && ./deploy.sh`
Expected: 성공

- [ ] **Step 3: 엔드투엔드 — 브라우저 없이 확인 가능한 부분**

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
curl -s -o /dev/null -w 'admin 사이트 → %{http_code}\n' https://mbti-admin.sedaily.ai/posts
curl -s -o /dev/null -w '사용자 사이트 → %{http_code}\n' https://ailens.sedaily.ai/
curl -s "$B/api/v2/posts?channel=letters" | python3 -m json.tool | head -5
```

Expected: 200 / 200 / `posts` 배열

- [ ] **Step 4: 수동 확인 (사용자)**

`https://mbti-admin.sedaily.ai/posts` 에서 글 작성 → 발행 → `https://ailens.sedaily.ai/`
레터 목록에 나타나는지 확인. 이 단계가 문영광님께 보여줄 데모다.

- [ ] **Step 5: 회귀 확인**

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
for p in /api/v2/today-letters /api/v2/front-page; do
  curl -s -o /dev/null -w "$p → %{http_code}\n" "$B$p"
done
```

Expected: 둘 다 200

---

## 실행 순서 요약

Task 1(타입·클라이언트) → 2(목록) → 3(에디터) → 4(프론트 머지) → 5(배포·확인).

Task 4 는 1~3 과 독립적이라 병행 가능하나, Task 5 전에는 전부 끝나 있어야 한다.

## 다음 계획

3단계(AI 레터 편집 + 이미지 업로드)는 별도 계획서로 작성한다. 이미지 업로드는 S3 버킷
생성과 CloudFront behavior 추가가 걸려 있어 AWS 승인 게이트가 다시 필요하다.
