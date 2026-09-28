"""웹툰 실험 패널(컷 이미지 생성) — 2026-09-20, `routes/webtoon_lab.py`
(1035줄 단일 파일) 하나에 몰려있던 걸 기능별로 쪼갰다(사용자 요청:
"웹툰 관련한거는... 기능별로 코드 파일들이 있기를 원하는데요"):

  jobs.py       모든 하위 모듈이 공유하는 job 테이블 헬퍼 + 공용 폴링 라우트
  generate.py   컷 이미지 생성(모델 디스패치)

`handler.py`는 각 서브모듈을 직접 import해서 라우트를 등록한다
(`from routes.webtoon import generate as webtoon_generate` 형태).

2026-09-25 — gpu.py(GPU IP-Adapter 켜기/끄기)·assets.py(인물·화풍 참조
이미지 업로드)·stage.py(단계별 생성)를 삭제했다("pipeline"/"style_guide"
모델 자체를 뺀 후속, pipelines/common/webtoon_image.py 상단 주석 참고).
이 `__init__.py`가 라우팅하던 Lambda 비동기 self-invoke(`_async_webtoon_job`
마커)도 그 두 모듈(gpu_start/stage_character)만 쓰고 있어서 `run_async_job`
자체를 없앴다 — handler.py의 `_async_webtoon_job` 분기도 같이 정리."""
