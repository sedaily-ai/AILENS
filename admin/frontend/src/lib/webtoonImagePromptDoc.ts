/** webtoon_image.py::serialize_prompt_doc()/parse_prompt_doc()과 정확히 같은
 *  포맷이어야 한다(## STYLE / ## CHARACTER_FEMALE / ## CHARACTER_MALE /
 *  ## IMAGE_MODEL 헤딩) — 한쪽만 고치면 발행한 프롬프트를 파이프라인이 못
 *  읽는다.
 *
 *  WebtoonImageLab.tsx·WebtoonImageSettingsPanel.tsx 둘 다 이 포맷으로 발행
 *  문서를 조립한다(2026-09-16 리팩토링 감사로 중복 정의를 여기로 모음) —
 *  나머지 상태 관리(defaults/assets fetch, 업로드, 발행)는 두 화면의 실제
 *  기능이 갈라져 있어(예: 참조 이미지 갤러리는 WebtoonImageSettingsPanel에만
 *  있음) 그대로 각자 둔다.
 *
 *  imageModel(2026-09-20 추가) — 실제 발행 파이프라인(pipeline.py)이 다음
 *  기사부터 쓸 이미지 모델 id("sd_ultra" 등, webtoonImageModels.ts의
 *  IMAGE_MODELS[].id와 같은 값). 빈 문자열이면 IMAGE_MODEL 섹션 자체를
 *  안 쓴다 — 아직 이 필드를 모르는 화면이 fetch 없이 발행해도 다른
 *  관리자가 고른 모델을 조용히 지우지 않는다(webtoon_image.py의
 *  serialize_prompt_doc()과 같은 계약, 호출부는 반드시 먼저 fetch한
 *  현재 값을 넘겨야 한다). */
export function buildImagePromptDoc(
  style: string,
  charFemale: string,
  charMale: string,
  imageModel: string = "",
  bubbleDetect?: boolean,
  bubbleStyle?: boolean
): string {
  const chunks = [
    `## STYLE\n${style.trim()}`,
    `## CHARACTER_FEMALE\n${charFemale.trim()}`,
    `## CHARACTER_MALE\n${charMale.trim()}`,
  ];
  if (imageModel.trim()) chunks.push(`## IMAGE_MODEL\n${imageModel.trim()}`);
  // 말풍선 얼굴 회피 on/off(2026-10-02) — undefined면 섹션을 안 쓴다(모르는 화면이 발행해도 다른 관리자의 설정을 지우지 않게 서버는 없음=꺼짐으로 읽는다)
  if (bubbleDetect !== undefined) chunks.push(`## BUBBLE_DETECT\n${bubbleDetect ? "on" : "off"}`);
  // 웹툰식 말풍선(2026-10-02) — 타원·얇은 선·위쪽 흰 여백. undefined면 섹션을 안 쓴다(서버는 없음=꺼짐)
  if (bubbleStyle !== undefined) chunks.push(`## BUBBLE_STYLE\n${bubbleStyle ? "on" : "off"}`);
  return chunks.join("\n\n");
}
