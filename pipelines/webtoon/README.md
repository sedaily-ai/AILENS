# 뉴스 웹툰 자동 생성 파이프라인

기사 텍스트 1건 → 8컷 웹툰(개별 이미지 8장 + 세로 스크롤 1장)을 자동으로
만드는 파이프라인. **2026-09-08~09에 3단계(이미지 생성) 아키텍처를
OpenAI GPT-image에서 AWS Bedrock(Stable Diffusion 계열) + 자체 GPU
IP-Adapter로 전면 교체했다** — 아래 내용은 그 이후(R12~R22) 기준이다.
과거 GPT 기반 시행착오는 이 문서 하단 "지난 아키텍처(2026-08, GPT
기반)"에 남겨뒀고, 전체 실험 과정은
`docs/evaluation/webtoon/라운드기록.md`(R1~R22)에 라운드별로 기록돼
있다 — 특정 설계 결정의 이유가 궁금하면 거기부터 찾을 것.

## 아키텍처 — 3단계 + 텍스트 합성

```
[1단계] 기사 텍스트 + admin 프롬프트(DDB, webtoon 탭)
   → 스크립트 생성 (Bedrock Claude)
   → 8컷의 title/내레이션/대사(A·B, tone: 보통|격앙)/caption/
     closing_caption만 텍스트로 (그림 묘사 없음)

[2단계] 기사 + 1단계 스크립트 + 같은 admin 프롬프트
   → 장면 연출 생성 (Bedrock Claude)
   → 컷마다 카메라 앵글 + 시각 묘사. 같은 정적 자세가 3컷 넘게
     연속되지 않게, 능동적 동작(가리키기·소품 들기·이동)을 최소
     3컷 이상 넣으라는 지침 포함(admin DDB v#9)

[3단계] 2단계 장면 → 텍스트 없는 배경 이미지 생성
   구도-화풍 분리 파이프라인(webtoon_image.generate_bedrock_composed_image):
     (a) translate_scene_to_photo_brief() — 한국어 [SCENE]/[CAMERA]를
         영어 사진 브리핑으로 압축 + 이 컷의 주인공이 A/B 단독인지
         둘 다(BOTH)인지 분류(Bedrock Claude, 1회 호출)
     (b) 주인공 판정에 따라 배경 생성 경로 분기:
         - A 또는 B 단독 → GPU IP-Adapter(gpu_ipadapter.py)로 참조
           얼굴을 고정한 포토리얼 사진 생성
         - BOTH(두 인물) → A·B 각각 IP-Adapter로 따로 생성 →
           Bedrock Remove Background로 인물만 오려내기 → 빈 배경
           사진 위에 합성(generate_dual_character_init_bytes)
         - 그 외(주로 인물 없는 상징적 컷) → Bedrock Stable Image
           Core로 참조 없는 포토리얼 생성
     (c) 위 결과를 Bedrock Style Transfer에 통과시켜 확립된 플랫
         셀 웹툰 화풍을 입힌다(webtoon_style_reference.png 참고)
   QA 게이트(pipeline._generate_and_qa_cut): 생성한 배경을 Rekognition
   얼굴 감지 + Claude 비전 검사에 통과시켜, 배경 인물 초과·인물 없음
   위반·사극 오염을 잡으면 1회 재생성한다.

[텍스트 합성] compose_text.compose() — PIL로 제목/말풍선/캡션/
   마무리 자막을 배경 위에 직접 그린다(Bedrock 계열 모델이 한글을
   정확히 못 그려서 텍스트는 항상 코드가 그린다 — "100% 정확" 보장이
   이 구조의 존재 이유). 캡션 키워드에 맞는 아이콘 배지(돈·계약서·
   달력·필름·지구본·차트)도 이 단계에서 붙는다.

[스티칭] 8장을 세로로 이어붙여 웹툰_전체.png 하나로
```

## GPU 인스턴스(IP-Adapter, 캐릭터 얼굴 고정)

Bedrock 관리형 API로는 IP-Adapter(참조 얼굴로 인물 정체성을 고정하는
기법)를 못 쓴다 — 자체 GPU 인스턴스(`webtoon-ipadapter-gpu`,
`i-02313c8c8285f9d91`, ap-northeast-2, g4dn.xlarge)를 배치 전용으로
운영한다. `pipeline.py`가 `IMAGE_PROVIDER == "bedrock-style-transfer"`
일 때 배치 시작 시 한 번만 자동 기동(SSM 온라인까지 대기)하고, 8컷 다
끝나면(예외가 나도 try/finally로) 한 번만 자동 정지한다 — 상시 가동이
아니라 "쓸 때만 켜고 끄는" 패턴이라 컷당 몇 초, 배치당 몇 분 수준의
가동시간만 과금된다(g4dn.xlarge $0.647/시간).

인스턴스가 처음부터 없거나 잃어버렸을 때 다시 세팅하는 절차는
`../common/gpu_scripts/README.md` 참고. 실제 추론 코드
(`ipadapter_infer.py`)와 오케스트레이션(`../common/gpu_ipadapter.py`)도
거기·`pipelines/common/`에 있다.

## 캐릭터 참조 이미지

