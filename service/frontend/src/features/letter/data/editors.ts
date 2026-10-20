// 에디터 데이터는 웹·앱 공용 패키지(@ailens/domain)로 옮겼다. 기존 import 경로를 유지하려고 다시 내보낸다.
export {
  EDITORS,
  NEEDS,
  SITUATIONS,
  editorsOfLetter,
  findEditor,
  recommendEditors,
  type EditorTopic,
  type LetterEditor,
  type NeedId,
  type SituationId,
} from '@ailens/domain';
