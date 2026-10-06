// 한글 조사 자동 선택 — "웹툰으로/레터로", "웹툰은/레터는"처럼 받침에 따라 바꾼다.
// 단어 마지막 글자가 한글 음절이 아니면(숫자·영문 등) 받침이 없는 것으로 본다.
function finalConsonant(word: string): number {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return 0;
  return code % 28; // 0 = 받침 없음, 8 = ㄹ
}

/** 으로/로 — 받침이 없거나 ㄹ이면 "로", 그 외엔 "으로". */
export function euro(word: string): string {
  const f = finalConsonant(word);
  return f === 0 || f === 8 ? '로' : '으로';
}

/** 은/는 */
export function eunneun(word: string): string {
  return finalConsonant(word) === 0 ? '는' : '은';
}
