#!/usr/bin/env python3
"""
여러 기사를 한 번에 웹툰으로 만드는 CLI.

사용법:
    python3 run_batch.py <출력폴더명1> <기사텍스트파일1> [<출력폴더명2> <기사텍스트파일2> ...]

예시:
    python3 run_batch.py 01_삼성HBM4 articles/삼성HBM4.txt 02_현대차파업 articles/현대차파업.txt

여러 기사를 병렬로 처리하고 싶으면, 이 스크립트를 인자를 나눠서 여러 번
백그라운드로 띄우면 된다(예: 4개씩 나눠서 4번 실행). OpenAI 레이트리밋을
고려해 동시 실행은 4~5개 이내를 권장한다.

기사 텍스트 파일 형식: 특별한 형식 없음, 기사 본문 그대로 텍스트 파일에
저장하면 된다(제목 포함해서 붙여넣어도 무방).
"""
import sys
from pipeline import run_article

if __name__ == "__main__":
    pairs = sys.argv[1:]
    if not pairs or len(pairs) % 2 != 0:
        print(__doc__)
        sys.exit(1)

    for i in range(0, len(pairs), 2):
        name, path = pairs[i], pairs[i + 1]
        try:
            run_article(name, path)
        except Exception as e:
            print(f"[{name}] 기사 전체 실패: {e}")

    print("\n전체 배치 완료")
