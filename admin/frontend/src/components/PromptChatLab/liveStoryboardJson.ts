/** 채팅 응답(스트리밍 중인 웹툰 스토리보드 JSON)의 부분 파싱 헬퍼 — PromptChatLab.tsx 에서 분리(리팩토링 7단계, 내용 불변). */
/* 2026-09-18, 사용자 요청 — "전체 출력을 하고나서.. 보정을 하네요(코드블럭에
   감싼다거나.. 구조를 깔끔하게 개선한다거나).. 실시간으로 바로바로
   디자인해야 합니다": 스트리밍 중엔 평문으로 보여주다 완성되면 DumpNode
   (코드블럭 포함)로 "바뀌는" 게 바로 그 "보정"이었다. 그래서 스트리밍
   중에도 완성본과 똑같이 DumpNode를 쓴다 — 아직 안 끝난 JSON 원문을
   최선을 다해(짝 안 맞는 따옴표·괄호를 보정해) 매 청크마다 다시 파싱해서,
   그 순간까지 들어온 필드만큼만 완성본과 동일한 디자인으로 보여준다.
   파싱 자체가 안 되는 극초반(예: 아직 "{"밖에 없음)에는 null을 돌려주고
   호출부가 "작성 중" 표시만 보여준다. */
export type JsonPath = Array<string | number>;

/** 스트리밍 원문(repair 전)에서 "지금 값이 채워지고 있는 자리"의 경로를
 *  추적한다 — 예: {"cuts":[{"camera":"클로즈"  ← 아직 안 끝남
 *  이면 ["cuts", 0, "camera"]를 돌려준다. DumpNode가 이 경로와 자기
 *  경로가 같은 필드만 "아직 쓰는 중"으로 보고 코드블럭 박스를 미룬다
 *  (2026-09-18, 사용자 요청 — "다 쓰고 나서 보정은 제가 원하는게
 *  아닙니다": 전체 응답이 아니라 필드 하나하나가 끝나는 시점마다
 *  자연스럽게 감싸야 한다는 뜻이라, "이 필드가 지금도 자라는 중인지"를
 *  알아야 한다). JSON이 완전히 닫혀 있으면(스택이 빈 상태) 빈 배열을
 *  돌려준다 — "지금 진행 중인 필드가 없다"는 뜻. */
export function computeInProgressPath(text: string): JsonPath {
  type Frame = { type: "obj"; key: string | null } | { type: "arr"; index: number };
  const stack: Frame[] = [];
  let inString = false;
  let escapeNext = false;
  let stringIsKey = false;
  let keyBuffer = "";
  let expectKeyNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
        const top = stack[stack.length - 1];
        if (stringIsKey) {
          if (top && top.type === "obj") top.key = keyBuffer;
        } else if (top && top.type === "obj") {
          // 문자열 "값"이 닫혔다 — 콤마/닫는 중괄호를 기다릴 것 없이 이
          // 키는 지금 이 순간 완성이다(카메라/장면처럼 값이 항상 문자열인
          // 필드가 대부분이라, 이 시점을 놓치면 다음 키가 시작될 때까지
          // "아직 쓰는 중"으로 잘못 붙잡아 두게 된다).
          top.key = null;
        }
      } else if (stringIsKey) {
        keyBuffer += ch;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    switch (ch) {
      case '"':
        inString = true;
        stringIsKey = !!(top && top.type === "obj" && expectKeyNext);
        keyBuffer = "";
        expectKeyNext = false;
        break;
      case "{":
        stack.push({ type: "obj", key: null });
        expectKeyNext = true;
        break;
      case "[":
        stack.push({ type: "arr", index: 0 });
        break;
      case "}":
      case "]":
        stack.pop();
        break;
      case ",":
        if (top?.type === "obj") {
          top.key = null;
          expectKeyNext = true;
        } else if (top?.type === "arr") {
          top.index += 1;
        }
        break;
      default:
        break;
    }
  }
  const path: JsonPath = [];
  for (const frame of stack) {
    if (frame.type === "obj") {
      if (frame.key != null) path.push(frame.key);
    } else {
      path.push(frame.index);
    }
  }
  return path;
}

export function pathsEqual(a: JsonPath, b: JsonPath): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/* 2026-09-18, 사용자 요청 — "전체 출력을 하고나서.. 보정을 하네요(코드블럭에
   감싼다거나.. 구조를 깔끔하게 개선한다거나).. 실시간으로 바로바로
   디자인해야 합니다" + (같은 날 후속) "다 쓰고 나서 보정은 제가 원하는게
   아닙니다": 스트리밍 중엔 평문으로 보여주다 완성되면 DumpNode(코드블럭
   포함)로 "바뀌는" 게 바로 그 "보정"이었다. 그래서 스트리밍 중에도
   완성본과 똑같이 DumpNode를 쓴다 — 아직 안 끝난 JSON 원문을 최선을
   다해(짝 안 맞는 따옴표·괄호를 보정해) 매 청크마다 다시 파싱해서, 그
   순간까지 들어온 필드만큼만 완성본과 동일한 디자인으로 보여준다.
   파싱 자체가 안 되는 극초반(예: 아직 "{"밖에 없음)에는 null을 돌려주고
   호출부가 "작성 중" 표시만 보여준다.

   다만 전체가 아니라 "필드 단위"로 완성 시점을 맞추려면(위 사용자 요청)
   응답 전체가 끝나기 전이라도 이미 다음 필드로 넘어간 필드는 완성된
   것으로 보고 코드블럭을 씌워야 한다 — 지금 한 글자씩 자라고 있는
   마지막 필드만 예외로 평문 유지한다. inProgressPath가 그 "지금 자라는
   중인 필드"의 경로다(computeInProgressPath 참고). */
