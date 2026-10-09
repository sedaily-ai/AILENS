import Link from 'next/link';
import type { LetterEditor } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';

/** 목록 상단의 에디터 카드. 누르면 에디터 프로필(쓴 레터·구독)로 간다. */
export function EditorCard({ editor, count }: { editor: LetterEditor; count: number }) {
  return (
    <Link href={`/letter/editors/${editor.id}`} className="lt-ed-card">
      <EditorAvatar editor={editor} />
      <span className="lt-ed-name">{editor.name}<em>AI 에디터</em></span>
      <span className="lt-ed-title">{editor.title}</span>
      <span className="lt-ed-count">{count > 0 ? `레터 ${count}편` : '곧 첫 레터'}</span>
    </Link>
  );
}
