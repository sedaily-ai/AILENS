'use client';

import Link from 'next/link';
import type { LetterEditor } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';

/** 목록 상단의 에디터 카드. 카드를 누르면 프로필(겹치는 레터·구독)으로, 팔로우 버튼은 이 기기의 관심으로 저장한다. */
export function EditorCard({ editor, count, following, onToggle }: { editor: LetterEditor; count: number; following: boolean; onToggle: () => void }) {
  return (
    <div className="lt-ed-card" data-following={following}>
      <Link href={`/letter/editors/${editor.id}`} className="lt-ed-link" aria-label={`${editor.name} ${editor.role} 프로필`}>
        <EditorAvatar editor={editor} size={44} />
        <span className="lt-ed-name">{editor.name}<em>AI</em></span>
        <span className="lt-ed-role">{editor.role}</span>
        <span className="lt-ed-for">{editor.forWhom}</span>
        <span className="lt-ed-count">{count > 0 ? `겹치는 레터 ${count}편` : '곧 첫 레터'}</span>
      </Link>
      <button type="button" className="lt-ed-follow" aria-pressed={following} onClick={onToggle}>{following ? '팔로우 중' : '팔로우'}</button>
    </div>
  );
}
