"""실제 완성된 파일의 재생 길이만 공급한다. 측정 실패는 완료 판정 대기다."""
import json
import math
from pathlib import Path
import subprocess


def measured_duration(path):
    if not path or not Path(path).is_file():
        return None
    try:
        result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                 '-of', 'json', str(path)], capture_output=True, text=True,
                                timeout=30, check=True)
        duration = float(json.loads(result.stdout)['format']['duration'])
        if math.isfinite(duration) and 0 < duration <= 86400:
            return duration
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        pass
    print('[media] 재생 길이 측정 실패 — 완료 판정 대기')
    return None
