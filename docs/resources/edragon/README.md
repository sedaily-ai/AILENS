# edragon 크롤링 자료 (경제용 피드)

## 이 자료는 무엇인가

[edragon.oopy.io](https://edragon.oopy.io) ("경제용 피드")는 서울경제신문(edragon@sedaily.com)이 운영하는
경제 용어·투자 교육 마이크로사이트다. AI LENS와 같은 회사가 발행하는 콘텐츠로, 본 저작물의 자체 재사용을
위해 크롤링해 이 레포 안에 로컬 자료로 보관한다.

## 크롤링 시점

2026-08-07

## 결과 요약

| 구분 | 성공 | 실패/미확보 |
|---|---|---|
| 토픽 아티클 (`articles/`) | 25 / 25 | 0 |
| 용어 사전 (`glossary/`) | 23 / 25 | 2 (채권 ETF, 황제주) |

- **아티클 25건**: 사용자가 제공한 URL 목록의 25개 페이지를 모두 fetch해 각각 별도 마크다운 파일로 저장했다.
  첫 번째 항목("국채 금리 급등의 의미는? / 미국과 일본의 국채 금리 급등 이유")은 실제로는 하나의 URL·하나의
  글 안에 여러 섹션으로 구성되어 있어, 중복 저장하지 않고 한 파일(`미일-국채-금리-급등-의미.md`)로 통합했다.
  일부 파일(`.md` frontmatter에 `note:` 필드가 있는 것들)은 WebFetch가 원문 그대로가 아니라 요약/번역된
  형태로 반환해, 원문과 표현이 다를 수 있다 — 정확한 인용이 필요하면 `source_url`을 다시 확인할 것.

- **용어 사전 25건 중 23건 확보**: 인덱스 페이지(`https://edragon.oopy.io/2175659d-574a-81a7-b4f1-c0eb4309b3c2`)는
  Notion 기반(oopy.io) 사이트라 각 용어로 이동하는 링크가 정적 HTML에는 없고 클라이언트 사이드 JS로
  렌더링된다. WebFetch로 raw HTML/JS 안에 임베드된 UUID 패턴을 반복 탐색해 25개 중 23개의 실제 URL을
  복구했고, 각각 fetch한 내용이 기대한 용어와 일치하는지 확인했다. 나머지 2개("채권 ETF", "황제주")는
  WebFetch가 이미 확인된 다른 용어의 UUID를 그대로 반환(할루시네이션으로 판단)해 신뢰할 수 없었다 —
  자세한 경위는 `glossary/_unrecovered-terms.md` 참조. 브라우저 자동화(Claude in Chrome)로 재시도를
  시도했으나 이 세션에서는 확장이 연결되어 있지 않아 사용하지 못했다.

## 디렉토리 구조

```
docs/resources/edragon/
├── README.md                      # 이 파일
├── articles/                      # 토픽 아티클 25건 (경제 이슈 해설)
│   └── <slug>.md                  # frontmatter: title, source_url, crawled_at
└── glossary/                      # 용어 사전 23건 + 미확보 기록 1건
    └── <slug>.md                  # frontmatter: title, term, source_url, crawled_at
```

각 파일은 `title` / `source_url` / `crawled_at` frontmatter와 본문(가능한 한 원문 국문 그대로, 헤딩·불릿
구조 보존)으로 구성된다. 용어 사전 파일은 `term` 필드가 추가로 있다.

## 다음 활용 제안

- AI LENS 레터의 **keywords 필드**(에디터별 MBTI 리라이팅에 등장하는 경제 용어 설명)나 CMS `trend_card`
  콘텐츠 생성 시 참고 자료로 활용 가능 — 특히 `glossary/`는 이미 "제용이·용용이"라는 캐릭터를 활용한
  쉬운 설명체로 되어 있어 SF(공감 캐스터)·NF(가치 탐색가) 그룹의 톤과 맞닿는 부분이 있다.
- `articles/`는 2024년 말~2025년 상반기 실제 시황 이슈(관세전쟁, 비상계엄, 반도체 사이클, 코인베이스
  S&P500 편입 등)를 다루고 있어, 유사 주제의 "오늘의 한 통" 레터를 작성할 때 배경 지식·통계 인용
  출처로 재사용할 수 있다.
- `glossary/_unrecovered-terms.md`에 남은 2개 용어(채권 ETF, 황제주)는 필요 시 브라우저 자동화로
  재크롤링을 시도할 것.