`pipelines/common/assets/character_ref_A.png`/`character_ref_B.png` —
GPU 인스턴스의 IP-Adapter가 참조하는 A(여성)·B(남성)의 대표 얼굴 크롭.
**깃 리포의 이 파일과 GPU 인스턴스(`/home/ec2-user/refs/`)의 실제
파일은 자동 동기화되지 않는다** — 리포 쪽을 바꾸면 S3 경유로 수동
재업로드해야 한다(`../common/gpu_scripts/README.md` 참고). 참조를
고를 때 헤어스타일 등 "그 순간의 상태"까지 그대로 재현된다는 걸
실측으로 확인했다(R15) — 대표적인 상태(예: 머리를 묶지 않은 상태)의
크롭을 고를 것.

## 셋업

```bash
cd pipelines/webtoon
pip install -r requirements.txt
```

AWS 자격 증명이 필요하다(DDB 프롬프트 읽기, Bedrock 이미지/텍스트
호출, GPU 인스턴스 기동/정지, S3, Rekognition) — 로컬에서는
`AWS_PROFILE=yeonggwang` 환경변수로 지정. DDB 접근이 실패해도
1·2단계 프롬프트는 파일시스템 폴백(`../../service/backend/prompts/
webtoon/published.md`)으로 계속 동작한다.

## 사용법

**여러 건 한 번에 (CLI)**
```bash
python3 run_batch.py 01_기사명 articles/기사파일.txt \
                      02_기사명2 articles/기사파일2.txt
```

**기사 1건 (Python)**
```python
from pipeline import run_article
run_article("01_기사명", "articles/기사파일.txt")
```

**제목·설명 생성 (전 폴더 일괄)**
```bash
python3 generate_meta.py                    # 현재 폴더의 모든 웹툰 폴더 대상
python3 generate_meta.py 01_기사명 02_기사명2   # 특정 폴더만
```

**전체 목록 인덱스 만들기**
```bash
python3 build_index.py .   # INDEX.md + index.json 생성
```

## 출력 구조

```
01_기사명/
├── 1_script.json      1단계 결과 (재사용 가능, resume=True 기본값)
├── 2_scenes.json       2단계 결과 (재사용 가능)
├── 컷1.png ~ 컷8.png    개별 컷
├── 웹툰_전체.png        세로 스크롤 합본
└── meta.json            제목 3안 + 작품설명 (generate_meta.py 실행 후 생김)
```

## 비용 (2026-09 공개 단가 기준 추정치, 라운드기록 R16 참고)

- 8컷 기사 1편: 약 **$1.03**(대사 컷 solo 4·BOTH 4 가정) — Bedrock
  텍스트·이미지 호출 + GPU 가동시간 합산 추정
- 실제 AWS 청구 데이터로는 아직 검증 안 함(반영 지연 + 소액 테스트와
  섞여 분리 어려움) — 이 워크로드로 한 달 이상 운영 후 Cost Explorer에서
  `Workload=webtoon-image`/`webtoon-ipadapter` 태그로 확인 권장

## 알려진 한계 / 다음에 할 것

라운드기록(R1~R22)의 이슈 트래커에 상세 기록돼 있다. 2026-09-09
기준 핵심 이슈(#4 장면 이행력, #14 배경 엑스트라, #15 캐릭터 일관성)는
전부 해결됐고, 남은 건:

- Style Transfer 단계에서 스튜디오 소품 잔여 오염이 이따금 보임(참고
  이미지를 중립 배경으로 교체했지만 완전히는 안 없어짐)
- 컷1(표지, 대사 없음)의 배경 인물 수는 다른 컷보다 덜 안정적
- 실제 AWS 청구 데이터 기반 비용 검증 안 됨(위 참고)
- 아이콘 배지 종류(현재 6종)가 실제 발행 기사들의 캡션 패턴을 다
  커버하진 못함 — 발행량이 늘면 키워드 사전 보강 필요
- AI LENS 실제 CMS/발행 파이프라인과의 연동(자동 발행)은 아직
  안 됨 — 이 파이프라인은 "생성"까지만

## 지난 아키텍처(2026-08, GPT 기반) — 참고용, 더 이상 안 씀

3단계 이미지 생성을 OpenAI `gpt-5.5`(Responses API의 `image_generation`
툴)로 했던 시절의 기록. 2026-09-08 사용자가 "OpenAI 대신 Stable
Diffusion 계열을 쓰기로 결정"하면서 전면 교체됐다 — 코드 자체는
`pipeline.py`에 `IMAGE_PROVIDER = "openai"`로 여전히 남아있어(휴면),
필요하면 되돌릴 수 있다.

당시 비용: 이미지 1장(1536×1024, high) $0.165, 8컷 편당 약 $1.32 —
[OpenAI 공식 가격 문서](https://developers.openai.com/api/docs/pricing)
기준(모델·가격이 바뀔 수 있음).

당시 시행착오(지금은 대부분 해당 없음 — Bedrock 경로는 원천적으로
텍스트를 안 그리므로 "말풍선이 안 나오는 문제" 자체가 없음 등):
- 실사 사진처럼 나오는 문제 → STYLE에 "hand-illustrated, NOT a
  photograph" 명시로 해결
- 디테일을 낮추면 실사 문제가 해결될 거라 착각 → "실사냐 아니냐"와
  "디테일 양"은 다른 축, 디테일은 유지하고 화풍만 명시하는 게 정답
- 대화 컷이 너무 적어 카드뉴스 같아지는 문제 → 1단계 프롬프트에
  "최소 5컷 이상 대화"처럼 구체적 하한선 명시로 해결
