"""
A/B Test data models.

Stored in Personal DB (sedaily-mbti-personal-dev) with SK prefixes:
  user_id=__experiment__  SK=AB_META#{experiment_id}           — experiment definition
  user_id={user_id}       SK=AB_ASSIGN#{experiment_id}         — group assignment
  user_id={user_id}       SK=AB_EVENT#{experiment_id}#{ts}     — tracked event

Group assignment is deterministic: hash(user_id + experiment_id) % 2 → A or B.
"""

import hashlib
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

EXPERIMENT_USER = '__experiment__'


def _now_kst_iso() -> str:
    return datetime.now(KST).isoformat()


def assign_group(user_id: str, experiment_id: str) -> str:
    """
    Deterministic group assignment based on hash.
    Same user + experiment always returns the same group.
    """
    key = f"{user_id}:{experiment_id}"
    digest = hashlib.sha256(key.encode('utf-8')).hexdigest()
    return 'A' if int(digest[:8], 16) % 2 == 0 else 'B'


@dataclass
class Experiment:
    """A/B test experiment definition."""
    experiment_id: str
    name: str
    description: str = ''
    start_date: str = ''
    end_date: str = ''
    status: str = 'active'     # active | paused | completed
    group_a_label: str = 'original'
    group_b_label: str = 'mbti_transformed'
    created_at: str = ''

    def __post_init__(self):
        if not self.created_at:
            self.created_at = _now_kst_iso()

    def to_item(self) -> Dict[str, Any]:
        return {
            'user_id': EXPERIMENT_USER,
            'sk': f'AB_META#{self.experiment_id}',
            'experiment_id': self.experiment_id,
            'name': self.name,
            'description': self.description,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'status': self.status,
            'group_a_label': self.group_a_label,
            'group_b_label': self.group_b_label,
            'created_at': self.created_at,
            'item_type': 'ab_experiment',
        }

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'Experiment':
        return cls(
            experiment_id=item.get('experiment_id', ''),
            name=item.get('name', ''),
            description=item.get('description', ''),
            start_date=item.get('start_date', ''),
            end_date=item.get('end_date', ''),
            status=item.get('status', 'active'),
            group_a_label=item.get('group_a_label', 'original'),
            group_b_label=item.get('group_b_label', 'mbti_transformed'),
            created_at=item.get('created_at', ''),
        )


@dataclass
class Assignment:
    """User's group assignment for an experiment."""
    user_id: str
    experiment_id: str
    group: str          # 'A' or 'B'
    assigned_at: str = ''

    def __post_init__(self):
        if not self.assigned_at:
            self.assigned_at = _now_kst_iso()

    @property
    def sk(self) -> str:
        return f'AB_ASSIGN#{self.experiment_id}'

    def to_item(self) -> Dict[str, Any]:
        return {
            'user_id': self.user_id,
            'sk': self.sk,
            'experiment_id': self.experiment_id,
            'group': self.group,
            'assigned_at': self.assigned_at,
            'item_type': 'ab_assignment',
        }

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'Assignment':
        return cls(
            user_id=item.get('user_id', ''),
            experiment_id=item.get('experiment_id', ''),
            group=item.get('group', ''),
            assigned_at=item.get('assigned_at', ''),
        )


@dataclass
class ABEvent:
    """A tracked event in an A/B experiment."""
    user_id: str
    experiment_id: str
    event_type: str        # 'read', 'scroll', 'archive', 'share', 'return'
    article_id: str = ''
    timestamp: str = ''
    metadata: Dict[str, Any] = field(default_factory=dict)
    # Common metadata fields:
    #   read_time_seconds: int
    #   scroll_depth_percent: int (0-100)
    #   group: str ('A' or 'B')

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = _now_kst_iso()

    @property
    def sk(self) -> str:
        ts = self.timestamp.replace(':', '-')
        return f'AB_EVENT#{self.experiment_id}#{ts}'

    def to_item(self) -> Dict[str, Any]:
        item = {
            'user_id': self.user_id,
            'sk': self.sk,
            'experiment_id': self.experiment_id,
            'event_type': self.event_type,
            'article_id': self.article_id,
            'timestamp': self.timestamp,
            'item_type': 'ab_event',
        }
        if self.metadata:
            item['metadata'] = self.metadata
        return item

    @classmethod
    def from_item(cls, item: Dict[str, Any]) -> 'ABEvent':
        return cls(
            user_id=item.get('user_id', ''),
            experiment_id=item.get('experiment_id', ''),
            event_type=item.get('event_type', ''),
            article_id=item.get('article_id', ''),
            timestamp=item.get('timestamp', ''),
            metadata=item.get('metadata', {}),
        )


# Aliases for convenience
ABExperiment = Experiment
ABAssignment = Assignment
