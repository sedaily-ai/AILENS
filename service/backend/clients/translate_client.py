"""
AWS Translate Client — Korean → English translation with economic terminology
==============================================================================
Wraps the AWS Translate API for article translation.

Features:
  - Korean → English translation
  - Custom terminology (economics_terminology.csv) for consistent terms
  - Long text chunking (Translate has 10,000 byte limit per call)
  - Paragraph-level translation to preserve structure

Terminology:
  공매도 → short selling
  기준금리 → base interest rate
  전세 → jeonse (lump-sum deposit lease)
  (see config/economics_terminology.csv for full list)
"""
import csv
import logging
import os
from typing import List, Optional

import boto3

from config.constants import AWS_REGION_DEFAULT

logger = logging.getLogger(__name__)

TRANSLATE_MAX_BYTES = 9500  # AWS Translate limit is 10,000 bytes; leave margin


class TranslateClient:
    """
    Client for AWS Translate Korean → English translation.

    Loads custom terminology from CSV for consistent economic term translation.
    Handles long texts by splitting into paragraph-level chunks.
    """

    def __init__(self, region: str = AWS_REGION_DEFAULT):
        self._client = boto3.client('translate', region_name=region)
        self._terminology_names: List[str] = []
        self._region = region

    def translate_text(self, text: str) -> str:
        """
        Translate Korean text to English.

        For texts exceeding the AWS Translate byte limit, splits by
        paragraphs and translates each chunk separately.

        Args:
            text: Korean text to translate

        Returns:
            English translation
        """
        if not text or not text.strip():
            return ''

        text = text.strip()

        # Check if under byte limit
        if len(text.encode('utf-8')) <= TRANSLATE_MAX_BYTES:
            return self._call_translate(text)

        # Split into paragraph chunks
        chunks = _split_for_translate(text, TRANSLATE_MAX_BYTES)
        translated = []

        for chunk in chunks:
            result = self._call_translate(chunk)
            translated.append(result)

        return '\n\n'.join(translated)

    def translate_paragraphs(self, paragraphs: List[str]) -> List[str]:
        """
        Translate a list of paragraphs, preserving structure.

        Args:
            paragraphs: List of Korean text paragraphs

        Returns:
            List of English translations (same order)
        """
        results = []
        for para in paragraphs:
            if not para.strip():
                results.append('')
                continue
            results.append(self.translate_text(para))
        return results

    def _call_translate(self, text: str) -> str:
        """Single AWS Translate API call."""
        try:
            kwargs = {
                'Text': text,
                'SourceLanguageCode': 'ko',
                'TargetLanguageCode': 'en',
            }

            if self._terminology_names:
                kwargs['TerminologyNames'] = self._terminology_names

            response = self._client.translate_text(**kwargs)
            return response.get('TranslatedText', '')

        except Exception as e:
            logger.error(f"Translation failed: {e}")
            return text  # Return original on failure

    def register_terminology(self, csv_path: Optional[str] = None) -> bool:
        """
        Register custom terminology from CSV file.

        The CSV must have columns: ko, en (Korean term, English term).
        Uploads to AWS Translate as a custom terminology resource.

        Args:
            csv_path: Path to CSV file (default: config/economics_terminology.csv)

        Returns:
            True if registered successfully
        """
        if csv_path is None:
            csv_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'config', 'economics_terminology.csv',
            )

        if not os.path.exists(csv_path):
            logger.warning(f"Terminology file not found: {csv_path}")
            return False

        try:
            # Read CSV and convert to AWS Translate format
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                rows = list(reader)

            if not rows:
                return False

            # Build terminology data (CSV format for AWS Translate)
            lines = ['ko,en']
            for row in rows:
                ko = row.get('ko', '').strip()
                en = row.get('en', '').strip()
                if ko and en:
                    lines.append(f'{ko},{en}')

            term_data = '\n'.join(lines).encode('utf-8')
            term_name = 'sedaily-mbti-economics'

            self._client.import_terminology(
                Name=term_name,
                MergeStrategy='OVERWRITE',
                TerminologyData={
                    'File': term_data,
                    'Format': 'CSV',
                    'Directionality': 'UNI',
                },
            )

            self._terminology_names = [term_name]
            logger.info(f"Registered terminology: {term_name} ({len(rows)} terms)")
            return True

        except Exception as e:
            logger.warning(f"Terminology registration failed (non-fatal): {e}")
            return False


def _split_for_translate(text: str, max_bytes: int) -> List[str]:
    """Split text into chunks that fit the AWS Translate byte limit."""
    paragraphs = text.split('\n\n')
    chunks: List[str] = []
    current: List[str] = []
    current_bytes = 0

    for para in paragraphs:
        para_bytes = len(para.encode('utf-8')) + 2  # +2 for \n\n separator

        if para_bytes > max_bytes:
            # Single paragraph too large — split by sentences
            if current:
                chunks.append('\n\n'.join(current))
                current = []
                current_bytes = 0
            # Hard split — backtrack to valid UTF-8 boundary to avoid
            # cutting multi-byte characters (Korean = 3 bytes each)
            encoded = para.encode('utf-8')
            offset = 0
            while offset < len(encoded):
                end = min(offset + max_bytes, len(encoded))
                # Backtrack if we landed in the middle of a multi-byte character
                if end < len(encoded):
                    while end > offset and (encoded[end] & 0xC0) == 0x80:
                        end -= 1
                chunks.append(encoded[offset:end].decode('utf-8'))
                offset = end
            continue

        if current_bytes + para_bytes > max_bytes:
            chunks.append('\n\n'.join(current))
            current = [para]
            current_bytes = para_bytes
        else:
            current.append(para)
            current_bytes += para_bytes

    if current:
        chunks.append('\n\n'.join(current))

    return chunks
