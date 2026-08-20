# pipelines/podcast — 팟캐스트 대본 + 음성 생성

기사 텍스트 1건 → 대본(GPT-4o) → mp3(AWS Polly, 한국어 Seoyeon/generative).

## 셋업

```bash
cd pipelines/podcast
pip install -r requirements.txt
```

DDB에서 admin이 저장한 podcast 프롬프트를 읽어오려면 AWS 자격 증명이
필요하다 — 로컬에서는 `AWS_PROFILE=yeonggwang`(letters와 동일 패턴,
`pipelines/common/ddb_prompt.py` 참고). Polly도 같은 자격 증명으로
호출한다 — 별도 API 키 없이 AWS 계정 권한만 있으면 된다.

OpenAI 키는 Secrets Manager `sedaily-mbti/openai-api-key`에서 자동으로
가져온다.

## 사용법

```bash
AWS_PROFILE=yeonggwang python3 pipeline.py <출력폴더명> <기사원문.txt>
```

또는 코드에서:

```python
from pipeline import run_article
run_article("빵지순례", "article.txt", output_root=Path("output"))
```

재실행하면 이미 만든 대본/mp3는 건너뛴다(`--no-resume`으로 강제 재생성).

## 출력

```
output/<이름>/대본.md      # GPT 원본 그대로(코드블록 포함)
output/<이름>/팟캐스트.mp3  # Polly 합성 결과
```

S3 업로드나 CMS 반영은 범위 밖 — "생성"까지만.

## 배경

`pipelines/letters/README.md`와 동일 — 2026-08-20 이전엔 매번 스크래치패드
1회성 스크립트로 만들어져 webtoon/video와 비대칭이었다.
