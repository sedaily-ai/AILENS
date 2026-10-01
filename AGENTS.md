# AGENTS.md

이 저장소에서 작업하는 모든 코딩 에이전트는 먼저 루트 [`CLAUDE.md`](CLAUDE.md)를 읽고 따른다.
하위 디렉터리에 더 구체적인 `AGENTS.md`가 있으면 그 범위에서는 해당 지침도 함께 적용한다.

## AWS 리소스·Bedrock 작업 전 필수 게이트

AWS 비용이 생길 수 있는 작업을 계획하거나 실행하기 **전에**
[`docs/architecture/비용태깅_규칙.md`](docs/architecture/비용태깅_규칙.md)를 처음부터 끝까지 읽는다.

핵심 불변식:

- AI LENS의 AWS 리소스와 application inference profile은 `Service=lens`로 생성한다.
  Atlas 크레딧 lane `atlas4`는 원복이 끝났다 — 새로 붙이지 않는다.
- 베어 Bedrock 모델 ID를 직접 호출하지 않고, 올바르게 태깅된 application inference profile ARN을 사용한다.
- 태그는 소급되지 않으므로 리소스 생성·일회성 작업·첫 추론 **전에** 적용하고, 생성 뒤 실제 태그를 재조회한다.
- 실제 업무에 필요한 호출만 수행한다. 비용 목표를 맞추기 위한 중복 처리나 불필요한 추론은 하지 않는다.

요약과 정본이 다르면 `docs/architecture/비용태깅_규칙.md`를 따른다.
