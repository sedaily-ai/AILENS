"""
Personal DB Client
Low-level DynamoDB operations for the Personal DB table (sedaily-mbti-personal-dev).

This is a separate table from the articles table, dedicated to user-specific data:
archived sentences, user profiles, reading history, and recommendation pointers.

Table design:
  PK: user_id (String)
  SK: sk (String)

SK patterns:
  PROFILE                          — user profile
  ARCHIVE#{article_id}#{timestamp} — archived sentence
  READING#{article_id}             — reading record
  RECOMMEND#{date}                 — daily recommendation pointers
"""
import os
import logging
from typing import Optional, Dict, Any, List
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

from config.constants import AWS_REGION_DEFAULT

logger = logging.getLogger(__name__)

PERSONAL_TABLE_DEFAULT = 'sedaily-mbti-personal-dev'


def _sanitize_for_dynamodb(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _sanitize_for_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_for_dynamodb(v) for v in obj]
    return obj


class PersonalDBClient:
    """
    Low-level client for the Personal DB DynamoDB table.

    Provides get/put/query/delete operations against the user_id + sk
    composite key. Higher-level business logic lives in PersonalRepository.
    """

    def __init__(
        self,
        table_name: Optional[str] = None,
        region: str = AWS_REGION_DEFAULT,
    ):
        self.table_name = table_name or os.getenv(
            'DYNAMODB_TABLE_PERSONAL', PERSONAL_TABLE_DEFAULT
        )
        self.region = region
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(self.table_name)

    async def get_item(
        self,
        user_id: str,
        sk: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a single item by user_id + sk."""
        try:
            response = self.table.get_item(
                Key={'user_id': user_id, 'sk': sk}
            )
            return response.get('Item')
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Personal DB table {self.table_name} does not exist yet")
                return None
            logger.error(f"Failed to get item ({user_id}, {sk}): {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to get item ({user_id}, {sk}): {e}")
            return None

    async def put_item(self, item: Dict[str, Any]) -> bool:
        """Put an item. Item must contain user_id and sk."""
        try:
            clean = {k: v for k, v in item.items() if v is not None}
            clean = _sanitize_for_dynamodb(clean)
            self.table.put_item(Item=clean)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Personal DB table {self.table_name} does not exist yet")
                return False
            logger.error(f"Failed to put item: {e}", exc_info=True)
            return False
        except Exception as e:
            logger.error(f"Failed to put item: {e}", exc_info=True)
            return False

    async def delete_item(self, user_id: str, sk: str) -> bool:
        """Delete a single item by user_id + sk."""
        try:
            self.table.delete_item(
                Key={'user_id': user_id, 'sk': sk}
            )
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Personal DB table {self.table_name} does not exist yet")
                return False
            logger.error(f"Failed to delete item ({user_id}, {sk}): {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to delete item ({user_id}, {sk}): {e}")
            return False

    async def query_by_user(
        self,
        user_id: str,
        sk_prefix: Optional[str] = None,
        sk_between: Optional[tuple] = None,
        limit: Optional[int] = None,
        scan_forward: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Query items for a user, optionally filtered by SK prefix or range.

        Args:
            user_id: Partition key
            sk_prefix: If set, only items whose SK begins with this value
            sk_between: If set, tuple (sk_start, sk_end) for range query
            limit: Max items to return
            scan_forward: True=ascending, False=descending (newest first)

        Returns:
            List of items
        """
        try:
            if sk_between:
                key_cond = Key('user_id').eq(user_id) & Key('sk').between(
                    sk_between[0], sk_between[1]
                )
            elif sk_prefix:
                key_cond = Key('user_id').eq(user_id) & Key('sk').begins_with(sk_prefix)
            else:
                key_cond = Key('user_id').eq(user_id)

            kwargs: Dict[str, Any] = {
                'KeyConditionExpression': key_cond,
                'ScanIndexForward': scan_forward,
            }
            if limit:
                kwargs['Limit'] = limit

            response = self.table.query(**kwargs)
            items = response.get('Items', [])

            # Paginate if needed and no limit cap reached
            while 'LastEvaluatedKey' in response:
                if limit and len(items) >= limit:
                    break
                kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
                response = self.table.query(**kwargs)
                items.extend(response.get('Items', []))

            if limit:
                items = items[:limit]

            return items

        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Personal DB table {self.table_name} does not exist yet")
                return []
            logger.error(f"Failed to query user {user_id}: {e}", exc_info=True)
            return []
        except Exception as e:
            logger.error(f"Failed to query user {user_id}: {e}", exc_info=True)
            return []

    async def update_item(
        self,
        user_id: str,
        sk: str,
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        Update specific attributes on an existing item.

        Args:
            user_id: Partition key
            sk: Sort key
            updates: Dict of attribute_name -> new_value

        Returns:
            Updated item dict, or None on failure
        """
        if not updates:
            return await self.get_item(user_id, sk)

        try:
            set_parts = []
            expr_values = {}
            expr_names = {}

            for idx, (attr, value) in enumerate(updates.items()):
                if value is None:
                    continue
                placeholder = f":v{idx}"
                name_ph = f"#a{idx}"
                set_parts.append(f"{name_ph} = {placeholder}")
                expr_values[placeholder] = value
                expr_names[name_ph] = attr

            if not set_parts:
                return await self.get_item(user_id, sk)

            expr_values = _sanitize_for_dynamodb(expr_values)

            response = self.table.update_item(
                Key={'user_id': user_id, 'sk': sk},
                UpdateExpression='SET ' + ', '.join(set_parts),
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names,
                ReturnValues='ALL_NEW',
            )
            return response.get('Attributes')

        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.warning(f"Personal DB table {self.table_name} does not exist yet")
                return None
            logger.error(f"Failed to update item ({user_id}, {sk}): {e}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Failed to update item ({user_id}, {sk}): {e}", exc_info=True)
            return None
