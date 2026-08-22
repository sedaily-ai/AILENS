# pipelines/letters — 레터 텍스트 생성

기사 텍스트 1건 → 레터 텍스트 1편. 4포맷 중 가장 단순한 파이프라인 —
GPT-4o 호출 한 번으로 끝난다.

## 셋업

```bash
cd pipelines/letters
pip install -r requirements.txt
```

DDB(`sedaily-mbti-admin-prompts-dev`, us-east-1)에서 admin이 저장한
letters 프롬프트를 읽어오려면 AWS 자격 증명이 필요하다 — 로컬에서는
`AWS_PROFILE=yeonggwang`. 자격 증명이 없거나 DDB 접근이 실패하면
`../../service/backend/prompts/letters/published.md` 파일시스템 폴백으로
계속 동작한다(`pipelines/common/ddb_prompt.py` 참고).

OpenAI 키는 AWS Secrets Manager `sedaily-mbti/openai-api-key`에서 자동으로
가져온다(마스터DB 뉴스웹툰 파이프라인과 같은 시크릿) — 별도 발급 불필요.

## 사용법

```bash
AWS_PROFILE=yeonggwang python3 pipeline.py <출력폴더명> <기사원문.txt>
```

또는 코드에서:

```python
from pipeline import run_article
run_article("빵지순례", "article.txt", output_root=Path("output"))
```

## 출력

```
output/<이름>/레터.md   # GPT 원본 그대로(코드블록 포함) — 실제 CMS 반영 시
                        #  paragraphs로 파싱하는 건 별도 스크립트 몫
```

S3 업로드나 CMS(`sedaily-mbti-cms-posts-dev`) 반영은 이 파이프라인 범위
밖이다 — "생성"까지만(pipelines/webtoon과 같은 원칙).

## 배경

`docs/evaluation/4format-samples/2026-08-11-빵지순례/라운드기록.md`,
`docs/worklog/2026-08/2026-08-20-homepage-refresh-seo-category-pipeline-reorg.md`
참고 — 2026-08-20 이전엔 레터가 매번 스크래치패드 1회성 스크립트로 만들어져
webtoon/video와 비대칭이었다.
