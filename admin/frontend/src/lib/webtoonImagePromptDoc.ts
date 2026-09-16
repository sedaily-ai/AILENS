/** webtoon_image.py::serialize_prompt_doc()/parse_prompt_doc()과 정확히 같은
 *  포맷이어야 한다(## STYLE / ## CHARACTER_FEMALE / ## CHARACTER_MALE 헤딩) —
 *  한쪽만 고치면 발행한 프롬프트를 파이프라인이 못 읽는다.
 *
 *  WebtoonImageLab.tsx·WebtoonImageSettingsPanel.tsx 둘 다 이 포맷으로 발행
 *  문서를 조립한다(2026-09-16 리팩토링 감사로 중복 정의를 여기로 모음) —
 *  나머지 상태 관리(defaults/assets fetch, 업로드, 발행)는 두 화면의 실제
 *  기능이 갈라져 있어(예: 참조 이미지 갤러리는 WebtoonImageSettingsPanel에만
 *  있음) 그대로 각자 둔다. */
export function buildImagePromptDoc(style: string, charFemale: string, charMale: string): string {
  return [
    `## STYLE\n${style.trim()}`,
    `## CHARACTER_FEMALE\n${charFemale.trim()}`,
    `## CHARACTER_MALE\n${charMale.trim()}`,
  ].join("\n\n");
}
