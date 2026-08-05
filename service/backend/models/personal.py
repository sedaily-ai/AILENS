"""
Personal data models for user-specific data.

These models represent data stored in the Personal DB (sedaily-mbti-personal-dev),
which is separate from the articles table. Personal DB stores user profiles,
archived sentences, reading history, and recommendation pointers.

Table design:
  PK: user_id (String)
  SK: sk (String) — pattern determines item type

SK patterns:
  PROFILE                          — user profile
  ARCHIVE#{article_id}#{timestamp} — archived sentence
  READING#{article_id}             — reading record
  RECOMMEND#{date}                 — daily recommendation pointers
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta


# Korea Standard Time
KST = timezone(timedelta(hours=9))


def _now_kst_iso() -> str:
    """Current time in KST as ISO 8601 string."""
    return datetime.now(KST).isoformat()


@dataclass
class ArchivedSentence:
    """
    A sentence saved by a user from an article.

    Stored in Personal DB with:
      PK: user_id
      SK: ARCHIVE#{article_id}#{timestamp}
    """
    user_id: str
    text: str                       # The saved sentence text
    article_id: str
    article_title: str
    article_published_at: str = ''  # ISO 8601
    created_at: str = ''
    id: str = ''                    # "{user_id}-{article_id}-{timestamp}" (auto-generated)

    def __post_init__(self):
        if not self.created_at:
            self.created_at = _now_kst_iso()
        if not self.id:
            ts = self.created_at.replace(':', '').replace('-', '').replace('+', '')[:15]
            self.id = f"{self.user_id}-{self.article_id}-{ts}"

    @property
    def sk(self) -> str:
        """Sort key for DynamoDB."""
        ts = self.created_at.replace(':', '-')
        return f"ARCHIVE#{self.article_id}#{ts}"

    def to_item(self) -> Dict[str, Any]:
        """Convert to DynamoDB item dict."""
        return {
            'user_id': self.user_id,
            'sk': self.sk,
            'id': self.id,
            'text': self.text,
            'article_id': self.article_id,
            'article_title': self.article_title,
            'article_published_at': self.article_published_at,
            'created_at': self.created_at,
            'item_type': 'archived_sentence',
        }

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'ArchivedSentence':
        """Create from DynamoDB item dict."""
        return cls(
            id=item.get('id', ''),
            user_id=item.get('user_id', ''),
            text=item.get('text', ''),
            article_id=item.get('article_id', ''),
            article_title=item.get('article_title', ''),
            article_published_at=item.get('article_published_at', ''),
            created_at=item.get('created_at', ''),
        )

    def to_api(self) -> Dict[str, Any]:
        """Convert to API response format."""
        return {
            'id': self.id,
            'text': self.text,
            'article_id': self.article_id,
            'article_title': self.article_title,
            'article_published_at': self.article_published_at,
            'created_at': self.created_at,
        }


@dataclass
class UserProfile:
    """
    User profile stored in Personal DB.

    Stored with:
      PK: user_id
      SK: PROFILE
    """
    user_id: str
    email: str = ''
    name: str = ''
    picture: str = ''               # profile image URL
    mbti_group: str = 'SF'          # NT, NF, ST, SF
    temperature: float = 36.5       # 공감온도 (0-100 scale)
    badges: List[str] = field(default_factory=list)
    title: str = ''                 # 칭호 (e.g., "분석의 여왕")
    created_at: str = ''
    last_login: str = ''

    SK = 'PROFILE'

    def __post_init__(self):
        if not self.created_at:
            self.created_at = _now_kst_iso()
        if not self.last_login:
            self.last_login = self.created_at

    def to_item(self) -> Dict[str, Any]:
        """Convert to DynamoDB item dict."""
        item = {
            'user_id': self.user_id,
            'sk': self.SK,
            'email': self.email,
            'name': self.name,
            'picture': self.picture,
            'mbti_group': self.mbti_group,
            'temperature': str(self.temperature),  # Decimal-safe
            'badges': self.badges,
            'title': self.title,
            'created_at': self.created_at,
            'last_login': self.last_login,
            'item_type': 'user_profile',
        }
        return {k: v for k, v in item.items() if v is not None}

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'UserProfile':
        """Create from DynamoDB item dict."""
        temp = item.get('temperature', 36.5)
        if isinstance(temp, str):
            temp = float(temp)
        return cls(
            user_id=item.get('user_id', ''),
            email=item.get('email', ''),
            name=item.get('name', ''),
            picture=item.get('picture', ''),
            mbti_group=item.get('mbti_group', 'SF'),
            temperature=float(temp),
            badges=item.get('badges', []),
            title=item.get('title', ''),
            created_at=item.get('created_at', ''),
            last_login=item.get('last_login', ''),
        )

    def to_api(self) -> Dict[str, Any]:
        """Convert to API response format."""
        return {
            'user_id': self.user_id,
            'email': self.email,
            'name': self.name,
            'picture': self.picture,
            'mbti_group': self.mbti_group,
            'temperature': self.temperature,
            'badges': self.badges,
            'title': self.title,
            'created_at': self.created_at,
            'last_login': self.last_login,
        }


@dataclass
class ReadingRecord:
    """
    Record of a user reading an article.

    Stored with:
      PK: user_id
      SK: READING#{article_id}
    """
    user_id: str
    article_id: str
    article_title: str = ''
    read_at: str = ''
    read_count: int = 1

    def __post_init__(self):
        if not self.read_at:
            self.read_at = _now_kst_iso()

    @property
    def sk(self) -> str:
        """Sort key for DynamoDB."""
        return f"READING#{self.article_id}"

    def to_item(self) -> Dict[str, Any]:
        """Convert to DynamoDB item dict."""
        return {
            'user_id': self.user_id,
            'sk': self.sk,
            'article_id': self.article_id,
            'article_title': self.article_title,
            'read_at': self.read_at,
            'read_count': self.read_count,
            'item_type': 'reading_record',
        }

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'ReadingRecord':
        """Create from DynamoDB item dict."""
        return cls(
            user_id=item.get('user_id', ''),
            article_id=item.get('article_id', ''),
            article_title=item.get('article_title', ''),
            read_at=item.get('read_at', ''),
            read_count=int(item.get('read_count', 1)),
        )

    def to_api(self) -> Dict[str, Any]:
        """Convert to API response format."""
        return {
            'article_id': self.article_id,
            'article_title': self.article_title,
            'read_at': self.read_at,
            'read_count': self.read_count,
        }
