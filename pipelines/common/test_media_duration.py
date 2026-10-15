from pathlib import Path
import subprocess
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from media_duration import measured_duration


def test_uses_measured_duration(tmp_path):
    media = tmp_path / 'audio.mp3'
    media.write_bytes(b'fixture')
    with patch('media_duration.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '{"format":{"duration":"31.25"}}')):
        assert measured_duration(media) == 31.25


def test_missing_invalid_or_failed_duration_remains_pending(tmp_path):
    assert measured_duration(tmp_path / 'missing') is None
    media = tmp_path / 'video.mp4'
    media.write_bytes(b'fixture')
    for value in ('NaN', '-1', '86401'):
        with patch('media_duration.subprocess.run', return_value=subprocess.CompletedProcess([], 0, '{"format":{"duration":"' + value + '"}}')):
            assert measured_duration(media) is None
    with patch('media_duration.subprocess.run', side_effect=FileNotFoundError):
        assert measured_duration(media) is None
