import { describe, expect, it } from 'vitest';
import { EDITORS, editorsOfLetter } from './editors';

describe('레터의 실제 작성자', () => {
  it('주제만 겹치는 에디터를 작성자로 표시하지 않는다', () => {
    const letter = { topics: EDITORS[0].topics.map(topic => topic.name), editors: [] };
    expect(editorsOfLetter(letter)).toEqual([]);
    expect(editorsOfLetter({})).toEqual([]);
  });
  it('서버의 작성자 순서를 유지하며 중복·미등록 작성자를 제외한다', () => {
    expect(editorsOfLetter({ editors: [EDITORS[1].id, EDITORS[0].id, EDITORS[1].id, 'unknown'] }).map(editor => editor.id))
      .toEqual([EDITORS[1].id, EDITORS[0].id]);
  });
});
