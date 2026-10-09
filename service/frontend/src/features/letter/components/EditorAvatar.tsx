import type { LetterEditor } from '../data/editors';

/** 이름 첫 글자를 담당 분야 색으로 보여 주는 원형 아바타(이미지가 생기기 전까지). */
export function EditorAvatar({ editor, size = 48 }: { editor: LetterEditor; size?: number }) {
  return (
    <span className="lt-avatar" aria-hidden style={{ width: size, height: size, background: editor.tone.bg, color: editor.tone.fg, fontSize: size * 0.42 }}>
      {editor.name.slice(0, 1)}
    </span>
  );
}
