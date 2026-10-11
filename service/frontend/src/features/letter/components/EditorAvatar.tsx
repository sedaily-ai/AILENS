import type { LetterEditor } from '../data/editors';

/** 프로필 이미지가 있으면 이미지로, 없으면 이름 첫 글자를 담당 영역 색으로 보여 주는 원형 아바타. */
export function EditorAvatar({ editor, size = 48 }: { editor: LetterEditor; size?: number }) {
  if (editor.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="lt-avatar lt-avatar-img" src={editor.image} alt="" width={size} height={size} style={{ width: size, height: size, background: editor.tone.bg }} />;
  }
  return (
    <span className="lt-avatar" aria-hidden style={{ width: size, height: size, background: editor.tone.bg, color: editor.tone.fg, fontSize: size * 0.42 }}>
      {editor.name.slice(0, 1)}
    </span>
  );
}
