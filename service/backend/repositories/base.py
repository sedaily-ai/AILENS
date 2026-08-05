"""
Base repository class for DynamoDB operations.
Provides common functionality for all repositories.
"""

import logging
from typing import Optional, Dict, Any, List, Set
from abc import ABC

import boto3
from boto3.dynamodb.conditions import Key, Attr

from config import settings, AWS_REGION_DEFAULT, BATCH_SIZE_DYNAMODB
from core.exceptions import RepositoryError

logger = logging.getLogger(__name__)


class BaseDynamoDBRepository(ABC):
    """
    Base class for DynamoDB repositories.
    Provides common operations like get_item, put_item, query, scan.

    Note: Currently uses synchronous boto3. For true async operations,
    consider using aioboto3 in the future.
    """

    def __init__(
        self,
        table_name: Optional[str] = None,
        region: Optional[str] = None
    ):
        """
        Initialize the repository.

        Args:
            table_name: DynamoDB table name (default: from settings)
            region: AWS region (default: from settings)
        """
        self.table_name = table_name or settings.dynamodb_table_articles
        self.region = region or settings.region or AWS_REGION_DEFAULT
        self._dynamodb = None
        self._table = None

    @property
    def dynamodb(self):
        """Lazy-load DynamoDB resource."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource(
                'dynamodb',
                region_name=self.region
            )
        return self._dynamodb

    @property
    def table(self):
        """Lazy-load DynamoDB table."""
        if self._table is None:
            self._table = self.dynamodb.Table(self.table_name)
        return self._table

    async def get_item(
        self,
        key: Dict[str, Any],
        projection: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single item by primary key.

        Args:
            key: Primary key dictionary (e.g., {'news_id': 'xxx'})
            projection: Optional projection expression for specific attributes

        Returns:
            Item dictionary or None if not found
        """
        try:
            kwargs = {'Key': key}
            if projection:
                kwargs['ProjectionExpression'] = projection

            response = self.table.get_item(**kwargs)
            return response.get('Item')

        except Exception as e:
            logger.error(f"Error getting item with key {key}: {e}", exc_info=True)
            return None

    async def put_item(
        self,
        item: Dict[str, Any],
        condition: Optional[str] = None
    ) -> bool:
        """
        Put an item into the table.

        Args:
            item: Item dictionary to store
            condition: Optional condition expression

        Returns:
            True if successful, False otherwise
        """
        try:
            # Remove None values (DynamoDB doesn't accept None)
            clean_item = {k: v for k, v in item.items() if v is not None}

            kwargs = {'Item': clean_item}
            if condition:
                kwargs['ConditionExpression'] = condition

            self.table.put_item(**kwargs)
            return True

        except Exception as e:
            logger.error(f"Error putting item: {e}", exc_info=True)
            return False

    async def update_item(
        self,
        key: Dict[str, Any],
        updates: Dict[str, Any],
        condition: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update an existing item.

        Args:
            key: Primary key dictionary
            updates: Dictionary of attribute updates
            condition: Optional condition expression

        Returns:
            Updated item or None if failed
        """
        if not updates:
            return await self.get_item(key)

        try:
            # Build update expression
            update_parts = []
            expression_values = {}
            expression_names = {}

            for idx, (attr_name, value) in enumerate(updates.items()):
                if value is None:
                    continue

                placeholder = f":val{idx}"
                name_placeholder = f"#attr{idx}"

                update_parts.append(f"{name_placeholder} = {placeholder}")
                expression_values[placeholder] = value
                expression_names[name_placeholder] = attr_name

            if not update_parts:
                return await self.get_item(key)

            update_expression = "SET " + ", ".join(update_parts)

            kwargs = {
                'Key': key,
                'UpdateExpression': update_expression,
                'ExpressionAttributeValues': expression_values,
                'ExpressionAttributeNames': expression_names,
                'ReturnValues': 'ALL_NEW'
            }

            if condition:
                kwargs['ConditionExpression'] = condition

            response = self.table.update_item(**kwargs)
            return response.get('Attributes')

        except Exception as e:
            logger.error(f"Error updating item with key {key}: {e}", exc_info=True)
            return None

    async def delete_item(
        self,
        key: Dict[str, Any],
        condition: Optional[str] = None
    ) -> bool:
        """
        Delete an item.

        Args:
            key: Primary key dictionary
            condition: Optional condition expression

        Returns:
            True if successful, False otherwise
        """
        try:
            kwargs = {'Key': key}
            if condition:
                kwargs['ConditionExpression'] = condition

            self.table.delete_item(**kwargs)
            return True

        except Exception as e:
            logger.error(f"Error deleting item with key {key}: {e}", exc_info=True)
            return False

    async def query(
        self,
        key_condition: Any,
        filter_expression: Optional[Any] = None,
        index_name: Optional[str] = None,
        projection: Optional[str] = None,
        limit: Optional[int] = None,
        scan_forward: bool = True,
        exclusive_start_key: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Query items using a key condition.

        Args:
            key_condition: Key condition expression (using boto3 conditions)
            filter_expression: Optional filter expression
            index_name: Optional GSI name
            projection: Optional projection expression
            limit: Maximum number of items to return
            scan_forward: Sort direction (True=ascending, False=descending)
            exclusive_start_key: Pagination start key

        Returns:
            Dictionary with 'items' and optional 'last_key' for pagination
        """
        try:
            kwargs = {
                'KeyConditionExpression': key_condition,
                'ScanIndexForward': scan_forward
            }

            if filter_expression is not None:
                kwargs['FilterExpression'] = filter_expression
            if index_name:
                kwargs['IndexName'] = index_name
            if projection:
                kwargs['ProjectionExpression'] = projection
            if limit:
                kwargs['Limit'] = limit
            if exclusive_start_key:
                kwargs['ExclusiveStartKey'] = exclusive_start_key

            response = self.table.query(**kwargs)

            result = {
                'items': response.get('Items', []),
                'count': response.get('Count', 0),
                'scanned_count': response.get('ScannedCount', 0)
            }

            if 'LastEvaluatedKey' in response:
                result['last_key'] = response['LastEvaluatedKey']

            return result

        except Exception as e:
            logger.error(f"Error querying table: {e}", exc_info=True)
            return {'items': [], 'count': 0, 'scanned_count': 0}

    async def scan(
        self,
        filter_expression: Optional[Any] = None,
        projection: Optional[str] = None,
        limit: Optional[int] = None,
        exclusive_start_key: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Scan the table (use sparingly, prefer query).

        Args:
            filter_expression: Optional filter expression
            projection: Optional projection expression
            limit: Maximum number of items to return
            exclusive_start_key: Pagination start key

        Returns:
            Dictionary with 'items' and optional 'last_key' for pagination
        """
        try:
            kwargs = {}

            if filter_expression is not None:
                kwargs['FilterExpression'] = filter_expression
            if projection:
                kwargs['ProjectionExpression'] = projection
            if limit:
                kwargs['Limit'] = limit
            if exclusive_start_key:
                kwargs['ExclusiveStartKey'] = exclusive_start_key

            response = self.table.scan(**kwargs)

            result = {
                'items': response.get('Items', []),
                'count': response.get('Count', 0),
                'scanned_count': response.get('ScannedCount', 0)
            }

            if 'LastEvaluatedKey' in response:
                result['last_key'] = response['LastEvaluatedKey']

            return result

        except Exception as e:
            logger.error(f"Error scanning table: {e}", exc_info=True)
            return {'items': [], 'count': 0, 'scanned_count': 0}

    async def batch_get_items(
        self,
        keys: List[Dict[str, Any]],
        projection: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Batch get multiple items by keys.

        Args:
            keys: List of primary key dictionaries
            projection: Optional projection expression

        Returns:
            List of found items
        """
        if not keys:
            return []

        items = []

        # Process in batches of 100 (DynamoDB limit)
        for i in range(0, len(keys), BATCH_SIZE_DYNAMODB):
            batch_keys = keys[i:i + BATCH_SIZE_DYNAMODB]

            try:
                request_items = {
                    self.table_name: {
                        'Keys': batch_keys
                    }
                }

                if projection:
                    request_items[self.table_name]['ProjectionExpression'] = projection

                response = self.dynamodb.batch_get_item(RequestItems=request_items)
                batch_items = response.get('Responses', {}).get(self.table_name, [])
                items.extend(batch_items)

                # Handle unprocessed keys
                while response.get('UnprocessedKeys'):
                    response = self.dynamodb.batch_get_item(
                        RequestItems=response['UnprocessedKeys']
                    )
                    batch_items = response.get('Responses', {}).get(self.table_name, [])
                    items.extend(batch_items)

            except Exception as e:
                logger.error(f"Error in batch_get_items: {e}", exc_info=True)

        return items

    async def batch_write_items(
        self,
        items: List[Dict[str, Any]]
    ) -> bool:
        """
        Batch write multiple items.

        Args:
            items: List of items to write

        Returns:
            True if all items written successfully
        """
        if not items:
            return True

        success = True

        # Process in batches of 25 (DynamoDB batch write limit)
        for i in range(0, len(items), 25):
            batch_items = items[i:i + 25]

            try:
                request_items = {
                    self.table_name: [
                        {'PutRequest': {'Item': {k: v for k, v in item.items() if v is not None}}}
                        for item in batch_items
                    ]
                }

                response = self.dynamodb.batch_write_item(RequestItems=request_items)

                # Handle unprocessed items
                while response.get('UnprocessedItems'):
                    response = self.dynamodb.batch_write_item(
                        RequestItems=response['UnprocessedItems']
                    )

            except Exception as e:
                logger.error(f"Error in batch_write_items: {e}", exc_info=True)
                success = False

        return success