export function tryParsePartialJson(raw: string): { value: unknown; inProgressPath: JsonPath } | null {
  let text = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "");
  if (!text) return null;
  const inProgressPath = computeInProgressPath(text);
  try {
    return { value: JSON.parse(text), inProgressPath };
  } catch {
    // 아래 보정 시도로 넘어간다
  }
  // 마지막에 안 닫힌 문자열(따옴표 개수가 홀수)이 있으면 그 시작 지점까지 잘라낸다.
  const quoteCount = (text.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 === 1) {
    text = text.slice(0, text.lastIndexOf('"'));
  }
  text = text.replace(/,\s*$/, "");
  // 값 없이 key만 덜렁 남은 경우(콜론 유무 무관) 그 key째로 버린다 —
  // "key"까지만 왔고 값이 아직 하나도 없으면 유효한 JSON을 못 만든다.
  text = text.replace(/,\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, "");
  text = text.replace(/,\s*$/, "");
  // 안 닫힌 { [ 를 스택으로 추적해 끝에 닫아준다(문자열 내부는 건너뜀).
  const closers: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (ch === "{" || ch === "[") closers.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") closers.pop();
  }
  while (closers.length) text += closers.pop();
  try {
    return { value: JSON.parse(text), inProgressPath };
  } catch {
    return null;
  }
}

/* 2026-09-20, 사용자 요청 — "스트리밍 중에도 이미 정리된 필드명으로
   보이게": 백엔드(routes/webtoon/script.py::normalize_cuts)는 전체
   JSON이 다 온 뒤에야 cut_id→cut, new_conclusion→narration, keyword→
   caption, headline→title, bubble_1/bubble_2→dialogue 같은 필드명
   정리를 한다. 스트리밍 중엔 위 tryParsePartialJson이 모델이 실제로
   쓰고 있는 원본 필드명(22장 스키마)을 그대로 돌려주므로, 스트리밍
   화면과 완성 후 storyboard 카드가 다른 필드명으로 보여 "다 쓰고 나서
   갑자기 정리된다"는 인상을 줬다(chat_ws.py::_stream_json_completion
   독스트링 참고 — 원래 의도된 설계였지만 사용자가 이 전환 자체를
   없애고 싶어함). 서버의 normalize_cuts()와 정확히 같은 규칙을
   여기서도 적용해 스트리밍 중에도 이미 정리된 필드명으로 보이게
   한다 — 서버 쪽 정규화는 그대로 둔다(최종 storyboard 메시지는 여전히
   서버가 만든다, 여긴 그 결과를 미리 보여주는 클라이언트 전용 거울). */
export function liveCutNumber(c: Record<string, unknown>): number | null {
  const n = c["cut"];
  if (typeof n === "number") return n;
  const cutId = c["cut_id"] ?? c["id"];
  if (typeof cutId === "string") {
    const digits = cutId.replace(/\D/g, "");
    if (digits) return parseInt(digits, 10);
  }
  return null;
}

export function liveFirstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export function liveDialogueFromBubbles(c: Record<string, unknown>): unknown[] {
  const existing = c["dialogue"];
  if (Array.isArray(existing) && existing.length) return existing;
  const lines: { speaker: string; line: string }[] = [];
  for (const key of ["bubble_1", "bubble_2"] as const) {
    const b = c[key];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      const bo = b as Record<string, unknown>;
      const text = bo["text"];
      if (typeof text === "string" && text) {
        const speakerRaw = bo["speaker"];
        const speaker = speakerRaw === "female" ? "A" : speakerRaw === "male" ? "B" : key;
        lines.push({ speaker, line: text });
      }
    }
  }
  return lines;
}

export function normalizeLiveCut(c: unknown): unknown {
  if (!c || typeof c !== "object" || Array.isArray(c)) return c;
  const co = c as Record<string, unknown>;
  return {
    cut: liveCutNumber(co),
    narration: liveFirstNonEmpty(co["narration"], co["new_conclusion"]),
    caption: liveFirstNonEmpty(co["caption"], co["keyword"]),
    closing_caption: (typeof co["closing_caption"] === "string" && co["closing_caption"]) || "",
    title: liveFirstNonEmpty(co["title"], co["headline"]),
    title_keyword: (typeof co["title_keyword"] === "string" && co["title_keyword"]) || "",
    dialogue: liveDialogueFromBubbles(co),
    image_prompt: (typeof co["image_prompt"] === "string" && co["image_prompt"]) || "",
  };
}

export function normalizeLiveParsed(
  parsed: { value: unknown; inProgressPath: JsonPath } | null
): { value: unknown; inProgressPath: JsonPath } | null {
  if (!parsed) return null;
  const v = parsed.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) return parsed;
  const vo = v as Record<string, unknown>;
  if (!Array.isArray(vo["cuts"])) return parsed;
  return { value: { ...vo, cuts: vo["cuts"].map(normalizeLiveCut) }, inProgressPath: parsed.inProgressPath };
}
