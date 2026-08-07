// CloudFront Function — admin-html-extension-rewrite
// Distribution: E1MITYI58DB9UW (mbti-admin.sedaily.ai), event: viewer-request
//
// 이 파일은 배포 자동화(deploy-admin.sh)의 일부가 아니다 — AWS CLI로 직접
// 관리한다(update-function → test-function → publish-function). 여기 있는
// 소스는 "지금 LIVE에 뭐가 올라가 있는지"를 레포에서 확인/추적하기 위한
// 기록이다. 실제로 수정할 때는 이 파일을 고친 뒤 아래 명령으로 반영한다:
//
//   aws cloudfront update-function --name admin-html-extension-rewrite \
//     --if-match <DEVELOPMENT ETag> \
//     --function-config Comment="...",Runtime=cloudfront-js-2.0 \
//     --function-code fileb://admin-html-extension-rewrite.js
//   aws cloudfront test-function --name admin-html-extension-rewrite \
//     --if-match <새 DEVELOPMENT ETag> --stage DEVELOPMENT --event-object fileb://<test event>.json
//   aws cloudfront publish-function --name admin-html-extension-rewrite --if-match <새 ETag>
//
// 히스토리:
//   2026-08-06 최초 생성 — 확장자 없는 정적 export 라우트에 .html(또는
//     디렉터리는 index.html) 붙이기. 이게 없으면 /posts 같은 요청이 S3에서
//     404 -> CloudFront 403/404->index.html 폴백이 항상 대시보드만 서빙한다.
//   2026-08-07 수정 — ?_rsc= 폴백 요청을 .txt(RSC 페이로드)로 분기.
//     service/frontend의 sedaily-mbti-letter-html-rewrite와 동일한 버그가
//     여기도 있었다 — /posts/edit?id=... 같은 쿼리 기반 라우트로 클라이언트
//     네비게이션(예: 글 목록 -> 글 수정 클릭)할 때, 세그먼트 캐시 미스로
//     라우터가 던지는 _rsc 폴백 fetch가 순수 HTML을 받아 조용히 멈추는
//     문제였다. 진단 경위: docs/worklog/2026-08/2026-08-07-cloudfront-rsc-navigation-bug.md
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.includes('.')) {
    return request;
  }

  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
    return request;
  }

  if (request.querystring && request.querystring._rsc) {
    request.uri = uri + '.txt';
    return request;
  }

  request.uri = uri + '.html';
  return request;
}
