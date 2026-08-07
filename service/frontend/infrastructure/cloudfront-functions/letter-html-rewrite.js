// CloudFront Function — sedaily-mbti-letter-html-rewrite
// Distribution: E1QS7PY350VHF6 (ailens.sedaily.ai), event: viewer-request
//
// 이 파일은 배포 자동화(deploy.sh)의 일부가 아니다 — AWS CLI로 직접
// 관리한다(update-function → test-function → publish-function). 여기 있는
// 소스는 "지금 LIVE에 뭐가 올라가 있는지"를 레포에서 확인/추적하기 위한
// 기록이다. 실제로 수정할 때는 이 파일을 고친 뒤 아래 명령으로 반영한다:
//
//   aws cloudfront update-function --name sedaily-mbti-letter-html-rewrite \
//     --if-match <DEVELOPMENT ETag> \
//     --function-config Comment="...",Runtime=cloudfront-js-2.0 \
//     --function-code fileb://letter-html-rewrite.js
//   aws cloudfront test-function --name sedaily-mbti-letter-html-rewrite \
//     --if-match <새 DEVELOPMENT ETag> --stage DEVELOPMENT --event-object fileb://<test event>.json
//   aws cloudfront publish-function --name sedaily-mbti-letter-html-rewrite --if-match <새 ETag>
//
// 히스토리:
//   2026-05-25 최초 생성 — 확장자 없는 정적 export 라우트에 .html 붙이기.
//   2026-08-07 수정 — ?_rsc= 폴백 요청을 .txt(RSC 페이로드)로 분기.
//     기존엔 _rsc 요청도 그냥 .html을 붙여서 반환했는데, "HTML 안에 RSC가
//     임베드돼 있으니 Next가 알아서 추출할 것"이라는 가정이 background
//     fetch() 기반 클라이언트 라우팅에는 적용되지 않았다(그 가정은 브라우저가
//     그 HTML을 직접 로드하며 임베드된 스크립트를 실행하는 최초 진입 시에만
//     성립). 그 결과 웹툰/레터 상세 페이지처럼 ?id= 같은 쿼리로 진입하는
//     라우트에서, 카드 클릭 -> 세그먼트 캐시 미스 -> _rsc 폴백 fetch가 순수
//     HTML을 받아 라우터가 조용히 멈추는 문제가 있었다(콘솔 에러 없음, URL도
//     안 바뀜). 진단 경위: docs/worklog/2026-08/2026-08-07-cloudfront-rsc-navigation-bug.md
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === '/' || uri.indexOf('.') !== -1 || uri.endsWith('/')) {
    return request;
  }
  if (request.querystring && request.querystring._rsc) {
    request.uri = uri + '.txt';
    return request;
  }
  request.uri = uri + '.html';
  return request;
}
